// IssueModal.jsx — organizer reports an issue on a completed gig. Captures a
// reason category + optional details; payout stays paused until an admin
// reviews and resolves it.
import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { C } from "../theme.js";
import { api } from "../api.js";

const REASONS = [
  ["left_early", "Scorekeeper left early"],
  ["no_show_late", "Showed up very late"],
  ["quality", "Quality of scorekeeping"],
  ["behaviour", "Behaviour / conduct"],
  ["other", "Other"],
];

export default function IssueModal({ gig, onClose, onDone, toast }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/gigs/${gig.id}/issue`, { method: "POST", body: { reason, details } });
      toast("Issue reported — payout is paused while ScoreGIG reviews. We'll be in touch.");
      onDone();
      onClose();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="sg-display text-lg flex items-center gap-2" style={{ color: C.red }}>
            <AlertTriangle size={18} /> REPORT AN ISSUE
          </h3>
          <button onClick={onClose} aria-label="Close"><X size={20} color={C.navy} /></button>
        </div>
        <p className="mt-1 text-sm" style={{ color: C.ink60 }}>
          This pauses the payout for "{gig.title}" until ScoreGIG reviews it. Most issues are sorted quickly.
        </p>

        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>What happened?</div>
          {REASONS.map(([key, label]) => (
            <button key={key} onClick={() => setReason(key)}
              className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm font-semibold"
              style={reason === key
                ? { borderColor: C.red, backgroundColor: "#FDECEC", color: C.navy }
                : { borderColor: C.mapleLine, color: C.navy }}>
              {label}
            </button>
          ))}
        </div>

        <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)}
          placeholder="Add any details that help us understand what happened (optional)."
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />

        <div className="mt-3 flex gap-2">
          <button disabled={!reason || busy} onClick={submit}
            className="flex-1 rounded-lg py-2.5 font-bold text-white disabled:opacity-40" style={{ backgroundColor: C.red }}>
            {busy ? "Reporting…" : "Submit report"}
          </button>
          <button onClick={onClose} className="rounded-lg border px-4 text-sm font-bold" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
