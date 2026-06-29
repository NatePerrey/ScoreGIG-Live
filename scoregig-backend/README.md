# ScoreGIG Backend

Node/Express API implementing ScoreGIG's payment timeline with real Stripe
(test mode by default). Pairs with the ScoreGIG React frontend.

## How money moves

```
ORGANIZER                        SCOREGIG PLATFORM                 SCOREKEEPER
post gig ── card saved (SetupIntent, no charge)
claim    ── card charged: pay + 8% fee ──▶ held in platform balance
complete ──────────── 12h hold ──────────▶ Transfer of pay ──────▶ Connect account
no-show  ◀──────── full Refund ───────────┘
```

Why a saved card instead of an authorization at posting: card authorizations
expire after ~7 days, but gigs are posted weeks ahead. A SetupIntent saves the
card with consent to charge off-session at claim time — the standard
marketplace pattern.

## Setup

1. **Stripe account** — sign up at stripe.com, then enable **Connect** in the
   dashboard (choose Express accounts, platform country Canada).
2. **Keys** — `cp .env.example .env`, paste your `sk_test_...` key.
3. **Run** — `npm install && npm run dev` (Node 20+).
4. **Webhooks (local)** — install the Stripe CLI, then:
   `stripe listen --forward-to localhost:4000/webhooks/stripe`
   and put the printed `whsec_...` into `.env`.
5. **Test cards** — use `4242 4242 4242 4242` with any future expiry/CVC.

Two demo users are seeded; authenticate with header
`Authorization: Bearer token-organizer-demo` or `Bearer token-teen-demo`.

## API

| Method | Path | Who | What |
|---|---|---|---|
| POST | /api/organizers/setup-intent | organizer | Start saving a card (returns clientSecret for Stripe.js) |
| POST | /api/scorekeepers/onboard | scorekeeper | Connect onboarding link (flags guardian flow for under-18) |
| GET | /api/me | any | Payment/onboarding status |
| GET | /api/gigs?lat&lng&radiusKm | any | Open gigs near a point |
| GET | /api/gigs?mine=1 | any | My posted / claimed gigs |
| POST | /api/gigs | organizer | Create gig (min $22 CAD, card required) |
| PATCH | /api/gigs/:id | organizer | Edit — owner only, while open |
| POST | /api/gigs/:id/claim | scorekeeper | Claim → charges organizer's card |
| POST | /api/gigs/:id/arrive | scorekeeper | From 20 min before start |
| POST | /api/gigs/:id/complete | scorekeeper | After game ends; starts 12h release clock |
| POST | /api/gigs/:id/no-show | organizer | From 10 min after start; full refund |
| POST | /api/gigs/:id/issue | organizer | Pause payout for review |
| POST | /api/gigs/:id/badge | organizer | Award MVP / Team Player / High Five |
| GET/POST | /api/brags, /api/brags/:id/five | — | Brag Board |

All timing rules are enforced server-side.

## Under-18 scorekeepers (important)

Stripe Express accounts require the holder to be 18+. For minors, the
onboarding response sets `guardianRequired: true` — your frontend should
explain that a parent/guardian completes Stripe onboarding and receives the
payouts. Decide this flow with a lawyer before launch; youth employment and
marketplace rules vary by province.

## Before going live — checklist

- Replace demo token auth (`src/auth.js`) with a real auth provider.
- Swap SQLite for Postgres; move the release job to a real scheduler/queue.
- Add identity safeguards appropriate for a teen marketplace (guardian
  consent records, organizer verification, reporting tools).
- Review Stripe Connect platform responsibilities (refunds, disputes, KYC)
  and complete your platform profile in the dashboard.
- Rate limiting, logging, and error alerting (e.g., Sentry).
- Flip `sk_test_` → `sk_live_` keys and re-point webhooks only after the
  full flow works end-to-end in test mode.
