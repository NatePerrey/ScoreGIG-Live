// auth.js — real authentication with email/password + JWT sessions.
// One account can act as BOTH organizer and scorekeeper, so we no longer
// gate by a fixed role; routes that are organizer- or scorekeeper-specific
// just require a logged-in user and act on what that user is doing.
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const TOKEN_TTL = "30d";

export function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Require a logged-in user. Attaches req.user (full row) or 401s.
export function auth() {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sign in required." });
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
      if (!user) return res.status(401).json({ error: "Sign in required." });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "Session expired — please sign in again." });
    }
  };
}

// Helper used by payout logic: minors route payouts through a guardian.
export function isMinor(user) {
  return user.is_adult === 0;
}
