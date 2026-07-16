// GigMessages.jsx — gig-scoped chat, embedded directly in the GigCard.
// Shows the last 10 messages, "Load 5 more" for older ones, button-only send
// (no Enter-to-send), and a friendly block message if the profanity filter
// catches something.
import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, Send } from "lucide-react";
import { C } from "../theme.js";
import { api } from "../api.js";

export default function GigMessages({ gig, me, toast }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreLimit, setLoadMoreLimit] = useState(5);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedOnce = useRef(false);

  const loadInitial = useCallback(() => {
    api(`/gigs/${gig.id}/messages`).then((data) => {
      setMsgs(data.messages);
      setHasMore(data.hasMore);
      setLoadMoreLimit(data.loadMoreLimit || 5);
    }).catch(() => {});
  }, [gig.id]);

  useEffect(() => {
    if (open && !loadedOnce.current) {
      loadedOnce.current = true;
      loadInitial();
    }
  }, [open, loadInitial]);

  const loadMore = async () => {
    if (!msgs.length) return;
    setLoadingMore(true);
    try {
      const data = await api(`/gigs/${gig.id}/messages?beforeId=${msgs[0].id}&limit=${loadMoreLimit}`);
      setMsgs([...data.messages, ...msgs]);
      setHasMore(data.hasMore);
    } catch (e) { toast(e.message, true); }
    setLoadingMore(false);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const sent = await api(`/gigs/${gig.id}/messages`, { method: "POST", body: { body } });
      setMsgs((prev) => [...prev, sent]);
      setDraft("");
    } catch (e) {
      toast(e.message, true);
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-xl border" style={{ borderColor: C.mapleLine }}>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold"
        style={{ color: C.navy }}>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={15} /> Messages
        </span>
        <span className="text-xs" style={{ color: C.ink40 }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t p-3" style={{ borderColor: C.mapleLine }}>
          {hasMore && (
            <button disabled={loadingMore} onClick={loadMore}
              className="mb-2 w-full rounded-lg border py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: C.mapleLine, color: C.ink60 }}>
              {loadingMore ? "Loading…" : "Load 5 more"}
            </button>
          )}

          {msgs.length === 0 && (
            <div className="py-3 text-center text-xs" style={{ color: C.ink40 }}>
              No messages yet — say hello 👋
            </div>
          )}

          <div className="space-y-2">
            {msgs.map((m) => {
              const mine = m.senderId === me.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%] rounded-lg px-3 py-1.5"
                    style={mine
                      ? { backgroundColor: C.navy, color: "#fff" }
                      : { backgroundColor: C.maple, color: C.navy }}>
                    {!mine && (
                      <div className="text-[10px] font-bold opacity-70">{m.senderName}</div>
                    )}
                    <div className="text-sm">{m.body}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              maxLength={1000} placeholder="Type a message…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.mapleLine }} />
            <button disabled={busy || !draft.trim()} onClick={send}
              className="shrink-0 rounded-lg p-2.5 text-white disabled:opacity-40"
              style={{ backgroundColor: C.navy }} aria-label="Send message">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
