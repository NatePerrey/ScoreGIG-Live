// db.js — SQLite via better-sqlite3. Swap for Postgres/Prisma in production
// without changing route logic much; the queries are deliberately plain.
import Database from "better-sqlite3";

// Use the persistent disk path in production (set via DATABASE_PATH env var
// on Render, e.g. /var/data/scoregig.db). Falls back to a local file for
// local development so nothing breaks when the env var isn't set.
const DB_PATH = process.env.DATABASE_PATH || "scoregig.db";

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,                       -- shown to other users; real name stays private
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,             -- bcrypt hash; never store plain passwords
  is_adult INTEGER NOT NULL DEFAULT 1,     -- 1 = 18+, 0 = under 18 (self-reported at signup)
  age_range TEXT,                          -- '15-17' | '18-25' | '26+'
  is_admin INTEGER NOT NULL DEFAULT 0,     -- platform owner; sees the admin dashboard
  stripe_customer_id TEXT,                 -- as organizer: saved-card customer
  default_payment_method TEXT,             -- as organizer: card saved via SetupIntent
  stripe_account_id TEXT,                  -- as scorekeeper: Connect account for payouts
  payouts_enabled INTEGER DEFAULT 0,       -- ready to receive payouts
  bio TEXT,                                -- scorekeeper resume: short "about me"
  experience TEXT,                         -- scorekeeper resume: sports/years/history
  games_worked TEXT,                       -- resume: "0","1","2"..."10+"
  sports TEXT,                             -- resume: JSON array of sports they score
  city TEXT                                -- scorekeeper home base
);

CREATE TABLE IF NOT EXISTS gigs (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  posted_as TEXT,                          -- Parent | Team Manager | Coach | Tournament Coordinator | Association Admin
  home_team TEXT,                          -- optional: home team name for this game
  away_team TEXT,                          -- optional: away team name for this game
  tournament_id TEXT,                      -- links games that belong to the same tournament posting
  sport TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single','multi','tournament')),
  games INTEGER NOT NULL DEFAULT 1,
  location TEXT NOT NULL,
  area TEXT,
  lat REAL, lng REAL,
  start_at INTEGER NOT NULL,               -- ms since epoch
  duration_min INTEGER NOT NULL,
  pay_cents INTEGER NOT NULL,              -- what the scorekeeper earns
  fee_cents INTEGER NOT NULL,              -- ScoreGIG service fee
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','pending','claimed','arrived','completed','paid','no_show','issue','cancelled','expired')),
  claimed_by INTEGER REFERENCES users(id),
  requested_by INTEGER REFERENCES users(id),  -- scorekeeper awaiting organizer approval
  payment_intent_id TEXT,                  -- capture at claim
  transfer_id TEXT,                        -- payout to scorekeeper
  release_at INTEGER,                      -- auto-release time after completion
  badge TEXT CHECK (badge IN ('mvp','team','five') OR badge IS NULL)
);

CREATE TABLE IF NOT EXISTS gig_events (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL REFERENCES gigs(id),
  t INTEGER NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brags (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  preset TEXT NOT NULL,                     -- key into BRAG_PRESETS; no free text, no gig details
  t INTEGER NOT NULL,
  fives INTEGER NOT NULL DEFAULT 0
);

-- One high-five per user per brag (enables the 1-per-user cap + undo).
CREATE TABLE IF NOT EXISTS brag_fives (
  id INTEGER PRIMARY KEY,
  brag_id INTEGER NOT NULL REFERENCES brags(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (brag_id, user_id)
);

-- Tips: 100% to the scorekeeper, available to the organizer for 12 hours
-- after game end. Platform takes no cut. Stored separately from the gig pay.
CREATE TABLE IF NOT EXISTS tips (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL UNIQUE REFERENCES gigs(id),  -- one tip per gig
  amount_cents INTEGER NOT NULL,
  payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',               -- 'pending' | 'transferred'
  created_at INTEGER NOT NULL
);

-- Reported issues on gigs. Admin reviews and resolves; open count drives the
-- dashboard badge. reason is a category; details is the reporter's free text.
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL REFERENCES gigs(id),
  reported_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,                     -- e.g. 'left_early','quality','behaviour','other'
  details TEXT,                             -- reporter's description (filtered)
  status TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'resolved'
  resolution TEXT,                          -- admin's note + outcome
  outcome TEXT,                             -- 'released' | 'refunded' | 'dismissed'
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- Scorekeeper-initiated cancellations of an already-approved gig. Kept in its
-- own table (the gig reopens and claimed_by is cleared) so a scorekeeper's
-- reliability history survives and shows on their resume. (Jun15 #4)
CREATE TABLE IF NOT EXISTS cancellations (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL REFERENCES gigs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),   -- the scorekeeper who cancelled
  reason TEXT,
  t INTEGER NOT NULL
);

-- Outbound notification log (email + SMS). One row per recipient per channel
-- per gig state change. Status tells you whether it actually went out, failed,
-- or is waiting for provider API keys to be configured.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  gig_id INTEGER REFERENCES gigs(id),
  channel TEXT NOT NULL,        -- 'email' | 'sms'
  to_addr TEXT,
  state TEXT,                   -- gig-clock state label, e.g. 'Claimed'
  status TEXT NOT NULL,         -- 'sent' | 'failed' | 'pending-setup'
  detail TEXT,
  t INTEGER NOT NULL
);

-- Gig-scoped chat between the organizer and their scorekeeper. Auto-deleted
-- after 60 days by jobs/cleanupMessages.js. ScoreGIG retains access during
-- that window for dispute resolution per the terms both users agreed to.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL REFERENCES gigs(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_gig ON messages(gig_id, id);

-- A message that got blocked by the profanity filter before it ever reached
-- the other person. Kept so the platform owner can see a pattern of abuse
-- even though nothing was actually delivered. reviewed lets admin clear it.
CREATE TABLE IF NOT EXISTS message_flags (
  id INTEGER PRIMARY KEY,
  gig_id INTEGER NOT NULL REFERENCES gigs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  attempted_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0
);

-- Free, self-hosted traffic tracker (admin dashboard, Sep19). One row per
-- screen view. visitor_id is a random id the frontend keeps in
-- localStorage — no cookies, no IP/PII stored — just enough to tell "one
-- person looked at 5 screens" from "5 people looked at 1 screen each".
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  t INTEGER NOT NULL,
  visitor_id TEXT,
  referrer TEXT
);
CREATE INDEX IF NOT EXISTS idx_page_views_t ON page_views (t);
`);

// --- Lightweight additive migrations -------------------------------------
// CREATE TABLE IF NOT EXISTS won't add columns to a pre-existing table, so we
// add new columns defensively. Each is wrapped because SQLite throws if the
// column already exists, which is fine to ignore.
function addColumn(sql) {
  try { db.exec(sql); } catch (e) { /* column already exists — ignore */ }
}
addColumn("ALTER TABLE gigs ADD COLUMN venue TEXT");                 // facility/rink/court detail (Jun15 #1)
addColumn("ALTER TABLE gigs ADD COLUMN game_code TEXT");             // digital scoresheet code, e.g. RAMP Gamesheet
addColumn("ALTER TABLE gigs ADD COLUMN payout_started INTEGER DEFAULT 0"); // atomic guard so a payout never runs twice
addColumn("ALTER TABLE gigs ADD COLUMN service TEXT DEFAULT 'scorekeeper'"); // scorekeeper or scoresheet (#13/#14)
addColumn("ALTER TABLE gigs ADD COLUMN cancelled_by INTEGER");       // who cancelled (owner or scorekeeper)
addColumn("ALTER TABLE gigs ADD COLUMN cancel_reason TEXT");
addColumn("ALTER TABLE gigs ADD COLUMN province TEXT");              // 2-letter code; drives the minimum-wage pay floor
addColumn("ALTER TABLE gigs ADD COLUMN hidden_by_owner INTEGER DEFAULT 0");  // organizer removed a finished gig from their My Gigs list (Jul1 #7)
addColumn("ALTER TABLE gigs ADD COLUMN notes TEXT");                 // organizer's operational notes to the scorekeeper (Bluetooth at rink, record shots on net, etc.)
addColumn("ALTER TABLE users ADD COLUMN member_orgs TEXT");                  // sports orgs/associations the user belongs to, collected at signup (Jul1 #3)
addColumn("ALTER TABLE users ADD COLUMN onboarding_submitted INTEGER DEFAULT 0"); // Stripe details submitted (#11)
addColumn("ALTER TABLE users ADD COLUMN phone TEXT");                            // optional, for SMS notifications
addColumn("ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1"); // 1=on (default), 0=opted out
addColumn("ALTER TABLE users ADD COLUMN sms_consent INTEGER DEFAULT 0");           // explicit opt-in to texts (CASL)
addColumn("ALTER TABLE users ADD COLUMN sms_consent_at INTEGER");                  // when they consented
addColumn("ALTER TABLE users ADD COLUMN sms_opted_out INTEGER DEFAULT 0");         // texted STOP / opted back out
// New-gig broadcast prefs: instant "new gig near you" alerts. A gig matches when
// its sport is in notify_sports AND it falls within notify_radius_km of the
// scorekeeper's watch point (notify_lat/lng). notify_sports is a JSON array;
// null falls back to the scorekeeper's resume sports so an existing keeper is
// matchable the moment they set a watch location.
addColumn("ALTER TABLE users ADD COLUMN notify_new_gigs INTEGER DEFAULT 1");       // master switch for new-gig alerts
addColumn("ALTER TABLE users ADD COLUMN notify_sports TEXT");                      // JSON array of sports to watch (null = resume sports)
addColumn("ALTER TABLE users ADD COLUMN notify_lat REAL");                         // watch point latitude
addColumn("ALTER TABLE users ADD COLUMN notify_lng REAL");                         // watch point longitude
addColumn("ALTER TABLE users ADD COLUMN notify_label TEXT");                       // human label for the watch point
addColumn("ALTER TABLE users ADD COLUMN notify_radius_km INTEGER DEFAULT 40");     // match radius in km
// Guardian email-consent for minors (15–17). Account exists immediately but
// gig posting/requesting is blocked until a parent/guardian confirms via the
// link emailed to guardian_email. Adults are seeded 'not_required'.
addColumn("ALTER TABLE users ADD COLUMN guardian_email TEXT");
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_status TEXT DEFAULT 'not_required'"); // 'not_required' | 'pending' | 'approved'
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_token TEXT");          // single-use confirm token
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_expires INTEGER");     // token expiry (ms epoch)
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_at INTEGER");          // when guardian confirmed
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_ip TEXT");             // IP that confirmed (audit trail)

// Password reset: a single-use token emailed to the account holder. Cleared on
// use or expiry. Mirrors the guardian-consent token approach.
addColumn("ALTER TABLE users ADD COLUMN reset_token TEXT");     // single-use password reset token
addColumn("ALTER TABLE users ADD COLUMN reset_expires INTEGER"); // token expiry (ms epoch)

// Reminder-digest job (piece 4): bitmask of which upcoming-game milestones have
// already been sent for a claimed gig, so a restart or a slow tick never
// double-sends. Bits: 1=5-day, 2=48-hour, 4=24-hour, 8=morning-of.
addColumn("ALTER TABLE gigs ADD COLUMN reminder_flags INTEGER NOT NULL DEFAULT 0");

// Division/age group for the game (e.g. "U13 AAA", "2014 AAA") — lets a
// tournament organizer post every game for one day + division quickly.
addColumn("ALTER TABLE gigs ADD COLUMN division TEXT");

// --- One-time schema fix: widen the status CHECK constraint ---------------
// The 'expired' status (auto-expire job, Sep19) was added to the app's
// vocabulary after this table's CHECK constraint was already locked in on
// first create, and SQLite can't ALTER a CHECK constraint in place. Until
// this runs, every attempt to set status='expired' silently fails the
// UPDATE (constraint violation), so unclaimed gigs never actually expire.
// Detect the stale constraint from sqlite_master and rebuild the table with
// the same data if found; a no-op after it's applied once.
(function fixExpiredStatusConstraint() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='gigs'"
  ).get();
  if (!row || row.sql.includes("'expired'")) return; // already fixed (or no table yet)

  const cols = db.prepare("PRAGMA table_info(gigs)").all().map((c) => c.name);
  const colList = cols.join(", ");

  // gig_events (and other tables) hold a plain REFERENCES gigs(id) — with
  // foreign key enforcement on (Render's build defaults it on; local dev
  // often doesn't, which is why this passed here but failed there), DROP
  // TABLE gigs would implicitly delete those rows first and get rejected
  // as a constraint violation. PRAGMA foreign_keys can only be toggled
  // outside a transaction, so flip it off, run the swap, then restore it.
  const fkWasOn = db.pragma("foreign_keys", { simple: true }) === 1;
  if (fkWasOn) db.pragma("foreign_keys = OFF");

  db.transaction(() => {
    db.exec(`
      CREATE TABLE gigs_new (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        posted_as TEXT,
        home_team TEXT,
        away_team TEXT,
        tournament_id TEXT,
        sport TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('single','multi','tournament')),
        games INTEGER NOT NULL DEFAULT 1,
        location TEXT NOT NULL,
        area TEXT,
        lat REAL, lng REAL,
        start_at INTEGER NOT NULL,
        duration_min INTEGER NOT NULL,
        pay_cents INTEGER NOT NULL,
        fee_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open','pending','claimed','arrived','completed','paid','no_show','issue','cancelled','expired')),
        claimed_by INTEGER REFERENCES users(id),
        requested_by INTEGER REFERENCES users(id),
        payment_intent_id TEXT,
        transfer_id TEXT,
        release_at INTEGER,
        badge TEXT CHECK (badge IN ('mvp','team','five') OR badge IS NULL),
        venue TEXT,
        game_code TEXT,
        payout_started INTEGER DEFAULT 0,
        service TEXT DEFAULT 'scorekeeper',
        cancelled_by INTEGER,
        cancel_reason TEXT,
        province TEXT,
        hidden_by_owner INTEGER DEFAULT 0,
        notes TEXT,
        reminder_flags INTEGER NOT NULL DEFAULT 0,
        division TEXT
      );
    `);
    db.exec(`INSERT INTO gigs_new (${colList}) SELECT ${colList} FROM gigs;`);
    db.exec(`DROP TABLE gigs;`);
    db.exec(`ALTER TABLE gigs_new RENAME TO gigs;`);
  })();
  if (fkWasOn) db.pragma("foreign_keys = ON");
  console.log("Migrated gigs table: status CHECK constraint now allows 'expired'.");
})();

export function logEvent(gigId, kind, label) {
  db.prepare(
    "INSERT INTO gig_events (gig_id, t, kind, label) VALUES (?, ?, ?, ?)"
  ).run(gigId, Date.now(), kind, label);
}

export function gigWithEvents(id) {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(id);
  if (!gig) return null;
  // Organizer's public display name (never the real name) for the "posted by" line.
  const owner = db.prepare("SELECT display_name, name FROM users WHERE id = ?").get(gig.owner_id);
  gig.owner_display = owner ? (owner.display_name || owner.name) : "Organizer";
  gig.events = db
    .prepare("SELECT t, kind, label FROM gig_events WHERE gig_id = ? ORDER BY t")
    .all(id);
  return gig;
}
