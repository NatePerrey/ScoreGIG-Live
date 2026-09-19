// pricing.js — the mandatory pay floor for a gig.
//
// A scorekeeper must be paid at least the GREATER of:
//   (a) a flat floor every gig clears regardless of length ($22), and
//   (b) the province's minimum wage × the gig's length in hours.
//
// (b) is what stops a 90-minute gig being posted at $22 (which works out to
// ~$14.67/hr, below every province's minimum wage). The floor is enforced
// server-side in routes/gigs.js on both create and edit.
//
// NOTE ON CLASSIFICATION: scorekeepers are independent contractors, so minimum
// wage law doesn't strictly bind here — this is a fairness floor pegged to the
// minimum wage, not a legal wage obligation. It also makes "every gig pays at
// least minimum-wage-equivalent" something ScoreGIG can stand behind publicly.

import { MIN_PAY_CENTS } from "./stripe.js";

// Flat floor (a minimum viable payment) — reuses the existing $22 constant.
export const FLAT_MIN_CENTS = MIN_PAY_CENTS;

// General adult minimum wage by province/territory, in cents per hour.
// As of MIN_WAGE_AS_OF below. THESE CHANGE — most jurisdictions adjust on
// April 1 or October 1. When rates change, update the numbers here and bump
// the date. This is the single source of truth; the frontend reads it from the
// /api/min-wage endpoint so the two never drift.
export const MIN_WAGE_CENTS = {
  BC: 1825, // British Columbia      (eff. Jun 1, 2026)
  AB: 1500, // Alberta               (unchanged since 2018)
  SK: 1535, // Saskatchewan
  MB: 1600, // Manitoba              (→ 1640 on Oct 1, 2026)
  ON: 1760, // Ontario               (→ 1795 on Oct 1, 2026)
  QC: 1660, // Quebec                (eff. May 1, 2026)
  NB: 1590, // New Brunswick         (eff. Apr 1, 2026)
  NS: 1675, // Nova Scotia           (→ 1700 on Oct 1, 2026)
  PE: 1700, // Prince Edward Island  (→ 1730 on Oct 1, 2026)
  NL: 1635, // Newfoundland & Labrador
  YT: 1851, // Yukon                 (eff. Apr 1, 2026)
  NT: 1695, // Northwest Territories
  NU: 1975, // Nunavut
};
export const MIN_WAGE_AS_OF = "2026-06-29";

export const PROVINCES = [
  { code: "BC", name: "British Columbia" },
  { code: "AB", name: "Alberta" },
  { code: "SK", name: "Saskatchewan" },
  { code: "MB", name: "Manitoba" },
  { code: "ON", name: "Ontario" },
  { code: "QC", name: "Quebec" },
  { code: "NB", name: "New Brunswick" },
  { code: "NS", name: "Nova Scotia" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "YT", name: "Yukon" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
];

export function isValidProvince(code) {
  return Boolean(MIN_WAGE_CENTS[String(code || "").toUpperCase()]);
}

// The minimum pay (in cents) a scorekeeper must receive for a gig of the given
// length in the given province. Rounded UP to the cent so it never dips below
// minimum-wage-equivalent. Unknown province falls back to the flat floor.
export function minPayCents(province, durationMin) {
  const code = String(province || "").toUpperCase();
  const wage = MIN_WAGE_CENTS[code];
  const mins = Number(durationMin) || 60;
  if (!wage) return FLAT_MIN_CENTS;
  const wageBased = Math.ceil((wage * mins) / 60);
  return Math.max(FLAT_MIN_CENTS, wageBased);
}
