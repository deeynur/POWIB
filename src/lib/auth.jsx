import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { online, supabase } from "./supabase";

// Who is signed in (online mode only): the Supabase session and the POWIB profile with role and approval.
const Ctx = createContext({ online: false });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(online ? undefined : null);
  const [profile, setProfile] = useState(null);
  // True after opening a "reset your password" email link: the person must choose a new password first.
  const [recovery, setRecovery] = useState(() => online && /type=recovery/.test(window.location.hash));

  const loadProfile = useCallback(async (user) => {
    if (!user) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile(data || { id: user.id, email: user.email, role: "Staff", approved: false });
  }, []);

  useEffect(() => {
    if (!online) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      loadProfile(s?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = {
    online,
    loading: online && (session === undefined || (session && !profile)),
    session,
    user: session?.user || null,
    profile,
    refreshProfile: () => loadProfile(session?.user),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email: email.trim(), password }),
    signUp: (name, email, password) =>
      supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } }),
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
