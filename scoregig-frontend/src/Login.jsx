// Login.jsx — real signup & login (email/password). One account does both
// roles (organizer + scorekeeper). Age range is collected at signup; 12–17
// routes payouts through a guardian later in the flow.
import { useState } from "react";
import { C } from "./theme.js";
import { api, setToken } from "./api.js";
import TermsModal from "./components/TermsModal.jsx";

const AGE_RANGES = [
  { value: "15-17", label: "15–17" },
  { value: "18-25", label: "18–25" },
  { value: "26+",   label: "26 or older" },
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showTerms, setShowTerms] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const path = mode === "signup" ? "/signup" : "/login";
      const body = mode === "signup"
        ? { name: `${firstName.trim()} ${lastName.trim()}`, displayName, email, password, ageRange, guardianEmail: guardianEmail.trim(), phone: phone.trim(), confirmAge, smsConsent: Boolean(phone.trim()) && smsConsent }
        : { email, password };
      const { token } = await api(path, { method: "POST", body });
      setToken(token);
      onAuthed();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const input = "w-full rounded-lg border px-3 py-2.5 text-sm";
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSubmit = mode === "signup"
    ? firstName.trim() && lastName.trim() && email && password.length >= 8 && ageRange
      && (ageRange !== "15-17" || (confirmAge && emailRe.test(guardianEmail.trim())))
    : email && password;

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: C.navy }}>
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="sg-display text-4xl text-white">SCORE<span style={{ color: C.amber }}>GIG</span></div>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            Scorekeepers wanted. Paid, badged, bragged.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-5">
          {/* Tab switch */}
          <div className="flex rounded-lg p-1" style={{ backgroundColor: C.maple }}>
            {[["login", "Log in"], ["signup", "Sign up"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setErr(null); }}
                className="flex-1 rounded-md py-1.5 text-sm font-bold transition-colors"
                style={mode === m ? { backgroundColor: C.navy, color: "#fff" } : { color: C.navy }}>
                {label}
              </button>
            ))}
          </div>

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

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Password</label>
            <input className={input} style={{ borderColor: C.mapleLine }} type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
          </div>

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
              {ageRange === "15-17" && (
                <p className="mt-1.5 text-[11px]" style={{ color: C.ink60 }}>
                  You're welcome here! Based on Stripe's payment policies, anyone under 18 needs a parent or guardian to complete payout setup and receive earnings on their behalf. It's a Stripe requirement to protect minors — not a ScoreGIG rule. You can still build your profile and request gigs.
                </p>
              )}
              {ageRange === "15-17" && (
                <div className="mt-2.5">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Parent / guardian email *</label>
                  <input className={input} style={{ borderColor: C.mapleLine }} type="email" value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)} placeholder="parent@example.com" autoCapitalize="none" />
                  <p className="mt-1 text-[11px]" style={{ color: C.ink60 }}>
                    We'll email your parent or guardian a link to approve your account. You can create your account now and browse, but you can't pick up paid gigs until they confirm.
                  </p>
                </div>
              )}
              {ageRange === "15-17" && (
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

          {err && (
            <div className="rounded-lg p-2 text-xs font-semibold text-white" style={{ backgroundColor: C.red }}>
              {err}
            </div>
          )}

          <button disabled={!canSubmit || busy} onClick={submit}
            className="w-full rounded-lg py-2.5 font-bold disabled:opacity-40"
            style={{ backgroundColor: C.amber, color: C.navy }}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>

          <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
            {mode === "signup"
              ? "One account lets you post gigs and pick up scorekeeping work."
              : "Welcome back!"}
          </p>
          <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
            By continuing you agree to our{" "}
            <button onClick={() => setShowTerms(true)} className="font-semibold underline" style={{ color: C.navy }}>
              Terms of Use
            </button>.
          </p>
        </div>
      </div>
      {showTerms && (
        <TermsModal readOnly onClose={() => setShowTerms(false)} onAccept={() => setShowTerms(false)} />
      )}
    </div>
  );
}
