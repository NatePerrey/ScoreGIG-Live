# Guardian email-consent flow — what changed & how to test

## What this adds
When a minor (15–17) signs up, their account is created **immediately** but starts
in a `pending` state. They can log in and browse, but **cannot post or request
paid gigs** until a parent/guardian confirms via an emailed link.

Confirmation works by emailing the guardian a unique link. The guardian opening
that link from their own inbox and clicking "I consent" is the proof of consent —
we record the timestamp and IP for your audit trail.

## Files changed
**Backend**
- `src/db.js` — added guardian columns to `users` (additive migration, safe on existing DBs)
- `src/guardian.js` — **new**: token issue/lookup, consent email (reuses your SendGrid wiring), confirm
- `src/routes/authRoutes.js` — signup now requires a guardian email for 15–17 and sends the email; `/me` returns consent status; added `POST /guardian-consent/resend`
- `src/routes/gigs.js` — posting and requesting are blocked while consent is `pending`
- `src/server.js` — **new public pages**: `GET /guardian-consent/:token` and `POST /guardian-consent/:token/confirm` (server-rendered, branded)
- `.env.example` — added `API_PUBLIC_URL` (the origin used to build the guardian link)

**Frontend**
- `src/Login.jsx` — guardian email field appears for 15–17 and is required to submit
- `src/App.jsx` — "Waiting for guardian approval" banner with a Resend button

## How to test locally (no email keys needed)
1. `cd scoregig-backend && npm install && cp .env.example .env && npm run dev`
2. `cd scoregig-frontend && npm install && npm run dev`
3. Sign up choosing the **15–17** age range and enter any guardian email.
4. The backend **logs the consent link** to its terminal, like:
   `[guardian:email pending-setup] -> parent@example.com: http://localhost:4000/guardian-consent/<token>`
5. Confirm the minor is gated: try to post/request a gig → you'll get the
   "waiting for parent/guardian approval" message. The banner shows in-app.
6. Paste that logged link into a browser, click **"I confirm — I consent"**.
7. Reload the app → banner is gone, posting/requesting now works.

To send real emails later, set `SENDGRID_API_KEY` + `SENDGRID_FROM` in `.env`
(same keys the rest of the app already uses) and set `API_PUBLIC_URL` to your
real backend URL so the link points somewhere your guardians can reach.

## NOT tested here
I could not boot a live server in this environment (no dependencies installed,
no network), so I verified syntax and cross-file consistency but did **not** run
the end-to-end flow. Please run steps 1–7 above on your machine before relying on it.

## Still a manual/legal step (not code)
Confirm with your lawyer that an email-confirmation record is sufficient proof of
guardian consent for your use, and what exact wording the consent page should
carry. The wording on the consent page is a reasonable starting draft, not legal advice.
