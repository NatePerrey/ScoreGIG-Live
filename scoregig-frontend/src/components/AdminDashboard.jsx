// AdminDashboard.jsx — platform owner overview. Shows gig counts, money
// totals, open issues (with resolve controls), and a recent-gigs table.
import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { C, fmtDT } from "../theme.js";
import { api } from "../api.js";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

const OUTCOMES = [
  ["released", "✅ Release payout to scorekeeper"],
  ["refunded",  "💳 Refund the organizer"],
  ["dismissed", "🗂 Dismiss — no money action"],
];

function IssueCard({ issue, onResolved, toast }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    setBusy(true);
    try {
      await api(`/admin/issues/${issue.id}/resolve`, { method: "POST", body: { outcome, note } });
      toast("Issue resolved!");
      onResolved();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: issue.status === "open" ? C.red : C.mapleLine }}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {issue.status === "open"
                ? <AlertTriangle size={13} color={C.red} />
                : <CheckCircle2 size={13} color={C.green} />}
              <span className="truncate font-bold text-sm" style={{ color: C.navy }}>{issue.gig_title}</span>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: C.ink60 }}>
              {issue.reasonLabel} · {fmtDT(issue.created_at)}
            </div>
            <div className="text-[11px]" style={{ color: C.ink40 }}>
              Reported by {issue.reporter}{issue.scorekeeper ? ` · Scorekeeper: ${issue.scorekeeper}` : ""}
            </div>
            {issue.details && (
              <p className="mt-1 text-[12px] italic" style={{ color: C.navy }}>"{issue.details}"</p>
            )}
            {issue.status === "resolved" && (
              <div className="mt-1 text-[11px] font-semibold" style={{ color: C.green }}>
                Resolved: {issue.outcome} {issue.resolution ? `· ${issue.resolution}` : ""}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="sg-num text-sm font-bold" style={{ color: C.navy }}>{money(issue.pay_cents)}</div>
            {issue.status === "open" && (
              <button onClick={() => setOpen(!open)}
                className="mt-1 rounded-lg px-2 py-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: C.navy }}>
                {open ? "Cancel" : "Resolve"}
              </button>
            )}
          </div>
        </div>

        {open && issue.status === "open" && (
          <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: C.mapleLine }}>
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Choose an outcome</div>
            {OUTCOMES.map(([key, label]) => (
              <button key={key} onClick={() => setOutcome(key)}
                className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs font-semibold"
                style={outcome === key
                  ? { borderColor: C.amber, backgroundColor: C.maple, color: C.navy }
                  : { borderColor: C.mapleLine, color: C.navy }}>
                {label}
              </button>
            ))}
            <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note for your records (optional)."
              className="w-full rounded-lg border px-3 py-2 text-xs" style={{ borderColor: C.mapleLine }} />
            <button disabled={!outcome || busy} onClick={resolve}
              className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: C.amber, color: C.navy }}>
              {busy ? "Resolving…" : "Confirm resolution"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard({ toast }) {
  const [stats, setStats] = useState(null);
  const [gigs, setGigs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [tab, setTab] = useState("overview");
  const [cityFilter, setCityFilter] = useState("all");

  const load = useCallback(() => {
    api("/admin/stats").then(setStats).catch((e) => toast(e.message, true));
    api("/admin/gigs").then(setGigs).catch(() => {});
    api("/admin/issues").then(setIssues).catch(() => {});
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (!stats) return <div className="p-6 text-center text-sm" style={{ color: C.ink60 }}>Loading dashboard…</div>;

  const s = stats.gigsByStatus;
  const openIssues = issues.filter((i) => i.status === "open");
  const resolvedIssues = issues.filter((i) => i.status === "resolved");

  const cards = [
    ["Users", stats.users],
    ["Total gigs", stats.totalGigs],
    ["Open", s.open],
    ["Claimed", s.claimed + s.arrived],
    ["Completed", s.completed],
    ["Paid", s.paid],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="sg-display text-xl" style={{ color: C.navy }}>ADMIN DASHBOARD</h2>
        {stats.openIssues > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: C.red }}>
            <AlertTriangle size={12} /> {stats.openIssues} open {stats.openIssues === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex rounded-lg p-1" style={{ backgroundColor: C.maple }}>
        {[["overview", "Overview"], ["issues", `Issues${stats.openIssues > 0 ? ` (${stats.openIssues})` : ""}`], ["gigs", "Recent gigs"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 rounded-md py-1.5 text-xs font-bold"
            style={tab === key ? { backgroundColor: C.navy, color: "#fff" } : { color: C.navy }}>
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {cards.map(([label, n]) => (
              <div key={label} className="rounded-xl border bg-white p-3 text-center" style={{ borderColor: C.mapleLine }}>
                <div className="sg-display sg-num text-2xl" style={{ color: C.navy }}>{n}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>{label}</div>
              </div>
            ))}
          </div>
          {/* Issue + no-show tiles — highlighted row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-3 text-center cursor-pointer"
              onClick={() => setTab("issues")}
              style={{ borderColor: openIssues.length > 0 ? C.red : C.mapleLine, backgroundColor: openIssues.length > 0 ? "#FFF0F0" : "#fff" }}>
              <div className="sg-display sg-num text-2xl" style={{ color: openIssues.length > 0 ? C.red : C.navy }}>{openIssues.length}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: openIssues.length > 0 ? C.red : C.ink60 }}>Active Issues</div>
            </div>
            <div className="rounded-xl border p-3 text-center cursor-pointer"
              onClick={() => setTab("gigs")}
              style={{ borderColor: s.no_show > 0 ? C.red : C.mapleLine, backgroundColor: s.no_show > 0 ? "#FFF0F0" : "#fff" }}>
              <div className="sg-display sg-num text-2xl" style={{ color: s.no_show > 0 ? C.red : C.navy }}>{s.no_show}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: s.no_show > 0 ? C.red : C.ink60 }}>No Shows</div>
            </div>
            <div className="rounded-xl border bg-white p-3 text-center cursor-pointer"
              onClick={() => setTab("issues")}
              style={{ borderColor: C.mapleLine }}>
              <div className="sg-display sg-num text-2xl" style={{ color: C.navy }}>{resolvedIssues.length}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Resolved</div>
            </div>
          </div>
          <div className="rounded-xl p-4 text-white" style={{ backgroundColor: C.navy }}>
            <h3 className="sg-display text-sm" style={{ color: C.amber }}>MONEY</h3>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Paid to scorekeepers</span>
                <span className="sg-num font-bold">{money(stats.money.paidOutToScorekeepersCents)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Your platform fees</span>
                <span className="sg-num font-bold" style={{ color: C.amber }}>{money(stats.money.platformFeesEarnedCents)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Held in escrow</span>
                <span className="sg-num font-bold">{money(stats.money.heldInEscrowCents)}</span>
              </div>
            </div>
          </div>

          {(() => {
            const n = stats.notifications || { sent: 0, failed: 0, pendingSetup: 0 };
            return (
              <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
                <h3 className="sg-display text-sm" style={{ color: C.navy }}>NOTIFICATIONS · LAST 30 DAYS</h3>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="sg-display sg-num text-xl" style={{ color: C.green }}>{n.sent}</div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Sent</div>
                  </div>
                  <div>
                    <div className="sg-display sg-num text-xl" style={{ color: n.pendingSetup > 0 ? C.amber : C.navy }}>{n.pendingSetup}</div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Pending setup</div>
                  </div>
                  <div>
                    <div className="sg-display sg-num text-xl" style={{ color: n.failed > 0 ? C.red : C.navy }}>{n.failed}</div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Failed</div>
                  </div>
                </div>
                {n.pendingSetup > 0 && (
                  <p className="mt-2 text-[10px]" style={{ color: C.ink40 }}>
                    "Pending setup" messages are logged but not sent yet — add your SendGrid / Twilio keys to go live.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ISSUES */}
      {tab === "issues" && (
        <div className="space-y-2">
          {issues.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
              No issues reported yet.
            </div>
          )}
          {openIssues.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.red }}>
                Open · needs review ({openIssues.length})
              </div>
              {openIssues.map((i) => <IssueCard key={i.id} issue={i} onResolved={load} toast={toast} />)}
            </div>
          )}
          {resolvedIssues.length > 0 && (
            <div>
              <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40 }}>
                Resolved ({resolvedIssues.length})
              </div>
              {resolvedIssues.map((i) => <IssueCard key={i.id} issue={i} onResolved={load} toast={toast} />)}
            </div>
          )}
        </div>
      )}

      {/* RECENT GIGS */}
      {tab === "gigs" && (() => {
        const cities = [...new Set(gigs.map((g) => g.area).filter(Boolean))].sort();
        const shownGigs = cityFilter === "all" ? gigs : gigs.filter((g) => g.area === cityFilter);
        return (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Filter by city</label>
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: C.mapleLine }}>
              <option value="all">All cities ({gigs.length})</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c} ({gigs.filter((g) => g.area === c).length})</option>
              ))}
            </select>
          </div>
          {shownGigs.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
              {gigs.length === 0 ? "No gigs posted yet." : "No gigs in this city."}
            </div>
          )}
          {shownGigs.map((g) => (
            <div key={g.id} className="rounded-xl border bg-white p-3" style={{ borderColor: C.mapleLine }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold" style={{ color: C.navy }}>{g.title}</div>
                  <div className="text-[11px]" style={{ color: C.ink60 }}>
                    {g.sport} · {g.area?.split(",")[0]} · {fmtDT(g.start_at)}
                  </div>
                  <div className="text-[11px]" style={{ color: C.ink40 }}>
                    {g.organizer}{g.scorekeeper ? ` · ${g.scorekeeper}` : " · unclaimed"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="sg-num text-sm font-bold" style={{ color: C.navy }}>{money(g.pay_cents)}</div>
                  <div className="text-[10px] font-bold uppercase" style={{ color: g.status === "issue" ? C.red : C.ink40 }}>{g.status}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        );
      })()}
    </div>
  );
}
