import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { online, supabase } from "./supabase";

// Who is signed in (online mode only): the Supabase session and the POWIB profile with role and approval.
const Ctx = createContext({ online: false });
export const useAuth = () => useContext(Ctx);

// Signs out after 30 minutes without use, so a Hub left open on a shared computer does not stay open.
// The last activity is kept in this browser and shared by its tabs, so working in one tab keeps the others signed in.
// It also counts across closing the browser: opening the Hub again after 30 minutes asks for the password.
const IDLE_MS = 30 * 60 * 1000;
const ACTIVE_KEY = "powib-last-active";
// No record yet (or storage blocked) counts as active now, so nobody is signed out by mistake.
function lastActive() {
  try {
    const v = Number(localStorage.getItem(ACTIVE_KEY));
    if (v) return v;
  } catch {
    return Date.now();
  }
  touch();
  return Date.now();
}
function touch() {
  try {
    localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(online ? undefined : null);
  const [profile, setProfile] = useState(null);
  // True after opening a "reset your password" email link: the person must choose a new password first.
  const [recovery, setRecovery] = useState(() => online && /type=recovery/.test(window.location.hash));
  const [idleSignedOut, setIdleSignedOut] = useState(false);

  const loadProfile = useCallback(async (user) => {
    if (!user) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile(data || { id: user.id, email: user.email, role: "Staff", approved: false });
  }, []);

  useEffect(() => {
    if (!online) return;
    // Arriving from an email link (password reset, confirming a new account) counts as fresh activity.
    if (/access_token|type=/.test(window.location.hash)) touch();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        touch();
        setRecovery(true);
      }
      setSession(s);
      loadProfile(s?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Idle sign-out while signed in.
  const signedIn = !!session;
  useEffect(() => {
    if (!online || !signedIn) return;
    const check = () => {
      if (Date.now() - lastActive() > IDLE_MS) {
        setIdleSignedOut(true);
        supabase.auth.signOut();
      }
    };
    check();
    let last = 0;
    const onActivity = () => {
      if (Date.now() - last < 30000) return; // note activity at most every 30 seconds
      last = Date.now();
      touch();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(check, 30000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);

  const value = {
    online,
    loading: online && (session === undefined || (session && !profile)),
    session,
    user: session?.user || null,
    profile,
    refreshProfile: () => loadProfile(session?.user),
    idleSignedOut,
    signIn: async (email, password) => {
      touch();
      setIdleSignedOut(false);
      return supabase.auth.signInWithPassword({ email: email.trim(), password });
    },
    // The confirmation email links back to this site (the live Hub, or localhost while testing).
    signUp: (name, email, password) =>
      supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin }),
    recovery,
    // Saves a new password for the signed-in person and ends the reset step.
    updatePassword: async (password) => {
      const res = await supabase.auth.updateUser({ password });
      if (!res.error) {
        setRecovery(false);
        if (window.location.hash) history.replaceState(null, "", window.location.pathname);
      }
      return res;
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Accounts list for admins (Team page).
export async function listProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at");
  if (error) throw error;
  return data;
}
export async function updateProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}
