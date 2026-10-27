import { useEffect, useRef, useState } from "react";
import { useHub } from "../lib/store";
import { useAuth } from "../lib/auth";
import { saveFiles } from "../lib/files";
import { ED_LIMIT, ROLES, lbl, money } from "../lib/logic";
import { Icon, Modal, Select, useFileUrl } from "./ui";
import Letterhead from "./Letterhead";
import { PasswordForm } from "./LoginPage";
import { useToast } from "./ui/Toast";

// What each role does, shown under its name in the role picker.
const ROLE_HINTS = {
  PM: "Approves requests first",
  Program: "Raises requests for projects",
  Logistics: "POs, vendors, delivery",
  Finance: "Checks budgets, pays",
  HR: "Staff, timesheets, leave",
  ED: `Final sign-off from ${money(ED_LIMIT)}`,
};
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r.value, label: r.label, hint: ROLE_HINTS[r.value] }));

export default function Header({ theme, onTheme, onNewRequest }) {
  const { role, setRole, mysig, setSignature, online } = useHub();
  const { profile, signOut } = useAuth();
  const toast = useToast();
  const sigInput = useRef(null);
  const sigUrl = useFileUrl(mysig);
  const [menu, setMenu] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu on an outside click or Esc.
  useEffect(() => {
    if (!menu) return;
    const down = (e) => !menuRef.current?.contains(e.target) && !e.target.closest?.(".picker-panel") && setMenu(false);
    const key = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  async function uploadSig(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const [r] = await saveFiles([f]);
      setSignature(role, r.id);
      toast(online ? "Your signature is saved." : `Signature saved for ${lbl(role)}.`, "success");
    } catch (err) {
      toast(err.message || "Could not save your signature. Use a PNG or JPG under 20 MB.", "error");
    }
  }

  // Online: the signed-in person. This-browser mode has no accounts, so the menu names the mode and the role sets the initials.
  const name = online ? profile?.full_name || profile?.email : "This browser only";
  const initials = ((online ? name : lbl(role)) || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="relative z-40 text-white">
      <Letterhead>
        <div className="flex w-full items-center gap-3">
        {/* Large, bold white type only: small white text on this blue is too faint to read. */}
        <div className="hidden min-w-0 md:block">
          <div className="truncate text-xl leading-tight font-bold lg:text-2xl">Protection without Borders</div>
          <span className="mt-1 inline-flex rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-brand-700">Organization Hub</span>
        </div>
        <span className="flex-1" />

        {!online && (
          // This-browser mode: pick which role you are acting as.
          <div className="hidden w-56 sm:block">
            <Select variant="onDark" aria-label="Viewing as" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          </div>
        )}

        {role !== "Staff" && (
          <button
            type="button"
            onClick={onNewRequest}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-white/50"
          >
            <Icon name="plus" className="size-4" />
            <span className="hidden sm:inline">New purchase request</span>
            <span className="sm:hidden">New request</span>
          </button>
        )}

        {/* Account menu: who you are, your signature, theme, sign out. */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Your account"
            className="flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 pl-1 transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/40"
          >
            <span className="grid size-10 place-items-center rounded-full bg-white text-sm font-bold text-brand-700 ring-2 ring-sun-400">{initials}</span>
            <svg viewBox="0 0 20 20" className={`size-4 text-white transition-transform ${menu ? "rotate-180" : ""}`} aria-hidden="true">
              <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {menu && (
            <div
              role="menu"
              className="picker-panel absolute right-0 z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-line bg-white text-ink-800 shadow-[0_18px_40px_-12px_rgba(11,58,83,0.45)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <div className="border-b border-line px-4 py-3 dark:border-slate-800">
                <div className="truncate font-medium text-ink-900 dark:text-white">{name}</div>
                {online && <div className="truncate text-xs text-ink-500">{profile?.email}</div>}
                <div className="mt-1.5 inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  {lbl(role)}
                  {profile?.is_admin && " · Admin"}
                </div>
              </div>

              {!online && (
                <div className="border-b border-line p-3 sm:hidden dark:border-slate-800">
                  <div className="mb-1.5 text-xs text-ink-500">Viewing as</div>
                  <Select aria-label="Viewing as" value={role} onChange={setRole} options={ROLE_OPTIONS} />
                </div>
              )}

              <div className="border-b border-line p-3 dark:border-slate-800">
                <div className="mb-2 text-xs text-ink-500">Your signature</div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 flex-1 place-items-center rounded-lg border border-dashed border-ink-300 bg-paper dark:bg-slate-800">
                    {sigUrl ? <img src={sigUrl} alt="Your signature" className="max-h-10" /> : <span className="text-xs text-ink-400">Not uploaded yet</span>}
                  </div>
                  <button type="button" role="menuitem" onClick={() => sigInput.current.click()} className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700">
                    {mysig ? "Change" : "Upload"}
                  </button>
                </div>
              </div>

              <div className="p-1.5">
                <button type="button" role="menuitem" onClick={onTheme} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-brand-50 dark:hover:bg-slate-800">
                  <Icon name={theme === "dark" ? "sun" : "moon"} className="size-4 text-ink-500" />
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                {online && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setChangingPw(true);
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-brand-50 dark:hover:bg-slate-800"
                  >
                    <Icon name="pen" className="size-4 text-ink-500" />
                    Change password
                  </button>
                )}
                {online && (
                  <button type="button" role="menuitem" onClick={signOut} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-700 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                    <Icon name="x" className="size-4" />
                    Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <input ref={sigInput} type="file" accept="image/*" hidden onChange={uploadSig} />
        </div>
      </Letterhead>
      <Modal open={changingPw} onClose={() => setChangingPw(false)} title="Change your password">
        {changingPw && (
          <PasswordForm
            onDone={() => {
              setChangingPw(false);
              toast("Your password is changed. Use it next time you sign in.", "success");
            }}
          />
        )}
      </Modal>
    </header>
  );
}
