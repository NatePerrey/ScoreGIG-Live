// passwordReset.js — self-serve "forgot password" via an emailed reset link.
//
// Flow:
//   1. User enters their email on the login screen and asks for a reset.
//   2. If an account exists we email a unique, time-limited link. (The API
//      always responds the same way whether or not the email exists, so the
//      form can't be used to discover which emails have accounts.)
//   3. The link opens a server-rendered page (like guardian consent) where the
//      user sets a new password. The token is single-use and cleared on success.
//
// Email uses the same SendGrid wiring as notify.js / guardian.js: with no
// SENDGRID_API_KEY set the message is logged and recorded as 'pending-setup',
// so the flow is testable locally and goes live the moment the key is present.

import { db } from "./db.js";
import crypto from "crypto";

const RESET_TTL_MS = 60 * 60 * 1000; // link valid 1 hour

// Public base URL the reset link points at. This is the BACKEND origin (the
// reset page is server-rendered here), not the SPA. Falls back to local.
function publicApiUrl() {
  return (process.env.API_PUBLIC_URL || "http://localhost:4000").replace(/\/+$/, "");
}

const EMAIL_READY = () =>
  Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM);

// Create (or refresh) a reset token for a user and return it.
export function issueResetToken(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = Date.now() + RESET_TTL_MS;
  db.prepare("UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?")
    .run(token, expires, userId);
  return token;
}

// Look up a user by a valid, unexpired reset token.
export function userByResetToken(token) {
  if (!token) return null;
  const user = db.prepare("SELECT * FROM users WHERE reset_token = ?").get(token);
  if (!user) return null;
  if (!user.reset_expires || user.reset_expires < Date.now()) {
    return { user, expired: true };
  }
  return { user, expired: false };
}

// Apply a new bcrypt hash and clear the token (single-use).
export function applyResetHash(userId, passwordHash) {
  db.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?"
  ).run(passwordHash, userId);
}

// Send the reset email. Mirrors guardian.js: logs + records when SendGrid isn't
// configured so nothing blocks local testing.
export async function sendPasswordResetEmail(user) {
  const to = user.email;
  if (!to) return;
  const token = user.reset_token || issueResetToken(user.id);
  const link = `${publicApiUrl()}/reset-password/${token}`;
  const who = user.display_name || user.name || "there";
  const body =
    `Hi ${who},\n\n` +
    `We received a request to reset the password for your ScoreGIG account.\n\n` +
    `Set a new password here:\n${link}\n\n` +
    `This link expires in 1 hour and can only be used once. If you didn't ask ` +
    `to reset your password, you can safely ignore this email — your password ` +
    `won't change.\n\n` +
    `— ScoreGIG`;

  function record(status, detail) {
    try {
      db.prepare(
        "INSERT INTO notifications (user_id, gig_id, channel, to_addr, state, status, detail, t) VALUES (?, NULL, 'email', ?, 'Password reset', ?, ?, ?)"
      ).run(user.id, to, status, detail || null, Date.now());
    } catch (e) {
      console.error("passwordReset: failed to record notification", e.message);
    }
  }

  if (!EMAIL_READY()) {
    console.log(`[reset:email pending-setup] -> ${to}: ${link}`);
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
        reply_to: { email: process.env.SUPPORT_EMAIL || "nathanperrey@scoregig.ca" },
        subject: "Reset your ScoreGIG password",
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
