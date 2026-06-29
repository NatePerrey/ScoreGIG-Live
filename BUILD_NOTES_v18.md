# Build notes — pay floor + 7 fixes (v18)

This build sits on top of the guardian-consent work (v17) and adds the
provincial minimum-wage pay floor plus seven requested fixes.

## 1. Provincial minimum-wage pay floor (the main one)
A gig must now pay the scorekeeper at least the GREATER of the flat $22 floor
and (that province's minimum wage × the gig's length). So a 90-minute gig in BC
can no longer be posted at $22 — the floor becomes $27.38 (1.5 × $18.25).

- New `src/pricing.js` holds the province→minimum-wage table (in cents) and the
  `minPayCents(province, durationMin)` calc. **This is the one place to update
  when rates change** — bump the numbers and the `MIN_WAGE_AS_OF` date.
- The post form now has a Province selector (auto-detected from the city you
  pick, editable), shows the live minimum next to Pay, and turns the field red
  below it. The server enforces the same floor on create AND edit, reading the
  rates from `/api/min-wage` so the form and server never disagree.
- NOTE: scorekeepers are contractors, so this is a *fairness floor pegged to
  minimum wage*, not a legal wage obligation — but it's a clean thing to stand
  behind ("every gig pays at least minimum-wage-equivalent").

## 2. Age confirmation only for 15–17
The "I'm at least 15" checkbox now appears only when the 15–17 range is picked.
Adults no longer see it. Enforced on both the form and the server.

## 3. Already-started gigs stay visible for 5 minutes
The available list now includes gigs that started up to 5 minutes ago, then
drops them. (Was: hidden the moment they started.)

## 4. Admin recent gigs grouped/filtered by city
The dashboard's Recent gigs are now grouped by city, with a "Filter by city"
dropdown (counts shown per city). Backend also accepts `?area=` to filter.

## 5. Dual-role (scorekeeper + scoresheet) for one person
Your question: today this unlocks when a scorekeeper has a real description in
their profile "Experience" field (I tightened it from "any character" to a
meaningful entry, and the error now tells them exactly how to enable it). It's
an opt-in via the experience field — say the word if you'd rather it be an
explicit checkbox on the profile.

## 6. "RAMP" removed from Game Code
The Game Code box now just says "Game code"; the helper text no longer mentions
RAMP/Gamesheets.

## 7. Organizer-presence recommendation
The post form now shows a note recommending someone from the organizer's team be
at the rink to help the scorekeeper if an issue comes up.

## 8. Resend-approval button feedback
The guardian banner's resend button now shows "Sending…" then "Sent ✓" with a
confirmation line, so it's obvious the click registered.

## How to test locally
1. Backend: `cd scoregig-backend && npm install && cp .env.example .env && npm run dev`
2. Frontend: `cd scoregig-frontend && npm install && npm run dev`
3. Pay floor: post a 90-min gig in BC at $22 → rejected, told the minimum is
   $27.38. Bump to $28 → accepts. Change province → minimum updates live.
4. Age: pick 18–25 → no "I'm 15+" box; pick 15–17 → box + guardian email appear.
5. Started gigs: post a gig starting a couple minutes ago (or just-passed) →
   still shows in available; after 5 min past start it disappears.
6. Admin → Recent gigs: use the city dropdown to filter.

## NOT tested here
No dependencies/network in my environment, so I verified syntax + cross-file
consistency (column counts, imports, JSX structure) but did NOT run it live.
Please run the steps above on your machine before relying on it.

## Heads-up: keep the wage table current
The rates in `pricing.js` are accurate as of 2026-06-29. Several provinces bump
on Oct 1, 2026 (ON→17.95, NS→17.00, PE→17.30, MB→16.40). Update the table then.
