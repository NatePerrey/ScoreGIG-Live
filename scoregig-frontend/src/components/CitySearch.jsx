// CitySearch.jsx — reusable Canada-wide city/address picker used in the
// gig-posting form. Returns { name, lat, lng } via onSelect.
import { useState, useEffect, useRef } from "react";
import { Search, Loader2, MapPin, Check } from "lucide-react";
import { C } from "../theme.js";

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

export default function CitySearch({ value, onSelect, toast }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try { setResults(await geocodeCanada(term)); }
      catch { toast?.("Couldn't reach location search — check your connection.", true); }
      finally { setLoading(false); }
    }, 450);
    return () => clearTimeout(debounce.current);
  }, [q, toast]);

  return (
    <div>
      {value?.name && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: C.maple, color: C.navy }}>
          <Check size={14} /> {value.name}
        </div>
      )}
      <div className="relative">
        <Search size={15} color={C.ink40} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={value?.name ? "Change location…" : "Search any city or address in Canada"}
          className="w-full rounded-lg border py-2.5 pl-9 pr-9 text-sm" style={{ borderColor: C.mapleLine }} />
        {loading && <Loader2 size={15} color={C.ink40} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
      </div>
      {results.length > 0 && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: C.mapleLine }}>
          {results.map((r, i) => (
            <button key={r.full || i} type="button"
              onClick={() => { onSelect(r); setQ(""); setResults([]); }}
              className="flex w-full items-start gap-2 border-b px-3 py-2.5 text-left text-sm font-semibold last:border-b-0"
              style={{ borderColor: C.mapleLine, color: C.navy }}>
              <MapPin size={13} color={C.ink40} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block">{r.name}</span>
                <span className="block truncate text-[11px] font-normal" style={{ color: C.ink40 }}>{r.full}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
