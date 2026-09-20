// theme.js — brand tokens, badges, sport language, areas, shared helpers.
import { Star, Users, Hand } from "lucide-react";

export const C = {
  navy: "#16243D",
  navySoft: "#243A5E",
  bg: "#FBF7EF",
  maple: "#F3E6CB",
  mapleLine: "#E2CFA6",
  amber: "#F5A800",
  red: "#D7263D",
  green: "#1F7A4D",
  ink60: "rgba(22,36,61,0.6)",
  ink40: "rgba(22,36,61,0.4)",
};

export const BADGES = {
  mvp:  { id: "mvp",  label: "MVP",         icon: Star,  color: C.amber,    desc: "Crushed it. Flawless scorekeeping." },
  team: { id: "team", label: "Team Player", icon: Users, color: C.green,    desc: "Helpful, friendly, went the extra mile." },
  five: { id: "five", label: "High Five",   icon: Hand,  color: C.navySoft, desc: "Solid job. Would book again." },
};

export const SPORTS = ["Basketball", "Hockey", "Baseball", "Volleyball", "Soccer", "Lacrosse", "Other"];

export const GIG_TYPES = {
  single:     { label: "Single game",    games: 1 },
  multi:      { label: "Multiple games", games: 3 },
  tournament: { label: "Tournament",     games: 4 },
};

// Roles an organizer can hire for. Each selected role becomes its own gig. (#13/#14)
export const SERVICES = {
  scorekeeper: { key: "scorekeeper", label: "Scorekeeper", desc: "Runs the clock / scoreboard" },
  scoresheet:  { key: "scoresheet",  label: "Scoresheet",  desc: "Keeps the official scoresheet" },
};
// "both" isn't a pickable role in the poster (it's the combined-gig checkbox's
// result, not a third button) so it lives outside SERVICES, just here for display.
export const serviceLabel = (k) => (k === "both" ? "Scorekeeper + Scoresheet" : SERVICES[k]?.label || "Scorekeeper");

const START_TERMS = {
  Basketball: "tip-off", Hockey: "puck drop", Baseball: "first pitch",
  Volleyball: "first serve", Soccer: "kickoff", Lacrosse: "the opening face-off",
};
export const startTerm = (s) => START_TERMS[s] || "game time";

const END_TERMS = {
  Basketball: "the final buzzer", Hockey: "the final horn", Baseball: "the final out",
  Volleyball: "match point", Soccer: "the final whistle", Lacrosse: "the final horn",
};
export const endTerm = (s) => END_TERMS[s] || "the end of the game";

export const AREAS = [
  { name: "Chilliwack, BC",       lat: 49.1579, lng: -121.9514 },
  { name: "Downtown Toronto, ON", lat: 43.6532, lng: -79.3832 },
  { name: "North York, ON",       lat: 43.7615, lng: -79.4111 },
  { name: "Scarborough, ON",      lat: 43.7764, lng: -79.2318 },
  { name: "Etobicoke, ON",        lat: 43.6205, lng: -79.5132 },
  { name: "Mississauga, ON",      lat: 43.5890, lng: -79.6441 },
  { name: "Vaughan, ON",          lat: 43.8361, lng: -79.4983 },
  { name: "Markham, ON",          lat: 43.8561, lng: -79.3370 },
  { name: "Oakville, ON",         lat: 43.4675, lng: -79.6877 },
  { name: "Hamilton, ON",         lat: 43.2557, lng: -79.8711 },
  { name: "Ottawa, ON",           lat: 45.4215, lng: -75.6972 },
  { name: "London, ON",           lat: 42.9849, lng: -81.2453 },
  { name: "Vancouver, BC",        lat: 49.2827, lng: -123.1207 },
  { name: "Calgary, AB",          lat: 51.0447, lng: -114.0719 },
  { name: "Montreal, QC",         lat: 45.5019, lng: -73.5674 },
  { name: "Halifax, NS",          lat: 44.6488, lng: -63.5752 },
];

export const MIN = 60 * 1000;
export const fmtDT = (ms) =>
  new Date(ms).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtT = (ms) =>
  new Date(ms).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

// Human-friendly gig length: "45 min", "1 hr", "1 hr 30 min", "2 hrs". (Jun14 #12)
export function fmtDuration(min) {
  const m = Number(min) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  const hrs = `${h} ${h === 1 ? "hr" : "hrs"}`;
  return r ? `${hrs} ${r} min` : hrs;
}
export const cadCents = (c) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")} CAD`;

export function kmBetween(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (km) => (km < 1 ? "<1 km" : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
