import Logo from "./Logo";
import { useHub } from "../lib/store";
import { ED_LIMIT, money } from "../lib/logic";

export default function Footer({ onTab, visible }) {
  const year = new Date().getFullYear();
  const { online } = useHub();
  return (
    <footer className="mt-16 border-t border-line bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-slate-400">
            The Organization Hub: one place for every team to raise purchase requests, approve and sign documents, and keep staff records.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Workspace</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onTab(t.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="cursor-pointer text-ink-500 transition hover:translate-x-0.5 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300"
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Contact</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-500 dark:text-slate-400">
            <li>
              <a className="transition hover:text-brand-700 dark:hover:text-brand-300" href="mailto:Protectionwithoutborders@gmail.com">
                Protectionwithoutborders@gmail.com
              </a>
            </li>
            <li>
              <a className="transition hover:text-brand-600 dark:hover:text-brand-300" href="mailto:procurement@powib.org.ng">
                procurement@powib.org.ng
              </a>
            </li>
            <li>Requests and POs from {money(ED_LIMIT)} need ED sign-off.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-ink-500 sm:px-6 dark:text-slate-400">
          <span>© {year} POWIB. All rights reserved.</span>
          <span>{online ? "Records and files are stored securely online." : "Records and files are saved in this browser."}</span>
        </div>
      </div>
    </footer>
  );
}
