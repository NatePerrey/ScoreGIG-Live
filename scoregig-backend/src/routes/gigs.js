// routes/gigs.js — the full gig lifecycle, with every time rule enforced
// server-side (never trust the client's clock):
//
//   open ──claim──▶ claimed ──arrive──▶ arrived ──complete──▶ completed ──auto──▶ paid
//                      │ (organizer, 5 min after start, not arrived)    │ (organizer)
//                      └────────▶ no_show (refund)                      └──▶ issue (hold)
import { Router } from "express";
import jwt from "jsonwebtoken";
import { db, logEvent, gigWithEvents } from "../db.js";
import { stripe, FEE_PERCENT, HOLD_HOURS, MIN_PAY_CENTS } from "../stripe.js";
import { auth } from "../auth.js";
import { checkClean } from "../clean.js";
import { guardianBlocked } from "../guardian.js";
import { minPayCents, isValidProvince, PROVINCES, MIN_WAGE_CENTS, FLAT_MIN_CENTS, MIN_WAGE_AS_OF } from "../pricing.js";
import { notifyGigState, sendPostConfirmation } from "../notify.js";
import { broadcastNewGig } from "../broadcast.js";
import { cancellationStanding } from "../reliability.js";

export const gigs = Router();
const MIN = 60 * 1000;

function kmBetween(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------- LIST (location-aware) ------------------------- */
// GET /gigs?lat=43.65&lng=-79.38&radiusKm=25      → open gigs near the viewer
// GET /gigs?mine=1                                 → gigs I posted OR claimed
// Reference data for the pay floor: flat minimum + provincial minimum wages.
// Public (no auth) so the post form can show the live floor as the organizer
// adjusts duration/province. Backend enforces the same numbers independently.
gigs.get("/min-wage", (_req, res) => {
  res.json({ flatMinCents: FLAT_MIN_CENTS, rates: MIN_WAGE_CENTS, provinces: PROVINCES, asOf: MIN_WAGE_AS_OF });
});

gigs.get("/gigs", auth(), (req, res) => {
  if (req.query.mine) {
    // Gigs I posted (unless I've removed them from my list) OR claimed OR
    // requested. hidden_by_owner only hides a finished gig from the organizer's
    // own view — a scorekeeper who worked it still sees it via claimed_by.
    const rows = db.prepare(
      "SELECT id FROM gigs WHERE (owner_id = ? AND COALESCE(hidden_by_owner,0) = 0) OR claimed_by = ? OR requested_by = ? ORDER BY start_at"
    ).all(req.user.id, req.user.id, req.user.id);
    return res.json(rows.map((r) => gigWithEvents(r.id)));
  }

  const now = Date.now();
  // Show gigs that haven't started yet AND ones that started up to 5 minutes ago
  // (a scorekeeper can still grab a just-started game). After 5 min past start,
  // the gig drops off the available list.
  const visibleSince = now - 5 * MIN;
  let rows = db
    .prepare("SELECT id, lat, lng FROM gigs WHERE status = 'open' AND start_at > ?")
    .all(visibleSince);

  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  const radiusKm = Math.min(parseFloat(req.query.radiusKm) || 25, 250);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    rows = rows.filter(
      (g) => g.lat == null || kmBetween({ lat, lng }, g) <= radiusKm
    );
  }
  res.json(rows.map((r) => gigWithEvents(r.id)));
});

gigs.get("/gigs/:id", auth(), (req, res) => {
  const gig = gigWithEvents(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  res.json(gig);
});

/* ------------------------------- CREATE ---------------------------------- */
// Requires a saved card (see /organizers/setup-intent). No charge happens yet.
const SERVICES = ["scorekeeper", "scoresheet"];
const SERVICE_LABEL = { scorekeeper: "Scorekeeper", scoresheet: "Scoresheet" };

gigs.post("/gigs", auth(), (req, res) => {
  if (guardianBlocked(req.user)) {
    return res.status(403).json({ error: "Your account is waiting for parent/guardian approval. Once they confirm the email we sent, you can post and request gigs." });
  }
  const { title, sport, type, postedAs, games } = req.body;
  // Organizer's operational notes to the scorekeeper (Bluetooth at the rink,
  // record shots on net, etc.). Posting-level: applied to every gig created here.
  const notes = String(req.body.notes || "").slice(0, 1000).trim() || null;

  if (!req.user.default_payment_method) {
    return res.status(402).json({ error: "Save a payment card before posting a gig." });
  }
  if (!title || !sport) return res.status(400).json({ error: "Title and sport are required." });
  const POSTED_AS = ["Parent", "Team Manager", "Coach", "Tournament Coordinator", "Association Admin"];
  if (!POSTED_AS.includes(postedAs)) {
    return res.status(400).json({ error: "Please choose how you're posting (Parent, Team Manager, etc.)." });
  }
  const titleClean = checkClean(title, "gig title");
  if (!titleClean.ok) return res.status(400).json({ error: titleClean.error });

  // Which roles to hire for. Each selected service produces its OWN gig per game
  // (a scorekeeper gig + a scoresheet gig can't be the same person — see /request).
  let services = Array.isArray(req.body.services) && req.body.services.length
    ? req.body.services.filter((s) => SERVICES.includes(s))
    : ["scorekeeper"];
  if (services.length === 0) services = ["scorekeeper"];

  // games is always an array of individual game objects.
  // Each: {venue, location, area, lat, lng, startAt, durationMin, payCents, homeTeam, awayTeam, division}
  if (!Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: "At least one game is required." });
  }
  for (const g of games) {
    if (!g.location) return res.status(400).json({ error: "Each game needs a location." });
    if (!Number.isFinite(g.startAt) || g.startAt <= Date.now()) {
      return res.status(400).json({ error: "Each game must have a future start time." });
    }
    const prov = String(g.province || "").toUpperCase();
    if (!isValidProvince(prov)) {
      return res.status(400).json({ error: "Each game needs a valid province so we can enforce minimum-wage pay." });
    }
    const minCents = minPayCents(prov, g.durationMin);
    // Pay can be a single payCents, or a per-role map (payByService) when the
    // organizer hires both roles at different rates. Every rate must clear the floor.
    const paysToCheck = g.payByService ? Object.values(g.payByService) : [g.payCents];
    for (const pc of paysToCheck) {
      if (!Number.isInteger(pc) || pc < minCents) {
        const mins = Number(g.durationMin) || 60;
        return res.status(400).json({ error: `A ${mins}-minute gig in ${prov} must pay the scorekeeper at least $${(minCents / 100).toFixed(2)} CAD — that's minimum wage for the time. Please raise the pay.` });
      }
    }
  }

  // Group everything in this posting (all games × all roles) under one id so
  // they can be viewed together and so the cross-role conflict guard can work.
  const totalGigs = games.length * services.length;
  const tournamentId = totalGigs > 1 ? `t_${req.user.id}_${Date.now()}` : null;

  const created = [];
  for (const service of services) {
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      // Per-role pay when hiring both roles at different rates; else the game's single pay.
      const payCents = (g.payByService && Number.isInteger(g.payByService[service])) ? g.payByService[service] : g.payCents;
      const feeCents = Math.round((payCents * FEE_PERCENT) / 100);
      let gameTitle = title;
      if (games.length > 1) gameTitle += ` — Game ${i + 1}`;
      if (services.length > 1) gameTitle += ` · ${SERVICE_LABEL[service]}`;
      const info = db.prepare(`
        INSERT INTO gigs (owner_id, title, posted_as, sport, type, service, venue, game_code, location, area, lat, lng,
                          start_at, duration_min, pay_cents, fee_cents, home_team, away_team, province, tournament_id, notes, division)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, gameTitle, postedAs, sport, type || "single", service,
             g.venue || null, g.gameCode || null, g.location, g.area || null, g.lat ?? null, g.lng ?? null,
             g.startAt, g.durationMin || 60, payCents, feeCents,
             g.homeTeam || null, g.awayTeam || null, String(g.province || "").toUpperCase(), tournamentId, notes,
             (g.division || "").trim() || null);
      logEvent(info.lastInsertRowid, "auth", "Card on file · charged only when you approve someone");
      created.push(gigWithEvents(info.lastInsertRowid));
    }
  }

  // Ping matching scorekeepers that a new gig just opened (fire-and-forget so
  // it never blocks the organizer's post from returning).
  for (const g of created) broadcastNewGig(g.id);

  // Email the organizer a receipt of what they just posted (fire-and-forget).
  sendPostConfirmation(req.user.id, created).catch((e) => console.error("post-confirmation error:", e.message));

  res.status(201).json(created.length === 1 ? created[0] : created);
});

/* -------------------------------- EDIT ----------------------------------- */
// Owner-only, and only while the gig is still open (unclaimed).
gigs.patch("/gigs/:id", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (gig.owner_id !== req.user.id) return res.status(403).json({ error: "Only the organizer who posted this gig can edit it." });
  if (gig.status !== "open") return res.status(409).json({ error: "This gig has been claimed and can no longer be edited." });

  const f = { ...gig, ...req.body };
  const prov = String(f.province || gig.province || "").toUpperCase();
  const minCents = isValidProvince(prov) ? minPayCents(prov, f.duration_min) : FLAT_MIN_CENTS;
  if (f.pay_cents < minCents) {
    const mins = Number(f.duration_min) || 60;
    return res.status(400).json({ error: `A ${mins}-minute gig in ${prov || "this province"} must pay at least $${(minCents / 100).toFixed(2)} CAD — minimum wage for the time.` });
  }

  const feeCents = Math.round((f.pay_cents * FEE_PERCENT) / 100);
  const notes = req.body.notes !== undefined
    ? (String(req.body.notes || "").slice(0, 1000).trim() || null)
    : (gig.notes ?? null);
  db.prepare(`
    UPDATE gigs SET title=?, sport=?, type=?, games=?, venue=?, game_code=?, location=?, area=?, lat=?, lng=?,
                    start_at=?, duration_min=?, pay_cents=?, fee_cents=?, home_team=?, away_team=?, province=?, notes=?, division=?
    WHERE id=?
  `).run(f.title, f.sport, f.type, f.games, f.venue ?? null, f.game_code ?? null, f.location, f.area, f.lat, f.lng,
         f.start_at, f.duration_min, f.pay_cents, feeCents,
         f.home_team ?? null, f.away_team ?? null, prov || null, notes,
         (req.body.division !== undefined ? (String(req.body.division || "").trim() || null) : (gig.division ?? null)),
         gig.id);

  if (f.pay_cents !== gig.pay_cents) {
    logEvent(gig.id, "auth", `Gig edited · new pay $${(f.pay_cents / 100).toFixed(2)} CAD`);
  }
  res.json(gigWithEvents(gig.id));
});

/* ------------------------------- REQUEST --------------------------------- */
// Scorekeeper requests a gig. Normally no charge yet — the organizer must
// approve (the safety gate). EXCEPTION: a scorekeeper who has already completed
// 3+ gigs for THIS organizer is pre-approved and locked in instantly, charging
// the organizer's card right away. (Jun14 #1.1)

// Shared: charge the organizer's saved card (pay + fee) and lock the gig to the
// scorekeeper. Used by both instant pre-approval and manual approval.
async function captureAndLock(gig, scorekeeper, owner, captureLabel) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: gig.pay_cents + gig.fee_cents,
    currency: "cad",
    customer: owner.stripe_customer_id,
    payment_method: owner.default_payment_method,
    off_session: true,
    confirm: true,
    transfer_group: `gig_${gig.id}`,
    description: `ScoreGIG: ${gig.title}`,
    metadata: { gig_id: String(gig.id) },
  });
  db.prepare("UPDATE gigs SET status='claimed', claimed_by=?, requested_by=NULL, payment_intent_id=? WHERE id=?")
    .run(scorekeeper.id, paymentIntent.id, gig.id);
  logEvent(gig.id, "capture", captureLabel);
  notifyGigState(gig.id, "Claimed", [scorekeeper.id]);
  return paymentIntent;
}

gigs.post("/gigs/:id/request", auth(), async (req, res) => {
  if (guardianBlocked(req.user)) {
    return res.status(403).json({ error: "Your account is waiting for parent/guardian approval. Once they confirm the email we sent, you can request gigs." });
  }
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (gig.status !== "open") return res.status(409).json({ error: "This gig isn't open for requests right now." });
  if (gig.owner_id === req.user.id) return res.status(400).json({ error: "You can't request your own gig." });
  if (!req.user.payouts_enabled) {
    return res.status(402).json({ error: "Finish payout setup before requesting gigs, so we can pay you." });
  }

  // Cross-role guard: one person can't cover two different roles in the same
  // event (e.g. run the clock AND keep the scoresheet) UNLESS they've documented
  // scorekeeping experience on their profile. This is the intentional "I can do
  // both" opt-in — describing your experience is what unlocks dual-role. (#14)
  if (gig.tournament_id) {
    const conflict = db.prepare(
      "SELECT id FROM gigs WHERE tournament_id=? AND service IS NOT ? AND (claimed_by=? OR requested_by=?)"
    ).get(gig.tournament_id, gig.service, req.user.id, req.user.id);
    if (conflict) {
      const experienced = Boolean(req.user.experience && req.user.experience.trim().length >= 15);
      if (!experienced) {
        return res.status(409).json({
          error: "You're already signed up for a different role in this event. To cover both the scorekeeper and scoresheet roles in the same game, add a short description of your scorekeeping experience to your profile first.",
        });
      }
    }
  }

  const who = req.user.display_name || req.user.name;

  // Pre-approved regular? 3+ completed gigs for this same organizer.
  // BUT recent over-cancelling pauses this fast-track (they can still request
  // normally; the organizer just approves manually). Self-corrects in 30 days.
  const standing = cancellationStanding(req.user.id);
  const priorWithOrganizer = db.prepare(
    "SELECT COUNT(*) AS n FROM gigs WHERE owner_id=? AND claimed_by=? AND status IN ('completed','paid')"
  ).get(gig.owner_id, req.user.id).n;

  if (priorWithOrganizer >= 3 && !standing.instantClaimBlocked) {
    const owner = db.prepare("SELECT * FROM users WHERE id=?").get(gig.owner_id);
    if (owner?.default_payment_method && owner?.stripe_customer_id) {
      try {
        logEvent(gig.id, "request", `${who} requested this gig`);
        await captureAndLock(gig, req.user, owner,
          `${who} is a pre-approved regular (3+ gigs with this organizer) · auto-approved & payment captured`);
        return res.json({ ...gigWithEvents(gig.id), instantClaim: true });
      } catch (err) {
        // Charge failed — fall back to a normal pending request rather than fail hard.
        console.error("Instant-claim charge failed, falling back to request:", err.code || err.message);
        db.prepare("UPDATE gigs SET status='open', requested_by=NULL, claimed_by=NULL WHERE id=?").run(gig.id);
      }
    }
  }

  db.prepare("UPDATE gigs SET status='pending', requested_by=? WHERE id=?")
    .run(req.user.id, gig.id);
  logEvent(gig.id, "request", `${who} requested this gig · awaiting your approval`);
  notifyGigState(gig.id, "Pending approval");
  res.json(gigWithEvents(gig.id));
});

/* ------------------------------- APPROVE --------------------------------- */
// Organizer approves the requesting scorekeeper. NOW the card is charged
// (pay + fee) and held in escrow, and the claim is locked in.
gigs.post("/gigs/:id/approve", auth(), async (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (gig.owner_id !== req.user.id) return res.status(403).json({ error: "Only the organizer who posted this gig can approve." });
  if (gig.status !== "pending" || !gig.requested_by) {
    return res.status(409).json({ error: "There's no pending request to approve." });
  }

  const scorekeeper = db.prepare("SELECT * FROM users WHERE id = ?").get(gig.requested_by);
  const owner = req.user;

  try {
    await captureAndLock(gig, scorekeeper, owner,
      `Approved ${scorekeeper.display_name || scorekeeper.name} · payment captured & held`);
    res.json(gigWithEvents(gig.id));
  } catch (err) {
    console.error("Approve charge failed:", err.code || err.message);
    res.status(402).json({
      error: "Your card couldn't be charged, so the approval didn't go through. Please check your payment card and try again.",
    });
  }
});

/* ------------------------------- DECLINE --------------------------------- */
// Organizer declines the request; the gig reopens for others. Softer wording
// is shown to the scorekeeper on their side.
gigs.post("/gigs/:id/decline", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (gig.owner_id !== req.user.id) return res.status(403).json({ error: "Only the organizer who posted this gig can decline." });
  if (gig.status !== "pending") return res.status(409).json({ error: "There's no pending request to decline." });

  const declinedSk = gig.requested_by;
  db.prepare("UPDATE gigs SET status='open', requested_by=NULL WHERE id=?").run(gig.id);
  logEvent(gig.id, "decline", "Request not accepted · gig reopened");
  notifyGigState(gig.id, "Request declined", [declinedSk]);
  res.json(gigWithEvents(gig.id));
});

/* ------------------------------- ARRIVE ---------------------------------- */
// Scorekeepers confirm arrival, allowed from 20 minutes before start.
gigs.post("/gigs/:id/arrive", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.claimed_by !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (gig.status !== "claimed") return res.status(409).json({ error: "Arrival can't be confirmed right now." });
  if (Date.now() < gig.start_at - 20 * MIN) {
    return res.status(409).json({ error: "Arrival opens 20 minutes before start time." });
  }

  db.prepare("UPDATE gigs SET status='arrived' WHERE id=?").run(gig.id);
  logEvent(gig.id, "arrive", "Arrival confirmed at the table");
  notifyGigState(gig.id, "Arrival confirmed");
  res.json(gigWithEvents(gig.id));
});

/* ------------------------------ COMPLETE --------------------------------- */
// After the game ends. Starts the auto-release clock.
gigs.post("/gigs/:id/complete", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.claimed_by !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (gig.status !== "arrived") return res.status(409).json({ error: "Confirm arrival first." });
  if (Date.now() < gig.start_at + gig.duration_min * MIN) {
    return res.status(409).json({ error: "Mark complete after the game ends." });
  }

  const releaseAt = Date.now() + HOLD_HOURS * 60 * MIN;
  db.prepare("UPDATE gigs SET status='completed', release_at=? WHERE id=?").run(releaseAt, gig.id);
  logEvent(gig.id, "complete", `Marked complete · auto-releases in ${HOLD_HOURS}h unless an issue is reported`);
  notifyGigState(gig.id, "Completed");
  res.json(gigWithEvents(gig.id));
});

/* ------------------------------ NO-SHOW ---------------------------------- */
// Organizer-only, from 5 minutes after start, only if arrival was never
// confirmed. Refunds the captured payment in full. (Jun15 #5)
gigs.post("/gigs/:id/no-show", auth(), async (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (gig.status !== "claimed") return res.status(409).json({ error: "No-show can only be reported before arrival is confirmed." });
  if (Date.now() < gig.start_at + 5 * MIN) {
    return res.status(409).json({ error: "No-show reporting opens 5 minutes after start time." });
  }

  try {
    await stripe.refunds.create({ payment_intent: gig.payment_intent_id });
    db.prepare("UPDATE gigs SET status='no_show' WHERE id=?").run(gig.id);
    logEvent(gig.id, "refund", "No-show reported · payment refunded in full");
    notifyGigState(gig.id, "No-show reported");
    res.json(gigWithEvents(gig.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Refund failed — our team has been notified. Your funds are safe." });
  }
});

/* ----------------------- SCOREKEEPER CANCELS CLAIM ----------------------- */
// Things come up — a scorekeeper can back out of a gig they were approved for,
// up until they've confirmed arrival. The organizer is refunded in full and the
// gig reopens for someone else. The cancellation is recorded against the
// scorekeeper (it shows on their resume) to keep them accountable. (Jun15 #4)
gigs.post("/gigs/:id/cancel-claim", auth(), async (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.claimed_by !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (!["claimed", "arrived"].includes(gig.status)) {
    return res.status(409).json({ error: "You can only cancel before the gig is marked complete." });
  }

  try {
    if (gig.payment_intent_id) {
      await stripe.refunds.create({ payment_intent: gig.payment_intent_id });
    }
    // Record the cancellation for the scorekeeper's reliability history.
    db.prepare("INSERT INTO cancellations (gig_id, user_id, reason, t) VALUES (?, ?, ?, ?)")
      .run(gig.id, req.user.id, (req.body.reason || "").slice(0, 300), Date.now());
    // Reopen the gig so it can be picked up again; clear the claim + payment.
    db.prepare(
      "UPDATE gigs SET status='open', claimed_by=NULL, requested_by=NULL, payment_intent_id=NULL, release_at=NULL WHERE id=?"
    ).run(gig.id);
    logEvent(gig.id, "decline", `${req.user.display_name || req.user.name} cancelled · organizer refunded, gig reopened`);
    notifyGigState(gig.id, "Cancelled by scorekeeper", [req.user.id]);
    res.json({ ...gigWithEvents(gig.id), standing: cancellationStanding(req.user.id) });
  } catch (err) {
    console.error("Cancel-claim refund failed:", err.code || err.message);
    res.status(500).json({ error: "Couldn't process the cancellation refund — please try again." });
  }
});

/* ------------------------- ORGANIZER CANCELS GIG ------------------------- */
// The event fell through. Organizer cancels their own gig at any stage before
// payout. If a scorekeeper was already locked in, they're notified (the gig
// shows as Cancelled on their My Gigs) and the organizer's card is refunded.
// This is distinct from a no-show (which is the scorekeeper's fault). (Jun15 #7)
gigs.post("/gigs/:id/cancel", auth(), async (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (["completed", "paid", "no_show", "cancelled"].includes(gig.status)) {
    return res.status(409).json({ error: "This gig can no longer be cancelled." });
  }

  const reason = (req.body.reason || "").slice(0, 300);
  try {
    // Refund if a payment was already captured (someone was approved/locked in).
    if (gig.payment_intent_id && ["claimed", "arrived"].includes(gig.status)) {
      await stripe.refunds.create({ payment_intent: gig.payment_intent_id });
    }
    const hadScorekeeper = Boolean(gig.claimed_by);
    db.prepare("UPDATE gigs SET status='cancelled', cancelled_by=?, cancel_reason=?, release_at=NULL WHERE id=?")
      .run(req.user.id, reason, gig.id);
    logEvent(gig.id, "decline", hadScorekeeper
      ? `Organizer cancelled this gig · scorekeeper notified, payment refunded${reason ? ` · "${reason}"` : ""}`
      : `Organizer cancelled this gig${reason ? ` · "${reason}"` : ""}`);
    notifyGigState(gig.id, "Cancelled");
    res.json(gigWithEvents(gig.id));
  } catch (err) {
    console.error("Organizer cancel refund failed:", err.code || err.message);
    res.status(500).json({ error: "Couldn't process the cancellation refund — please try again." });
  }
});

// Organizer removes a finished gig from their own My Gigs list. This is a
// personal hide, not a delete: the gig row and its full history are preserved
// for records, payouts, and the scorekeeper's view. Only terminal gigs qualify
// so an active gig can't be hidden by accident. 'issue' is excluded on purpose
// — a gig under review should stay visible until it's resolved. (Jul1 #7)
gigs.post("/gigs/:id/dismiss", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  const dismissible = ["completed", "paid", "no_show", "cancelled", "expired"];
  if (!dismissible.includes(gig.status)) {
    return res.status(409).json({ error: "Only finished, worked, cancelled, or expired gigs can be removed from your list." });
  }
  db.prepare("UPDATE gigs SET hidden_by_owner=1 WHERE id=?").run(gig.id);
  res.json({ ok: true, id: gig.id });
});

/* ------------------------- APPROVE & RELEASE NOW ------------------------- */
// Organizer is happy — release payout immediately instead of waiting 2 hours.
// Sets release_at to now; the release job fires on its next tick (≤60 seconds).
gigs.post("/gigs/:id/release-now", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (gig.owner_id !== req.user.id) return res.status(403).json({ error: "Only the organizer can release early." });
  if (gig.status !== "completed") {
    return res.status(409).json({ error: "The gig needs to be marked complete before releasing." });
  }
  db.prepare("UPDATE gigs SET release_at=? WHERE id=?").run(Date.now(), gig.id);
  logEvent(gig.id, "complete", "Organizer approved — payout releasing now");
  res.json(gigWithEvents(gig.id));
});

/* -------------------------------- ISSUE ---------------------------------- */
// Pauses the auto-release for manual review.
gigs.post("/gigs/:id/issue", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (gig.status !== "completed") return res.status(409).json({ error: "Issues can be reported between completion and payout." });

  const reason = req.body.reason || "other";
  const details = (req.body.details || "").slice(0, 1000);
  const d = checkClean(details, "description");
  if (!d.ok) return res.status(400).json({ error: d.error });

  db.prepare("UPDATE gigs SET status='issue', release_at=NULL WHERE id=?").run(gig.id);
  db.prepare(
    "INSERT INTO issues (gig_id, reported_by, reason, details, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(gig.id, req.user.id, reason, details, Date.now());
  logEvent(gig.id, "issue", "Issue reported · payout paused for ScoreGIG review");
  notifyGigState(gig.id, "Issue reported");
  res.json(gigWithEvents(gig.id));
});

/* -------------------------------- BADGE ---------------------------------- */
gigs.post("/gigs/:id/badge", auth(), (req, res) => {
  const { badge } = req.body;
  if (!["mvp", "team", "five"].includes(badge)) return res.status(400).json({ error: "Unknown badge." });
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (!["completed", "paid"].includes(gig.status)) return res.status(409).json({ error: "Badges are awarded after the gig." });
  if (gig.badge) return res.status(409).json({ error: "A badge was already awarded for this gig." });

  db.prepare("UPDATE gigs SET badge=? WHERE id=?").run(badge, gig.id);
  res.json(gigWithEvents(gig.id));
});

/* --------------------------------- TIP ----------------------------------- */
// Organizer can tip the scorekeeper within 12 hours of game end. 100% goes
// to the scorekeeper — platform takes no cut on tips.
const TIP_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const MIN_TIP_CENTS = 100;                   // $1 minimum

gigs.get("/gigs/:id/tip-status", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  const gameEnd = gig.start_at + gig.duration_min * 60 * 1000;
  const windowOpen = Date.now() >= gameEnd;
  const windowClosed = Date.now() > gameEnd + TIP_WINDOW_MS;
  const existingTip = db.prepare("SELECT * FROM tips WHERE gig_id = ?").get(gig.id);
  res.json({
    canTip: windowOpen && !windowClosed && !existingTip && ["completed", "paid"].includes(gig.status),
    tipped: Boolean(existingTip),
    windowClosesAt: gameEnd + TIP_WINDOW_MS,
  });
});

gigs.post("/gigs/:id/tip", auth(), async (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig || gig.owner_id !== req.user.id) return res.status(404).json({ error: "Gig not found." });
  if (!["completed", "paid"].includes(gig.status)) {
    return res.status(409).json({ error: "Tips are available after the gig is complete." });
  }

  const gameEnd = gig.start_at + gig.duration_min * 60 * 1000;
  if (Date.now() > gameEnd + TIP_WINDOW_MS) {
    return res.status(409).json({ error: "The 12-hour tip window has closed for this gig." });
  }
  const existing = db.prepare("SELECT id FROM tips WHERE gig_id = ?").get(gig.id);
  if (existing) return res.status(409).json({ error: "A tip was already sent for this gig." });

  const amountCents = Math.round(Number(req.body.amountCents) || 0);
  if (amountCents < MIN_TIP_CENTS) {
    return res.status(400).json({ error: `Minimum tip is $${(MIN_TIP_CENTS / 100).toFixed(2)}.` });
  }

  const owner = req.user;
  const scorekeeper = db.prepare("SELECT * FROM users WHERE id = ?").get(gig.claimed_by);
  if (!scorekeeper?.stripe_account_id) {
    return res.status(409).json({ error: "The scorekeeper's payout account isn't set up yet." });
  }

  try {
    // Charge the tip separately — no platform fee on top, just the tip amount.
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "cad",
      customer: owner.stripe_customer_id,
      payment_method: owner.default_payment_method,
      off_session: true,
      confirm: true,
      transfer_group: `gig_${gig.id}`,
      description: `ScoreGIG tip: ${gig.title}`,
      metadata: { gig_id: String(gig.id), tip: "true" },
    });

    // Transfer 100% to the scorekeeper — no fee deducted.
    await stripe.transfers.create({
      amount: amountCents,
      currency: "cad",
      destination: scorekeeper.stripe_account_id,
      transfer_group: `gig_${gig.id}`,
      description: `ScoreGIG tip: ${gig.title}`,
    });

    db.prepare("INSERT INTO tips (gig_id, amount_cents, payment_intent_id, status, created_at) VALUES (?, ?, ?, 'transferred', ?)")
      .run(gig.id, amountCents, intent.id, Date.now());
    logEvent(gig.id, "paid", `Tip of $${(amountCents / 100).toFixed(2)} sent — 100% to the scorekeeper`);
    res.json({ ok: true, amountCents });
  } catch (err) {
    console.error("Tip charge failed:", err.code || err.message);
    res.status(402).json({ error: "Tip payment failed — check your card and try again." });
  }
});

/* ----------------------------- BRAG BOARD -------------------------------- */
// Brags are PRESET celebration messages only — no free text, no gig details
// (no venue/date/team). This keeps minors safe: there's nothing actionable to
// learn. Both scorekeepers and organizers can post. The feed is public.
const BRAG_PRESETS = {
  // key: [emoji, message, who can post]
  secured:    ["🔒", "Gig secured!", "scorekeeper"],
  complete:   ["✅", "Gig complete — made some cash!", "scorekeeper"],
  another:    ["📋", "Another one in the books!", "scorekeeper"],
  firstgig:   ["🌟", "Just landed my first gig!", "scorekeeper"],
  badge:      ["🏅", "Earned a badge today!", "scorekeeper"],
  found:      ["🙌", "Found a great scorekeeper through ScoreGIG!", "organizer"],
  smooth:     ["👏", "Smooth game — thanks to my scorekeeper!", "organizer"],
  recommend:  ["💯", "ScoreGIG made covering our games easy!", "organizer"],
};

// Public feed — no auth required. Shows display names only, never real names,
// never gig specifics. If a valid token is present, marks which the viewer fived.
gigs.get("/brags", (req, res) => {
  let viewerId = null;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const { uid } = jwt.verify(token, process.env.JWT_SECRET || "dev-only-change-me");
      viewerId = uid;
    } catch { /* ignore — just means anonymous viewer */ }
  }
  const rows = db.prepare(`
    SELECT b.id, b.preset, b.t, b.fives,
           COALESCE(u.display_name, 'ScoreGIG user') AS who
    FROM brags b JOIN users u ON u.id = b.user_id
    ORDER BY b.t DESC LIMIT 100
  `).all();
  const myFives = viewerId
    ? new Set(db.prepare("SELECT brag_id FROM brag_fives WHERE user_id=?").all(viewerId).map((r) => r.brag_id))
    : new Set();
  res.json(rows.map((r) => {
    const p = BRAG_PRESETS[r.preset];
    return {
      id: r.id, t: r.t, fives: r.fives, who: r.who,
      emoji: p ? p[0] : "🎉",
      text: p ? p[1] : "Celebrating a gig!",
      fived: myFives.has(r.id),
    };
  }));
});

// Expose the preset list so the picker can render the options.
gigs.get("/brag-presets", auth(), (req, res) => {
  res.json(Object.entries(BRAG_PRESETS).map(([key, [emoji, text, who]]) => ({ key, emoji, text, who })));
});

gigs.post("/brags", auth(), (req, res) => {
  const { preset } = req.body;
  const p = BRAG_PRESETS[preset];
  if (!p) return res.status(400).json({ error: "Pick a celebration to post." });

  const audience = p[2]; // 'scorekeeper' | 'organizer'
  // Verify the user has actually done the thing they're bragging about.
  if (audience === "scorekeeper") {
    const done = db.prepare(
      "SELECT COUNT(*) AS n FROM gigs WHERE claimed_by=? AND status IN ('completed','paid')"
    ).get(req.user.id).n;
    if (done === 0) return res.status(409).json({ error: "Complete a gig first, then celebrate!" });
  } else {
    const hosted = db.prepare(
      "SELECT COUNT(*) AS n FROM gigs WHERE owner_id=? AND status IN ('claimed','arrived','completed','paid')"
    ).get(req.user.id).n;
    if (hosted === 0) return res.status(409).json({ error: "Post a gig and get it covered first!" });
  }

  const info = db.prepare("INSERT INTO brags (user_id, preset, t) VALUES (?, ?, ?)")
    .run(req.user.id, preset, Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

// One high-five per user per brag, with undo (toggle).
gigs.post("/brags/:id/five", auth(), (req, res) => {
  const bragId = req.params.id;
  const existing = db.prepare("SELECT id FROM brag_fives WHERE brag_id=? AND user_id=?")
    .get(bragId, req.user.id);
  if (existing) {
    db.prepare("DELETE FROM brag_fives WHERE id=?").run(existing.id);
    db.prepare("UPDATE brags SET fives = MAX(0, fives - 1) WHERE id=?").run(bragId);
    return res.json({ fived: false });
  }
  db.prepare("INSERT INTO brag_fives (brag_id, user_id) VALUES (?, ?)").run(bragId, req.user.id);
  db.prepare("UPDATE brags SET fives = fives + 1 WHERE id=?").run(bragId);
  res.json({ fived: true });
});
