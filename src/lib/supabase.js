// Connection to the shared online database. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local;
// without them the app runs in "this browser only" mode as before.
import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// Everything in VITE_ variables is sent to every visitor's browser, so only the public (anon/publishable) key may go here.
// The app refuses to start with a secret key or a malformed address rather than publish them.
function checkEnv() {
  if (!url && !key) return "";
  if (!url || !key) return "Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local.";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url))
    return "VITE_SUPABASE_URL must be your project address, like https://your-project.supabase.co.";
  if (/^sb_secret_/.test(key) || jwtRole(key) === "service_role")
    return "VITE_SUPABASE_ANON_KEY holds a SECRET key. Remove it from .env.local now, use the publishable (anon) key instead, and rotate the secret key in Supabase.";
  if (!/^sb_publishable_/.test(key) && jwtRole(key) !== "anon") return "VITE_SUPABASE_ANON_KEY is not a Supabase publishable (anon) key.";
  return "";
}
function jwtRole(k) {
  try {
    return JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    return null;
  }
}

export const envError = checkEnv();
export const supabase = url && key && !envError ? createClient(url, key) : null;
export const online = !!supabase;
export const BUCKET = "hub-files";
