// ContactModal.jsx — "Contact us / report a problem" form.
import { useState } from "react";
import { X } from "lucide-react";
import { C } from "../theme.js";
import { api } from "../api.js";

export default function ContactModal({ onClose, toast }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [gigId, setGigId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSubmit = name.trim() && emailRe.test(email.trim()) && message.trim() && !busy;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api("/contact", {
        method: "POST",
        body: {
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          gigId: gigId.trim() ? Number(gigId.trim()) : null,
        },
      });
      toast("Thanks! We've got your message and will reply soon.");
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const input = "w-full rounded-lg border px-3 py-2.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="sg-display text-lg" style={{ color: C.navy }}>CONTACT US</h3>
          <button onClick={onClose} aria-label="Close"><X size={20} color={C.navy} /></button>
        </div>
        <p className="mt-1 text-sm" style={{ color: C.ink60 }}>Hit a snag? Let us know and we'll help.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Your name</label>
            <input className={input} style={{ borderColor: C.mapleLine }} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Your email</label>
            <input className={input} style={{ borderColor: C.mapleLine }} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoCapitalize="none" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Message</label>
            <textarea className={`${input} resize-none`} style={{ borderColor: C.mapleLine }} value={message}
              onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's going on…" rows={4} maxLength={4000} />
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>{message.length} / 4000</p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Gig number <span style={{ color: C.ink40 }}>(if about a specific gig)</span></label>
            <input className={input} style={{ borderColor: C.mapleLine }} type="number" value={gigId}
              onChange={(e) => setGigId(e.target.value)} placeholder="e.g. 1247" />
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>You'll see the gig number at the top of each gig card.</p>
          </div>

          {err && (<div className="rounded-lg p-2 text-xs font-semibold text-white" style={{ backgroundColor: C.red }}>{err}</div>)}

          <button disabled={!canSubmit} onClick={submit}
            className="w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: C.navy }}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </div>
    </div>
  );
}
