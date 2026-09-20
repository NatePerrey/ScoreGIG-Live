// PostGig.jsx — create or edit a gig. For single games, one form. For multi/
// tournament, a shared header (venue, city, duration, pay — set once, applied
// to every game) plus a stripped-down row per game (teams, date/time, optional
// game code). Editing always edits one existing game via the full form below,
// since a gig record is always a single game regardless of how it was posted.
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, GIG_TYPES, SPORTS, SERVICES } from "../theme.js";
import { api } from "../api.js";
import CitySearch from "./CitySearch.jsx";

const POSTED_AS = ["Parent", "Team Manager", "Coach", "Tournament Coordinator", "Association Admin"];
const SERVICE_LIST = Object.values(SERVICES);
// Canadian provinces/territories — drives the minimum-wage floor the backend enforces.
const PROVINCES = [
  { code: "BC", name: "British Columbia" }, { code: "AB", name: "Alberta" },
  { code: "SK", name: "Saskatchewan" }, { code: "MB", name: "Manitoba" },
  { code: "ON", name: "Ontario" }, { code: "QC", name: "Quebec" },
  { code: "NB", name: "New Brunswick" }, { code: "NS", name: "Nova Scotia" },
  { code: "PE", name: "Prince Edward Island" }, { code: "NL", name: "Newfoundland and Labrador" },
  { code: "YT", name: "Yukon" }, { code: "NT", name: "Northwest Territories" }, { code: "NU", name: "Nunavut" },
];

const blankGame = () => ({
  venue: "", rink: "", gameCode: "", location: "", place: null, date: "", time: "",
  durationMin: 60, pay: 30, homeTeam: "", awayTeam: "", division: "",
});

// Combine a venue/facility name with an optional rink/court number into one
// display string, e.g. "Chilliwack Coliseum" + "Rink 2" -> "Chilliwack Coliseum — Rink 2".
const combineVenue = (venue, rink) => {
  const v = (venue || "").trim();
  const r = (rink || "").trim();
  if (v && r) return `${v} — ${r}`;
  return v || r || null;
};

// Full per-game form — single-gig mode and editing only (always exactly one game).
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
        <label className={lbl} style={{ color: C.ink60 }}>Division <span style={{ color: C.ink40 }}>(optional)</span></label>
        <input className={input} style={{ borderColor: C.mapleLine }} value={game.division}
          onChange={(e) => set("division", e.target.value)} placeholder="e.g. U13 AAA Division" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Venue / facility</label>
          <input className={input} style={{ borderColor: game.venue ? C.green : C.mapleLine }} value={game.venue}
            onChange={(e) => set("venue", e.target.value)} placeholder="e.g. Chilliwack Coliseum" />
          <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
            The complex. This shows on the gig{game.venue ? " ✓" : ""}.
          </p>
        </div>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Rink / court <span style={{ color: C.ink40 }}>(optional)</span></label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={game.rink}
            onChange={(e) => set("rink", e.target.value)} placeholder="e.g. Rink 2" />
          <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
            For arenas with more than one sheet/court.
          </p>
        </div>
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

// Stripped-down row for tournament/multi mode. Venue, city, duration, and pay
// live once in the shared header above — a row only needs what's unique per
// game: the teams, the date/time, and (if the header toggle is on) a per-game
// code. Brackets often aren't set when a tournament first goes up, so blank
// team/code fields get a "before game day" hint instead of looking incomplete.
function GameRow({ game, idx, onChange, onRemove, canRemove, lbl, input, showGameCode }) {
  const set = (k, v) => onChange(idx, k, v);
  const teamsBlank = !game.homeTeam && !game.awayTeam;
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
      {teamsBlank && (
        <p className="text-[10px]" style={{ color: C.ink40 }}>
          Don't know the teams yet? You can add them anytime before game day.
        </p>
      )}
      <div>
        <label className={lbl} style={{ color: C.ink60 }}>Rink / court <span style={{ color: C.ink40 }}>(optional)</span></label>
        <input className={input} style={{ borderColor: C.mapleLine }} value={game.rink}
          onChange={(e) => set("rink", e.target.value)} placeholder="e.g. Rink 2" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Date</label>
          <input type="date" disabled className={input} value={game.date}
            style={{ borderColor: C.mapleLine, backgroundColor: C.maple, color: C.ink60, cursor: "not-allowed" }} />
          <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>Set once above, applies to every game.</p>
        </div>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Start time</label>
          <input type="time" className={input} style={{ borderColor: C.mapleLine }} value={game.time}
            onChange={(e) => set("time", e.target.value)} />
        </div>
      </div>
      {showGameCode && (
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Game code <span style={{ color: C.ink40 }}>(optional)</span></label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={game.gameCode}
            onChange={(e) => set("gameCode", e.target.value)} placeholder="Game code" />
          {!game.gameCode && (
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
              Don't have it yet? Add it anytime before game day — it's shared with the scorekeeper once they're confirmed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PostGig({ initial, onSubmit, onCancel, toast }) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title?.replace(/ \u2014 Game \d+$/, "") || "");
  const [sport, setSport] = useState(initial?.sport || "Hockey");
  const [otherSport, setOtherSport] = useState("");
  const [province, setProvince] = useState(initial?.province || "");
  const [type, setType] = useState(initial?.type || "single");
  const [postedAs, setPostedAs] = useState(initial?.posted_as || "");
  const [games, setGames] = useState(() => {
    if (initial) {
      const d = new Date(initial.start_at);
      const pad = (n) => String(n).padStart(2, "0");
      return [{
        venue: initial.venue || "", rink: "", gameCode: initial.game_code || "",
        location: initial.location, place: initial.area ? { name: initial.area, lat: initial.lat, lng: initial.lng } : null,
        date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        durationMin: initial.duration_min, pay: initial.pay_cents / 100,
        homeTeam: initial.home_team || "", awayTeam: initial.away_team || "",
        division: initial.division || "",

      }];
    }
    return [blankGame()];
  });
  // Which roles to hire for (new posts only — a gig's role is fixed once created).
  const [services, setServices] = useState(initial?.service ? [initial.service] : ["scorekeeper"]);
  const [notes, setNotes] = useState(initial?.notes || "");
  // Posting flow: choose Single vs Tournament, then (single) pick role(s).
  const [mode, setMode] = useState(editing ? (initial?.type === "single" ? "single" : "tournament") : "choose");
  const [singleRole, setSingleRole] = useState(editing && initial?.type === "single" ? (initial.service || "scorekeeper") : null);
  const [bothRoles, setBothRoles] = useState(false);
  const [paySheet, setPaySheet] = useState(30); // scoresheet pay ($) when both roles picked

  // Tournament header (piece 2): venue, city, duration, and pay set ONCE and
  // applied to every game row below. Only used for new multi-game postings —
  // editing always edits one existing game via the full GameForm above.
  const [tourVenue, setTourVenue] = useState("");
  const [tourPlace, setTourPlace] = useState(null);
  const [tourDate, setTourDate] = useState("");
  const [tourDivision, setTourDivision] = useState("");
  const [tourDuration, setTourDuration] = useState(60);
  const [tourPay, setTourPay] = useState(30);
  // Whether this tournament uses per-game digital scoresheet codes at all (piece 3).
  // Defaults on since that's the prior behaviour; associations that don't use one
  // (e.g. no RAMP Gamesheet) can turn it off to drop the field from every row.
  const [tourUsesGameCode, setTourUsesGameCode] = useState(true);
  const isHeaderMode = mode !== "single" && !editing;

  const toggleService = (k) => setServices((p) =>
    p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : [...p, k]);

  const gameCount = { single: 1, multi: 3, tournament: 4 }[type] || 1;

  // When type changes, adjust the games array to match the expected count.
  // In header mode (multi/tournament), new rows inherit the shared tourDate
  // and tourDivision so they stay in sync with "Applies to every game below"
  // immediately — one day + division posts fast without retyping either.
  const changeType = (t) => {
    setType(t);
    const count = { single: 1, multi: 3, tournament: 4 }[t] || 1;
    const headerModeNow = t !== "single" && !editing;
    setGames((prev) => {
      if (count > prev.length) {
        const extra = Array(count - prev.length).fill(null).map(() =>
          headerModeNow
            ? { ...blankGame(), date: tourDate || "", division: tourDivision || "" }
            : blankGame());
        return [...prev, ...extra];
      }
      return prev.slice(0, count);
    });
  };

  // Syncs the shared tournament date down onto every game row — GameRow's
  // date input is locked/disabled, so this header field is the only place
  // it can be changed once games exist.
  const changeTourDate = (val) => {
    setTourDate(val);
    setGames((prev) => prev.map((g) => ({ ...g, date: val })));
  };

  // Bulk-fills the shared division onto every game row (one tap for "all AAA
  // games today"), but unlike date it stays editable per row afterward, since
  // a tournament day can mix divisions.
  const changeTourDivision = (val) => {
    setTourDivision(val);
    setGames((prev) => prev.map((g) => ({ ...g, division: val })));
  };

  const updateGame = (idx, key, val) => {
    setGames((prev) => prev.map((g, i) => i === idx ? { ...g, [key]: val } : g));
  };
  const removeGame = (idx) => setGames((prev) => prev.filter((_, i) => i !== idx));
  const addGame = () => setGames((prev) => [
    ...prev,
    isHeaderMode
      ? { ...blankGame(), date: tourDate || "", division: tourDivision || "" }
      : blankGame(),
  ]);

  const lbl = "mb-1 block text-[10px] font-bold uppercase tracking-wide";
  const input = "w-full rounded-lg border px-3 py-2.5 text-sm bg-white";

  // Pay floor data from the backend (single source of truth). Until it loads we
  // fall back to the flat $22 floor so the form still works.
  const [wage, setWage] = useState({ flatMinCents: 2000, rates: {}, provinces: [] });
  useEffect(() => {
    api("/min-wage").then(setWage).catch(() => {});
  }, []);
  // Mirror the backend's minPayCents(province, durationMin): max(flat floor,
  // minimum wage prorated to the game length). Falls back to the flat floor
  // until a province is picked or the rates load.
  const minCentsFor = (durationMin) => {
    const mins = Number(durationMin) || 60;
    const flat = wage.flatMinCents || 2000;
    const rate = (wage.rates && wage.rates[province]) || 0;
    if (!rate) return flat;
    return Math.max(flat, Math.ceil((rate * mins) / 60));
  };

  // Effective roles: single mode derives from the toggle/checkbox; tournament
  // mode uses the existing multi-select.
  const effServices = mode === "single"
    ? (bothRoles ? ["scorekeeper", "scoresheet"] : (singleRole ? [singleRole] : []))
    : services;

  const roleValid = mode === "single" ? (bothRoles || !!singleRole) : services.length > 0;
  const sheetMin = minCentsFor(games[0]?.durationMin || 60);
  const sheetPayValid = !(mode === "single" && bothRoles) || Math.round((Number(paySheet) || 0) * 100) >= sheetMin;

  // Header-mode pay floor, mirrors the per-game one above but off the shared duration.
  const headerMinCents = minCentsFor(tourDuration);
  const headerPayValid = Math.round((Number(tourPay) || 0) * 100) >= headerMinCents;

  const allValid = title && postedAs && province && roleValid && sheetPayValid && (
    isHeaderMode
      ? !!tourPlace && headerPayValid && games.every((g) => {
          const startMs = g.date && g.time ? new Date(`${g.date}T${g.time}`).getTime() : null;
          return startMs && startMs > Date.now();
        })
      : games.every((g) => {
          const startMs = g.date && g.time ? new Date(`${g.date}T${g.time}`).getTime() : null;
          return g.location && g.place && startMs && startMs > Date.now()
            && Math.round((Number(g.pay) || 0) * 100) >= minCentsFor(g.durationMin);
        })
  );

  const submit = () => {
    const finalSport = sport === "Other" && otherSport.trim() ? `Other: ${otherSport.trim()}` : sport;
    const gamesPayload = games.map((g) => {
      if (isHeaderMode) {
        return {
          venue: combineVenue(tourVenue.trim(), g.rink) || null, gameCode: (tourUsesGameCode && g.gameCode) || null,
          location: tourPlace.name, area: tourPlace.name, lat: tourPlace.lat, lng: tourPlace.lng,
          startAt: new Date(`${g.date}T${g.time}`).getTime(),
          durationMin: Number(tourDuration) || 60,
          payCents: Math.round(tourPay * 100),
          province,
          homeTeam: g.homeTeam || null, awayTeam: g.awayTeam || null,
          division: (g.division || "").trim() || null,
        };
      }
      const row = {
        venue: combineVenue(g.venue, g.rink) || null, gameCode: g.gameCode || null,
        location: g.location, area: g.place.name, lat: g.place.lat, lng: g.place.lng,
        startAt: new Date(`${g.date}T${g.time}`).getTime(),
        durationMin: Number(g.durationMin) || 60,
        payCents: Math.round(g.pay * 100),
        province,
        homeTeam: g.homeTeam || null, awayTeam: g.awayTeam || null,
        division: (g.division || "").trim() || null,
      };
      // Single gig, both roles: game Pay = scorekeeper (clock) pay; paySheet = scoresheet pay.
      if (mode === "single" && bothRoles) {
        row.payByService = { scorekeeper: Math.round(g.pay * 100), scoresheet: Math.round(paySheet * 100) };
      }
      return row;
    });
    onSubmit({ title, sport: finalSport, type, postedAs, services: effServices, games: gamesPayload, notes: notes.trim() || null }, editing ? initial.id : null);
  };

  const totalGigs = games.length * (editing ? 1 : effServices.length);

  if (mode === "choose") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="sg-display text-xl" style={{ color: C.navy }}>POST A GIG</h2>
          <button onClick={onCancel} className="text-sm font-bold" style={{ color: C.ink60 }}>Cancel</button>
        </div>
        <p className="text-sm" style={{ color: C.ink60 }}>What are you posting?</p>
        <button onClick={() => { setMode("single"); changeType("single"); }}
          className="w-full rounded-xl border-2 p-4 text-left" style={{ borderColor: C.navy, backgroundColor: "#fff" }}>
          <div className="text-base font-bold" style={{ color: C.navy }}>Post a Single Gig</div>
          <div className="mt-0.5 text-xs" style={{ color: C.ink60 }}>One game. Pick the role you need filled — or both.</div>
        </button>
        <button onClick={() => { setMode("tournament"); changeType("tournament"); }}
          className="w-full rounded-xl border-2 p-4 text-left" style={{ borderColor: C.amber, backgroundColor: "#fff" }}>
          <div className="text-base font-bold" style={{ color: C.navy }}>Post Tournament Gigs</div>
          <div className="mt-0.5 text-xs" style={{ color: C.ink60 }}>Multiple games at once — each posts as its own claimable gig.</div>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!editing && (
            <button onClick={() => setMode("choose")} className="text-sm font-bold" style={{ color: C.ink60 }}>‹ Back</button>
          )}
          <h2 className="sg-display text-xl" style={{ color: C.navy }}>{editing ? "EDIT GIG" : mode === "single" ? "SINGLE GIG" : "TOURNAMENT"}</h2>
        </div>
        <button onClick={onCancel} className="text-sm font-bold" style={{ color: C.ink60 }}>Cancel</button>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: C.mapleLine }}>
        <div>
          <label className={lbl} style={{ color: C.ink60 }}>{mode === "tournament" ? "Tournament name" : "Gig title"}</label>
          <input className={input} style={{ borderColor: C.mapleLine }} value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === "tournament" ? "2026 Allstar Tournament" : "U13 AAA Minor Hockey Game"} />
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
          <div style={{ display: mode === "single" ? "none" : "block" }}>
            <label className={lbl} style={{ color: C.ink60 }}>Type</label>
            <select className={input} style={{ borderColor: C.mapleLine }} value={type} onChange={(e) => changeType(e.target.value)}>
              {Object.entries(GIG_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={lbl} style={{ color: C.ink60 }}>
            Province{mode === "tournament" ? " (all games)" : ""}
          </label>
          <select className={input} style={{ borderColor: province ? C.mapleLine : C.red }}
            value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Select a province…</option>
            {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
            Sets the minimum pay we enforce (minimum wage for the game length).
          </p>
        </div>

        {!editing && mode === "single" && (
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Which role do you need?</label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_LIST.map((s) => (
                <button key={s.key} type="button" onClick={() => setSingleRole(s.key)} disabled={bothRoles}
                  className="rounded-lg border px-2 py-2 text-center disabled:opacity-40"
                  style={(!bothRoles && singleRole === s.key)
                    ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy }
                    : { borderColor: C.mapleLine, color: C.navy, backgroundColor: "#fff" }}>
                  <span className="block text-xs font-bold">{s.label}</span>
                  <span className="block text-[9px] leading-tight" style={{ color: (!bothRoles && singleRole === s.key) ? "rgba(255,255,255,0.7)" : C.ink40 }}>{s.desc}</span>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
              <input type="checkbox" checked={bothRoles} onChange={(e) => setBothRoles(e.target.checked)} />
              I need both roles filled (creates a separate gig for each)
            </label>
            {bothRoles && (
              <div className="mt-2">
                <label className={lbl} style={{ color: C.ink60 }}>Scoresheet pay (CAD)</label>
                <input type="number" min={Math.ceil(sheetMin / 100)} step={1} className={input}
                  style={{ borderColor: sheetPayValid ? C.mapleLine : C.red }}
                  value={paySheet} onChange={(e) => setPaySheet(Number(e.target.value))} />
                <p className="mt-1 text-[10px]" style={{ color: sheetPayValid ? C.ink40 : C.red }}>
                  The game's Pay field below is the Scorekeeper (clock) pay. This is the separate Scoresheet pay — min ${(sheetMin / 100).toFixed(2)}.
                </p>
              </div>
            )}
          </div>
        )}

        {!editing && mode !== "single" && (
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

        <div>
          <label className={lbl} style={{ color: C.ink60 }}>Notes for the scorekeeper <span style={{ color: C.ink40 }}>(optional)</span></label>
          <textarea className={input} style={{ borderColor: C.mapleLine, minHeight: "60px", resize: "vertical" }}
            value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000}
            placeholder="e.g. Bluetooth speaker at the rink for music, or we'd like shots on net recorded." />
          <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
            Rink details or requests — shared with whoever claims the gig.
          </p>
        </div>
      </div>

      {/* Tournament header (piece 2): venue, city, duration, pay — set once here, applied to every game row below */}
      {isHeaderMode && (
        <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: C.amber }}>
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>
            Applies to every game below
          </div>
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Date</label>
            <input type="date" className={input} style={{ borderColor: tourDate ? C.green : C.mapleLine }}
              value={tourDate} onChange={(e) => changeTourDate(e.target.value)} />
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
              Post one day of games at a time — every game below shares this date. Need a different day? Post it separately.
            </p>
          </div>
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Division <span style={{ color: C.ink40 }}>(optional)</span></label>
            <input className={input} style={{ borderColor: C.mapleLine }} value={tourDivision}
              onChange={(e) => changeTourDivision(e.target.value)} placeholder="e.g. U13 AAA Division" />
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
              Fills every game below with this division — handy when posting a whole day for one division. Edit any single game after if one differs.
            </p>
          </div>
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>Venue / facility</label>
            <input className={input} style={{ borderColor: tourVenue ? C.green : C.mapleLine }} value={tourVenue}
              onChange={(e) => setTourVenue(e.target.value)} placeholder="e.g. Chilliwack Coliseum" />
            <p className="mt-1 text-[10px]" style={{ color: C.ink40 }}>
              The rink, court, gym, or complex hosting all of these games.
            </p>
          </div>
          <div>
            <label className={lbl} style={{ color: C.ink60 }}>City / area <span style={{ color: C.ink40 }}>(for map & distance)</span></label>
            <CitySearch value={tourPlace} onSelect={(p) => setTourPlace(p)} toast={toast} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl} style={{ color: C.ink60 }}>Duration (min)</label>
              <select className={input} style={{ borderColor: C.mapleLine }} value={tourDuration}
                onChange={(e) => setTourDuration(Number(e.target.value))}>
                {[30,45,60,75,90,120,150,180].map((m) => (
                  <option key={m} value={m}>{m < 60 ? `${m} min` : m === 60 ? "1 hr" : `${Math.floor(m/60)}h ${m%60 > 0 ? `${m%60}m` : ""}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl} style={{ color: C.ink60 }}>Pay per game (CAD)</label>
              <input type="number" min={Math.ceil(headerMinCents / 100)} step={1} className={input}
                style={{ borderColor: headerPayValid ? C.mapleLine : C.red }}
                value={tourPay} onChange={(e) => setTourPay(Number(e.target.value))} />
              <p className="mt-1 text-[10px]" style={{ color: headerPayValid ? C.ink40 : C.red }}>
                Minimum for this length &amp; province: ${(headerMinCents / 100).toFixed(2)} (at least minimum wage)
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
            <input type="checkbox" checked={tourUsesGameCode} onChange={(e) => setTourUsesGameCode(e.target.checked)} />
            This tournament uses game codes (e.g. RAMP Gamesheet)
          </label>
        </div>
      )}

      {/* One row per game (header mode), or a full form per game (single/editing) */}
      <div className="space-y-3">
        {games.map((game, idx) => (
          isHeaderMode ? (
            <GameRow key={idx} game={game} idx={idx} onChange={updateGame}
              onRemove={removeGame} canRemove={games.length > 1} lbl={lbl} input={input}
              showGameCode={tourUsesGameCode} />
          ) : (
            <GameForm key={idx} game={game} idx={idx} onChange={updateGame}
              onRemove={removeGame} canRemove={games.length > 1}
              lbl={lbl} input={input} toast={toast} minCents={minCentsFor(game.durationMin)} />
          )
        ))}
        {type !== "single" && (
          <button onClick={addGame}
            className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold"
            style={{ borderColor: C.amber, color: C.amber }}>
            <Plus size={16} /> {isHeaderMode && tourVenue.trim() ? `Add another game to ${tourVenue.trim()}` : "Add another game"}
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
