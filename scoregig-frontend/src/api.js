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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
