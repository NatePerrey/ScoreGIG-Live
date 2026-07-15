// db.js — SQLite via better-sqlite3. Swap for Postgres/Prisma in production
// without changing route logic much; the queries are deliberately plain.
import Database from "better-sqlite3";

export const db = new Database("scoregig.db");
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
    CHECK (status IN ('open','pending','claimed','arrived','completed','paid','no_show','issue','cancelled')),
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
addColumn("ALTER TABLE users ADD COLUMN member_orgs TEXT");                  // sports orgs/associations the user belongs to, collected at signup (Jul1 #3)
addColumn("ALTER TABLE users ADD COLUMN onboarding_submitted INTEGER DEFAULT 0"); // Stripe details submitted (#11)
addColumn("ALTER TABLE users ADD COLUMN phone TEXT");                            // optional, for SMS notifications
addColumn("ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1"); // 1=on (default), 0=opted out
addColumn("ALTER TABLE users ADD COLUMN sms_consent INTEGER DEFAULT 0");           // explicit opt-in to texts (CASL)
addColumn("ALTER TABLE users ADD COLUMN sms_consent_at INTEGER");                  // when they consented
addColumn("ALTER TABLE users ADD COLUMN sms_opted_out INTEGER DEFAULT 0");         // texted STOP / opted back out
// Guardian email-consent for minors (15–17). Account exists immediately but
// gig posting/requesting is blocked until a parent/guardian confirms via the
// link emailed to guardian_email. Adults are seeded 'not_required'.
addColumn("ALTER TABLE users ADD COLUMN guardian_email TEXT");
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_status TEXT DEFAULT 'not_required'"); // 'not_required' | 'pending' | 'approved'
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_token TEXT");          // single-use confirm token
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_expires INTEGER");     // token expiry (ms epoch)
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_at INTEGER");          // when guardian confirmed
addColumn("ALTER TABLE users ADD COLUMN guardian_consent_ip TEXT");             // IP that confirmed (audit trail)

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
