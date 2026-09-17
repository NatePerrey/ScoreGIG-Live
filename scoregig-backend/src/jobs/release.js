// jobs/release.js — the "automatic payment timeline".
// Every minute, find completed gigs past their release time with no issue
// reported, and transfer the gig pay to the scorekeeper's Connect account.
// The platform keeps the service fee (it was charged on top at claim time).
//
// Production hardening:
//   • Re-entrancy lock: a slow run never overlaps the next tick.
//   • Atomic per-row claim (payout_started) so a payout can't fire twice, even
//     across overlapping ticks or multiple server instances.
//   • Scheduler mode: set RELEASE_SCHEDULER=external to disable the built-in
//     timer and instead drive payouts from a real scheduler (cron / cloud
//     scheduler / queue) by calling POST /internal/run-release.
import { db, logEvent } from "../db.js";
import { stripe } from "../stripe.js";
import { notifyGigState } from "../notify.js";

let running = false; // re-entrancy guard for this process

export function startReleaseJob() {
  const mode = (process.env.RELEASE_SCHEDULER || "internal").toLowerCase();
  if (mode === "external") {
    console.log("Release scheduler: EXTERNAL — drive payouts via POST /internal/run-release.");
    return;
  }
  setInterval(() => {
    releaseDuePayments().catch((e) => console.error("release tick error:", e.message));
  }, 60 * 1000);
  releaseDuePayments().catch((e) => console.error("release boot error:", e.message));
}

export async function releaseDuePayments() {
  if (running) return { skipped: "already-running" };
  running = true;
  let released = 0;
  try {
    const due = db.prepare(`
      SELECT g.*, u.stripe_account_id
      FROM gigs g JOIN users u ON u.id = g.claimed_by
      WHERE g.status = 'completed' AND g.release_at IS NOT NULL AND g.release_at <= ?
    `).all(Date.now());

    for (const gig of due) {
      // Atomically claim this payout. If another tick/instance already grabbed
      // it, changes will be 0 and we skip — no double transfer.
      const claim = db.prepare(
        "UPDATE gigs SET payout_started = 1 WHERE id = ? AND status = 'completed' AND (payout_started IS NULL OR payout_started = 0)"
      ).run(gig.id);
      if (claim.changes !== 1) continue;

      try {
        const transfer = await stripe.transfers.create({
          amount: gig.pay_cents,
          currency: "cad",
          destination: gig.stripe_account_id,
          transfer_group: `gig_${gig.id}`,
          description: `ScoreGIG payout: ${gig.title}`,
          metadata: { gig_id: String(gig.id) },
        });
        db.prepare("UPDATE gigs SET status='paid', transfer_id=? WHERE id=?")
          .run(transfer.id, gig.id);
        logEvent(gig.id, "paid", "Payment released automatically");
        notifyGigState(gig.id, "Paid");
        released++;
        console.log(`Released $${(gig.pay_cents / 100).toFixed(2)} for gig ${gig.id}`);
      } catch (err) {
        // Release the claim so it retries next tick. Don't mark paid.
        db.prepare("UPDATE gigs SET payout_started = 0 WHERE id = ?").run(gig.id);
        console.error(`Release failed for gig ${gig.id}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
  return { released };
}
