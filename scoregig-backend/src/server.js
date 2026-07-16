// server.js — Express app + Stripe webhooks.
//
// Local dev:
//   1. cp .env.example .env   (fill in your sk_test key)
//   2. npm install && npm run dev
//   3. stripe listen --forward-to localhost:4000/webhooks/stripe
//      (paste the whsec_... it prints into .env as STRIPE_WEBHOOK_SECRET)
import express from "express";
import cors from "cors";
import "dotenv/config";
import { db, logEvent } from "./db.js";
import { stripe } from "./stripe.js";
import { accounts } from "./routes/accounts.js";
import { gigs } from "./routes/gigs.js";
import { authRoutes } from "./routes/authRoutes.js";
import { admin } from "./routes/admin.js";
import { messages } from "./routes/messages.js";
import { startReleaseJob, releaseDuePayments } from "./jobs/release.js";
import { startMessageCleanupJob } from "./jobs/cleanupMessages.js";
import { applyInboundSms, verifyTwilioSignature } from "./notify.js";
import { userByConsentToken, confirmConsent } from "./guardian.js";

const app = express();
app.use(cors({ origin: process.env.APP_URL }));

/* ----------------------------- WEBHOOKS ---------------------------------- */
// MUST be registered before express.json() — Stripe signature verification
// needs the raw request body.
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send("Invalid signature");
  }

  switch (event.type) {
    // Organizer finished saving a card → store it as their default.
    case "setup_intent.succeeded": {
      const si = event.data.object;
      db.prepare("UPDATE users SET default_payment_method=? WHERE stripe_customer_id=?")
        .run(si.payment_method, si.customer);
      break;
    }
    // Scorekeeper (or their guardian) finished Connect onboarding.
    case "account.updated": {
      const acct = event.data.object;
      db.prepare("UPDATE users SET payouts_enabled=?, onboarding_submitted=? WHERE stripe_account_id=?")
        .run(acct.details_submitted && acct.charges_enabled ? 1 : 0, acct.details_submitted ? 1 : 0, acct.id);
      break;
    }
    // A claim charge was disputed by the cardholder — freeze the gig.
    case "charge.dispute.created": {
      const gigId = event.data.object.metadata?.gig_id;
      if (gigId) {
        db.prepare("UPDATE gigs SET status='issue', release_at=NULL WHERE id=? AND status IN ('claimed','arrived','completed')")
          .run(gigId);
        logEvent(gigId, "issue", "Payment disputed · payout paused");
      }
      break;
    }
    default:
      break; // ignore events we don't handle
  }

  res.json({ received: true });
});

/* ----------------------- TWILIO INBOUND SMS (STOP/START) ------------------ */
// Twilio also auto-handles STOP at the carrier level; this keeps our own opt-out
// state in sync. Configure this URL as the messaging webhook in the Twilio
// console, and set TWILIO_WEBHOOK_URL so signatures are verified.
app.post("/webhooks/twilio-sms", express.urlencoded({ extended: false }), (req, res) => {
  if (!verifyTwilioSignature(req)) return res.status(403).send("invalid signature");
  try {
    applyInboundSms(req.body.From, req.body.Body);
  } catch (e) {
    console.error("twilio webhook error:", e.message);
  }
  res.set("Content-Type", "text/xml").send("<Response></Response>");
});

/* ------------------- GUARDIAN CONSENT (server-rendered) ------------------- */
// The link in the guardian's email opens these pages directly. Kept as plain
// server-rendered HTML so it works even when the SPA isn't running, and so the
// click itself (from the guardian's own inbox) is the proof of consent.
function consentPage({ title, heading, message, showButton, token }) {
  const button = showButton
    ? `<form method="POST" action="/guardian-consent/${token}/confirm" style="margin-top:24px">
         <button type="submit" style="background:#F5A800;color:#16243D;border:none;border-radius:10px;padding:14px 22px;font-size:16px;font-weight:800;cursor:pointer;width:100%">I confirm — I consent</button>
       </form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title></head>
    <body style="margin:0;background:#16243D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="max-width:440px;width:100%;background:#fff;border-radius:18px;padding:28px">
        <div style="font-size:30px;font-weight:900;letter-spacing:0.5px;color:#16243D;text-align:center">SCORE<span style="color:#F5A800">GIG</span></div>
        <h1 style="font-size:19px;color:#16243D;margin:20px 0 8px">${heading}</h1>
        <p style="font-size:14px;line-height:1.5;color:#3a3a3a;margin:0">${message}</p>
        ${button}
      </div>
    </body></html>`;
}

app.get("/guardian-consent/:token", (req, res) => {
  const found = userByConsentToken(req.params.token);
  if (!found) {
    return res.status(404).send(consentPage({
      title: "ScoreGIG — link not found",
      heading: "This link isn't valid",
      message: "We couldn't find a pending consent request for this link. It may have already been confirmed, or the link may be incomplete. If your child is still waiting, ask them to resend the consent email from their ScoreGIG account.",
      showButton: false,
    }));
  }
  if (found.expired) {
    return res.status(410).send(consentPage({
      title: "ScoreGIG — link expired",
      heading: "This link has expired",
      message: "For security, consent links expire after 14 days. Please ask your child to resend the consent email from their ScoreGIG account, and we'll send a fresh link to this address.",
      showButton: false,
    }));
  }
  if (found.user.guardian_consent_status === "approved") {
    return res.send(consentPage({
      title: "ScoreGIG — already confirmed",
      heading: "Consent already confirmed",
      message: "Thanks — consent for this account has already been recorded. There's nothing more you need to do.",
      showButton: false,
    }));
  }
  const minor = found.user.display_name || found.user.name || "Your child";
  res.send(consentPage({
    title: "ScoreGIG — parent/guardian consent",
    heading: "Parent / guardian consent",
    message: `${minor} has signed up for ScoreGIG, a marketplace where people are paid to keep score at local sporting events. As their parent or guardian, you're confirming that you consent to them creating a ScoreGIG account, taking paid scorekeeping gigs, and to ScoreGIG collecting the information needed to operate the account and arrange payment. You can withdraw consent at any time by contacting ScoreGIG. By tapping the button below you confirm you are their parent or legal guardian.`,
    showButton: true,
    token: req.params.token,
  }));
});

app.post("/guardian-consent/:token/confirm", express.urlencoded({ extended: false }), (req, res) => {
  const found = userByConsentToken(req.params.token);
  if (!found || found.expired) {
    return res.status(found?.expired ? 410 : 404).send(consentPage({
      title: "ScoreGIG — link unavailable",
      heading: found?.expired ? "This link has expired" : "This link isn't valid",
      message: "Please ask your child to resend the consent email from their ScoreGIG account for a fresh link.",
      showButton: false,
    }));
  }
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  confirmConsent(found.user, ip);
  res.send(consentPage({
    title: "ScoreGIG — consent confirmed",
    heading: "Thank you — consent confirmed",
    message: "Your child's ScoreGIG account is now active and they can pick up paid scorekeeping gigs. You can close this page. If you have any questions, just reply to the email we sent you.",
    showButton: false,
  }));
});

/* ------------------------------- API -------------------------------------- */
app.use(express.json());
app.use("/api", authRoutes);
app.use("/api", accounts);
app.use("/api", gigs);
app.use("/api", admin);
app.use("/api", messages);

// Internal payout trigger for external schedulers (cron / cloud scheduler).
// Protect with a shared secret in the x-internal-secret header. Only useful when
// RELEASE_SCHEDULER=external; harmless otherwise.
app.post("/internal/run-release", async (req, res) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.get("x-internal-secret") !== secret) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const result = await releaseDuePayments();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`ScoreGIG API running on http://localhost:${port}`);
  startReleaseJob();
  startMessageCleanupJob();
});
