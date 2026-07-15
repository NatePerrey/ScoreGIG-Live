// Profile.jsx — scorekeeper trophy case + payout onboarding entry point.
import { useState } from "react";
import { C, BADGES, SPORTS } from "../theme.js";
import { api } from "../api.js";
import CitySearch from "./CitySearch.jsx";

export default function Profile({ me, myGigs, toast, refreshMe }) {
  const paid = myGigs.filter((g) => ["completed","paid"].includes(g.status));
  const earned = paid.reduce((s, g) => s + g.pay_cents, 0);
  // Once a scorekeeper has a real ScoreGIG track record, the self-reported
  // "prior jobs" number stops mattering — hide it so verified history speaks.
  const HISTORY_THRESHOLD = 3;
  const hasHistory = paid.length >= HISTORY_THRESHOLD;
  const counts = {};
  myGigs.forEach((g) => { if (g.badge) counts[g.badge] = (counts[g.badge] || 0) + 1; });
  const initials = (me.displayName || me.name).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const [editingResume, setEditingResume] = useState(false);
  const [displayName, setDisplayName] = useState(me.displayName || me.name || "");
  const [bio, setBio] = useState(me.bio || "");
  const [experience, setExperience] = useState(me.experience || "");
  const [city, setCity] = useState(me.city || "");
  const [gamesWorked, setGamesWorked] = useState(me.gamesWorked || "0");
  const [sports, setSports] = useState(me.sports || []);
  const [phone, setPhone] = useState(me.phone || "");
  const [notifs, setNotifs] = useState(me.notificationsEnabled !== false);
  const [smsConsent, setSmsConsent] = useState(me.smsConsent === true);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const toggleSport = (s) => setSports((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const [cashOutResult, setCashOutResult] = useState(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [rechecking, setRechecking] = useState(false); // pressed/loading state on Re-check status (#4)

  const cashOut = async () => {
    setCashingOut(true);
    try {
      const d = await api("/scorekeepers/cashout", { method: "POST" });
      setCashOutResult(d);
      toast("Cash out requested! Money should arrive within minutes.");
    } catch (e) { toast(e.message, true); }
    setCashingOut(false);
  };

  const saveResume = async () => {
    if (!displayName.trim()) { toast("Display name can't be empty.", true); return; }
    try {
      await api("/me/profile", { method: "PATCH", body: { displayName: displayName.trim(), bio, experience, city, gamesWorked, sports } });
      toast("Profile updated!");
      setEditingResume(false);
      refreshMe();
    } catch (e) { toast(e.message, true); }
  };

  const saveNotifs = async () => {
    setSavingNotifs(true);
    try {
      await api("/me/profile", { method: "PATCH", body: { phone: phone.trim(), notificationsEnabled: notifs, smsConsent: Boolean(phone.trim()) && smsConsent } });
      toast("Notification settings saved.");
      refreshMe();
    } catch (e) { toast(e.message, true); }
    finally { setSavingNotifs(false); }
  };

  const onboard = async () => {
    try {
      const d = await api("/scorekeepers/onboard", { method: "POST" });
      if (d.guardianRequired) toast(d.note);
      // Store a flag so when Stripe redirects back we auto-recheck
      sessionStorage.setItem("sg_onboarding", "1");
      window.location.href = d.url;
    } catch (e) { toast(e.message, true); }
  };

  const recheck = async (silent = false) => {
    if (rechecking) return;
    setRechecking(true);
    try {
      // Retry up to 3 times with a short delay — Stripe can lag on capabilities
      let d;
      for (let i = 0; i < 3; i++) {
        d = await api("/scorekeepers/refresh-status", { method: "POST" });
        if (d.payoutsEnabled) break;
        if (i < 2) await new Promise((r) => setTimeout(r, 1500));
      }
      if (!silent) toast(d.payoutsEnabled ? "Payouts enabled — you're all set! 🎉" : "Almost there — Stripe is still verifying. Try again in a moment.");
      refreshMe();
    } catch (e) { if (!silent) toast(e.message, true); }
    finally { setRechecking(false); }
  };

  // Auto-recheck when returning from Stripe onboarding
  useState(() => {
    if (sessionStorage.getItem("sg_onboarding")) {
      sessionStorage.removeItem("sg_onboarding");
      setTimeout(() => recheck(true), 1000);
    }
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5 text-white" style={{ backgroundColor: C.navy }}>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full sg-display text-lg"
            style={{ backgroundColor: C.amber, color: C.navy }}>{initials}</span>
          <div>
            <div className="font-bold">{me.displayName || me.name}</div>
            <div className="text-xs opacity-70">
              Scorekeeper{me.city ? ` · ${me.city}` : ""}{me.minor ? " · under 18 (guardian payout)" : ""}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[["Gigs done", paid.length], ["Earned", `$${Math.round(earned / 100)}`],
            ["Badges", Object.values(counts).reduce((a, b) => a + b, 0)]].map(([l, v]) => (
            <div key={l} className="rounded-lg py-2" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <div className="sg-display sg-num text-xl" style={{ color: C.amber }}>{v}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-70">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancellation standing — soft warning at 2, instant-booking paused at 3+ */}
      {me.cancellationStanding && me.cancellationStanding.tier !== "good" && (() => {
        const st = me.cancellationStanding;
        const restricted = st.tier === "restricted";
        return (
          <div className="rounded-xl border p-4" style={{ borderColor: restricted ? C.red : C.amber, backgroundColor: restricted ? "#FFF6F6" : "#FFFBF0" }}>
            <div className="text-sm font-bold" style={{ color: restricted ? C.red : C.navy }}>
              {restricted ? "Instant booking paused" : "Heads up on cancellations"}
            </div>
            <p className="mt-1 text-[12px]" style={{ color: C.ink60 }}>
              {restricted
                ? `You've cancelled ${st.recentCancellations} gigs in the last 30 days. Instant booking with your regular organizers is paused for now — you can still request gigs, and organizers will approve them manually. Your standing recovers automatically as older cancellations pass the 30-day mark.`
                : `You've cancelled ${st.recentCancellations} gigs in the last 30 days. One more and instant booking with your regular organizers will pause temporarily. Cancellations drop off your record 30 days after they happen.`}
            </p>
          </div>
        );
      })()}

      {!me.payoutsEnabled && (() => {
        // Simple 3-step progress: account created -> Stripe payouts set up -> first gig claimed.
        const step = me.onboardingSubmitted ? 2 : 1;
        const steps = ["Create account", "Set up payouts", "Claim a gig"];
        return (
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
            <div className="mb-1 flex justify-between text-[11px] font-bold" style={{ color: C.navy }}>
              <span>Step {step} of {steps.length}</span>
              <span>{steps[step - 1]}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: C.maple }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(step / steps.length) * 100}%`, backgroundColor: C.amber }} />
            </div>
          </div>
        );
      })()}

      {!me.payoutsEnabled && (
        me.onboardingSubmitted ? (
          <div className="space-y-2 rounded-xl border bg-white p-4" style={{ borderColor: C.amber }}>
            <div className="text-sm font-bold" style={{ color: C.navy }}>⏳ Verifying your payout details</div>
            <p className="text-xs" style={{ color: C.ink60 }}>
              You've finished the Stripe form — no need to do it again. Stripe is verifying and linking your account, which may take a few minutes. We'll switch on gig requests automatically once it's ready.
            </p>
            <button onClick={() => recheck(false)} disabled={rechecking}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-bold text-white disabled:opacity-80"
              style={{ backgroundColor: rechecking ? C.navySoft : C.navy }}>
              {rechecking && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {rechecking ? "Checking…" : "Re-check status"}
            </button>
            <button onClick={onboard} className="w-full text-xs font-semibold" style={{ color: C.ink60 }}>
              Need to update your details? Reopen Stripe setup
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border bg-white p-4" style={{ borderColor: C.amber }}>
            <div className="text-sm font-bold" style={{ color: C.navy }}>Set up payouts to claim gigs</div>
            <p className="text-xs" style={{ color: C.ink60 }}>
              ScoreGIG pays you through Stripe. {me.minor
                ? "Since you're under 18, Stripe requires a parent or guardian to complete payout setup and receive funds on your behalf. This is a Stripe policy — not a ScoreGIG decision — designed to protect minors."
                : "It takes about two minutes."}
            </p>
            <button onClick={onboard} className="w-full rounded-lg py-2.5 font-bold text-white" style={{ backgroundColor: C.navy }}>
              Set up payouts with Stripe
            </button>
            <p className="mt-1 text-[11px] text-center" style={{ color: C.ink60 }}>This may take a few minutes to approve and link.</p>
            <button onClick={() => recheck(false)} disabled={rechecking}
              className="flex w-full items-center justify-center gap-2 text-xs font-semibold disabled:opacity-70" style={{ color: C.ink60 }}>
              {rechecking && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {rechecking ? "Checking with Stripe…" : "Already finished? Re-check status"}
            </button>
          </div>
        )
      )}

      {me.payoutsEnabled && (
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
          <h3 className="sg-display text-sm" style={{ color: C.navy }}>PAYOUTS</h3>
          <p className="mt-1 text-xs" style={{ color: C.ink60 }}>
            Your earnings release 2 hours after each gig (or sooner if the organizer approves). They sweep to your bank every Wednesday for free.
          </p>
          {cashOutResult ? (
            <div className="mt-2 rounded-lg p-2.5 text-xs font-semibold" style={{ backgroundColor: C.maple, color: C.navy }}>
              ✅ Instant cash-out requested — {cashOutResult.eta}
            </div>
          ) : (
            <button disabled={cashingOut} onClick={cashOut}
              className="mt-2 w-full rounded-lg border py-2.5 text-sm font-bold disabled:opacity-40"
              style={{ borderColor: C.navy, color: C.navy }}>
              {cashingOut ? "Requesting…" : "Cash out now (≈1.5% fee)"}
            </button>
          )}
          <p className="mt-1.5 text-[11px]" style={{ color: C.ink40 }}>
            Instant cash-out sends money to your linked debit card within minutes. Wednesday batch is always free.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
        <div className="flex items-center justify-between">
          <h3 className="sg-display text-sm" style={{ color: C.navy }}>SCOREKEEPER STATS</h3>
          {!editingResume && (
            <button onClick={() => setEditingResume(true)} className="text-xs font-bold" style={{ color: C.amber }}>
              Edit
            </button>
          )}
        </div>

        {!editingResume ? (
          <div className="mt-2 space-y-2">
            {me.bio
              ? <p className="text-sm" style={{ color: C.navy }}>{me.bio}</p>
              : <p className="text-sm italic" style={{ color: C.ink40 }}>Add a short intro so organizers know who you are.</p>}
            {((me.gamesWorked && me.gamesWorked !== "0" && !hasHistory) || (me.sports && me.sports.length > 0)) ? (
              <div className="flex flex-wrap gap-1.5">
                {me.gamesWorked && me.gamesWorked !== "0" && !hasHistory && (
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>
                    {me.gamesWorked === "10" ? "10+" : me.gamesWorked} jobs before ScoreGIG
                  </span>
                )}
                {(me.sports || []).map((s) => (
                  <span key={s} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>{s}</span>
                ))}
              </div>
            ) : null}
            {me.experience && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40 }}>Experience</div>
                <p className="whitespace-pre-line text-sm" style={{ color: C.navy }}>{me.experience}</p>
              </div>
            )}
            <div className="mt-1 text-[11px]" style={{ color: C.ink60 }}>
              {paid.length} completed {paid.length === 1 ? "gig" : "gigs"} on ScoreGIG back up your experience automatically.
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40}
                placeholder="Shown to organizers — never your real name unless you want it to be"
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />
            </div>
            {hasHistory ? (
              <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                You've completed {paid.length} gigs on ScoreGIG — your verified record now speaks for itself, so the "prior experience" estimate is hidden.
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>
                  How many scorekeeping jobs have you worked prior to ScoreGIG? · <span style={{ color: C.navy }}>{gamesWorked === "10" ? "10+" : gamesWorked}</span>
                </label>
                <input type="range" min={0} max={10} step={1} value={Number(gamesWorked) || 0}
                  onChange={(e) => setGamesWorked(String(e.target.value))}
                  className="w-full" style={{ accentColor: C.amber }} />
                <div className="flex justify-between text-[10px]" style={{ color: C.ink40 }}>
                  <span>0</span><span>10+</span>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>What do you scorekeep?</label>
              <div className="flex flex-wrap gap-1.5">
                {SPORTS.map((s) => (
                  <button key={s} type="button" onClick={() => toggleSport(s)}
                    className="rounded-full border px-3 py-1 text-xs font-bold"
                    style={sports.includes(s)
                      ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                      : { borderColor: C.mapleLine, color: C.navy }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>About you (1–2 lines)</label>
              <textarea rows={2} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Grade 11 student, played rep hockey 6 years, love being on the clock."
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Experience & history</label>
              <textarea rows={5} maxLength={2000} value={experience} onChange={(e) => setExperience(e.target.value)}
                placeholder={"List sports you can score, years of experience, certifications, leagues worked, etc.\n\ne.g.\n• Hockey — 3 seasons, house & rep\n• Basketball — official scoresheet certified\n• Volleyball — 20+ games at U13–U16"}
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Home city</label>
              <CitySearch value={city ? { name: city } : null} onSelect={(r) => setCity(r.name)} toast={toast} />
            </div>
            <div className="flex gap-2">
              <button onClick={saveResume} className="flex-1 rounded-lg py-2.5 font-bold text-white" style={{ backgroundColor: C.navy }}>Save resume</button>
              <button onClick={() => { setEditingResume(false); setDisplayName(me.displayName || me.name || ""); setBio(me.bio || ""); setExperience(me.experience || ""); setCity(me.city || ""); setGamesWorked(me.gamesWorked || "0"); setSports(me.sports || []); }}
                className="rounded-lg border px-4 text-sm font-bold" style={{ borderColor: C.mapleLine, color: C.ink60 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Notification settings — email is on by default; SMS needs a phone. */}
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
        <div className="text-sm font-bold" style={{ color: C.navy }}>Notifications</div>
        <p className="mt-0.5 text-[11px]" style={{ color: C.ink60 }}>
          We'll let you know every time one of your gigs changes (claimed, arrival, completed, paid, cancelled, and more).
        </p>

        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold" style={{ color: C.navy }}>Get notifications</span>
          <button onClick={() => setNotifs((v) => !v)} role="switch" aria-checked={notifs}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ backgroundColor: notifs ? C.green : C.mapleLine }}>
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: notifs ? "1.5rem" : "0.125rem" }} />
          </button>
        </label>
        <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
          {notifs
            ? "On — email always, plus text if you add a mobile number below."
            : "Off — you won't get any email or text updates."}
        </p>

        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>
            Mobile number <span style={{ color: C.ink40 }}>(optional, for texts)</span>
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+1 587 555 1234"
            className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />

          {phone.trim() && (
            <label className="mt-2 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="text-[10px]" style={{ color: C.ink60 }}>
                Yes, text me ScoreGIG gig updates at this number. Msg &amp; data rates may apply; reply STOP anytime to opt out.
              </span>
            </label>
          )}
          {me.smsOptedOut && (
            <p className="mt-2 rounded px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: "#FFF6F6", color: C.red }}>
              You replied STOP, so texts are paused. Re-check the box above and save to start them again.
            </p>
          )}
        </div>

        <button onClick={saveNotifs} disabled={savingNotifs}
          className="mt-3 w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-50" style={{ backgroundColor: C.navy }}>
          {savingNotifs ? "Saving…" : "Save notification settings"}
        </button>
      </div>

      {/* Loyalty milestone — every 5 gigs earns a merch reward */}
      {(() => {
        const completed = paid.length;
        const milestone = 5;
        const nextMilestone = Math.ceil((completed + 0.01) / milestone) * milestone;
        const progress = completed % milestone;
        const ready = completed > 0 && completed % milestone === 0;
        return (
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: ready ? C.amber : C.mapleLine }}>
            <h3 className="sg-display text-sm" style={{ color: C.navy }}>LOYALTY REWARDS</h3>
            <p className="mt-1 text-xs" style={{ color: C.ink60 }}>
              Every 5 gigs earns you a ScoreGIG toque, hat, or t-shirt for just $10.
            </p>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] font-bold" style={{ color: C.navy }}>
                <span>{completed} gigs completed</span>
                <span>{ready ? "🎉 Reward ready!" : `${progress}/${milestone} to next reward`}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: C.maple }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min((progress / milestone) * 100, 100)}%`, backgroundColor: ready ? C.amber : C.navy }} />
              </div>
            </div>
            {ready && (
              <a href="mailto:rewards@scoregig.ca?subject=Merch Reward Claim"
                className="mt-3 flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-bold text-white"
                style={{ backgroundColor: C.amber, color: C.navy }}>
                🏆 Claim your reward
              </a>
            )}
          </div>
        );
      })()}

      <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
        <h3 className="sg-display text-sm" style={{ color: C.navy }}>TROPHY CASE</h3>
        <div className="mt-3 space-y-2">
          {Object.values(BADGES).map((b) => {
            const Icon = b.icon; const n = counts[b.id] || 0;
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-lg p-2"
                style={{ backgroundColor: n ? C.maple : "transparent", opacity: n ? 1 : 0.45 }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: b.color }}><Icon size={18} /></span>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: C.navy }}>{b.label}</div>
                  <div className="text-[11px]" style={{ color: C.ink60 }}>{b.desc}</div>
                </div>
                <span className="sg-display sg-num text-lg" style={{ color: C.navy }}>×{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
