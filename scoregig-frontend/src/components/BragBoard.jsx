// BragBoard.jsx — public celebration feed. Posts are PRESET messages only:
// no free text, no gig details (keeps minors safe). Display names only.
// One high-five per user per brag, with undo. Share to socials.
import { useState, useEffect } from "react";
import { Hand, Instagram, Facebook, Share2 } from "lucide-react";
import { C, fmtDT } from "../theme.js";
import { api } from "../api.js";

export default function BragBoard({ brags, myDoneGigs, me, refresh, toast }) {
  const [composing, setComposing] = useState(false);
  const [presets, setPresets] = useState([]);
  const [chosen, setChosen] = useState("");

  // Has this user hosted a covered gig (so organizer presets apply)?
  const hasHosted = brags && me ? true : true; // server enforces; we show both groups

  useEffect(() => {
    if (composing && presets.length === 0) {
      api("/brag-presets").then(setPresets).catch(() => {});
    }
  }, [composing]);

  const post = async () => {
    try {
      await api("/brags", { method: "POST", body: { preset: chosen } });
      setChosen(""); setComposing(false);
      toast("Posted to the Brag Board! 🎉");
      refresh();
    } catch (e) { toast(e.message, true); }
  };

  const five = async (id) => {
    try { await api(`/brags/${id}/five`, { method: "POST" }); refresh(); }
    catch (e) { toast(e.message, true); }
  };

  const share = (b, network) => {
    const caption = `${b.emoji} ${b.text} · via ScoreGIG 🇨🇦 #ScoreGIG #Scorekeeper`;
    if (network === "copy") {
      navigator.clipboard?.writeText(caption).catch(() => {});
      toast("Caption copied — paste it into your post!");
      return;
    }
    const url = "https://scoregig.ca";
    const links = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(caption)}`,
      // Instagram & TikTok have no web share intent; copy caption instead.
    };
    if (links[network]) {
      window.open(links[network], "_blank", "noopener");
    } else {
      navigator.clipboard?.writeText(caption).catch(() => {});
      toast(`Caption copied — open ${network[0].toUpperCase()}${network.slice(1)} and paste it!`);
    }
  };

  // Presets available to this user: scorekeeper presets if they've completed a
  // gig, organizer presets if they've hosted one. Server enforces; we show all
  // and let the server reject if not eligible, with a friendly message.
  const canPost = me; // any logged-in user may attempt; server checks eligibility

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="sg-display text-xl" style={{ color: C.navy }}>BRAG BOARD</h2>
        {canPost && (
          <button onClick={() => setComposing(!composing)}
            className="rounded-lg px-3 py-1.5 text-sm font-bold" style={{ backgroundColor: C.amber, color: C.navy }}>
            {composing ? "Close" : "+ Post a brag"}
          </button>
        )}
      </div>

      <p className="text-[12px]" style={{ color: C.ink60 }}>
        Celebrate the win — no personal details, just good vibes. Visible to everyone.
      </p>

      {composing && (
        <div className="space-y-2 rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.ink60 }}>Pick a celebration</div>
          <div className="space-y-1.5">
            {presets.map((p) => (
              <button key={p.key} onClick={() => setChosen(p.key)}
                className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm"
                style={chosen === p.key
                  ? { borderColor: C.amber, backgroundColor: C.maple, color: C.navy }
                  : { borderColor: C.mapleLine, color: C.navy }}>
                <span className="text-lg">{p.emoji}</span>
                <span className="font-semibold">{p.text}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: C.ink40 }}>{p.who}</span>
              </button>
            ))}
          </div>
          <button disabled={!chosen} onClick={post}
            className="w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-40" style={{ backgroundColor: C.navy }}>
            Post to the board
          </button>
        </div>
      )}

      {brags.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: C.mapleLine, color: C.ink60 }}>
          No brags yet — be the first to celebrate!
        </div>
      )}

      {brags.map((b) => (
        <div key={b.id} className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ color: C.navy }}>{b.who}</span>
            <span className="text-[11px]" style={{ color: C.ink40 }}>{fmtDT(b.t)}</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.navy }}>
            <span className="mr-1">{b.emoji}</span>{b.text}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => five(b.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold"
              style={b.fived
                ? { borderColor: C.amber, backgroundColor: C.maple, color: C.navy }
                : { borderColor: C.mapleLine, color: C.navy }}>
              <Hand size={14} /> {b.fived ? "High-fived" : "High five"} · {b.fives}
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => share(b, "facebook")} aria-label="Share to Facebook"
                className="rounded-lg p-1.5" style={{ color: C.ink60 }}><Facebook size={16} /></button>
              <button onClick={() => share(b, "instagram")} aria-label="Share to Instagram"
                className="rounded-lg p-1.5" style={{ color: C.ink60 }}><Instagram size={16} /></button>
              <button onClick={() => share(b, "copy")} aria-label="Copy caption"
                className="rounded-lg p-1.5" style={{ color: C.ink60 }}><Share2 size={16} /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
