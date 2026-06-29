# ScoreGIG — Full Stack (with real accounts)

Two folders, two terminals, real Stripe (test mode).

## What changed in this version
- **Real sign-up / login** (email + password) — no more demo buttons.
- **One account does both** — toggle "Organize" / "Scorekeep" at the top.
- **Age range at signup** (12–17 / 18–25 / 26+); 12–17 uses the guardian payout path.
- **The first account you create becomes the platform admin** and gets an
  Admin tab (in Organize mode) with gig counts, money totals, and a gig list.

## 1. Backend  (terminal 1)
```bash
cd scoregig-backend
cp .env.example .env        # paste your sk_test_... key AND set JWT_SECRET to any long random text
npm install
npm run dev                 # http://localhost:4000
```

## 2. Webhooks  (terminal 2, optional)
```bash
stripe listen --forward-to localhost:4000/webhooks/stripe
# paste the printed whsec_... into scoregig-backend/.env, restart backend
```

## 3. Frontend  (terminal 3)
```bash
cd scoregig-frontend
cp .env.example .env        # paste your pk_test_... publishable key
npm install
npm run dev                 # http://localhost:5173
```

## Payout model (#12)
- **2-hour auto-release** after a gig is marked complete (organizer has 2 hours
  to report an issue before money moves)
- **"Approve & release now"** button on completed gigs — organizer taps it and
  the scorekeeper is paid within 60 seconds
- **Free weekly Wednesday batch** — Stripe sweeps Connect balances to bank
  accounts every Wednesday at no cost (set at account creation)
- **"Cash out now"** on the scorekeeper Profile — instant payout to a linked
  debit card for ~1.5% fee; their choice

## Tips (#13)
- Organizer can tip within **12 hours of game end** — 100% goes to the
  scorekeeper, no platform fee
- Preset amounts ($5 / $10 / $15 / $20) plus a custom field
- One tip per gig; tip panel appears automatically on completed/paid gig cards
- Charged to the organizer's saved card on file

## Loyalty rewards (#14)
- Scorekeeper Profile shows a **progress bar** toward the next 5-gig milestone
- At 5, 10, 15... gigs completed the bar fills and a **"Claim your reward"**
  button appears (links to rewards@scoregig.ca for manual fulfillment)
- Reward: ScoreGIG toque, hat, or t-shirt for $10

## Issue resolution (admin)
When an organizer reports an issue on a completed gig, payout is paused and
an issue record is created. The admin dashboard shows all open issues with an
alert badge. Admin can resolve each issue with one of three outcomes:
- **Release** — payout goes to the scorekeeper as normal
- **Refund** — organizer gets their money back via Stripe
- **Dismiss** — close with no money action

Resolved issues stay on the Issues tab for your records; the open-issue counter
decrements as you work through them.

## Scorekeeper Stats (resume)
The Profile editor now includes:
- **Games worked** — a 0–10+ slider
- **What do you scorekeep?** — sport toggles matching the organizer gig form
- Bio (short intro)
- Experience & history (free text, filtered)
These show on the scorekeeper's public profile that organizers review before
approving a claim request.

## Privacy & safety model
- **Display names everywhere.** At signup everyone sets a display name (e.g.
  "Jordan T."). Real legal names are used only for Stripe payouts and are never
  shown to other users.
- **Brag Board is preset-only.** Posts are pre-written celebrations ("Gig
  secured!", "Gig complete — made some cash!") with no venue, date, or team —
  nothing that reveals where a minor will be. The feed is public.
- **"Posting as" role.** Organizers pick Parent / Team Manager / Coach /
  Tournament Coordinator / Association Admin when posting — a trust signal
  scorekeepers see.
- **Clean-language filter** on bios and gig titles (a first line of defense,
  not a guarantee — pair with reporting later).
- **One high-five per person per brag,** with undo.

## How claiming works (request → approve)
For safety in youth sports, scorekeepers don't claim instantly. Instead:
1. Scorekeeper taps **Request this gig** (no charge yet)
2. Organizer sees the request, taps **View resume** to vet them, then
   **Approve** (card charged, scorekeeper locked in) or **Decline** (reopens)
This puts a real adult gatekeeper in front of every game. (Pre-approving
trusted regulars for instant claims is a planned future addition.)

## First run
1. Open http://localhost:5173 → **Sign up**. The FIRST account becomes admin.
2. Use the **Organize / Scorekeep** toggle at the top to switch hats.
3. To test the two-sided flow solo, sign up a SECOND account in a private/
   incognito window (e.g. an 18–25 scorekeeper) and have them claim a gig you
   posted.
4. Card testing: 4242 4242 4242 4242, any future expiry, any CVC, any postal.

## Notes
- Your old test data (demo Pat/Jordan gigs) is gone — this version uses a new
  account system. If you have an old scoregig.db, delete it so the new schema
  is created fresh.
- Platform fee is 15% (PLATFORM_FEE_PERCENT in backend .env).
- Still to come per your list: request→approve claiming, tips, add-on services,
  weekly payout batching, push notifications, public brag feed.
