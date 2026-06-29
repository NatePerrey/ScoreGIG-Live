// GigCard.jsx — one gig, with role-appropriate actions. Time windows are
// hinted client-side for UX, but the server is the referee: any action can
// come back with a 409 and we just show its message.
import { useState } from "react";
import { Clock, MapPin, CheckCircle2, AlertTriangle, Trophy, Pencil, Eye, Ban, Timer, ClipboardCheck } from "lucide-react";
import { C, GIG_TYPES, MIN, fmtDT, fmtT, fmtDuration, serviceLabel, startTerm, endTerm, kmBetween, fmtKm } from "../theme.js";
import { Pill, BadgeChip, PayTimeline } from "./ui.jsx";
import TipPanel from "./TipPanel.jsx";

export default function GigCard({ gig, me, viewer, onAction, onBadge, onEdit, onViewResume, onReportIssue, toast }) {
  const now = Date.now();
  const [confirmCancel, setConfirmCancel] = useState(false); // scorekeeper cancelling their claim
  const [confirmOwnerCancel, setConfirmOwnerCancel] = useState(false); // organizer cancelling the gig
  const [busy, setBusy] = useState(false); // prevents double-clicks on action buttons

  // Run an action once: disable buttons while it's in flight so a fast double-tap
  // can't fire it twice. The card refreshes afterward, so the relevant button
  // usually disappears anyway.
  const fire = async (action, body) => {
    if (busy) return;
    setBusy(true);
    try { await onAction(gig.id, action, body); }
    finally { setBusy(false); }
  };
  // One account can do both; ownership is just the actual relationship to this gig.
  const ownedByMe = gig.owner_id === me.id;
  const claimedByMe = gig.claimed_by === me.id;
  const requestedByMe = gig.requested_by === me.id;
  const ended = now >= gig.start_at + gig.duration_min * MIN;
  const term = startTerm(gig.sport);

  const canEdit = ownedByMe && gig.status === "open";
  const canArrive = claimedByMe && gig.status === "claimed" && now >= gig.start_at - 20 * MIN;
  const canComplete = claimedByMe && gig.status === "arrived" && ended;
  const canNoShow = ownedByMe && gig.status === "claimed" && now >= gig.start_at + 5 * MIN;
  const canIssue = ownedByMe && gig.status === "completed";
  const canBadge = ownedByMe && ["completed", "paid"].includes(gig.status) && !gig.badge;
  const hasPendingRequest = ownedByMe && gig.status === "pending" && gig.requested_by;
  // Scorekeeper can back out until they've marked complete.
  const canCancelClaim = claimedByMe && ["claimed", "arrived"].includes(gig.status);
  // Organizer can cancel their gig anytime before payout/completion.
  const canOwnerCancel = ownedByMe && ["open", "pending", "claimed", "arrived"].includes(gig.status);
  const dist = viewer && gig.lat != null ? kmBetween(viewer, gig) : null;
  const svc = serviceLabel(gig.service);
  // Once "release now" is pressed, release_at is set to now and the payout job
  // fires within ~60s. Detect that so the button shows as already pressed and
  // can't be clicked again while we wait for it to flip to "paid".
  const releaseRequested = gig.status === "completed" && gig.release_at && gig.release_at <= now;

  const statusPill = {
    open: ["Open", C.navy, C.maple],
    pending: ["Pending approval", C.navy, C.amber],
    claimed: ["Claimed", "#fff", C.navySoft],
    arrived: ["On the clock", "#fff", C.green],
    completed: ["Awaiting payout", C.navy, C.amber],
    paid: ["Paid", "#fff", C.green],
    no_show: ["No-show", "#fff", C.red],
    issue: ["Issue reported", "#fff", C.red],
    cancelled: ["Cancelled", "#fff", C.red],
  }[gig.status];

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: C.mapleLine }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold leading-snug" style={{ color: C.navy }}>{gig.title}</div>
          {gig.posted_as && (
            <div className="mt-0.5 text-[11px] font-semibold" style={{ color: C.ink60 }}>
              Posted by {gig.posted_as}{gig.owner_display ? ` · ${gig.owner_display}` : ""}
            </div>
          )}
          {(gig.home_team || gig.away_team) && (
            <div className="mt-0.5 text-[11px] font-bold" style={{ color: C.navy }}>
              {gig.home_team || "Home"} <span style={{ color: C.ink40 }}>vs</span> {gig.away_team || "Away"}
            </div>
          )}
          {gig.venue && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: C.navy }}>
              <MapPin size={12} color={C.amber} /> {gig.venue}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: C.ink60 }}>
            <span className="inline-flex items-center gap-1"><Clock size={12} />{fmtDT(gig.start_at)}</span>
            <span className="inline-flex items-center gap-1"><Timer size={12} />{fmtDuration(gig.duration_min)}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />{gig.area ? gig.area.split(",").slice(0, 2).join(",") : gig.location}
            </span>
          </div>
          {gig.game_code && (ownedByMe || claimedByMe) && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: C.maple, color: C.navy }}>
              Game code: {gig.game_code}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="sg-display sg-num text-xl" style={{ color: C.navy }}>${Math.round(gig.pay_cents / 100)}</div>
          <div className="text-[10px] -mt-0.5" style={{ color: C.ink40 }}>CAD</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill><ClipboardCheck size={10} /> {svc}</Pill>
        <Pill>{GIG_TYPES[gig.type]?.label}{gig.games > 1 ? ` · ${gig.games} games` : ""}</Pill>
        {dist != null && <Pill><MapPin size={10} /> {fmtKm(dist)} away</Pill>}
        <Pill color={statusPill[1]} bg={statusPill[2]}>{statusPill[0]}</Pill>
        {gig.badge && <BadgeChip id={gig.badge} />}
      </div>

      <PayTimeline gig={gig} isOrganizer={ownedByMe} />

      {/* Scorekeeper actions */}
      {!ownedByMe && gig.status === "open" && (
        <button disabled={busy} onClick={() => fire("request")}
          className="mt-3 w-full rounded-lg py-2.5 font-bold text-white active:scale-[0.99] disabled:opacity-50"
          style={{ backgroundColor: C.navy }}>
          Request this gig — earn ${Math.round(gig.pay_cents / 100)}
        </button>
      )}
      {requestedByMe && gig.status === "pending" && (
        <div className="mt-3 rounded-lg p-2.5 text-center text-[12px] font-semibold"
          style={{ backgroundColor: C.maple, color: C.navy }}>
          ⏳ Request sent — waiting for the organizer to confirm. No card needed on your end.
        </div>
      )}
      {claimedByMe && gig.status === "claimed" && (
        <div className="mt-3">
          <button disabled={!canArrive || busy} onClick={() => fire("arrive")}
            className="w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: C.green }}>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={16} /> Confirm arrival</span>
          </button>
          <div className="mt-1 text-center text-[11px]" style={{ color: C.ink60 }}>
            {canArrive ? "You're inside the 20-minute window — confirm when you're on the clock."
              : `Unlocks at ${fmtT(gig.start_at - 20 * MIN)} (20 min before ${term})`}
          </div>
        </div>
      )}
      {claimedByMe && gig.status === "arrived" && (
        <div className="mt-3">
          <button disabled={!canComplete || busy} onClick={() => fire("complete")}
            className="w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: C.navy }}>
            Mark gig complete
          </button>
          {!canComplete && <div className="mt-1 text-center text-[11px]" style={{ color: C.ink60 }}>
            Available after {endTerm(gig.sport)} ({fmtT(gig.start_at + gig.duration_min * MIN)})
          </div>}
        </div>
      )}

      {/* Scorekeeper can back out before marking complete — things come up. */}
      {canCancelClaim && (
        confirmCancel ? (
          <div className="mt-2 rounded-lg border p-3" style={{ borderColor: C.red }}>
            <p className="text-[12px] font-semibold" style={{ color: C.navy }}>
              Cancel this gig? The organizer is refunded and notified, and it reopens for someone else.
              Cancellations show on your profile, so organizers can see your reliability — keep them rare.
            </p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => { setConfirmCancel(false); fire("cancel-claim"); }}
                className="flex-1 rounded-lg py-2 text-sm font-bold text-white" style={{ backgroundColor: C.red }}>
                Yes, cancel
              </button>
              <button onClick={() => setConfirmCancel(false)}
                className="flex-1 rounded-lg border py-2 text-sm font-bold" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmCancel(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.red }}>
            <Ban size={13} /> Can't make it? Cancel this gig
          </button>
        )
      )}

      {/* Organizer actions */}
      {ownedByMe && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canEdit && (
            <button onClick={() => onEdit(gig)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold"
              style={{ borderColor: C.navy, color: C.navy }}>
              <Pencil size={14} /> Edit gig
            </button>
          )}
          {gig.status === "open" && (
            <span className="text-[11px]" style={{ color: C.ink60 }}>
              Waiting for a scorekeeper to request · card on file, nothing charged yet
            </span>
          )}
          {hasPendingRequest && (
            <div className="w-full rounded-lg border p-3" style={{ borderColor: C.amber }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold" style={{ color: C.navy }}>
                  Request from a scorekeeper
                </div>
                <button onClick={() => onViewResume(gig.requested_by)}
                  className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: C.amber }}>
                  <Eye size={13} /> View resume
                </button>
              </div>
              <p className="mt-1 text-[11px]" style={{ color: C.ink60 }}>
                Review who they are, then approve to lock them in (your card is charged on approval) or decline to reopen the gig.
              </p>
              <div className="mt-2 flex gap-2">
                <button disabled={busy} onClick={() => fire("approve")}
                  className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: C.green }}>
                  {busy ? "Working\u2026" : "Approve"}
                </button>
                <button disabled={busy} onClick={() => fire("decline")}
                  className="flex-1 rounded-lg border py-2 text-sm font-bold disabled:opacity-50" style={{ borderColor: C.red, color: C.red }}>
                  Decline
                </button>
              </div>
            </div>
          )}
          {canNoShow && (
            <button disabled={busy} onClick={() => fire("no-show")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50"
              style={{ borderColor: C.red, color: C.red }}>
              <AlertTriangle size={14} /> Report no-show & refund
            </button>
          )}
          {gig.status === "claimed" && !canNoShow && (
            <span className="text-[11px]" style={{ color: C.ink60 }}>
              No-show reporting opens {fmtT(gig.start_at + 5 * MIN)} (5 min after start)
            </span>
          )}
          {canIssue && (
            <div className="space-y-2 w-full">
              <button disabled={busy || releaseRequested} onClick={() => fire("release-now")}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: releaseRequested ? C.navySoft : C.green }}>
                {releaseRequested ? "✓ Payment releasing…" : "✅ Approve & release payment now"}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => onReportIssue(gig)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold"
                  style={{ borderColor: C.red, color: C.red }}>
                  <AlertTriangle size={14} /> Report an issue
                </button>
                {!gig.badge && (
                  <button onClick={() => onBadge(gig.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold"
                    style={{ backgroundColor: C.amber, color: C.navy }}>
                    <Trophy size={14} /> Award badge
                  </button>
                )}
              </div>
              <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
                Payment auto-releases in 2 hours if you take no action.
              </p>
            </div>
          )}
          {canBadge && !canIssue && (
            <button onClick={() => onBadge(gig.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold"
              style={{ backgroundColor: C.amber, color: C.navy }}>
              <Trophy size={14} /> Award a badge
            </button>
          )}

          {/* Organizer can cancel the gig if the event falls through. */}
          {canOwnerCancel && (
            confirmOwnerCancel ? (
              <div className="w-full rounded-lg border p-3" style={{ borderColor: C.red }}>
                <p className="text-[12px] font-semibold" style={{ color: C.navy }}>
                  Cancel this gig?{" "}
                  {["claimed", "arrived"].includes(gig.status)
                    ? "Your scorekeeper will be notified right away and your card is refunded in full."
                    : "It will be removed from the available list."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={() => { setConfirmOwnerCancel(false); fire("cancel"); }}
                    className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: C.red }}>
                    Yes, cancel gig
                  </button>
                  <button onClick={() => setConfirmOwnerCancel(false)}
                    className="flex-1 rounded-lg border py-2 text-sm font-bold" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmOwnerCancel(true)}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.red }}>
                <Ban size={13} /> Cancel gig
              </button>
            )
          )}
        </div>
      )}

      {/* Tip panel — organizer can tip within 12h of game end, 100% to scorekeeper */}
      {ownedByMe && ["completed","paid"].includes(gig.status) && toast && (
        <TipPanel gig={gig} toast={toast} onTipped={() => onAction && null} />
      )}
    </div>
  );
}
