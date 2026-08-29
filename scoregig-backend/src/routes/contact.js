// contact.js — "Contact us / report a problem" form handler.
//
// The frontend ContactModal POSTs { name, email, message, gigId } here. We email
// it to the support inbox with the submitter as reply_to, so responding is just
// hitting Reply. No auth: a logged-out person hitting a snag must be able to
// reach us.
//
// Recipient resolution: SUPPORT_EMAIL if set, else a hard fallback to the real
// inbox. Deliberately does NOT fall back to SENDGRID_FROM — that address may be
// a no-mailbox sender like notifications@, so contact mail must never chase it.
// Works with zero config today (lands in nathanperrey@scoregig.ca); point
// SUPPORT_EMAIL elsewhere later without a code change.
import { Router } from "express";
import { sendRawEmail } from "../notify.js";

export const contact = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Very light in-memory throttle: this is a public, unauthenticated endpoint that
// sends email, so cap it per IP to keep it from being used to burn SendGrid
// quota. Resets on redeploy — fine for the pilot; swap for a real limiter if
// abuse ever shows up.
const HITS = new Map(); // ip -> number[] (timestamps)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
function rateLimited(ip) {
  const now = Date.now();
  const recent = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

contact.post("/contact", async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many messages just now — please try again in a few minutes." });
  }

  const name = String(req.body.name || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().slice(0, 160);
  const message = String(req.body.message || "").trim().slice(0, 4000);
  const gigId =
    req.body.gigId != null && Number.isFinite(Number(req.body.gigId)) ? Number(req.body.gigId) : null;

  if (!name) return res.status(400).json({ error: "Please add your name." });
  if (!emailRe.test(email)) return res.status(400).json({ error: "Please enter a valid email so we can reply." });
  if (!message) return res.status(400).json({ error: "Please add a message." });

  const to = process.env.SUPPORT_EMAIL || "nathanperrey@scoregig.ca";
  const subject = `ScoreGIG contact — ${name}${gigId ? ` (gig #${gigId})` : ""}`;
  const text =
`New message from the ScoreGIG contact form:

Name:   ${name}
Email:  ${email}
${gigId ? `Gig:    #${gigId}\n` : ""}Message:
${message}

— Reply directly to this email to respond to ${name}.`;

  const result = await sendRawEmail({ to, replyTo: email, subject, text });
  if (!result.ok) {
    console.error("contact: send failed:", result.detail);
    return res.status(502).json({ error: "Couldn't send your message right now. Please try again in a bit." });
  }
  res.json({ ok: true });
});
