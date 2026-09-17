// clean.js — basic profanity guard for user-entered free text (bios, gig
// titles). This is a FIRST line of defense, not a guarantee: determined users
// can evade word filters, so pair it with reporting + admin review in
// production. Blocks the obvious stuff while avoiding the "Scunthorpe problem"
// by matching whole words only.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "piss",
  "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard", "cock",
  "pussy", "twat", "wank", "bollocks",
];

// Build a whole-word, case-insensitive regex. \b boundaries prevent matching
// inside legit words (e.g. "assignment", "Scunthorpe").
const RE = new RegExp(`\\b(${BLOCKED.join("|")})\\b`, "i");

export function isClean(text) {
  return !RE.test(String(text || ""));
}

// Returns { ok } or { ok:false, error } for routes to use directly.
export function checkClean(text, fieldLabel = "text") {
  if (isClean(text)) return { ok: true };
  return { ok: false, error: `Please keep your ${fieldLabel} clean — that wording isn't allowed.` };
}
