// TipPanel.jsx — organizer tips the scorekeeper after a gig. 100% goes to
// the scorekeeper (no platform fee). Available for 12 hours after game end.
import { useState, useEffect } from "react";
import { C } from "../theme.js";
import { api } from "../api.js";

const PRESETS = [2, 4, 5, 7]; // dollars

export default function TipPanel({ gig, toast, onTipped }) {
  const [status, setStatus] = useState(null);
  const [amount, setAmount] = useState(2);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/gigs/${gig.id}/tip-status`).then(setStatus).catch(() => {});
  }, [gig.id]);

  if (!status) return null;
  if (status.tipped) return (
    <div className="mt-2 rounded-lg p-2.5 text-center text-xs font-semibold"
      style={{ backgroundColor: C.maple, color: C.navy }}>
      ✅ Tip sent — 100% went to your scorekeeper!
    </div>
  );
  if (!status.canTip) return null;

  const finalCents = useCustom
    ? Math.round((parseFloat(custom) || 0) * 100)
    : amount * 100;

  const send = async () => {
    if (finalCents < 100) return toast("Minimum tip is $1.", true);
    setBusy(true);
    try {
      await api(`/gigs/${gig.id}/tip`, { method: "POST", body: { amountCents: finalCents } });
      toast(`$${(finalCents / 100).toFixed(2)} tip sent — 100% to your scorekeeper! 🎉`);
      setStatus({ ...status, tipped: true });
      onTipped();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  return (
    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: C.amber }}>
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.navy }}>
        Leave a tip — 100% goes to your scorekeeper
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: C.ink60 }}>
        No platform fee on tips. Available for 12 hours after the game.
      </p>
      <div className="mt-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { setAmount(p); setUseCustom(false); }}
            className="flex-1 rounded-lg border py-2 text-sm font-bold"
            style={!useCustom && amount === p
              ? { backgroundColor: C.amber, color: C.navy, borderColor: C.amber }
              : { borderColor: C.mapleLine, color: C.navy }}>
            ${p}
          </button>
        ))}
        <button onClick={() => setUseCustom(true)}
          className="flex-1 rounded-lg border py-2 text-sm font-bold"
          style={useCustom
            ? { backgroundColor: C.amber, color: C.navy, borderColor: C.amber }
            : { borderColor: C.mapleLine, color: C.navy }}>
          Other
        </button>
      </div>
      {useCustom && (
        <input type="number" min={1} step={1} value={custom}
          onChange={(e) => setCustom(e.target.value)} placeholder="Amount in $"
          className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />
      )}
      <button disabled={busy || finalCents < 100} onClick={send}
        className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-40"
        style={{ backgroundColor: C.navy }}>
        {busy ? "Sending…" : `Send $${(finalCents / 100).toFixed(2)} tip`}
      </button>
    </div>
  );
}
