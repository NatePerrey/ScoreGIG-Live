// broadcast.js — "new gig near you" alerts.
//
// When an organizer posts an open gig, we email every scorekeeper whose watch
// area covers it and who watches that sport. This is the retention engine:
// scorekeepers come back because a matching gig pings them, not because they
// keep checking the feed.
//
// MATCHING = sport match AND within notify_radius_km of the scorekeeper's watch
// point (great-circle distance from the gig's lat/lng). If a gig was somehow
// posted without coordinates, we fall back to sport-only so it still goes out.
//
// HEAD START (built, OFF at launch): reliable scorekeepers can get a few
// minutes' jump on everyone else once they've completed enough gigs. It's off
// today — HEAD_START_MINUTES is 0, so nobody is delayed and everyone is alerted
// at once. Raise it (e.g. 5) once you have more scorekeepers than gigs and
// rewarding the regulars actually helps; until then, flipping it changes
// nothing about who gets alerted, only the timing.
//
// DELIVERY: email only for now. notify.js already carries SMS on the same
// records table, so adding a text here later is one extra call, not a rebuild.

import { db } from "./db.js";
import { emailUser } from "./notify.js";
import { guardianBlocked } from "./guardian.js";

// ---- Head-start config (see note above) ---------------------------------
const HEAD_START_MINUTES = 0;      // 0 = everyone alerted instantly (launch default)
const HEAD_START_AFTER_GIGS = 10;  // completed gigs to earn the head start

const DEFAULT_RADIUS_KM = 40;

// Great-circle distance in km between two lat/lng points.
function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Completed-gig count drives the head-start tier.
function completedCount(userId) {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM gigs WHERE claimed_by = ? AND status IN ('completed','paid')")
    .get(userId);
  return row ? row.n : 0;
}

function fmtWhen(ms) {
  try {
    return new Date(ms).toLocaleString("en-CA", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver",
    });
  } catch {
    return "";
  }
}

function buildEmail(gig) {
  const pay = `$${(gig.pay_cents / 100).toFixed(2)}`;
  const where = gig.area || gig.location || "";
  const cityShort = where ? where.split(",")[0].trim() : "";
  const when = fmtWhen(gig.start_at);
  const appUrl = (process.env.APP_URL || "https://scoregig.ca").replace(/\/+$/, "");
  const subject = `New ${gig.sport} gig${cityShort ? ` in ${cityShort}` : ""} — ${pay}${when ? `, ${when}` : ""}`;
  const body =
`A new scorekeeping gig just opened that matches what you're watching:

  ${gig.title}
  Sport:  ${gig.sport}
  When:   ${when || "see app"}
  Where:  ${where || "see app"}
  Pays:   ${pay} to you

Gigs are first-come — open ScoreGIG to grab it before someone else does:
${appUrl}

You're getting this because you turned on new-gig alerts for this area and
sport. Change them or turn them off anytime in your ScoreGIG profile.`;
  return { subject, body };
}

/**
 * Fire "new gig near you" alerts for a freshly posted gig.
 * Fire-and-forget: never throws into the request/response path.
 * @param {number} gigId
 */
export function broadcastNewGig(gigId) {
  _broadcast(gigId).catch((e) => console.error("broadcast error:", e.message));
}

async function _broadcast(gigId) {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(gigId);
  if (!gig || gig.status !== "open") return;

  const hasGigCoords = Number.isFinite(gig.lat) && Number.isFinite(gig.lng);

  const candidates = db
    .prepare(
      `SELECT * FROM users
       WHERE id != ?
         AND notifications_enabled = 1
         AND notify_new_gigs = 1`
    )
    .all(gig.owner_id);

  const { subject, body } = buildEmail(gig);
  const trusted = [];
  const rest = [];

  for (const u of candidates) {
    if (guardianBlocked(u)) continue; // minors awaiting guardian consent can't claim yet

    // Which sports does this scorekeeper want alerts for? Explicit notify_sports
    // wins; otherwise fall back to their resume sports. Empty => opted into none.
    let watchSports = [];
    try {
      watchSports = u.notify_sports
        ? JSON.parse(u.notify_sports)
        : (u.sports ? JSON.parse(u.sports) : []);
    } catch {
      watchSports = [];
    }
    if (!watchSports.length || !watchSports.includes(gig.sport)) continue;

    // Distance gate — skipped only if the gig itself has no coordinates.
    if (hasGigCoords) {
      if (!Number.isFinite(u.notify_lat) || !Number.isFinite(u.notify_lng)) continue; // no watch point set
      const radius = Number.isFinite(u.notify_radius_km) ? u.notify_radius_km : DEFAULT_RADIUS_KM;
      if (haversineKm(gig.lat, gig.lng, u.notify_lat, u.notify_lng) > radius) continue;
    }

    (completedCount(u.id) >= HEAD_START_AFTER_GIGS ? trusted : rest).push(u);
  }

  // Trusted tier first (and, when head start is 0, this is simply everyone).
  for (const u of trusted) {
    await emailUser({ user: u, gigId: gig.id, state: "New gig", subject, body });
  }

  if (HEAD_START_MINUTES > 0) {
    // Reliable scorekeepers already got theirs; hold the rest for a few minutes.
    // NOTE: in-process timer — a redeploy during the delay window would drop the
    // pending blast. Fine while this is off; harden with a persisted job if you
    // ever turn the head start on.
    setTimeout(() => {
      (async () => {
        const fresh = db.prepare("SELECT status FROM gigs WHERE id = ?").get(gig.id);
        if (!fresh || fresh.status !== "open") return; // already claimed — don't tease it
        for (const u of rest) {
          await emailUser({ user: u, gigId: gig.id, state: "New gig", subject, body });
        }
      })().catch((e) => console.error("broadcast (delayed) error:", e.message));
    }, HEAD_START_MINUTES * 60 * 1000);
  } else {
    for (const u of rest) {
      await emailUser({ user: u, gigId: gig.id, state: "New gig", subject, body });
    }
  }
}
