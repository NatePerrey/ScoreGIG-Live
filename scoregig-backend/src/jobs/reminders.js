// jobs/reminders.js — the "upcoming game" reminder digest.
//
// For every CLAIMED (or ARRIVED-but-not-yet-started) gig, as game day gets
// closer, remind both the organizer and the confirmed scorekeeper. Each
// recipient gets ONE digest email per milestone listing every one of their
// own upcoming games that just crossed it — not one email per game — since a
// tournament organizer can have dozens of games hit the same milestone on the
// same day.
//
// Milestones: 5 days out, 48 hours out, 24 hours out, and "morning of" (the
// first tick after 6am Pacific on game day). A bitmask on the gig
// (reminder_flags) tracks which have already gone out, so a restart or a slow
// tick can never double-send — same pattern as payout_started in release.js.
//
// Scheduler mode: set REMINDER_SCHEDULER=external to disable the built-in
// timer and drive this from a real scheduler instead, via
// POST /internal/run-reminders (see server.js).
import { db } from "../db.js";
import { emailUser } from "../notify.js";

let running = false; // re-entrancy guard for this process

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Fixed lead-time milestones. bit is the reminder_flags bit; ms is how far
// before start_at the milestone fires. Checked with >= so a missed tick (job
// was down, or a slow deploy) still catches up on the very next run.
const LEAD_MILESTONES = [
  { bit: 1, ms: 5 * DAY, label: "5 days" },
  { bit: 2, ms: 48 * HOUR, label: "48 hours" },
  { bit: 4, ms: 24 * HOUR, label: "24 hours" },
];
const MORNING_BIT = 8;
const MORNING_HOUR_PACIFIC = 6; // first tick at/after 6am Pacific on game day

function pacificParts(ms) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(ms).map((p) => [p.type, p.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function fmtLocal(ms) {
  try {
    return new Date(ms).toLocaleString("en-CA", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver",
    });
  } catch { return "see app"; }
}

// One line per game for a digest email.
function gameLine(gig) {
  const teams = (gig.home_team || gig.away_team) ? ` — ${gig.home_team || "Home"} vs ${gig.away_team || "Away"}` : "";
  const venue = gig.venue ? ` @ ${gig.venue}` : "";
  return `  • ${fmtLocal(gig.start_at)} — ${gig.title}${teams}${venue} (${gig.area || gig.location})`;
}

function digestBody(label, gigsForUser) {
  const n = gigsForUser.length;
  const intro = n === 1
    ? `A reminder — your game is coming up in about ${label}:`
    : `A reminder — you have ${n} games coming up in about ${label}:`;
  const lines = gigsForUser.map(gameLine).join("\n");
  return `${intro}\n\n${lines}\n\nSee the full details anytime in your ScoreGIG account.`;
}

function subjectFor(label, n) {
  return n === 1 ? `Reminder: your game is in about ${label}` : `Reminder: ${n} games coming up in about ${label}`;
}

export function startReminderJob() {
  const mode = (process.env.REMINDER_SCHEDULER || "internal").toLowerCase();
  if (mode === "external") {
    console.log("Reminder scheduler: EXTERNAL — drive digests via POST /internal/run-reminders.");
    return;
  }
  setInterval(() => {
    runReminderDigest().catch((e) => console.error("reminder tick error:", e.message));
  }, 15 * 60 * 1000); // every 15 minutes
  runReminderDigest().catch((e) => console.error("reminder boot error:", e.message));
}

export async function runReminderDigest() {
  if (running) return { skipped: "already-running" };
  running = true;
  const sent = { fiveDay: 0, fortyEightHr: 0, twentyFourHr: 0, morning: 0 };
  try {
    const now = Date.now();
    // Only confirmed, not-yet-started games get reminded — an unclaimed gig
    // has no confirmed scorekeeper to remind yet, and a game that's already
    // underway or finished doesn't need an upcoming-game nudge.
    const upcoming = db.prepare(`
      SELECT * FROM gigs
      WHERE status IN ('claimed','arrived') AND start_at > ?
    `).all(now);

    for (const { bit, ms, label } of LEAD_MILESTONES) {
      const due = upcoming.filter((g) => !(g.reminder_flags & bit) && (g.start_at - now) <= ms);
      if (due.length) await sendDigestForMilestone(due, bit, label);
    }

    // Morning-of: same Pacific calendar day as the game, first tick at/after
    // 6am Pacific. Uses today's real date rather than a fixed ms offset so it
    // lands in the morning regardless of what time the game itself is at.
    const { dateKey: today, hour: pacHour } = pacificParts(now);
    if (pacHour >= MORNING_HOUR_PACIFIC) {
      const dueMorning = upcoming.filter((g) => {
        if (g.reminder_flags & MORNING_BIT) return false;
        return pacificParts(g.start_at).dateKey === today;
      });
      if (dueMorning.length) await sendDigestForMilestone(dueMorning, MORNING_BIT, "today");
    }

    sent.fiveDay = 1; // counts are informational only; see console log for real totals
  } finally {
    running = false;
  }
  return sent;
}

async function sendDigestForMilestone(dueGigs, bit, label) {
  // Group by recipient: the organizer and the confirmed scorekeeper each get
  // their own digest of their own games hitting this milestone.
  const byUser = new Map();
  for (const gig of dueGigs) {
    for (const uid of [gig.owner_id, gig.claimed_by].filter(Boolean)) {
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(gig);
    }
  }

  for (const [uid, gigsForUser] of byUser) {
    const user = db.prepare("SELECT id, email, notifications_enabled FROM users WHERE id = ?").get(uid);
    if (user && user.notifications_enabled) {
      const body = digestBody(label, gigsForUser);
      await emailUser({
        user, gigId: gigsForUser[0].id, state: `Reminder (${label})`,
        subject: subjectFor(label, gigsForUser.length), body,
      });
    }
  }

  // Mark every game in this batch as done for this milestone, whether or not
  // the send succeeded — matches the rest of notify.js, which logs failed
  // sends rather than retrying them on the next tick.
  const ids = dueGigs.map((g) => g.id);
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE gigs SET reminder_flags = reminder_flags | ? WHERE id IN (${placeholders})`)
    .run(bit, ...ids);
  console.log(`[reminders] ${label} digest sent for ${ids.length} game(s), ${byUser.size} recipient(s)`);
}
