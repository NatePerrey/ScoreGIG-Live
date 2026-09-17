// jobs/cleanupMessages.js — deletes gig-chat messages older than 60 days.
// Runs once at boot, then once a day. Doesn't touch message_flags (the
// profanity-block log) — that's a moderation record, not chat history, and
// stays until an admin reviews it.
import { db } from "../db.js";

const RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const TICK_MS = 24 * 60 * 60 * 1000; // once a day

export function startMessageCleanupJob() {
  runCleanup();
  setInterval(runCleanup, TICK_MS);
}

export function runCleanup() {
  try {
    const cutoff = Date.now() - RETENTION_MS;
    const result = db.prepare("DELETE FROM messages WHERE created_at < ?").run(cutoff);
    if (result.changes > 0) {
      console.log(`[cleanup] deleted ${result.changes} message(s) older than 60 days`);
    }
    return { deleted: result.changes };
  } catch (e) {
    console.error("message cleanup error:", e.message);
    return { deleted: 0, error: e.message };
  }
}
