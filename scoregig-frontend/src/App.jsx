// App.jsx — shell: auth gate, mode switch (Organize / Scorekeep), data
// loading, tabs, and gig actions. One account can do both, so the person
// toggles which "hat" they're wearing instead of being locked to a role.
import { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList, PlusCircle, Megaphone, User, CheckCircle2, Shield, X, ChevronRight, CreditCard, LayoutDashboard } from "lucide-react";
import { C, BADGES, AREAS } from "./theme.js";
import { api, setToken, getToken } from "./api.js";
import { Toast } from "./components/ui.jsx";
import GigCard from "./components/GigCard.jsx";
import LocationBar from "./components/LocationBar.jsx";
import PostGig from "./components/PostGig.jsx";
import SaveCard from "./components/SaveCard.jsx";
import BragBoard from "./components/BragBoard.jsx";
import Profile from "./components/Profile.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import ResumeModal from "./components/ResumeModal.jsx";
import IssueModal from "./components/IssueModal.jsx";
import TermsModal from "./components/TermsModal.jsx";
import Login from "./Login.jsx";

function BadgeModal({ onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="sg-display text-lg" style={{ color: C.navy }}>AWARD A BADGE</h3>
          <button onClick={onClose} aria-label="Close"><X size={20} color={C.navy} /></button>
        </div>
        <p className="mt-1 text-sm" style={{ color: C.ink60 }}>No star ratings here — pick the badge that fits how they showed up.</p>
        <div className="mt-4 space-y-2">
          {Object.values(BADGES).map((b) => {
            const Icon = b.icon;
            return (
              <button key={b.id} onClick={() => onPick(b.id)}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left active:scale-[0.99]" style={{ borderColor: C.mapleLine }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: b.color }}><Icon size={20} /></span>
                <span>
                  <span className="block font-bold" style={{ color: C.navy }}>{b.label}</span>
                  <span className="block text-xs" style={{ color: C.ink60 }}>{b.desc}</span>
                </span>
                <ChevronRight className="ml-auto" size={18} color={C.ink40} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Pending-guardian banner for a minor's account, with explicit click feedback
// on resend so it's obvious the button did something.
function GuardianBanner({ guardianEmail }) {
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [err, setErr] = useState("");
  const resend = async () => {
    setStatus("sending"); setErr("");
    try {
      await api("/guardian-consent/resend", { method: "POST" });
      setStatus("sent");
    } catch (e) { setErr(e.message || "Couldn't send. Try again."); setStatus("error"); }
  };
  const label = status === "sending" ? "Sending…"
    : status === "sent" ? "Sent ✓ — resend again"
    : status === "error" ? "Try again"
    : "Resend approval email";
  return (
    <div className="mb-4 rounded-xl border p-3" style={{ borderColor: C.amber, backgroundColor: "#FFF8E8" }}>
      <p className="text-sm font-bold" style={{ color: C.navy }}>Waiting for guardian approval</p>
      <p className="mt-1 text-[12px]" style={{ color: C.ink60 }}>
        We emailed an approval link to {guardianEmail || "your parent/guardian"}. You can look around, but you can't post or request paid gigs until they confirm.
      </p>
      <button onClick={resend} disabled={status === "sending"}
        className="mt-2 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-60"
        style={{ backgroundColor: C.amber, color: C.navy }}>
        {label}
      </button>
      {status === "sent" && (
        <p className="mt-1.5 text-[11px] font-semibold" style={{ color: C.navy }}>
          Approval email sent to {guardianEmail}. Ask them to check their inbox (and spam).
        </p>
      )}
      {status === "error" && (
        <p className="mt-1.5 text-[11px] font-semibold" style={{ color: C.red }}>{err}</p>
      )}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState("organize"); // 'organize' | 'scorekeep'
  const [tab, setTab] = useState("gigs");
  const [openGigs, setOpenGigs] = useState([]);
  const [myGigs, setMyGigs] = useState([]);
  const [brags, setBrags] = useState([]);
  const [viewer, setViewer] = useState(AREAS[0]);
  const [radius, setRadius] = useState(25);
  const [editing, setEditing] = useState(null);
  const [badgeFor, setBadgeFor] = useState(null);
  const [resumeFor, setResumeFor] = useState(null);
  const [issueFor, setIssueFor] = useState(null);
  const [termsCtx, setTermsCtx] = useState(null); // { context: 'post'|'claim', then: fn }
  const [showTerms, setShowTerms] = useState(false); // read-only Terms viewer
  const [msg, setMsg] = useState(null);
  const toastTimer = useRef(null);

  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setMsg(null);
  }, []);

  const toast = useCallback((m, error = false) => {
    clearTimeout(toastTimer.current);
    setMsg({ m, error });
    // Stay long enough to read; longer messages get a little more time. (Jun14 #4)
    const ms = Math.min(14000, 9000 + String(m).length * 45);
    toastTimer.current = setTimeout(() => setMsg(null), ms);
  }, []);

  const refreshMe = useCallback(() => {
    api("/me").then(setMe).catch(() => { setToken(null); setAuthed(false); });
  }, []);

  const refreshGigs = useCallback(() => {
    api("/gigs?mine=1").then(setMyGigs).catch((e) => toast(e.message, true));
    api(`/gigs?lat=${viewer.lat}&lng=${viewer.lng}&radiusKm=${radius}`)
      .then(setOpenGigs).catch((e) => toast(e.message, true));
    api("/brags").then(setBrags).catch(() => {});
  }, [viewer, radius, toast]);

  useEffect(() => { if (authed) refreshMe(); }, [authed, refreshMe]);
  useEffect(() => { if (me) refreshGigs(); }, [me, refreshGigs]);
  useEffect(() => {
    if (!me) return;
    const i = setInterval(refreshGigs, 30000);
    return () => clearInterval(i);
  }, [me, refreshGigs]);

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  if (!me) return <div className="p-8 text-center" style={{ color: C.ink60 }}>Loading…</div>;

  const organizing = mode === "organize";

  // Gigs I posted vs gigs I claimed (one account can have both).
  const postedByMe = myGigs.filter((g) => g.owner_id === me.id);
  // In scorekeep mode, "my gigs" = ones I claimed OR have a pending request on.
  const claimedByMe = myGigs.filter((g) => g.claimed_by === me.id || g.requested_by === me.id);
  const myDoneGigs = myGigs.filter((g) => g.claimed_by === me.id && ["completed", "paid"].includes(g.status));

  const termsAccepted = () => Boolean(sessionStorage.getItem("sg_terms"));
  const acceptTerms = () => { sessionStorage.setItem("sg_terms", "1"); };

  const act = async (gigId, action, body) => {
    // Gate the 'request' action behind terms acceptance
    if (action === "request" && !termsAccepted()) {
      setTermsCtx({ context: "claim", then: () => act(gigId, action) });
      return;
    }
    try {
      const result = await api(`/gigs/${gigId}/${action}`, { method: "POST", body });
      const friendly = {
        request: "Request sent! The organizer will review your profile and confirm. Hang tight!",
        approve: "Approved! Your card was charged and the scorekeeper is locked in.",
        decline: "Request declined — the gig is open again for others.",
        "release-now": "Payment approved! Your scorekeeper will be paid within the next minute.",
        arrive: "Your arrival is confirmed and a notification has been sent to the organizer. Good luck at the game!",
        complete: "Nice work! Payment releases automatically unless the organizer flags an issue.",
        "no-show": "No-show reported. You've been refunded in full.",
        issue: "Issue reported — payout paused while ScoreGIG reviews.",
        "cancel-claim": "Gig cancelled. The organizer has been refunded and notified. Heads up — cancellations show on your profile, so try to keep them rare.",
        cancel: "Gig cancelled. Your scorekeeper has been notified, and any charge was refunded to your card.",
        dismiss: "Removed from your list.",
      };
      // Pre-approved regulars get locked in instantly instead of going pending.
      if (action === "request" && result?.instantClaim) {
        toast("You're a trusted regular for this organizer — you're locked in instantly! No waiting for approval. 🎉");
      } else if (action === "cancel-claim" && result?.standing && result.standing.tier !== "good") {
        const st = result.standing;
        if (st.tier === "restricted") {
          toast(`Gig cancelled. You've cancelled ${st.recentCancellations} gigs in the last 30 days, so instant booking with your regular organizers is paused for now. It lifts automatically as older cancellations age out.`, true);
        } else {
          toast(`Gig cancelled. That's ${st.recentCancellations} in the last 30 days — one more and instant booking with your regulars pauses temporarily. Cancellations age out after 30 days.`, true);
        }
      } else {
        toast(friendly[action] || "Done!");
      }
      if (action === "cancel-claim") refreshMe();
      refreshGigs();
    } catch (e) { toast(e.message, true); }
  };

  const submitGig = async (body, editId) => {
    if (!termsAccepted()) {
      setTermsCtx({ context: "post", then: () => submitGig(body, editId) });
      return;
    }
    try {
      if (editId) {
        const g = body.games[0];
        await api(`/gigs/${editId}`, {
          method: "PATCH",
          body: {
            title: body.title, sport: body.sport, type: body.type,
            venue: g.venue || null, game_code: g.gameCode || null,
            location: g.location, area: g.area, lat: g.lat, lng: g.lng,
            start_at: g.startAt, duration_min: g.durationMin, pay_cents: g.payCents,
            province: g.province,
            home_team: g.homeTeam || null, away_team: g.awayTeam || null,
          },
        });
        toast("Gig updated! Scorekeepers will see the new details right away.");
      } else {
        const result = await api("/gigs", { method: "POST", body });
        const count = Array.isArray(result) ? result.length : 1;
        toast(count > 1
          ? `${count} gigs posted! Each game is separate — scorekeepers can claim individually.`
          : "Gig posted! Your card is on file — charged only when you approve a scorekeeper.");
      }
      setEditing(null); setTab("gigs"); refreshGigs();
    } catch (e) { toast(e.message, true); }
  };

  const awardBadge = async (badge) => {
    try {
      await api(`/gigs/${badgeFor}/badge`, { method: "POST", body: { badge } });
      toast(`${BADGES[badge].label} badge awarded! It's now in their trophy case.`);
      setBadgeFor(null); refreshGigs();
    } catch (e) { toast(e.message, true); }
  };

  // Tabs depend on the current mode. Admins get an extra tab in organize mode.
  const organizeTabs = [
    ["gigs", "My gigs", ClipboardList],
    ["post", "Post a gig", PlusCircle],
    ["card", "Payment", CreditCard],
    ["brag", "Brag Board", Megaphone],
    ...(me.isAdmin ? [["admin", "Admin", LayoutDashboard]] : []),
  ];
  const scorekeepTabs = [
    ["gigs", "Available", ClipboardList],
    ["mine", "My gigs", CheckCircle2],
    ["brag", "Brag Board", Megaphone],
    ["profile", "Profile", User],
  ];
  const tabs = organizing ? organizeTabs : scorekeepTabs;

  const switchMode = (m) => { setMode(m); setTab("gigs"); setEditing(null); };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <header className="sticky top-0 z-40 px-4 pb-3 pt-4" style={{ backgroundColor: C.navy }}>
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button onClick={() => { setEditing(null); setTab("gigs"); }}
            className="sg-display text-2xl text-white">SCORE<span style={{ color: C.amber }}>GIG</span></button>
          <button onClick={() => { setToken(null); setAuthed(false); setMe(null); }}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff" }}>
            {(me.displayName || me.name).split(" ")[0]} · Sign out
          </button>
        </div>
        {/* Mode switch — one account, two hats */}
        <div className="mx-auto mt-3 flex max-w-md rounded-lg p-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
          {[["organize", "Organizer"], ["scorekeep", "Scorekeeper"]].map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)}
              className="flex-1 rounded-md py-1.5 text-sm font-bold transition-colors"
              style={mode === m ? { backgroundColor: C.amber, color: C.navy } : { color: "rgba(255,255,255,0.7)" }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-28 pt-4">
        {me.guardianConsentStatus === "pending" && (
          <GuardianBanner guardianEmail={me.guardianEmail} />
        )}
        {/* ---------------- ORGANIZE MODE ---------------- */}
        {organizing && tab === "gigs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="sg-display text-xl" style={{ color: C.navy }}>MY GIGS</h2>
              <button onClick={() => { setEditing(null); setTab(me.cardSaved ? "post" : "card"); }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold"
                style={{ backgroundColor: C.amber, color: C.navy }}>
                <PlusCircle size={16} /> Post a gig
              </button>
            </div>
            {!me.cardSaved && (
              <button onClick={() => setTab("card")} className="w-full rounded-lg border p-3 text-left text-sm font-bold"
                style={{ borderColor: C.amber, color: C.navy, backgroundColor: "#fff" }}>
                💳 Add a payment card to start posting gigs →
              </button>
            )}
            <div className="flex items-start gap-1.5 rounded-lg p-2.5 text-[11px]" style={{ backgroundColor: C.maple, color: C.navy }}>
              <Shield size={13} className="mt-0.5 shrink-0" />
              <span>Your card is charged when a gig is claimed and released automatically after the gig. No-show? Report it 5 minutes after start for a full refund.</span>
            </div>
            {postedByMe.length === 0 && (
              <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                No gigs yet — post your first one!
              </div>
            )}
            {postedByMe.map((g) => (
              <GigCard key={g.id} gig={g} me={me} onAction={act} onBadge={setBadgeFor} onViewResume={setResumeFor}
                onReportIssue={setIssueFor} toast={toast}
                onEdit={(gig) => { setEditing(gig); setTab("post"); }} />
            ))}
          </div>
        )}

        {organizing && tab === "post" && (
          me.cardSaved
            ? <PostGig initial={editing} onSubmit={submitGig} toast={toast} onCancel={() => { setEditing(null); setTab("gigs"); }} />
            : <SaveCard onSaved={() => { refreshMe(); }} toast={toast} />
        )}

        {organizing && tab === "card" && (
          me.cardSaved
            ? <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.navy }}>
                ✅ A card is on file. You're charged only when a gig is claimed.
              </div>
            : <SaveCard onSaved={() => { refreshMe(); setTab("post"); }} toast={toast} />
        )}

        {organizing && tab === "admin" && me.isAdmin && (
          <AdminDashboard toast={toast} />
        )}

        {/* ---------------- SCOREKEEP MODE ---------------- */}
        {!organizing && tab === "gigs" && (
          <div className="space-y-3">
            <h2 className="sg-display text-xl" style={{ color: C.navy }}>AVAILABLE GIGS</h2>
            {!me.payoutsEnabled && (
              me.onboardingSubmitted ? (
                <div className="w-full rounded-lg border p-3 text-sm" style={{ borderColor: C.amber, backgroundColor: "#fff" }}>
                  <div className="font-bold" style={{ color: C.navy }}>⏳ Stripe is verifying your payout details</div>
                  <p className="mt-0.5 text-[12px]" style={{ color: C.ink60 }}>
                    This may take a few minutes to approve and link — no need to start over. We'll switch on requests automatically. Check status on your Profile.
                  </p>
                </div>
              ) : (
                <div>
                  <button onClick={() => setTab("profile")} className="w-full rounded-lg border p-3 text-left text-sm font-bold"
                    style={{ borderColor: C.amber, color: C.navy, backgroundColor: "#fff" }}>
                    💰 Set up payouts so you can claim gigs →
                  </button>
                  <p className="mt-1 px-1 text-[11px]" style={{ color: C.ink60 }}>
                    This may take a few minutes to approve and link.
                  </p>
                </div>
              )
            )}
            <LocationBar viewer={viewer} setViewer={setViewer} radius={radius} setRadius={setRadius} toast={toast} />
            {openGigs.length === 0 && (
              <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                No open gigs within {radius} km of {viewer.name}. Widen the search radius or search another area. Travelling? Search where you're headed and claim before you go.
              </div>
            )}
            {openGigs.map((g) => <GigCard key={g.id} gig={g} me={me} viewer={viewer} onAction={act} />)}
          </div>
        )}

        {!organizing && tab === "mine" && (
          <div className="space-y-3">
            <h2 className="sg-display text-xl" style={{ color: C.navy }}>MY GIGS</h2>
            {claimedByMe.length === 0 && (
              <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                You haven't claimed a gig yet. Head to Available and grab one!
              </div>
            )}
            {claimedByMe.map((g) => <GigCard key={g.id} gig={g} me={me} onAction={act} />)}
          </div>
        )}

        {!organizing && tab === "profile" && (
          <Profile me={me} myGigs={claimedByMe} toast={toast} refreshMe={refreshMe} />
        )}

        {/* ---------------- SHARED ---------------- */}
        {tab === "brag" && (
          <BragBoard brags={brags} myDoneGigs={myDoneGigs} me={me} refresh={refreshGigs} toast={toast} />
        )}

        <div className="mt-8 pb-2 text-center">
          <button onClick={() => setShowTerms(true)} className="text-[11px] font-semibold underline"
            style={{ color: C.ink40 }}>
            Terms of Use
          </button>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white" style={{ borderColor: C.mapleLine }}>
        <div className="mx-auto flex max-w-md">
          {tabs.map(([key, label, Icon]) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => { setEditing(null); setTab(key); }}
                className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold">
                <Icon size={20} color={active ? C.amber : C.ink40} strokeWidth={active ? 2.5 : 2} />
                <span style={{ color: active ? C.navy : C.ink40 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Toast msg={msg?.m} error={msg?.error} onClose={dismissToast} />
      {badgeFor && <BadgeModal onPick={awardBadge} onClose={() => setBadgeFor(null)} />}
      {resumeFor && <ResumeModal scorekeeperId={resumeFor} onClose={() => setResumeFor(null)} toast={toast} />}
      {issueFor && <IssueModal gig={issueFor} onClose={() => setIssueFor(null)} onDone={refreshGigs} toast={toast} />}
      {showTerms && (
        <TermsModal readOnly onClose={() => setShowTerms(false)} onAccept={() => setShowTerms(false)} />
      )}
      {termsCtx && (
        <TermsModal
          context={termsCtx.context}
          onClose={() => setTermsCtx(null)}
          onAccept={() => { acceptTerms(); setTermsCtx(null); termsCtx.then(); }}
        />
      )}
    </div>
  );
}
