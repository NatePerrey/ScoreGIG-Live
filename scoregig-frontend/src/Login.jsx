// Login.jsx — real signup & login (email/password). One account does both
// roles (organizer + scorekeeper). Age range is collected at signup; 12–17
// routes payouts through a guardian later in the flow.
import { useState } from "react";
import { Megaphone, ClipboardList, DollarSign, CheckCircle2, GraduationCap } from "lucide-react";
import { C } from "./theme.js";
import { api, setToken } from "./api.js";
import TermsModal from "./components/TermsModal.jsx";

const AGE_RANGES = [
  { value: "under18", label: "Under 18" },
  { value: "over18",  label: "18 and over" },
];

// Quick-pick sports orgs / associations shown at signup. Tuned for the
// Chilliwack minor-hockey pilot — edit this list as ScoreGIG expands to new
// regions or sports. Anything not listed goes in the "Other" field.
const MEMBER_ORG_OPTIONS = [
  "Chilliwack Minor Hockey",
  "BC Hockey",
  "Hockey Canada",
  "Local minor sports association",
  "School / club team",
];

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [ageRange, setAgeRange] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [confirmAge, setConfirmAge] = useState(false);
  const [memberOrgs, setMemberOrgs] = useState([]); // selected org chips (#3)
  const [otherOrg, setOtherOrg] = useState("");      // free-text "Other" org (#3)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null); // info message, e.g. "reset link sent"
  const [showTerms, setShowTerms] = useState(false);
  const toggleOrg = (o) => setMemberOrgs((p) => p.includes(o) ? p.filter((x) => x !== o) : [...p, o]);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const path = mode === "signup" ? "/signup" : "/login";
      const orgsJoined = [...memberOrgs, otherOrg.trim()].filter(Boolean).join(", ");
      const body = mode === "signup"
        ? { name: `${firstName.trim()} ${lastName.trim()}`, displayName, email, password, ageRange, guardianEmail: guardianEmail.trim(), phone: phone.trim(), confirmAge, smsConsent: Boolean(phone.trim()) && smsConsent, memberOrgs: orgsJoined }
        : { email, password };
      const { token } = await api(path, { method: "POST", body });
      setToken(token);
      onAuthed();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  // Forgot password: ask the backend to email a reset link. The response is the
  // same whether or not the email exists, so we always show the same message.
  const sendReset = async () => {
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await api("/forgot-password", { method: "POST", body: { email: email.trim() } });
      setNotice("If an account exists for that email, we've sent a password reset link. Check your inbox (and your spam folder) — the link expires in 1 hour.");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const goMode = (m) => { setMode(m); setErr(null); setNotice(null); };

  // Landing-page CTA (Sep22): jump straight into the signup tab and scroll
  // the form into view, so "Get started" and "explain what this is" live on
  // one page instead of sending people to a separate marketing site first.
  const goSignUp = () => {
    goMode("signup");
    document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const input = "w-full rounded-lg border px-3 py-2.5 text-sm";
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSubmit = mode === "forgot"
    ? emailRe.test(email.trim())
    : mode === "signup"
    ? firstName.trim() && lastName.trim() && email && password.length >= 8 && ageRange
      && (ageRange !== "under18" || (confirmAge && emailRe.test(guardianEmail.trim())))
    : email && password;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.navy }}>
      {/* HERO — explains ScoreGIG to a first-time visitor, before any form (Sep22) */}
      <div className="px-4 pb-8 pt-12 text-center">
        <div className="sg-display text-4xl text-white">SCORE<span style={{ color: C.amber }}>GIG</span></div>
        <p className="mt-2 text-sm font-semibold tracking-wide" style={{ color: "rgba(255,255,255,0.75)" }}>
          CANADA'S MARKETPLACE FOR GAME-DAY SCOREKEEPERS
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
          Youth sports organizers need someone at every game to run the clock and keep the scoresheet.
          ScoreGIG connects them with people nearby who want to do it — and get paid every time.
        </p>
        <button onClick={goSignUp}
          className="mt-6 rounded-lg px-6 py-3 text-sm font-bold"
          style={{ backgroundColor: C.amber, color: C.navy }}>
          Get started — it's free
        </button>
      </div>

      {/* HOW IT WORKS — one card per side of the marketplace, each with a punchy reason list (Sep22) */}
      <div className="mx-auto max-w-2xl px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }}>
            <Megaphone size={22} color={C.amber} />
            <h3 className="mt-2 text-sm font-bold text-white">Organizing a game?</h3>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              Stop scrambling for a scorekeeper the night before. Post the date, time, rink, and pay —
              someone local claims it, and you're covered.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "Posted in minutes, filled by people nearby",
                "No subscription, nothing charged upfront",
                "Your card is only billed once you approve someone",
              ].map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                  <CheckCircle2 size={14} color={C.amber} className="mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }}>
            <ClipboardList size={22} color={C.amber} />
            <h3 className="mt-2 text-sm font-bold text-white">Want to keep score?</h3>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              Turn game nights you'd already be at into paid ones. Claim gigs that fit your schedule
              and get paid directly — no experience required to start.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "You keep 100% of your listed pay — no cut taken",
                "Pick the games that work for you, nothing more",
                "Build a resume of real, paid responsibility",
              ].map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                  <CheckCircle2 size={14} color={C.amber} className="mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* YOUTH EMPLOYMENT CALLOUT — promotes hiring local youth scorekeepers (Sep22) */}
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="flex gap-3 rounded-2xl p-4" style={{ backgroundColor: C.amber }}>
          <GraduationCap size={26} color={C.navy} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold" style={{ color: C.navy }}>Put local youth to work</h3>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.navy }}>
              A lot of our scorekeepers are students 15 and up from the same community as the game
              they're working — kids who already know the rink and love the sport. For organizers,
              that's a reliable scorekeeper who actually wants to be there. For students, it's real
              paid work that fits around school, without needing a part-time job on top of it.
            </p>
          </div>
        </div>
      </div>

      {/* SIGN UP / LOG IN */}
      <div id="join" className="flex justify-center px-4 pb-14">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-3 rounded-2xl bg-white p-5">
          {/* Tab switch */}
          {mode !== "forgot" && (
            <div className="flex rounded-lg p-1" style={{ backgroundColor: C.maple }}>
              {[["login", "Log in"], ["signup", "Sign up"]].map(([m, label]) => (
                <button key={m} onClick={() => goMode(m)}
                  className="flex-1 rounded-md py-1.5 text-sm font-bold transition-colors"
                  style={mode === m ? { backgroundColor: C.navy, color: "#fff" } : { color: C.navy }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "forgot" && (
            <div>
              <h2 className="text-base font-bold" style={{ color: C.navy }}>Reset your password</h2>
              <p className="mt-1 text-[12px]" style={{ color: C.ink60 }}>
                Enter the email on your account and we'll send you a link to set a new password.
              </p>
            </div>
          )}

          {mode === "signup" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>First name *</label>
                <input className={input} style={{ borderColor: C.mapleLine }} value={firstName}
                  onChange={(e) => setFirstName(e.target.value)} placeholder="First" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Last name *</label>
                <input className={input} style={{ borderColor: C.mapleLine }} value={lastName}
                  onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
              </div>
            </div>
          )}
          {mode === "signup" && (firstName || lastName) && (
            <p className="text-[11px]" style={{ color: C.ink60 }}>
              Your full name is private — used only for payments. Other users never see it.
            </p>
          )}

          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Display name</label>
              <input className={input} style={{ borderColor: C.mapleLine }} value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Jordan T. (leave blank and we'll set this)" maxLength={40} />
              <p className="mt-1 text-[11px]" style={{ color: C.ink60 }}>
                This is the only name other people see — on gigs and the Brag Board. Keep it friendly, not your full name.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Email</label>
            <input className={input} style={{ borderColor: C.mapleLine }} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoCapitalize="none" />
          </div>

          {mode !== "forgot" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Password</label>
              <input className={input} style={{ borderColor: C.mapleLine }} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
              {mode === "login" && (
                <div className="mt-1.5 text-right">
                  <button type="button" onClick={() => goMode("forgot")}
                    className="text-[11px] font-semibold underline" style={{ color: C.navy }}>
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>
                Mobile number <span style={{ color: C.ink40 }}>(optional)</span>
              </label>
              <input className={input} style={{ borderColor: C.mapleLine }} type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="+1 587 555 1234" autoComplete="tel" />
              <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
                Add it to also get text updates about your gigs. Email updates are on by default; you can turn notifications off anytime in your profile.
              </p>
              {phone.trim() && (
                <label className="mt-2 flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span className="text-[10px]" style={{ color: C.ink60 }}>
                    Yes, text me ScoreGIG gig updates at this number. Msg &amp; data rates may apply; reply STOP anytime to opt out. (Optional — leave unchecked for email only.)
                  </span>
                </label>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Age range</label>
              <div className="flex gap-2">
                {AGE_RANGES.map((a) => (
                  <button key={a.value} onClick={() => setAgeRange(a.value)}
                    className="flex-1 rounded-lg border py-2 text-xs font-bold"
                    style={ageRange === a.value
                      ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                      : { borderColor: C.mapleLine, color: C.navy }}>
                    {a.label}
                  </button>
                ))}
              </div>
              {ageRange === "under18" && (
                <p className="mt-1.5 text-[11px]" style={{ color: C.ink60 }}>
                  You're welcome here! Based on Stripe's payment policies, anyone under 18 needs a parent or guardian to complete payout setup and receive earnings on their behalf. It's a Stripe requirement to protect minors — not a ScoreGIG rule. You can still build your profile and request gigs.
                </p>
              )}
              {ageRange === "under18" && (
                <div className="mt-2.5">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Parent / guardian email *</label>
                  <input className={input} style={{ borderColor: C.mapleLine }} type="email" value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)} placeholder="parent@example.com" autoCapitalize="none" />
                  <p className="mt-1 text-[11px]" style={{ color: C.ink60 }}>
                    We'll email your parent or guardian a link to approve your account. You can create your account now and browse, but you can't pick up paid gigs until they confirm.
                  </p>
                </div>
              )}
              {ageRange === "under18" && (
                <label className="mt-2.5 flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={confirmAge} onChange={(e) => setConfirmAge(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span className="text-[11px]" style={{ color: C.navy }}>
                    I confirm I am at least 15 years old. ScoreGIG is only for ages 15+.
                  </span>
                </label>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>
                Sports organizations you're part of <span style={{ color: C.ink40 }}>(optional)</span>
              </label>
              <p className="mb-2 text-[11px]" style={{ color: C.ink60 }}>
                Tap any that apply. This helps organizers see your background and match you to local gigs. Add your own below.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MEMBER_ORG_OPTIONS.map((o) => (
                  <button key={o} type="button" onClick={() => toggleOrg(o)}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={memberOrgs.includes(o)
                      ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                      : { borderColor: C.mapleLine, color: C.navy }}>
                    {o}
                  </button>
                ))}
              </div>
              <input className={`${input} mt-2`} style={{ borderColor: C.mapleLine }} value={otherOrg}
                onChange={(e) => setOtherOrg(e.target.value)} placeholder="Other organization (optional)" maxLength={100} />
            </div>
          )}

          {err && (
            <div className="rounded-lg p-2 text-xs font-semibold text-white" style={{ backgroundColor: C.red }}>
              {err}
            </div>
          )}

          {notice && (
            <div className="rounded-lg border p-2.5 text-xs font-semibold" style={{ backgroundColor: C.maple, borderColor: C.mapleLine, color: C.navy }}>
              {notice}
            </div>
          )}

          <button disabled={!canSubmit || busy} onClick={mode === "forgot" ? sendReset : submit}
            className="w-full rounded-lg py-2.5 font-bold disabled:opacity-40"
            style={{ backgroundColor: C.amber, color: C.navy }}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Log in"}
          </button>

          {mode === "forgot" ? (
            <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
              <button type="button" onClick={() => goMode("login")} className="font-semibold underline" style={{ color: C.navy }}>
                ← Back to log in
              </button>
            </p>
          ) : (
            <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
              {mode === "signup"
                ? "One account lets you post gigs and pick up scorekeeping work."
                : "Welcome back!"}
            </p>
          )}
          <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
            By continuing you agree to our{" "}
            <button onClick={() => setShowTerms(true)} className="font-semibold underline" style={{ color: C.navy }}>
              Terms of Use
            </button>.
          </p>
        </div>
      </div>
      </div>
      {showTerms && (
        <TermsModal readOnly onClose={() => setShowTerms(false)} onAccept={() => setShowTerms(false)} />
      )}
    </div>
  );
}
