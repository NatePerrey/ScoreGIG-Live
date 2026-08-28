// Smoke test for broadcastNewGig matching. Uses a throwaway DB and no SendGrid
// keys, so every match is logged to `notifications` as 'pending-setup' — which
// is exactly what we assert on. Run: node smoke.mjs
import fs from "fs";
const DB = "/tmp/smoke.db";
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} }
process.env.DATABASE_PATH = DB;
delete process.env.SENDGRID_API_KEY;   // force pending-setup path (no real email)
delete process.env.SENDGRID_FROM;

const { db } = await import("./src/db.js");
const { broadcastNewGig } = await import("./src/broadcast.js");

const mkUser = (o) => {
  const cols = {
    name: o.name, email: o.email, password_hash: "x", is_adult: 1,
    notifications_enabled: 1, notify_new_gigs: 1,
    notify_sports: null, sports: null,
    notify_lat: null, notify_lng: null, notify_radius_km: 40,
    guardian_consent_status: "not_required",
    ...o,
  };
  const keys = Object.keys(cols).filter((k) => !["name2"].includes(k));
  const info = db.prepare(
    `INSERT INTO users (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
  ).run(...keys.map((k) => cols[k]));
  return info.lastInsertRowid;
};

const CHW = { lat: 49.1579, lng: -121.9514 };   // Chilliwack
const ABB = { lat: 49.0504, lng: -122.3045 };   // Abbotsford (~28 km)
const VAN = { lat: 49.2827, lng: -123.1207 };   // Vancouver (~100 km)

const owner = mkUser({ name: "Org", email: "org@t.co" });

const A = mkUser({ name: "A hockey chilliwack",  email: "a@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: CHW.lat, notify_lng: CHW.lng });
const B = mkUser({ name: "B hockey vancouver",   email: "b@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: VAN.lat, notify_lng: VAN.lng });
const C = mkUser({ name: "C basketball chwk",    email: "c@t.co", notify_sports: JSON.stringify(["Basketball"]), notify_lat: CHW.lat, notify_lng: CHW.lng });
const D = mkUser({ name: "D hockey abbotsford",  email: "d@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: ABB.lat, notify_lng: ABB.lng });
const E = mkUser({ name: "E notifs off",         email: "e@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: CHW.lat, notify_lng: CHW.lng, notifications_enabled: 0 });
const F = mkUser({ name: "F newgigs off",        email: "f@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: CHW.lat, notify_lng: CHW.lng, notify_new_gigs: 0 });
const G = mkUser({ name: "G no watchpoint",      email: "g@t.co", notify_sports: JSON.stringify(["Hockey"]) });
const H = mkUser({ name: "H resume-sport fallback", email: "h@t.co", sports: JSON.stringify(["Hockey"]), notify_lat: CHW.lat, notify_lng: CHW.lng });
const I = mkUser({ name: "I guardian pending",   email: "i@t.co", notify_sports: JSON.stringify(["Hockey"]), notify_lat: CHW.lat, notify_lng: CHW.lng, is_adult: 0, guardian_consent_status: "pending" });

const gigInfo = db.prepare(`
  INSERT INTO gigs (owner_id, title, sport, type, location, area, lat, lng, start_at, duration_min, pay_cents, fee_cents, status)
  VALUES (?, ?, ?, 'single', ?, ?, ?, ?, ?, 90, 3000, 540, 'open')
`).run(owner, "U13 Rep — Chilliwack Coliseum", "Hockey", "Chilliwack, BC", "Chilliwack, BC", CHW.lat, CHW.lng, Date.now() + 86400000);
const gigId = gigInfo.lastInsertRowid;

broadcastNewGig(gigId);
await new Promise((r) => setTimeout(r, 300)); // let the fire-and-forget flush

const matched = new Set(
  db.prepare("SELECT DISTINCT user_id FROM notifications WHERE gig_id = ? AND state = 'New gig'").all(gigId).map((r) => r.user_id)
);

const label = { [A]:"A(chwk hockey)",[B]:"B(van hockey)",[C]:"C(chwk basketball)",[D]:"D(abbotsford hockey)",[E]:"E(notifs off)",[F]:"F(newgigs off)",[G]:"G(no watchpoint)",[H]:"H(resume fallback)",[I]:"I(guardian pending)" };
const expectMatch = new Set([A, D, H]);
const all = [A,B,C,D,E,F,G,H,I];

let pass = true;
console.log("\n  who got the alert:");
for (const id of all) {
  const got = matched.has(id);
  const want = expectMatch.has(id);
  const ok = got === want;
  if (!ok) pass = false;
  console.log(`   ${ok ? "✓" : "✗ MISMATCH"}  ${label[id].padEnd(22)} matched=${got} expected=${want}`);
}
console.log("\n  " + (pass ? "ALL ASSERTIONS PASSED ✅" : "SOME ASSERTIONS FAILED ❌") + "\n");
process.exit(pass ? 0 : 1);
