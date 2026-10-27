import { useState } from "react";
import { useAuth } from "../lib/auth";
import { readLocal, writeLocal } from "../lib/store";
import Letterhead from "./Letterhead";
import { Button, Field, Icon, cx } from "./ui";

// The sign-in pages are set like POWIB's letterhead: the blue band with the bell and name, then the white page.
function Shell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <Letterhead size="lg">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-bold text-white sm:text-4xl">Protection without Borders</h1>
          <a
            href="mailto:Protectionwithoutborders@gmail.com"
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-800 transition hover:text-brand-700 sm:text-sm"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
              <rect x="2.5" y="5" width="19" height="14" rx="2" fill="#FAAA37" />
              <path d="m3 6.5 9 6.5 9-6.5" fill="none" stroke="#E95A21" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <span className="truncate">Protectionwithoutborders@gmail.com</span>
          </a>
        </div>
      </Letterhead>

      <main className="flex flex-1 justify-center px-4 pt-10 pb-12 sm:pt-14">
        <div className="animate-pop w-full max-w-md">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(12,58,92,0.35)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-ink-500 dark:text-slate-400">POWIB Organization Hub · for POWIB staff only</p>
        </div>
      </main>
    </div>
  );
}

const MSG = {
  "Invalid login credentials": "Wrong email or password.",
  "User already registered": "An account with this email already exists. Sign in instead.",
  "Email not confirmed": "Please confirm your email first, using the link we sent you.",
  "Request rate limit reached": "Too many attempts from this network. Wait a few minutes and try again.",
  "email rate limit exceeded": "Too many emails sent. Wait an hour and try again.",
};

// After 5 wrong passwords this browser waits before trying again (1 minute, doubling up to 15 minutes).
// Supabase also limits sign-ins per network address on its side.
const GUARD = "powib-login-guard";
const guard = () => readLocal(GUARD, { fails: 0, until: 0, resetAt: 0 });
function waitText(ms) {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.ceil(s / 60)} minutes`;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const g = guard();
    if (mode === "in" && g.until > Date.now()) return setMsg({ bad: true, text: `Too many wrong passwords. Try again in ${waitText(g.until - Date.now())}.` });
    if (mode === "reset" && g.resetAt > Date.now()) return setMsg({ bad: true, text: `A reset link was just sent. You can ask again in ${waitText(g.resetAt - Date.now())}.` });
    if (!EMAIL.test(f.email.trim()) || f.email.length > 254) return setMsg({ bad: true, text: "Enter a valid email address." });
    if (f.password.length > 72) return setMsg({ bad: true, text: "The password can be at most 72 characters." });
    if (f.name.length > 120) return setMsg({ bad: true, text: "The name can be at most 120 characters." });
    if (mode !== "reset" && f.password.length < 8) return setMsg({ bad: true, text: "The password must be at least 8 characters." });
    if (mode === "up" && !f.name.trim()) return setMsg({ bad: true, text: "Enter your full name." });
    setBusy(true);
    const { error, data } =
      mode === "in" ? await signIn(f.email.trim(), f.password) : mode === "up" ? await signUp(f.name.trim(), f.email.trim(), f.password) : await resetPassword(f.email.trim());
    setBusy(false);
    if (mode === "in") {
      const fails = error?.message === "Invalid login credentials" ? g.fails + 1 : 0;
      writeLocal(GUARD, { ...g, fails, until: fails >= 5 ? Date.now() + Math.min(60000 * 2 ** (fails - 5), 900000) : 0 });
    }
    if (mode === "reset" && !error) writeLocal(GUARD, { ...g, resetAt: Date.now() + 60000 });
    if (error) return setMsg({ bad: true, text: MSG[error.message] || error.message });
    if (mode === "up" && !data.session) setMsg({ text: "Account created. Check your email to confirm it, then sign in." });
    if (mode === "reset") setMsg({ text: "If that email has an account, a reset link is on its way." });
  }

  return (
    <Shell>
      <h2 className="text-xl font-semibold text-ink-900 dark:text-white">
        {mode === "in" ? "Sign in" : mode === "up" ? "Create your staff account" : "Reset your password"}
      </h2>
      <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
        {mode === "up" ? "HR approves new accounts and sets your role." : mode === "in" ? "Use your POWIB staff account." : "We'll email you a link to set a new password."}
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        {mode === "up" && (
          <Field label="Full name">
            <input className="input" value={f.name} onChange={set("name")} autoComplete="name" />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
        </Field>
        {mode !== "reset" && (
          <Field label="Password" hint={mode === "up" ? "At least 8 characters." : undefined}>
            <input className="input" type="password" value={f.password} onChange={set("password")} autoComplete={mode === "up" ? "new-password" : "current-password"} />
          </Field>
        )}
        {msg && (
          <p className={cx("rounded-lg px-3 py-2 text-sm", msg.bad ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
            {msg.text}
          </p>
        )}
        <Button variant="primary" type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        {mode !== "in" ? (
          <button type="button" className="cursor-pointer font-medium text-brand-600 hover:underline" onClick={() => { setMode("in"); setMsg(null); }}>
            Back to sign in
          </button>
        ) : (
          <>
            <button type="button" className="cursor-pointer font-medium text-brand-600 hover:underline" onClick={() => { setMode("up"); setMsg(null); }}>
              New staff? Create an account
            </button>
            <button type="button" className="cursor-pointer text-ink-500 hover:underline" onClick={() => { setMode("reset"); setMsg(null); }}>
              Forgot password?
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

// New password + confirmation. Used after a reset link and from the account menu.
export function PasswordForm({ onDone, submitLabel = "Save new password" }) {
  const { updatePassword } = useAuth();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg("The password must be at least 8 characters.");
    if (pw !== again) return setMsg("The two passwords don't match.");
    setBusy(true);
    const { error } = await updatePassword(pw);
    setBusy(false);
    if (error) return setMsg(/should be different|same/i.test(error.message) ? "Choose a password you haven't used before." : error.message);
    onDone?.();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="New password" hint="At least 8 characters.">
        <input className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Type it again">
        <input className="input" type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </Field>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700 select-none dark:text-slate-300">
        <input type="checkbox" className="size-4 accent-brand-600" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}
      <Button variant="primary" type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// Shown after opening a "reset your password" email link.
export function SetPasswordPage() {
  const { profile, user } = useAuth();
  return (
    <Shell>
      <h2 className="text-xl font-semibold text-ink-900 dark:text-white">Set a new password</h2>
      <p className="mt-1 mb-6 text-sm text-ink-500 dark:text-slate-400">For {profile?.email || user?.email}. You'll use it next time you sign in.</p>
      <PasswordForm submitLabel="Save and continue" />
    </Shell>
  );
}

export function PendingPage() {
  const { profile, signOut } = useAuth();
  return (
    <Shell>
      <div className="grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600">
        <Icon name="clock" className="size-6" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-ink-900 dark:text-white">Waiting for approval</h2>
      <p className="mt-2 text-sm text-ink-700 dark:text-slate-300">
        Thanks, {profile?.full_name || profile?.email}. Your account has been created. HR will approve it and set your role, then you can sign in and use the Hub.
      </p>
      <Button className="mt-6 w-full" onClick={signOut}>Sign out</Button>
    </Shell>
  );
}
