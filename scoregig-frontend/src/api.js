// api.js — tiny typed-ish client for the ScoreGIG backend.
// Every call attaches the bearer token; 4xx errors throw with the server's
// friendly message so components can show it in a toast.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

let token = localStorage.getItem("scoregig_token") || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem("scoregig_token", t);
  else localStorage.removeItem("scoregig_token");
}
export function getToken() { return token; }

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Token missing/expired/invalid — drop it and tell the app to sign out.
    setToken(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("scoregig:signout"));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// --- Free, self-hosted traffic tracker (admin dashboard, Sep19) ----------
// A random id kept in localStorage — no cookies, no login required — so the
// admin dashboard can tell "one person on 5 screens" from "5 people on 1
// screen each" without logging anything identifying.
function visitorId() {
  try {
    let id = localStorage.getItem("scoregig_visitor_id");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem("scoregig_visitor_id", id);
    }
    return id;
  } catch { return null; } // private browsing / storage blocked — fine, just skip the id
}

// Fire-and-forget screen view. Never throws, never blocks the UI — a tracking
// hiccup should be invisible to the person using the app.
export function trackView(path) {
  try {
    fetch(`${BASE}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, visitorId: visitorId(), referrer: document.referrer || null }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
