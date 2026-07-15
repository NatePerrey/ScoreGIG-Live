// LocationBar.jsx — Canada-wide location search for the gig feed.
// Type any city, town, or address; we geocode it (OpenStreetMap Nominatim,
// restricted to Canada). The curated list stays as one-tap quick picks, and
// device GPS is still available.
import { useState, useEffect, useRef } from "react";
import { MapPin, ChevronRight, Search, Loader2 } from "lucide-react";
import { C, AREAS } from "../theme.js";

async function geocodeCanada(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=ca&limit=6&q="
    + encodeURIComponent(query);
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Search failed");
  const rows = await res.json();
  return rows.map((r) => ({
    name: r.display_name.split(",").slice(0, 2).join(",").trim(),
    full: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

export default function LocationBar({ viewer, setViewer, radius, setRadius, toast }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  // Debounced live search as the user types (min 3 chars).
  useEffect(() => {
    clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try { setResults(await geocodeCanada(term)); }
      catch { toast("Couldn't reach the location search — try a quick pick below.", true); }
      finally { setLoading(false); }
    }, 450);
    return () => clearTimeout(debounce.current);
  }, [q, toast]);

  const pick = (a) => {
    setViewer({ name: a.name, lat: a.lat, lng: a.lng });
    setQ(""); setResults([]); setOpen(false);
    toast(`Showing gigs within ${radius} km of ${a.name}.`);
  };

  const useDevice = () => {
    if (!navigator.geolocation) return toast("Device location isn't available — search for your area instead.", true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setViewer({ name: "My current location", lat: pos.coords.latitude, lng: pos.coords.longitude }); setOpen(false); toast(`Located you! Showing gigs within ${radius} km.`); },
      () => toast("Couldn't get your location — search for your area instead.", true),
      { timeout: 8000 }
    );
  };

  const quickPicks = AREAS.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const showQuick = q.trim().length < 3;

  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: C.mapleLine }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: C.maple }}>
          <MapPin size={15} color={C.navy} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-bold" style={{ color: C.navy }}>{viewer.name}</span>
          <span className="block text-[11px]" style={{ color: C.ink60 }}>Within {radius} km · tap to change</span>
        </span>
        <ChevronRight size={16} color={C.ink40} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: C.mapleLine }}>
          <div className="relative">
            <Search size={15} color={C.ink40} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search any city or address in Canada"
              className="w-full rounded-lg border py-2.5 pl-9 pr-9 text-sm" style={{ borderColor: C.mapleLine }} />
            {loading && <Loader2 size={15} color={C.ink40} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border" style={{ borderColor: C.mapleLine }}>
            {showQuick && (
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.ink40, backgroundColor: C.bg }}>
                Quick picks
              </div>
            )}
            {(showQuick ? quickPicks : results).map((a, i) => (
              <button key={a.full || a.name || i} onClick={() => pick(a)}
                className="flex w-full items-start gap-2 border-b px-3 py-2.5 text-left text-sm font-semibold last:border-b-0"
                style={{ borderColor: C.mapleLine, color: C.navy, backgroundColor: a.name === viewer.name ? C.maple : "#fff" }}>
                <MapPin size={13} color={C.ink40} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block">{a.name}</span>
                  {a.full && <span className="block truncate text-[11px] font-normal" style={{ color: C.ink40 }}>{a.full}</span>}
                </span>
              </button>
            ))}
            {!showQuick && !loading && results.length === 0 && (
              <div className="p-3 text-center text-xs" style={{ color: C.ink60 }}>
                No matches in Canada for “{q.trim()}”. Try a nearby city or a postal code.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: C.ink60 }}>Radius</span>
            {[10, 25, 50, 100].map((r) => (
              <button key={r} onClick={() => setRadius(r)}
                className="flex-1 rounded-lg border py-1.5 text-xs font-bold"
                style={radius === r ? { backgroundColor: C.navy, color: "#fff", borderColor: C.navy } : { borderColor: C.mapleLine, color: C.navy }}>
                {r} km
              </button>
            ))}
          </div>
          <button onClick={useDevice} className="w-full rounded-lg border py-2 text-sm font-bold" style={{ borderColor: C.navy, color: C.navy }}>
            📍 Use my device location
          </button>
        </div>
      )}
    </div>
  );
}
