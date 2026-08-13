// PostGig.jsx — create or edit a gig. For single games, one form. For multi/
// tournament, a separate game entry per game (each with its own time, location,
// pay, and optional home/away teams). Each game becomes its own gig record.
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, GIG_TYPES, SPORTS, SERVICES } from "../theme.js";
import { api } from "../api.js";
import CitySearch from "./CitySearch.jsx";

const POSTED_AS = ["Parent", "Team Manager", "Coach", "Tournament Coordinator", "Association Admin"];
const SERVICE_LIST = Object.values(SERVICES);

const blankGame = () => ({
  venue: "", gameCode: "", location: "", place: null, date: "", time: "",
  durationMin: 60, pay: 30, homeTeam: "", awayTeam: "",
});

function GameForm({ game, idx, onChange, onRemove, canRemove, lbl, input, toast, minCents }) {
  const set = (k, v) => onChange(idx, k, v);
  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: C.mapleLine }}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.navy }}>
          Game {idx + 1}
        </div>
        {canRemove && (
          <button onClick={() => onRemove(idx)} className="text-xs font-bold" style={{ color: C.red }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Home team</label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={game.homeTeam}
            onChange={(e) => set("homeTeam", e.target.value)} placeholder="e.g. Chilliwack Chiefs" />
        </div>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Away team</label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={game.awayTeam}
            onChange={(e) => set("awayTeam", e.target.value)} placeholder="e.g. Abbotsford Hawks" />
        </div>
      </div>
      <div>
        <label className={lbl} style={{ color: C.ink60 }}>Venue / facility</label>
        <input className={input} style={{ borderColor: game.venue ? C.green : C.mapleLine }} value={game.venue}
          onChange={(e) => set("venue", e.target.value)} placeholder="e.g. Chilliwack Coliseum — Rink 2" />
        <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
          The exact rink, court, gym, or complex. This shows on the gig{game.venue ? " ✓" : ""}.
        </p>
      </div>
      <div>
        <label className={lbl} style={{ color: C.ink60 }}>Game code <span style={{ color: C.ink40 }}>(optional)</span></label>
        <input className={input} style={{ borderColor: C.mapleLine }} value={game.gameCode}
          onChange={(e) => set("gameCode", e.target.value)} placeholder="Game code" />
        <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
          For digital scoresheets. Shared with the scorekeeper once they're confirmed.
        </p>
      </div>
      <div>
      <div>
        <label className={lbl} style={{ color: C.ink60 }}>City / area <span style={{ color: C.ink40 }}>(for map & distance)</span></label>
        <CitySearch value={game.place} onSelect={(p) => { set("location", p.name); set("place", p); }} toast={toast} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Date</label>
          <input type="date" className={input} style={{ borderColor: C.mapleLine }} value={game.date}
            onChange={(e) => set("date", e.target.value)} />
        </div>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Start time</label>
          <input type="time" className={input} style={{ borderColor: C.mapleLine }} value={game.time}
            onChange={(e) => set("time", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Duration (min)</label>
          <select className={input} style={{ borderColor: C.mapleLine }} value={game.durationMin}
            onChange={(e) => set("durationMin", Number(e.target.value))}>
            {[30,45,60,75,90,120,150,180].map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m} min` : m === 60 ? "1 hr" : `${Math.floor(m/60)}h ${m%60 > 0 ? `${m%60}m` : ""}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Pay (CAD)</label>
          <input type="number" min={Math.ceil((minCents || 2200) / 100)} step={1} className={input}
            style={{ borderColor: Math.round((Number(game.pay) || 0) * 100) < (minCents || 0) ? C.red : C.mapleLine }}
            value={game.pay} onChange={(e) => set("pay", Number(e.target.value))} />
          {minCents > 0 && (
            <p className="mt-1 text-[10px]" style={{ color: Math.round((Number(game.pay) || 0) * 100) < minCents ? C.red : C.ink40 }}>
              Minimum for this length &amp; province: ${(minCents / 100).toFixed(2)} (at least minimum wage)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostGig({ initial, onSubmit, onCancel, toast }) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title?.replace(/ \u2014 Game \d+$/, "") || "");
  const [sport, setSport] = useState(initial?.sport || "Basketball");
  const [otherSport, setOtherSport] = useState("");
  const [type, setType] = useState(initial?.type || "single");
  const [postedAs, setPostedAs] = useState(initial?.posted_as || "");
  const [games, setGames] = useState(() => {
    if (initial) {
      const d = new Date(initial.start_at);
      const pad = (n) => String(n).padStart(2, "0");
      return [{
        venue: initial.venue || "", gameCode: initial.game_code || "",
        location: initial.location, place: initial.area ? { name: initial.area, lat: initial.lat, lng: initial.lng } : null,
        date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        durationMin: initial.duration_min, pay: initial.pay_cents / 100,
        homeTeam: initial.home_team || "", awayTeam: initial.away_team || "",

      }];
    }
    return [blankGame()];
  });
  // Which roles to hire for (new posts only — a gig's role is fixed once created).
  const [services, setServices] = useState(initial?.service ? [initial.service] : ["scorekeeper"]);
  const toggleService = (k) => setServices((p) =>
    p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : [...p, k]);

  const gameCount = { single: 1, multi: 3, tournament: 4 }[type] || 1;

  // When type changes, adjust the games array to match the expected count
  const changeType = (t) => {
    setType(t);
    const count = { single: 1, multi: 3, tournament: 4 }[t] || 1;
    setGames((prev) => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(null).map(blankGame)];
      return prev.slice(0, count);
    });
  };

  const updateGame = (idx, key, val) => {
    setGames((prev) => prev.map((g, i) => i === idx ? { ...g, [key]: val } : g));
  };
  const removeGame = (idx) => setGames((prev) => prev.filter((_, i) => i !== idx));
  const addGame = () => setGames((prev) => [...prev, blankGame()]);

  const lbl = "mb-1 block text-[10px] font-bold uppercase tracking-wide";
  const input = "w-full rounded-lg border px-3 py-2.5 text-sm bg-white";

  // Pay floor data from the backend (single source of truth). Until it loads we
  // fall back to the flat $22 floor so the form still works.
  const [wage, setWage] = useState({ minGigCents: 2000, hourlyRateCents: 2000 });
  useEffect(() => {
    api("/min-wage").then(setWage).catch(() => {});
  }, []);
  const minCentsFor = (g) => {
    const mins = Number(g.durationMin) || 60;
    if (mins <= 60) return (wage.minGigCents || 2000);
    const over = mins - 60;
    return (wage.minGigCents || 2000) + Math.ceil(((wage.hourlyRateCents || 2000) * over) / 60);
  };

  const allValid = title && postedAs && games.every((g) => {
    const startMs = g.date && g.time ? new Date(`${g.date}T${g.time}`).getTime() : null;
    return g.location && g.place && startMs && startMs > Date.now()
      && Math.round((Number(g.pay) || 0) * 100) >= minCentsFor(g);
  });

  const submit = () => {
    const finalSport = sport === "Other" && otherSport.trim() ? `Other: ${otherSport.trim()}` : sport;
    const gamesPayload = games.map((g) => ({
      venue: g.venue || null, gameCode: g.gameCode || null,
      location: g.location, area: g.place.name, lat: g.place.lat, lng: g.place.lng,
      startAt: new Date(`${g.date}T${g.time}`).getTime(),
      durationMin: Number(g.durationMin) || 60,
      payCents: Math.round(g.pay * 100),
      homeTeam: g.homeTeam || null, awayTeam: g.awayTeam || null,

    }));
    onSubmit({ title, sport: finalSport, type, postedAs, services, games: gamesPayload }, editing ? initial.id : null);
  };

  const totalGigs = games.length * (editing ? 1 : services.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="sg-display text-xl" style={{ color: C.navy }}>{editing ? "EDIT GIG" : "POST A GIG"}</h2>
        <button onClick={onCancel} className="text-sm font-bold" style={{ color: C.ink60 }}>Cancel</button>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: C.mapleLine }}>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Gig title</label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={title}
            onChange={(e) => setTitle(e.target.value)} placeholder="U12 Rep Basketball — Saturday league" />
        </div>

        <div>
          <label className={lbl} style={{ color: C.ink60 }}>I'm posting as</label>
          <div className="grid grid-cols-2 gap-2">
            {POSTED_AS.map((role) => (
              <button key={role} type="button" onClick={() => setPostedAs(role)}
                className="rounded-lg border py-2 text-xs font-bold"
                style={postedAs === role
                  ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                  : { borderColor: C.mapleLine, color: C.navy, backgroundColor: "#fff" }}>
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Sport</label>
            <select className={input} style={{ borderColor: C.mapleLine }} value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

        {sport === "Other" && (
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>What sport? <span style={{ color: C.ink40 }}>(let us know)</span></label>
            <input className={input} style={{ borderColor: C.mapleLine }} value={otherSport}
              onChange={(e) => setOtherSport(e.target.value)} placeholder="e.g. Ringette, Lacrosse, Curling…" maxLength={50} />
          </div>
        )}
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Type</label>
            <select className={input} style={{ borderColor: C.mapleLine }} value={type} onChange={(e) => changeType(e.target.value)}>
              {Object.entries(GIG_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        {!editing && (
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Who do you need? <span style={{ color: C.ink40 }}>(pick one or more)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_LIST.map((s) => (
                <button key={s.key} type="button" onClick={() => toggleService(s.key)}
                  className="rounded-lg border px-2 py-2 text-center"
                  style={services.includes(s.key)
                    ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                    : { borderColor: C.mapleLine, color: C.navy, backgroundColor: "#fff" }}>
                  <span className="block text-xs font-bold">{s.label}</span>
                  <span className="block text-[9px] leading-tight" style={{ color: services.includes(s.key) ? "rgba(255,255,255,0.7)" : C.ink40 }}>{s.desc}</span>
                </button>
              ))}
            </div>
            {services.length > 1 && (
              <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
                Each role becomes its own gig, and one person can't cover two roles in the same event (unless they've added documented experience).
              </p>
            )}
          </div>
        )}
      </div>

      {/* One game form per game */}
      <div className="space-y-3">
        {games.map((game, idx) => (
          <GameForm key={idx} game={game} idx={idx} onChange={updateGame}
            onRemove={removeGame} canRemove={games.length > 1}
            lbl={lbl} input={input} toast={toast} minCents={minCentsFor(game)} />
        ))}
        {type !== "single" && (
          <button onClick={addGame}
            className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold"
            style={{ borderColor: C.amber, color: C.amber }}>
            <Plus size={16} /> Add another game
          </button>
        )}
      </div>

      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: C.amber, backgroundColor: "#FFF8E8", color: C.navy }}>
        <span style={{ fontWeight: 700 }}>Recommended:</span> have someone from your team at the rink during the game. If anything comes up — a question on the clock, a scoring dispute — being on-site lets you help the scorekeeper sort it out right away.
      </div>

      <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: C.maple, color: C.navy }}>
        {totalGigs > 1
          ? `This will create ${totalGigs} separate gigs${!editing && services.length > 1 ? ` (${games.length} game${games.length > 1 ? "s" : ""} × ${services.length} roles)` : ""} — each can be claimed individually.`
          : "Your card is on file. It's only charged when you approve someone."}
      </div>

      {!allValid && <p className="text-center text-[11px]" style={{ color: C.ink60 }}>Fill in all game details, pick who you're posting as, and make sure each game's pay meets the minimum shown (at least minimum wage for the time).</p>}

      <button disabled={!allValid} onClick={submit}
        className="w-full rounded-lg py-3 font-bold text-white disabled:opacity-40"
        style={{ backgroundColor: C.navy }}>
        {editing ? "Save changes" : totalGigs > 1 ? `Post ${totalGigs} gigs` : "Post gig"}
      </button>
    </div>
  );
}
