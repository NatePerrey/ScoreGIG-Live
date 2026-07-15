// SaveCard.jsx — real Stripe card saving for organizers.
// Flow: backend creates a SetupIntent → Stripe Elements collects the card
// securely (it never touches our server) → confirmCardSetup → tell backend.
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";
import { C } from "../theme.js";
import { api } from "../api.js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function CardForm({ onSaved, toast }) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/organizers/setup-intent", { method: "POST" })
      .then((d) => setClientSecret(d.clientSecret))
      .catch((e) => toast(e.message, true));
  }, []);

  const save = async () => {
    if (!stripe || !elements || !clientSecret) return;
    setBusy(true);
    const result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });
    if (result.error) {
      toast(result.error.message, true);
      setBusy(false);
      return;
    }
    try {
      await api("/organizers/confirm-card", { method: "POST", body: { setupIntentId: result.setupIntent.id } });
      toast("Card saved! You can post gigs now — you're only charged when one is claimed.");
      onSaved();
    } catch (e) {
      toast(e.message, true);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.mapleLine }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: C.navy }}>Card details</span>
          <span className="text-[10px] font-bold" style={{ color: C.ink40 }}>Powered by Stripe · CAD 🇨🇦</span>
        </div>
        <div className="rounded-lg border px-3 py-3" style={{ borderColor: C.mapleLine }}>
          <CardElement options={{ style: { base: { fontSize: "15px", color: C.navy } } }} />
        </div>
        <div className="mt-2 flex items-start gap-1.5 rounded-lg p-2 text-[11px]" style={{ backgroundColor: C.maple, color: C.navy }}>
          <Lock size={12} className="mt-0.5 shrink-0" />
          <span>Your card is saved securely with Stripe — <b>nothing is charged now</b>. You're charged (pay + service fee) only when a scorekeeper claims one of your gigs, and refunded in full for no-shows.</span>
        </div>
      </div>
      <button disabled={busy || !clientSecret} onClick={save}
        className="w-full rounded-lg py-3 font-bold disabled:opacity-40 active:scale-[0.99]"
        style={{ backgroundColor: C.amber, color: C.navy }}>
        {busy ? "Saving…" : "Save card"}
      </button>
      <p className="text-center text-[11px]" style={{ color: C.ink60 }}>
        Test mode: use 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
    </div>
  );
}

export default function SaveCard({ onSaved, toast }) {
  return (
    <Elements stripe={stripePromise}>
      <h2 className="sg-display mb-3 text-xl" style={{ color: C.navy }}>ADD A PAYMENT CARD</h2>
      <CardForm onSaved={onSaved} toast={toast} />
    </Elements>
  );
}
