// reliability.js — scorekeeper "standing" based on recent cancellations.
//
// Self-correcting by design: only cancellations in the trailing 30 days count,
// so a clean month restores good standing automatically. No hard bans — the
// only consequence is losing the instant-booking fast-track for a while.
//
//   0–1 recent cancellations -> good
//   2  recent cancellations  -> warning (soft heads-up)
//   3+ recent cancellations  -> restricted (instant-claim pre-approval paused)
import { db } from "./db.js";

export const CANCEL_WINDOW_DAYS = 30;
export const WARN_AT = 2;
export const RESTRICT_AT = 3;

export function recentCancellationCount(userId) {
  const since = Date.now() - CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return db
    .prepare("SELECT COUNT(*) AS n FROM cancellations WHERE user_id = ? AND t >= ?")
    .get(userId, since).n;
}

export function cancellationStanding(userId) {
  const recentCancellations = recentCancellationCount(userId);
  let tier = "good";
  if (recentCancellations >= RESTRICT_AT) tier = "restricted";
  else if (recentCancellations >= WARN_AT) tier = "warning";
  return {
    recentCancellations,
    tier,
    instantClaimBlocked: tier === "restricted",
    windowDays: CANCEL_WINDOW_DAYS,
    warnAt: WARN_AT,
    restrictAt: RESTRICT_AT,
  };
}
