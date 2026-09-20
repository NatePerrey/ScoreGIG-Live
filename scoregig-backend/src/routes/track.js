// track.js — free, self-hosted traffic tracker (admin dashboard, Sep19).
//
// The frontend fires a fire-and-forget POST here on app load and whenever
// the person switches screens. No auth (visitors aren't logged in yet, and
// logged-in visits count too), no cookies, no IP/user-agent logged — just a
// path, a timestamp, and a random visitor_id the frontend keeps in
// localStorage so we can tell "1 person, 5 screens" from "5 people, 1
// screen each". Never blocks or breaks the app: always returns fast, even
// on bad input.
import { Router } from "express";
import { db } from "../db.js";

export const track = Router();

// Same light per-IP throttle pattern as contact.js — this is public and
// writes to the DB, so cap it well above real usage but stop abuse.
const HITS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;
function rateLimited(ip) {
  const now = Date.now();
  const recent = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

track.post("/track", (req, res) => {
  // Always respond fast — a tracking hiccup should never surface to the user.
  res.status(204).end();

  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (rateLimited(ip)) return;

    const path = String(req.body?.path || "").trim().slice(0, 200);
    if (!path) return;
    const visitorId = req.body?.visitorId ? String(req.body.visitorId).trim().slice(0, 64) : null;
    const referrer = req.body?.referrer ? String(req.body.referrer).trim().slice(0, 200) : null;

    db.prepare("INSERT INTO page_views (path, t, visitor_id, referrer) VALUES (?, ?, ?, ?)")
      .run(path, Date.now(), visitorId, referrer);
  } catch (e) {
    console.error("track: insert failed:", e.message);
  }
});
