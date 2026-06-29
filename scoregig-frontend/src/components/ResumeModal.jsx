// ResumeModal.jsx — organizer views a scorekeeper's resume before approving.
// Shows bio, experience, home city, completed-gig count, and earned badges.
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { C, BADGES } from "../theme.js";
import { BadgeChip } from "./ui.jsx";
import { api } from "../api.js";

export default function ResumeModal({ scorekeeperId, onClose, toast }) {
  const [p, setP] = useState(null);

  useEffect(() => {
    api(`/scorekeepers/${scorekeeperId}/profile`)
      .then(setP)
      .catch((e) => { toast(e.message, true); onClose(); });
  }, [scorekeeperId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="sg-display text-lg" style={{ color: C.navy }}>SCOREKEEPER STATS</h3>
          <button onClick={onClose} aria-label="Close"><X size={20} color={C.navy} /></button>
        </div>

        {!p ? (
          <div className="py-8 text-center text-sm" style={{ color: C.ink60 }}>Loading…</div>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <div className="text-lg font-bold" style={{ color: C.navy }}>{p.name}</div>
              {p.city && <div className="text-xs" style={{ color: C.ink60 }}>{p.city}</div>}
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg p-3" style={{ backgroundColor: C.maple }}>
                <div className="sg-display sg-num text-xl" style={{ color: C.navy }}>{p.gigsCompleted}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Gigs completed</div>
              </div>
              <div className="rounded-lg p-3" style={{ backgroundColor: C.maple }}>
                <div className="sg-display sg-num text-xl" style={{ color: C.navy }}>
                  {p.badgeCounts.mvp + p.badgeCounts.team + p.badgeCounts.five}
                </div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: C.ink60 }}>Badges earned</div>
              </div>
            </div>

            {/* Reliability — so you can make an informed approval. */}
            {(() => {
              const r = p.reliability || { noShows: 0, issuesReported: 0, cancellations: 0 };
              const flags = r.noShows + r.issuesReported + r.cancellations;
              return (
                <div className="rounded-lg border p-3"
                  style={{ borderColor: flags ? C.red : C.mapleLine, backgroundColor: flags ? "#FFF6F6" : "#fff" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: flags ? C.red : C.ink40 }}>
                    Reliability
                  </div>
                  {flags === 0 ? (
                    <p className="mt-1 text-sm font-semibold" style={{ color: C.green }}>✓ Clean record — no no-shows, cancellations, or reported issues.</p>
                  ) : (
                    <>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.noShows > 0 && (
                          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: C.red }}>
                            {r.noShows} no-show{r.noShows > 1 ? "s" : ""}
                          </span>
                        )}
                        {r.cancellations > 0 && (
                          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>
                            {r.cancellations} cancellation{r.cancellations > 1 ? "s" : ""}
                          </span>
                        )}
                        {r.issuesReported > 0 && (
                          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>
                            {r.issuesReported} reported issue{r.issuesReported > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {r.cancellations > 0 && (
                        <p className="mt-1.5 text-[10px]" style={{ color: C.ink40 }}>Cancellations shown reflect the last 30 days.</p>
                      )}
                    </>
                  )}
                  {p.standing && p.standing.tier === "restricted" && (
                    <p className="mt-2 rounded px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: "#FFF0F0", color: C.red }}>
                      Instant booking is currently paused for this scorekeeper due to recent cancellations.
                    </p>
                  )}
                </div>
              );
            })()}

            {(() => {
              const showPrior = p.gamesWorked && p.gamesWorked !== "0" && (p.gigsCompleted || 0) < 3;
              return ((showPrior || (p.sports && p.sports.length > 0)) && (
                <div className="flex flex-wrap gap-1.5">
                  {showPrior && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>
                      {p.gamesWorked === "10" ? "10+" : p.gamesWorked} jobs before ScoreGIG
                    </span>
                  )}
                  {(p.sports || []).map((s) => (
                    <span key={s} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: C.maple, color: C.navy }}>{s}</span>
                  ))}
                </div>
              ));
            })()}

            {p.bio
              ? <p className="text-sm" style={{ color: C.navy }}>{p.bio}</p>
              : <p className="text-sm italic" style={{ color: C.ink40 }}>No intro added yet.</p>}

            {p.experience && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40 }}>Experience</div>
                <p className="whitespace-pre-line text-sm" style={{ color: C.navy }}>{p.experience}</p>
              </div>
            )}

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40 }}>Badges</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(p.badgeCounts).filter(([, n]) => n > 0).length === 0
                  ? <span className="text-sm italic" style={{ color: C.ink40 }}>None yet — everyone starts somewhere.</span>
                  : Object.entries(p.badgeCounts).filter(([, n]) => n > 0).map(([id, n]) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        <BadgeChip id={id} /> <span className="text-xs font-bold" style={{ color: C.ink60 }}>×{n}</span>
                      </span>
                    ))}
              </div>
            </div>

            {p.history?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40 }}>Recent gigs</div>
                <div className="space-y-1">
                  {p.history.slice(0, 8).map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs" style={{ color: C.navy }}>
                      <span className="truncate">{h.title}</span>
                      {h.badge && <BadgeChip id={h.badge} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
