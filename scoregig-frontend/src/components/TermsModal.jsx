// TermsModal.jsx — shown before posting a gig or requesting a claim.
// User must scroll to the bottom and check the box before proceeding.
import { useState, useRef } from "react";
import { X } from "lucide-react";
import { C } from "../theme.js";

const TERMS = `SCOREGIG TERMS OF USE

Last updated: June 2026

1. ABOUT SCOREGIG
ScoreGIG is a Canadian marketplace connecting sports organizers with scorekeepers. By using ScoreGIG you agree to these terms.

2. ELIGIBILITY
You must be at least 12 years old to use ScoreGIG. Users aged 12–17 require a parent or guardian to complete payout setup. By signing up you confirm you have provided accurate age information.

3. FOR ORGANIZERS — POSTING GIGS
By posting a gig you agree that:
• Your saved payment card will be charged only when you approve a scorekeeper's request.
• You are responsible for providing accurate gig details (location, time, sport, pay).
• Minimum pay is $22 CAD per gig.
• You agree to notify your scorekeeper promptly if the event is cancelled.
• ScoreGIG charges a 15% platform fee on top of the scorekeeper's pay.
• You have 2 hours after a gig is marked complete to report a legitimate issue.

4. FOR SCOREKEEPERS — REQUESTING GIGS
By requesting a gig you agree that:
• You will show up on time and perform the scorekeeping duties as described.
• You will confirm your arrival in the app within 20 minutes of the start time.
• Failure to show without notice may result in account suspension.
• Earnings are released to your Stripe account after the 2-hour review window.
• ScoreGIG is not responsible for delays caused by Stripe's bank transfer schedules.

5. PRE-APPROVED SCOREKEEPERS
Scorekeepers who have successfully completed 3 or more gigs with the same organizer may be eligible for pre-approval, allowing them to claim that organizer's future gigs without waiting for manual approval. This is at the organizer's discretion.

6. MUSIC & ADD-ON SERVICES
If you offer add-on services (e.g. running music during a game), you agree to play only radio-edited, clean content with zero explicit language or profanity. Violation may result in immediate removal from the platform.

7. BEHAVIOUR & CONDUCT
All users must treat each other with respect. Harassment, inappropriate conduct, or fraudulent activity will result in account suspension and may be reported to authorities.

8. PAYMENTS & FEES
• All payments are processed by Stripe (Canada). ScoreGIG does not store card numbers.
• Tips to scorekeepers are 100% passed through with no platform fee.
• Instant cash-out carries a ~1.5% fee charged by Stripe.
• ScoreGIG's 15% fee is non-refundable except in no-show situations.

9. PRIVACY
ScoreGIG collects name, email, and age range at signup. Your legal name is used only for Stripe payments and is never displayed to other users. Display names are shown publicly. Brag Board posts contain no personal gig details.

10. LIMITATION OF LIABILITY
ScoreGIG is a marketplace platform. We are not responsible for the conduct of organizers or scorekeepers. Use of the platform is at your own risk.

11. CHANGES TO THESE TERMS
ScoreGIG reserves the right to update these terms at any time. Continued use of the platform constitutes acceptance of updated terms.

By clicking "I agree" you confirm you have read and accept these Terms of Use.`;

export default function TermsModal({ onAccept, onClose, context = "post", readOnly = false }) {
  const [scrolled, setScrolled] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const bodyRef = useRef(null);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setScrolled(true);
  };

  const action = context === "post" ? "post a gig" : "request this gig";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="flex h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: C.mapleLine }}>
          <h3 className="sg-display text-lg" style={{ color: C.navy }}>TERMS OF USE</h3>
          <button onClick={onClose} aria-label="Close"><X size={20} color={C.navy} /></button>
        </div>
        {!readOnly && (
          <p className="px-4 pt-3 text-xs font-semibold" style={{ color: C.ink60 }}>
            Please read and scroll to the bottom before you can {action}.
          </p>
        )}
        <div ref={bodyRef} onScroll={onScroll}
          className="flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed whitespace-pre-wrap"
          style={{ color: C.navy }}>
          {TERMS}
        </div>
        {readOnly ? (
          <div className="border-t p-4" style={{ borderColor: C.mapleLine }}>
            <button onClick={onClose}
              className="w-full rounded-lg py-2.5 font-bold text-white" style={{ backgroundColor: C.navy }}>
              Close
            </button>
          </div>
        ) : (
          <div className="border-t p-4 space-y-3" style={{ borderColor: C.mapleLine }}>
            {!scrolled && (
              <p className="text-center text-[11px] font-semibold" style={{ color: C.ink40 }}>
                Scroll to the bottom to continue ↓
              </p>
            )}
            {scrolled && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="text-xs" style={{ color: C.navy }}>
                  I have read and agree to the ScoreGIG Terms of Use.
                </span>
              </label>
            )}
            <button disabled={!agreed} onClick={onAccept}
              className="w-full rounded-lg py-2.5 font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: C.navy }}>
              I agree — continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
