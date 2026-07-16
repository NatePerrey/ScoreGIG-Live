// routes/admin.js — owner-only platform overview.
// Only accounts with is_admin = 1 can read these. This powers the admin
// dashboard: counts, money totals, and recent activity.
import { Router } from "express";
import { db, logEvent } from "../db.js";
import { stripe } from "../stripe.js";
import { auth } from "../auth.js";

export const admin = Router();

// Gate: must be logged in AND an admin.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.is_admin !== 1) {
    return res.status(403).json({ error: "Admins only." });
  }
  next();
}

admin.get("/admin/stats", auth(), requireAdmin, (req, res) => {
  const byStatus = db.prepare(
    "SELECT status, COUNT(*) AS n FROM gigs GROUP BY status"
  ).all();
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));

  const totalGigs = db.prepare("SELECT COUNT(*) AS n FROM gigs").get().n;
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const openIssues = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE status='open'").get().n;
  const unreviewedFlags = db.prepare("SELECT COUNT(*) AS n FROM message_flags WHERE reviewed = 0").get().n;

  // Money: pay_cents is the scorekeeper's cut, fee_cents is your platform fee.
  const paid = db.prepare(
    "SELECT COALESCE(SUM(pay_cents),0) AS pay, COALESCE(SUM(fee_cents),0) AS fees FROM gigs WHERE status = 'paid'"
  ).get();
  const inEscrow = db.prepare(
    "SELECT COALESCE(SUM(pay_cents),0) AS pay FROM gigs WHERE status IN ('claimed','arrived','completed')"
  ).get();

  // Notification delivery summary (last 30 days) so the admin can confirm
  // messages are flowing — or see that providers aren't configured yet.
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const notifRows = db.prepare(
    "SELECT status, COUNT(*) AS n FROM notifications WHERE t >= ? GROUP BY status"
  ).all(since);
  const notif = Object.fromEntries(notifRows.map((r) => [r.status, r.n]));

  res.json({
    users,
    totalGigs,
    openIssues,
    unreviewedFlags,
    notifications: {
      sent: notif.sent || 0,
      failed: notif.failed || 0,
      pendingSetup: notif["pending-setup"] || 0,
    },
    gigsByStatus: {
      open: counts.open || 0,
      claimed: counts.claimed || 0,
      arrived: counts.arrived || 0,
      completed: counts.completed || 0,
      paid: counts.paid || 0,
      no_show: counts.no_show || 0,
      issue: counts.issue || 0,
      cancelled: counts.cancelled || 0,
    },
    money: {
      paidOutToScorekeepersCents: paid.pay,
      platformFeesEarnedCents: paid.fees,
      heldInEscrowCents: inEscrow.pay,
    },
  });
});

// Recent gigs list for the dashboard table. Grouped by city (area), then most
// recent first within each city. Optional ?area= filters to one city.
admin.get("/admin/gigs", auth(), requireAdmin, (req, res) => {
  const area = (req.query.area || "").trim();
  const rows = db.prepare(`
    SELECT g.id, g.title, g.sport, g.area, g.start_at, g.status,
           g.pay_cents, g.fee_cents,
           o.display_name AS organizer, s.display_name AS scorekeeper
    FROM gigs g
    JOIN users o ON o.id = g.owner_id
    LEFT JOIN users s ON s.id = g.claimed_by
    ${area ? "WHERE g.area = @area" : ""}
    ORDER BY g.area COLLATE NOCASE, g.start_at DESC LIMIT 100
  `).all(area ? { area } : {});
  res.json(rows);
});

const REASON_LABELS = {
  left_early: "Scorekeeper left early",
  no_show_late: "Showed up very late",
  quality: "Quality of scorekeeping",
  behaviour: "Behaviour / conduct",
  other: "Other",
};

// All issues (open first), with the context an admin needs to decide.
admin.get("/admin/issues", auth(), requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, g.title AS gig_title, g.pay_cents, g.sport, g.area, g.start_at,
           r.display_name AS reporter,
           s.display_name AS scorekeeper
    FROM issues i
    JOIN gigs g ON g.id = i.gig_id
    JOIN users r ON r.id = i.reported_by
    LEFT JOIN users s ON s.id = g.claimed_by
    ORDER BY (i.status='open') DESC, i.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows.map((r) => ({ ...r, reasonLabel: REASON_LABELS[r.reason] || r.reason })));
});

// Resolve an issue. outcome: 'released' (pay the scorekeeper), 'refunded'
// (refund the organizer), or 'dismissed' (no money action, just close).
admin.post("/admin/issues/:id/resolve", auth(), requireAdmin, async (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ error: "Issue not found." });
  if (issue.status === "resolved") return res.status(409).json({ error: "This issue is already resolved." });

  const outcome = req.body.outcome;
  const note = (req.body.note || "").slice(0, 1000);
  if (!["released", "refunded", "dismissed"].includes(outcome)) {
    return res.status(400).json({ error: "Pick an outcome: released, refunded, or dismissed." });
  }

  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(issue.gig_id);

  try {
    if (outcome === "refunded" && gig.payment_intent_id) {
      await stripe.refunds.create({ payment_intent: gig.payment_intent_id });
      db.prepare("UPDATE gigs SET status='no_show' WHERE id=?").run(gig.id);
      logEvent(gig.id, "issue", "Issue resolved · organizer refunded");
    } else if (outcome === "released") {
      // Let it flow to payout: mark completed so the release job pays out.
      db.prepare("UPDATE gigs SET status='completed', release_at=? WHERE id=?")
        .run(Date.now(), gig.id);
      logEvent(gig.id, "issue", "Issue resolved · payout released to scorekeeper");
    } else {
      logEvent(gig.id, "issue", "Issue reviewed · dismissed, no change");
    }
  } catch (err) {
    console.error("Issue resolution money action failed:", err.code || err.message);
    return res.status(502).json({ error: "Couldn't complete the refund/payout with Stripe. Try again." });
  }

  db.prepare("UPDATE issues SET status='resolved', outcome=?, resolution=?, resolved_at=? WHERE id=?")
    .run(outcome, note, Date.now(), issue.id);
  res.json({ ok: true });
});

/* --------------------------- FLAGGED MESSAGES ------------------------------ */
// Chat messages the profanity filter blocked before they were ever sent.
// Nothing to "resolve" here — just a visibility trail so the platform owner
// can see if someone's being abusive. Unreviewed first, most recent first.
admin.get("/admin/message-flags", auth(), requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, g.title AS gig_title, u.display_name AS user_name
    FROM message_flags f
    JOIN gigs g ON g.id = f.gig_id
    JOIN users u ON u.id = f.user_id
    ORDER BY f.reviewed ASC, f.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

admin.post("/admin/message-flags/:id/review", auth(), requireAdmin, (req, res) => {
  db.prepare("UPDATE message_flags SET reviewed = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
