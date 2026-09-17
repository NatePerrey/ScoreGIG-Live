// ui.jsx — small shared pieces: pills, badge chips, the Payment Clock.
import { C, BADGES, cadCents, fmtDT } from "../theme.js";

export function Pill({ children, color = C.navy, bg = C.maple }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color, backgroundColor: bg }}>{children}</span>
  );
}

export function BadgeChip({ id, size = "sm" }) {
  const b = BADGES[id]; if (!b) return null;
  const Icon = b.icon;
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold ${pad}`}
      style={{ backgroundColor: b.color, color: "#fff" }}>
      <Icon size={size === "lg" ? 16 : 12} strokeWidth={2.5} /> {b.label}
    </span>
  );
}

/* Signature element: the scoreboard timeline.
   For organizers: PAYMENT CLOCK (shows card/charge info).
   For scorekeepers: GIG CLOCK (no card language — they never pay). */
export function PayTimeline({ gig, isOrganizer = true }) {
  // Scorekeepers skip the CARD step — it's not their payment
  const organizerSteps = [
    { key: "auth",     label: "CARD" },
    { key: "request",  label: "REQ" },
    { key: "capture",  label: "OK'D" },
    { key: "arrive",   label: "CLOCK" },
    { key: "complete", label: "DONE" },
    { key: "paid",     label: "PAID" },
  ];
  const scorekeeperSteps = [
    { key: "request",  label: "REQ'D" },
    { key: "capture",  label: "OK'D" },
    { key: "arrive",   label: "CLOCK" },
    { key: "complete", label: "DONE" },
    { key: "paid",     label: "EARNED" },
  ];
  const steps = isOrganizer ? organizerSteps : scorekeeperSteps;
  const clockLabel = isOrganizer ? "PAYMENT CLOCK" : "GIG CLOCK";

  const done = new Set(gig.events?.map((e) => e.kind));
  const dead = gig.status === "no_show" || gig.status === "issue" || gig.status === "cancelled";

  // Status descriptions — organizer sees card/charge info, scorekeeper sees gig flow
  const organizerDesc = {
    open:      "Card on file · charged only when you approve someone",
    pending:   "Someone requested this · approve to charge & lock them in",
    claimed:   "Your card was charged · held in escrow until the gig is done",
    arrived:   "Held in escrow · releases automatically after completion",
    completed: `Releases automatically ${fmtDT(gig.release_at)} unless an issue is reported`,
    paid:      `Released ${cadCents(gig.pay_cents)} to them · powered by Stripe (Canada)`,
    no_show:   "No-show reported · payment refunded to you",
    issue:     "Issue reported · payout paused for review",
    cancelled: "Gig cancelled · any charge was refunded to you",
  };
  const scorekeeperDesc = {
    open:      "Gig is open — request it to get started",
    pending:   "Your request is in — waiting for the organizer to confirm",
    claimed:   "You're locked in! Show up and confirm arrival 20 min before start",
    arrived:   "You're on the clock — earnings release after the gig",
    completed: "Game done! Earnings release automatically within 2 hours",
    paid:      `${cadCents(gig.pay_cents)} sent to your Stripe account 🎉 (test mode shows the transfer in your Stripe dashboard)`,
    no_show:   "No-show was reported for this gig",
    issue:     "Issue reported · under review",
    cancelled: "The organizer cancelled this gig — you don't need to attend",
  };
  const desc = isOrganizer ? organizerDesc : scorekeeperDesc;

  return (
    <div className="mt-3 rounded-lg p-2.5" style={{ backgroundColor: C.navy }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="sg-display text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>{clockLabel}</span>
        <span className="sg-display sg-num text-sm" style={{ color: dead ? C.red : C.amber }}>
          {dead ? (gig.status === "no_show" ? "REFUNDED" : gig.status === "cancelled" ? "CANCELLED" : "ON HOLD") : cadCents(gig.pay_cents)}
        </span>
      </div>
      <div className="flex gap-1">
        {steps.map((s) => {
          const hit = done.has(s.key);
          return (
            <div key={s.key} className="flex-1">
              <div className="h-2 rounded-sm" style={{
                backgroundColor: hit && !dead ? C.amber : dead && hit ? C.red : "rgba(255,255,255,0.14)",
                boxShadow: hit && !dead ? `0 0 6px ${C.amber}` : "none",
              }} />
              <div className="sg-display mt-1 text-center text-[9px]"
                style={{ color: hit ? "#fff" : "rgba(255,255,255,0.35)" }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {desc[gig.status] || ""}
      </div>
    </div>
  );
}

export function Toast({ msg, error, onClose }) {
  if (!msg) return null;
  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-start gap-2 rounded-xl p-3 text-sm font-semibold text-white shadow-lg"
      style={{ backgroundColor: error ? C.red : C.navy }}
      role="status">
      <span className="flex-1">{msg}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss"
          className="-mr-1 -mt-0.5 shrink-0 rounded-full px-1.5 text-base leading-none opacity-80 hover:opacity-100"
          style={{ color: "#fff" }}>×</button>
      )}
    </div>
  );
}
