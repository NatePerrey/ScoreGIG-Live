// stripe.js — single Stripe client for the whole app
import Stripe from "stripe";
import "dotenv/config";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing — copy .env.example to .env and fill it in.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 15);
export const HOLD_HOURS = Number(process.env.RELEASE_HOLD_HOURS || 2);
export const MIN_PAY_CENTS = 2200; // $22 CAD minimum gig pay
