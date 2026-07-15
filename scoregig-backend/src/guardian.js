// guardian.js — parent/guardian email consent for minor scorekeepers (15–17).
//
// Flow:
//   1. Minor signs up with a guardian's email. Account is created immediately
//      but guardian_consent_status = 'pending' (they can browse, not transact).
//   2. We email the guardian a unique confirmation link.
//   3. Guardian opens the link (proving control of that inbox) and clicks
//      "I consent". We record the timestamp + IP and flip status to 'approved'.
//   4. The minor's account unlocks for posting/requesting gigs.
//
// Email uses the same SendGrid wiring as notify.js: with no SENDGRID_API_KEY
// set the message is logged and recorded as 'pending-setup', so the whole flow
// is testable locally today and goes live the moment you add the key.

import { db } from "./db.js";
import crypto from "crypto";

const CONSENT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // link valid 14 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s) {
  return EMAIL_RE.test(String(s || "").trim());
}

// Public base URL the guardian's link points at. This is the BACKEND origin
// (the consent page is server-rendered here), not the SPA. Falls back to local.
function publicApiUrl() {
  return (process.env.API_PUBLIC_URL || "http://localhost:4000").replace(/\/+$/, "");
}

const EMAIL_READY = () =>
  Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM);

// Create (or refresh) a consent token for a user and return it.
export function issueConsentToken(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = Date.now() + CONSENT_TTL_MS;
  db.prepare(
    "UPDATE users SET guardian_consent_token = ?, guardian_consent_expires = ? WHERE id = ?"
  ).run(token, expires, userId);
  return token;
}

// Send the guardian the consent email. Mirrors notify.js: logs + records when
// SendGrid isn't configured so nothing blocks local testing.
export async function sendGuardianConsentEmail(user) {
  const to = user.guardian_email;
  if (!to) return;
  const token = user.guardian_consent_token || issueConsentToken(user.id);
  const link = `${publicApiUrl()}/guardian-consent/${token}`;
  const minor = user.display_name || user.name || "your child";
  const body =
    `Hello,\n\n` +
    `${minor} has signed up for ScoreGIG, a marketplace where people are paid to ` +
    `keep score at local sporting events. Because they're under 18, we need a ` +
    `parent or guardian to confirm consent before they can pick up paid gigs.\n\n` +
    `Please review and confirm here:\n${link}\n\n` +
    `This link expires in 14 days. If you weren't expecting this email, you can ` +
    `safely ignore it — no account can be activated for paid work without your confirmation.\n\n` +
    `— ScoreGIG`;

  function record(status, detail) {
    try {
      db.prepare(
        "INSERT INTO notifications (user_id, gig_id, channel, to_addr, state, status, detail, t) VALUES (?, NULL, 'email', ?, 'Guardian consent', ?, ?, ?)"
      ).run(user.id, to, status, detail || null, Date.now());
    } catch (e) {
      console.error("guardian: failed to record notification", e.message);
    }
  }

  if (!EMAIL_READY()) {
    console.log(`[guardian:email pending-setup] -> ${to}: ${link}`);
    record("pending-setup");
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
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM, name: "ScoreGIG" },
        subject: "Parent/guardian consent needed for ScoreGIG",
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (res.ok) record("sent");
    else {
      const txt = await res.text().catch(() => "");
      record("failed", `${res.status} ${txt}`.slice(0, 200));
    }
  } catch (err) {
    record("failed", String(err.message).slice(0, 200));
  }
}

// True if this user is a minor still awaiting guardian confirmation. Used to
// gate posting/requesting gigs.
export function guardianBlocked(user) {
  return user && user.guardian_consent_status === "pending";
}

// Look up a user by a valid, unexpired consent token.
export function userByConsentToken(token) {
  if (!token) return null;
  const user = db
    .prepare("SELECT * FROM users WHERE guardian_consent_token = ?")
    .get(token);
  if (!user) return null;
  if (!user.guardian_consent_expires || user.guardian_consent_expires < Date.now()) {
    return { user, expired: true };
  }
  return { user, expired: false };
}

// Mark consent approved. Idempotent: confirming an already-approved token is OK.
export function confirmConsent(user, ip) {
  db.prepare(
    "UPDATE users SET guardian_consent_status = 'approved', guardian_consent_at = ?, guardian_consent_ip = ?, guardian_consent_token = NULL, guardian_consent_expires = NULL WHERE id = ?"
  ).run(Date.now(), ip || null, user.id);
}
