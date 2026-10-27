import { Icon, cx } from "./ui";

export const TABS = [
  { id: "dash", label: "Dashboard", icon: "grid" },
  { id: "proc", label: "Procurement", icon: "cart" },
  { id: "fin", label: "Finance", icon: "wallet" },
  { id: "vendors", label: "Vendors", icon: "store" },
  { id: "docs", label: "Documents", icon: "doc" },
  { id: "hr", label: "HR", icon: "users", roles: ["HR", "ED"] },
  { id: "me", label: "My HR", icon: "clock", online: true },
  { id: "team", label: "Team", icon: "users", admin: true },
];

// Tabs a person sees. Staff accounts only get My HR; My HR and Team need the online Hub.
export function visibleTabs(role, { online, admin } = {}) {
  if (online && role === "Staff") return TABS.filter((t) => t.id === "me" || (t.admin && admin));
  return TABS.filter((t) => (!t.roles || t.roles.includes(role)) && (!t.online || online) && (!t.admin || (online && admin)));
}

export default function NavTabs({ tab, onTab, badges, visible }) {
  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 [scrollbar-width:none]" role="tablist">
        {visible.map((t) => {
          const on = t.id === tab;
          const n = badges[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTab(t.id)}
              className={cx(
                "relative flex shrink-0 cursor-pointer items-center gap-2 px-3 py-4 text-sm font-medium transition sm:px-4",
                on ? "text-brand-700 dark:text-brand-300" : "text-ink-500 hover:text-ink-900 dark:text-slate-400 dark:hover:text-white"
              )}
            >
              <Icon name={t.icon} className="size-4" />
              {t.label}
              {n > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] leading-5 font-semibold text-white">
                  {n}
                </span>
              )}
              <span
                className={cx(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500 transition-transform duration-300",
                  on ? "scale-x-100" : "scale-x-0"
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
