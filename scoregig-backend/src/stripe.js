// stripe.js — single Stripe client for the whole app
import Stripe from "stripe";
import "dotenv/config";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing — copy .env.example to .env and fill it in.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Platform fee charged to the organizer on top of the scorekeeper's pay.
// 18% covers Stripe's per-transaction processing cost (~2.9% + $0.30) and
// leaves a working margin. The live value is set by PLATFORM_FEE_PERCENT on
// Render — update it there to change the fee without a redeploy.
export const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 18);
export const HOLD_HOURS = Number(process.env.RELEASE_HOLD_HOURS || 2);
export const MIN_PAY_CENTS = 2200; // $22 CAD minimum gig pay
