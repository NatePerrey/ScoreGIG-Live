// routes/authRoutes.js — signup, login, and "who am I".
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken, auth, isMinor } from "../auth.js";
import { cancellationStanding } from "../reliability.js";
import { checkClean } from "../clean.js";
import { issueConsentToken, sendGuardianConsentEmail } from "../guardian.js";

export const authRoutes = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Jordan Smith" -> "Jordan S." — a safe public default that hides the full name.
function defaultDisplayName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/* ------------------------------- SIGN UP --------------------------------- */
// Body: { name, displayName?, email, password, ageRange }
authRoutes.post("/signup", (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const ageRange = req.body.ageRange;
  let displayName = (req.body.displayName || "").trim();
  // Optional phone for SMS notifications. Kept permissive (formats vary); we just
  // store a trimmed value and leave provider-side validation to send time.
  const phone = (req.body.phone || "").trim().slice(0, 20) || null;
  const smsConsent = phone && req.body.smsConsent === true ? 1 : 0;
  const smsConsentAt = smsConsent ? Date.now() : null;

  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!["15-17", "18-25", "26+"].includes(ageRange)) {
    return res.status(400).json({ error: "You must be at least 15 years old to join ScoreGIG. Please select a valid age range." });
  }
  if (ageRange === "15-17" && req.body.confirmAge !== true) {
    return res.status(400).json({ error: "Please confirm you're at least 15 years old." });
  }

  // Display name: default if blank, and must be clean (it's shown publicly).
  if (!displayName) displayName = defaultDisplayName(name);
  const dnClean = checkClean(displayName, "display name");
  if (!dnClean.ok) return res.status(400).json({ error: dnClean.error });
  displayName = displayName.slice(0, 40);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const isAdult = ageRange === "15-17" ? 0 : 1;
  const hash = bcrypt.hashSync(password, 10);

  // Minor (15–17): a parent/guardian email is required. The account is created
  // right away but starts in 'pending' consent — they can browse but can't post
  // or request gigs until the guardian confirms via the emailed link.
  const isMinorSignup = ageRange === "15-17";
  const guardianEmail = (req.body.guardianEmail || "").trim().toLowerCase();
  if (isMinorSignup) {
    if (!EMAIL_RE.test(guardianEmail)) {
      return res.status(400).json({ error: "A parent or guardian email is required for ages 15–17." });
    }
    if (guardianEmail === email) {
      return res.status(400).json({ error: "The guardian email must be different from your own email." });
    }
  }
  const consentStatus = isMinorSignup ? "pending" : "not_required";

  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const isAdmin = userCount === 0 ? 1 : 0;

  const info = db.prepare(
    "INSERT INTO users (name, display_name, email, password_hash, is_adult, age_range, is_admin, phone, sms_consent, sms_consent_at, guardian_email, guardian_consent_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(name, displayName, email, hash, isAdult, ageRange, isAdmin, phone, smsConsent, smsConsentAt, isMinorSignup ? guardianEmail : null, consentStatus);

  // Fire the guardian consent email (fire-and-forget, like notify.js — never
  // block the signup response on the email provider).
  if (isMinorSignup) {
    const newUser = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    issueConsentToken(newUser.id);
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    sendGuardianConsentEmail(fresh).catch((e) => console.error("guardian email error:", e.message));
  }

  res.status(201).json({ token: signToken(info.lastInsertRowid) });
});

/* -------------------------------- LOGIN ---------------------------------- */
authRoutes.post("/login", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  // Same message whether email or password is wrong (don't leak which exists).
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  res.json({ token: signToken(user.id) });
});

/* -------------------------------- WHO AM I ------------------------------- */
authRoutes.get("/me", auth(), (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    name: u.name,
    displayName: u.display_name || u.name,
    email: u.email,
    isAdult: u.is_adult === 1,
    minor: isMinor(u),
    ageRange: u.age_range || null,
    guardianConsentStatus: u.guardian_consent_status || "not_required",
    guardianEmail: u.guardian_email || "",
    isAdmin: u.is_admin === 1,
    cardSaved: Boolean(u.default_payment_method),
    payoutsEnabled: Boolean(u.payouts_enabled),
    onboardingSubmitted: Boolean(u.onboarding_submitted),
    phone: u.phone || "",
    notificationsEnabled: u.notifications_enabled == null ? true : Boolean(u.notifications_enabled),
    smsConsent: Boolean(u.sms_consent),
    smsOptedOut: Boolean(u.sms_opted_out),
    cancellationStanding: cancellationStanding(u.id),
    bio: u.bio || "",
    experience: u.experience || "",
    gamesWorked: u.games_worked || "",
    sports: u.sports ? JSON.parse(u.sports) : [],
    city: u.city || "",
  });
});

/* ---------------------- RESEND GUARDIAN CONSENT -------------------------- */
// Minor (or anyone on a 'pending' account) can re-trigger the guardian email,
// optionally correcting the guardian address (e.g. a typo at signup).
authRoutes.post("/guardian-consent/resend", auth(), (req, res) => {
  const u = req.user;
  if (u.guardian_consent_status !== "pending") {
    return res.status(400).json({ error: "No pending guardian consent on this account." });
  }
  const newEmail = (req.body.guardianEmail || "").trim().toLowerCase();
  if (newEmail) {
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: "Please enter a valid guardian email." });
    if (newEmail === u.email) return res.status(400).json({ error: "The guardian email must be different from your own email." });
    db.prepare("UPDATE users SET guardian_email = ? WHERE id = ?").run(newEmail, u.id);
  }
  issueConsentToken(u.id);
  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
  sendGuardianConsentEmail(fresh).catch((e) => console.error("guardian email error:", e.message));
  res.json({ ok: true, guardianEmail: fresh.guardian_email });
});
