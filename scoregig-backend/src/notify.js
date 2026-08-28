// notify.js — gig-state notifications over email (always) and SMS (if a phone
// is on file). Every gig-clock state change calls notifyGigState(), which
// messages both the organizer and the scorekeeper.
//
// Providers are wired but inert until you add API keys to the environment:
//   Email  -> SendGrid:  SENDGRID_API_KEY, SENDGRID_FROM
//   SMS    -> Twilio:     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// With no keys set, messages are logged and recorded as 'pending-setup' so the
// whole flow is testable now; flip it live later by setting the env vars.

import { db } from "./db.js";
import crypto from "crypto";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);
const digitsOnly = (s) => String(s || "").replace(/\D/g, "");

// Process an inbound text. STOP-type keywords opt the user out of SMS; START-type
// keywords opt them back in. Matches on the last 10 digits so stored formats like
// "+1 587 555 1234" still line up with Twilio's E.164 "+15875551234".
export function applyInboundSms(fromPhone, body) {
  const word = String(body || "").trim().toUpperCase();
  const isStop = STOP_WORDS.has(word);
  const isStart = START_WORDS.has(word);
  if (!isStop && !isStart) return null;
  const last10 = digitsOnly(fromPhone).slice(-10);
  if (!last10) return null;
  const rows = db.prepare("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone != ''").all();
  const match = rows.find((r) => digitsOnly(r.phone).slice(-10) === last10);
  if (!match) return null;
  db.prepare("UPDATE users SET sms_opted_out = ? WHERE id = ?").run(isStop ? 1 : 0, match.id);
  console.log(`[notify:sms inbound] ${isStop ? "STOP" : "START"} from user ${match.id}`);
  return { userId: match.id, optedOut: isStop };
}

// Verify Twilio's request signature so a stranger can't toggle opt-out state.
// Skips (returns true) when not configured, so local testing still works.
export function verifyTwilioSignature(req) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const url = process.env.TWILIO_WEBHOOK_URL;
  if (!token || !url) return true; // not configured yet → allow (dev/testing)
  const signature = req.header("X-Twilio-Signature") || "";
  const params = req.body || {};
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

const EMAIL_READY = () => Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM);
const SMS_READY = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

function record(userId, gigId, channel, toAddr, state, status, detail) {
  try {
    db.prepare(
      "INSERT INTO notifications (user_id, gig_id, channel, to_addr, state, status, detail, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(userId, gigId, channel, toAddr || null, state, status, detail || null, Date.now());
  } catch (e) {
    console.error("notify: failed to record", e.message);
  }
}

/* ------------------------------- EMAIL ----------------------------------- */
// Low-level, reusable email send. Handles the not-configured-yet path, the
// SendGrid POST, and the notifications-log record. Used both by gig-state
// notifications (fixed "ScoreGIG update" subject) and by new-gig broadcasts
// (their own subject line). Never throws.
export async function emailUser({ user, gigId = null, state = "", subject = "ScoreGIG update", body }) {
  if (!user || !user.email) return;
  if (!EMAIL_READY()) {
    console.log(`[notify:email pending-setup] -> ${user.email}: ${subject}`);
    record(user.id, gigId, "email", user.email, state, "pending-setup");
    return;
  }
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: user.email }] }],
        from: { email: process.env.SENDGRID_FROM, name: "ScoreGIG" },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (res.ok) {
      record(user.id, gigId, "email", user.email, state, "sent");
    } else {
      const txt = await res.text().catch(() => "");
      record(user.id, gigId, "email", user.email, state, "failed", `${res.status} ${txt}`.slice(0, 200));
    }
  } catch (err) {
    record(user.id, gigId, "email", user.email, state, "failed", String(err.message).slice(0, 200));
  }
}

async function sendEmail(user, gig, state, body) {
  await emailUser({ user, gigId: gig.id, state, subject: "ScoreGIG update", body });
}

/* -------------------------------- SMS ------------------------------------ */
async function sendSMS(user, gig, state, body) {
  if (!user.phone) return;
  // CASL/carrier compliance: only text users who explicitly opted in and have
  // not opted back out (via STOP or in-app).
  if (!user.sms_consent || user.sms_opted_out) return;
  const smsBody = `${body} Reply STOP to opt out.`;
  if (!SMS_READY()) {
    console.log(`[notify:sms pending-setup] -> ${user.phone}: ${smsBody}`);
    record(user.id, gig.id, "sms", user.phone, state, "pending-setup");
    return;
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const form = new URLSearchParams({ To: user.phone, From: process.env.TWILIO_FROM, Body: smsBody });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (res.ok) {
      record(user.id, gig.id, "sms", user.phone, state, "sent");
    } else {
      const txt = await res.text().catch(() => "");
      record(user.id, gig.id, "sms", user.phone, state, "failed", `${res.status} ${txt}`.slice(0, 200));
    }
  } catch (err) {
    record(user.id, gig.id, "sms", user.phone, state, "failed", String(err.message).slice(0, 200));
  }
}

async function deliver(user, gig, state) {
  // One simple, consistent message for both channels.
  const body = `Your gig "${gig.title}" is now ${state}.`;
  await sendEmail(user, gig, state, body);
  await sendSMS(user, gig, state, body);
}

/**
 * Notify everyone attached to a gig that its state changed.
 * Fire-and-forget: never throws into the request/response path.
 * @param {number} gigId
 * @param {string} stateLabel  human label, e.g. "Claimed", "Completed"
 * @param {number[]} extraUserIds  recipients whose link may have just been cleared
 *                                 (e.g. a declined or cancelling scorekeeper)
 */
export function notifyGigState(gigId, stateLabel, extraUserIds = []) {
  _run(gigId, stateLabel, extraUserIds).catch((e) => console.error("notify error:", e.message));
}

/**
 * Notify one recipient that a new gig-chat message arrived. Separate from
 * notifyGigState because it's addressed to one person (not everyone on the
 * gig) and carries its own short body instead of a state-change sentence.
 * @param {number} gigId
 * @param {number} recipientUserId
 * @param {string} senderName  the sender's display name
 */
export function notifyNewMessage(gigId, recipientUserId, senderName) {
  _runMessage(gigId, recipientUserId, senderName).catch((e) => console.error("notify (message) error:", e.message));
}

async function _runMessage(gigId, recipientUserId, senderName) {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(gigId);
  if (!gig) return;
  const user = db
    .prepare("SELECT id, email, phone, notifications_enabled, sms_consent, sms_opted_out FROM users WHERE id = ?")
    .get(recipientUserId);
  if (!user || !user.notifications_enabled) return;
  const body = `New message from ${senderName} re: ${gig.title}`;
  await sendEmail(user, gig, "New message", body);
  await sendSMS(user, gig, "New message", body);
}

async function _run(gigId, stateLabel, extraUserIds) {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(gigId);
  if (!gig) return;
  const ids = new Set(
    [gig.owner_id, gig.claimed_by, gig.requested_by, ...extraUserIds].filter(Boolean)
  );
  for (const uid of ids) {
    const user = db
      .prepare("SELECT id, email, phone, notifications_enabled, sms_consent, sms_opted_out FROM users WHERE id = ?")
      .get(uid);
    if (!user) continue;
    if (!user.notifications_enabled) continue; // opted out → nothing on any channel
    await deliver(user, gig, stateLabel);
  }
}
