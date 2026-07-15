// routes/accounts.js — payment setup for both sides of the marketplace.
//
// Organizers:    save a card via SetupIntent (charged later when a gig is claimed,
//                because raw card authorizations expire after ~7 days — too short
//                for gigs posted weeks ahead).
// Scorekeepers:  onboard onto Stripe Connect so they can receive payouts.
import { Router } from "express";
import { db } from "../db.js";
import { stripe } from "../stripe.js";
import { auth, isMinor } from "../auth.js";
import { cancellationStanding } from "../reliability.js";
import { checkClean } from "../clean.js";

export const accounts = Router();

/* ---------------------------------------------------------------- */
/* ORGANIZER: create a SetupIntent so the frontend can save a card  */
/* Frontend: confirm with stripe.confirmCardSetup(clientSecret)      */
/* ---------------------------------------------------------------- */
accounts.post("/organizers/setup-intent", auth(), async (req, res) => {
  try {
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: req.user.name,
        email: req.user.email,
        metadata: { scoregig_user_id: String(req.user.id) },
      });
      customerId = customer.id;
      db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?")
        .run(customerId, req.user.id);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session", // we charge later, when a scorekeeper claims
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't start card setup. Try again." });
  }
});

/* ---------------------------------------------------------------- */
/* SCOREKEEPER: create a Connect account + hosted onboarding link    */
/*                                                                   */
/* IMPORTANT — under-18 scorekeepers:                                */
/* Stripe Express/Custom accounts require the account holder to be   */
/* 18+. For minors, route payouts through a parent/guardian: the     */
/* guardian completes onboarding and owns the payout account. We     */
/* flag minors here so your frontend can show the guardian flow.     */
/* ---------------------------------------------------------------- */
accounts.post("/scorekeepers/onboard", auth(), async (req, res) => {
  try {
    const minor = isMinor(req.user);

    let accountId = req.user.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "CA",
        email: req.user.email,
        capabilities: { transfers: { requested: true } },
        business_type: "individual",
        // Default payout schedule: weekly on Wednesdays (free, standard 2-day bank transfer).
        // Scorekeepers can optionally cash out instantly for a small fee at any time.
        settings: {
          payouts: {
            schedule: { interval: "weekly", weekly_anchor: "wednesday" },
          },
        },
        metadata: {
          scoregig_user_id: String(req.user.id),
          guardian_account: minor ? "true" : "false",
        },
      });
      accountId = account.id;
      db.prepare("UPDATE users SET stripe_account_id = ? WHERE id = ?")
        .run(accountId, req.user.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.APP_URL}/onboarding/retry`,
      return_url: `${process.env.APP_URL}/onboarding/done`,
      type: "account_onboarding",
    });

    res.json({
      url: link.url,
      guardianRequired: minor,
      note: minor
        ? "You're under 18, so a parent or guardian must complete this step — payouts will go to their account."
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't start payout setup. Try again." });
  }
});

// Edit your scorekeeper resume: short bio, experience/history, home city.
accounts.patch("/me/profile", auth(), (req, res) => {
  // Partial-safe: only fields actually present in the body are changed, so a
  // settings save (phone / notifications) won't wipe the resume and vice-versa.
  const has = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
  // Display name: what other users see. Real name is never editable here.
  const displayName = has("displayName")
    ? (req.body.displayName || "").trim().slice(0, 40)
    : (req.user.display_name || req.user.name);
  if (has("displayName")) {
    const c = checkClean(displayName, "display name");
    if (!c.ok) return res.status(400).json({ error: c.error });
    if (!displayName) return res.status(400).json({ error: "Display name can't be empty." });
  }
  const bio = has("bio") ? (req.body.bio || "").slice(0, 280) : (req.user.bio || "");
  const experience = has("experience") ? (req.body.experience || "").slice(0, 2000) : (req.user.experience || "");
  const city = has("city") ? (req.body.city || "").slice(0, 120) : (req.user.city || "");
  const gamesWorked = has("gamesWorked") ? (req.body.gamesWorked || "").slice(0, 8) : (req.user.games_worked || "");
  // sports: array of strings from the known list; store as JSON.
  let sports;
  if (has("sports")) {
    sports = (Array.isArray(req.body.sports) ? req.body.sports.slice(0, 12) : [])
      .filter((s) => typeof s === "string" && s.length < 40);
  } else {
    sports = req.user.sports ? JSON.parse(req.user.sports) : [];
  }
  for (const [val, label] of [[bio, "bio"], [experience, "experience"]]) {
    const c = checkClean(val, label);
    if (!c.ok) return res.status(400).json({ error: c.error });
  }
  // Account-level settings (editable here too): SMS phone + notifications on/off.
  // Fall back to existing values so a resume save never wipes them.
  const phone = typeof req.body.phone === "string"
    ? req.body.phone.trim().slice(0, 20)
    : (req.user.phone || "");
  const notificationsEnabled = typeof req.body.notificationsEnabled === "boolean"
    ? req.body.notificationsEnabled
    : (req.user.notifications_enabled == null ? true : Boolean(req.user.notifications_enabled));

  // SMS consent (CASL): explicit opt-in required to text. An in-app opt-in also
  // clears any prior STOP; opting out here stops texts (email is unaffected).
  let smsConsent = req.user.sms_consent ? 1 : 0;
  let smsConsentAt = req.user.sms_consent_at || null;
  let smsOptedOut = req.user.sms_opted_out ? 1 : 0;
  if (typeof req.body.smsConsent === "boolean") {
    if (req.body.smsConsent) {
      smsConsentAt = req.user.sms_consent ? smsConsentAt : Date.now();
      smsConsent = 1;
      smsOptedOut = 0;
    } else {
      smsConsent = 0;
    }
  }

  db.prepare("UPDATE users SET display_name = ?, bio = ?, experience = ?, city = ?, games_worked = ?, sports = ?, phone = ?, notifications_enabled = ?, sms_consent = ?, sms_consent_at = ?, sms_opted_out = ? WHERE id = ?")
    .run(displayName, bio, experience, city, gamesWorked, JSON.stringify(sports), phone || null, notificationsEnabled ? 1 : 0, smsConsent, smsConsentAt, smsOptedOut, req.user.id);
  res.json({ displayName, bio, experience, city, gamesWorked, sports, phone: phone || "", notificationsEnabled, smsConsent: Boolean(smsConsent), smsOptedOut: Boolean(smsOptedOut) });
});

// Public scorekeeper profile: resume + earned badges + completed gig history.
// Any logged-in organizer can view this to vet who claimed (or might claim).
accounts.get("/scorekeepers/:id/profile", auth(), (req, res) => {
  const u = db.prepare("SELECT id, display_name, bio, experience, games_worked, sports, city FROM users WHERE id = ?")
    .get(req.params.id);
  if (!u) return res.status(404).json({ error: "Scorekeeper not found." });
  u.name = u.display_name || "Scorekeeper";  // never expose real name publicly
  delete u.display_name;
  u.gamesWorked = u.games_worked || "";
  u.sports = u.sports ? JSON.parse(u.sports) : [];
  delete u.games_worked;

  const history = db.prepare(`
    SELECT id, title, sport, area, start_at, badge
    FROM gigs
    WHERE claimed_by = ? AND status IN ('completed','paid')
    ORDER BY start_at DESC LIMIT 50
  `).all(u.id);

  const badgeCounts = { mvp: 0, team: 0, five: 0 };
  history.forEach((g) => { if (g.badge) badgeCounts[g.badge]++; });

  // Reliability history — surfaced to organizers at approval time so they can
  // make an informed call. (Jun15 #3)
  // Cancellations age off after 30 days: a scorekeeper who has a clean month
  // gets a clean record again, so an old one-off doesn't follow them forever.
  const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
  const noShows = db.prepare(
    "SELECT COUNT(*) AS n FROM gigs WHERE claimed_by = ? AND status = 'no_show'"
  ).get(u.id).n;
  const issuesReported = db.prepare(
    "SELECT COUNT(*) AS n FROM issues i JOIN gigs g ON g.id = i.gig_id WHERE g.claimed_by = ?"
  ).get(u.id).n;
  const cancellations = db.prepare(
    "SELECT COUNT(*) AS n FROM cancellations WHERE user_id = ? AND t >= ?"
  ).get(u.id, Date.now() - RECENT_MS).n;

  res.json({
    ...u,
    gigsCompleted: history.length,
    badgeCounts,
    history,
    reliability: { noShows, issuesReported, cancellations },
    standing: cancellationStanding(u.id),
  });
});

/* ---------------------------------------------------------------- */
/* Webhook-independent fallbacks (handy in local dev, harmless in    */
/* production where webhooks also update these).                     */
/* ---------------------------------------------------------------- */

// After stripe.confirmCardSetup succeeds, the frontend posts the SetupIntent
// id here so we store the card immediately instead of waiting for a webhook.
accounts.post("/organizers/confirm-card", auth(), async (req, res) => {
  try {
    const si = await stripe.setupIntents.retrieve(req.body.setupIntentId);
    if (si.customer !== req.user.stripe_customer_id || si.status !== "succeeded") {
      return res.status(400).json({ error: "Card setup not completed." });
    }
    db.prepare("UPDATE users SET default_payment_method = ? WHERE id = ?")
      .run(si.payment_method, req.user.id);
    res.json({ cardSaved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't verify card setup." });
  }
});

// Re-check Connect onboarding status directly from Stripe.
// We consider a scorekeeper "ready" once Stripe has details_submitted and
// charges_enabled. In test mode (and during real verification windows)
// payouts_enabled can lag or stay false even though onboarding is done, so
// gating only on payouts_enabled would trap users in a loop.
accounts.post("/scorekeepers/refresh-status", auth(), async (req, res) => {
  try {
    if (!req.user.stripe_account_id) return res.json({ payoutsEnabled: false });
    const acct = await stripe.accounts.retrieve(req.user.stripe_account_id);
    // Use details_submitted + transfers capability (not payouts_enabled which lags in test mode).
    const transfersActive = acct.capabilities?.transfers === "active";
    const ready = Boolean(acct.details_submitted && (transfersActive || acct.charges_enabled));
    // Remember that they finished the Stripe form even if Stripe is still
    // verifying — so the UI shows "verifying" instead of asking them to redo it. (#11)
    db.prepare("UPDATE users SET payouts_enabled = ?, onboarding_submitted = ? WHERE id = ?")
      .run(ready ? 1 : 0, acct.details_submitted ? 1 : 0, req.user.id);
    res.json({ payoutsEnabled: ready, detailsSubmitted: Boolean(acct.details_submitted) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't refresh payout status." });
  }
});

// Cash out now — scorekeeper requests an instant payout of their available
// Connect balance. Stripe charges ~1.5% for instant (vs free weekly).
// We pass the fee through transparently rather than absorbing it.
const INSTANT_PAYOUT_FEE_PERCENT = 1.5;

accounts.post("/scorekeepers/cashout", auth(), async (req, res) => {
  if (!req.user.stripe_account_id || !req.user.payouts_enabled) {
    return res.status(402).json({ error: "Finish payout setup before cashing out." });
  }
  try {
    // Check their available balance on the Connect account.
    const balance = await stripe.balance.retrieve({ stripeAccount: req.user.stripe_account_id });
    const available = balance.available.find((b) => b.currency === "cad");
    const availableCents = available ? available.amount : 0;

    if (availableCents < 100) {
      return res.status(400).json({ error: "No balance available to cash out yet." });
    }

    // Fee is charged to the amount (deducted from what they receive).
    const feeCents = Math.ceil((availableCents * INSTANT_PAYOUT_FEE_PERCENT) / 100);
    const payoutCents = availableCents - feeCents;

    const payout = await stripe.payouts.create(
      { amount: availableCents, currency: "cad", method: "instant" },
      { stripeAccount: req.user.stripe_account_id }
    );

    res.json({
      ok: true,
      availableCents,
      feeCents,
      payoutCents,
      eta: "Usually within minutes to your debit card.",
    });
  } catch (err) {
    console.error("Cash-out failed:", err.code || err.message);
    // Instant payouts need a debit card linked — surface that helpfully.
    if (err.code === "instant_payouts_unsupported") {
      return res.status(400).json({
        error: "Instant payouts need a debit card linked to your Stripe account. Add one in your payout settings.",
      });
    }
    res.status(500).json({ error: "Cash-out failed — try again or wait for Wednesday's payout." });
  }
});
