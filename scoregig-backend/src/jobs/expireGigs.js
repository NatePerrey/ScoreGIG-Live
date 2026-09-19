// jobs/expireGigs.js — auto-close gigs nobody claimed.
// Every minute, find gigs that are still 'open' (never claimed) whose game
// started more than EXPIRE_GRACE_MIN minutes ago, and flip them to 'expired'.
// This only affects unclaimed gigs — anything claimed/pending/arrived/etc. is
// untouched, and since an open gig has never been charged (Stripe only charges
// at claim-approval), there's no payment to unwind here.
import { db, logEvent } from "../db.js";
import { notifyGigState } from "../notify.js";

const EXPIRE_GRACE_MIN = 10; // matches "10 mins after the game has started"
let running = false; // re-entrancy guard, same pattern as jobs/release.js

export function startExpireGigsJob() {
  setInterval(() => {
    expireStaleGigs().catch((e) => console.error("expireGigs tick error:", e.message));
  }, 60 * 1000);
  expireStaleGigs().catch((e) => console.error("expireGigs boot error:", e.message));
}

export async function expireStaleGigs() {
  if (running) return { skipped: "already-running" };
  running = true;
  let expired = 0;
  try {
    const cutoff = Date.now() - EXPIRE_GRACE_MIN * 60 * 1000;
    const due = db.prepare(
      "SELECT * FROM gigs WHERE status = 'open' AND start_at <= ?"
    ).all(cutoff);

    for (const gig of due) {
      // Atomic per-row claim, same guard style as the release job, so this
      // never double-fires across overlapping ticks.
      const claim = db.prepare(
        "UPDATE gigs SET status = 'expired' WHERE id = ? AND status = 'open'"
      ).run(gig.id);
      if (claim.changes !== 1) continue;

      logEvent(gig.id, "expired", `Auto-expired · nobody claimed it within ${EXPIRE_GRACE_MIN} min of start time`);
      notifyGigState(gig.id, "Expired");
      expired++;
      console.log(`Expired gig ${gig.id} ("${gig.title}") — never claimed.`);
    }
  } finally {
    running = false;
  }
  return { expired };
}
