// routes/messages.js — gig-scoped chat between the organizer and their
// scorekeeper. Messages live only as long as the 60-day retention window
// (jobs/cleanupMessages.js deletes anything older). A basic profanity filter
// hard-blocks a message before it's ever stored or delivered; the blocked
// attempt is logged separately to message_flags so the admin can see it.
import { Router } from "express";
import { db } from "../db.js";
import { auth } from "../auth.js";
import { isClean } from "../clean.js";
import { notifyNewMessage } from "../notify.js";

export const messages = Router();

const MAX_LEN = 1000;
const DEFAULT_LIMIT = 10;
const LOAD_MORE_LIMIT = 5;

// Only the organizer, the assigned scorekeeper, or a scorekeeper with a
// pending request on this gig can see/send messages for it.
function canAccess(gig, userId) {
  return gig.owner_id === userId || gig.claimed_by === userId || gig.requested_by === userId;
}

function otherParty(gig, userId) {
  // The "other side" of the conversation from userId's perspective.
  if (gig.owner_id === userId) return gig.claimed_by || gig.requested_by || null;
  return gig.owner_id;
}

/* --------------------------------- GET ------------------------------------ */
// GET /gigs/:id/messages?beforeId=<id>&limit=<n>
// Returns the most recent `limit` messages older than beforeId (if given),
// in chronological order, plus hasMore so the UI knows whether to show
// "Load more".
messages.get("/gigs/:id/messages", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (!canAccess(gig, req.user.id)) return res.status(403).json({ error: "Not your gig." });

  const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), 50);

  const rows = db.prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name, u.name
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.gig_id = ? ${beforeId ? "AND m.id < ?" : ""}
    ORDER BY m.id DESC
    LIMIT ?
  `).all(...(beforeId ? [gig.id, beforeId, limit + 1] : [gig.id, limit + 1]));

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse().map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    senderName: r.display_name || r.name,
    body: r.body,
    createdAt: r.created_at,
  }));

  res.json({ messages: page, hasMore, loadMoreLimit: LOAD_MORE_LIMIT });
});

/* --------------------------------- POST ------------------------------------ */
// POST /gigs/:id/messages { body }
messages.post("/gigs/:id/messages", auth(), (req, res) => {
  const gig = db.prepare("SELECT * FROM gigs WHERE id = ?").get(req.params.id);
  if (!gig) return res.status(404).json({ error: "Gig not found." });
  if (!canAccess(gig, req.user.id)) return res.status(403).json({ error: "Not your gig." });

  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Message can't be empty." });
  if (body.length > MAX_LEN) return res.status(400).json({ error: `Keep it under ${MAX_LEN} characters.` });

  if (!isClean(body)) {
    db.prepare(
      "INSERT INTO message_flags (gig_id, user_id, attempted_body, created_at) VALUES (?, ?, ?, ?)"
    ).run(gig.id, req.user.id, body, Date.now());
    return res.status(422).json({ error: "Let's keep it professional — that message wasn't sent." });
  }

  const t = Date.now();
  const result = db.prepare(
    "INSERT INTO messages (gig_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)"
  ).run(gig.id, req.user.id, body, t);

  const recipientId = otherParty(gig, req.user.id);
  if (recipientId) {
    const senderName = req.user.display_name || req.user.name;
    notifyNewMessage(gig.id, recipientId, senderName);
  }

  res.json({
    id: result.lastInsertRowid,
    senderId: req.user.id,
    senderName: req.user.display_name || req.user.name,
    body,
    createdAt: t,
  });
});
