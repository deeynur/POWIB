import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import { getUrl, openFile } from "../../lib/files";
import { sl } from "../../lib/logic";
import { useToast } from "./Toast";

const cx = (...c) => c.filter(Boolean).join(" ");
export { cx };
export { default as Select } from "./Select";

const BTN = {
  primary:
    "bg-brand-600 text-white border-brand-600 hover:bg-brand-700 hover:border-brand-700",
  default:
    "bg-white text-ink-800 border-line hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:text-brand-300",
  danger:
    "bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:bg-slate-900 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950",
  ghost: "border-transparent text-ink-700 hover:bg-ink-900/5 hover:text-ink-900 dark:text-slate-300 dark:hover:bg-slate-800",
};

export function Button({ variant = "default", size = "md", className, ...p }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition duration-150",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN[variant],
        className
      )}
      {...p}
    />
  );
}

export function Card({ className, accent, children, ...p }) {
  // A coloured edge on the left gives the record's state: amber waiting, green done, red rejected, blue in progress.
  const bar = { warn: "before:bg-amber-500", bad: "before:bg-red-500", ok: "before:bg-emerald-600", brand: "before:bg-brand-500" }[accent];
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-xl border border-line bg-white p-5 transition duration-200",
        "dark:border-slate-800 dark:bg-slate-900",
        bar && "pl-6 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full",
        bar,
        className
      )}
      {...p}
    >
      {children}
    </div>
  );
}

const TAG = {
  Requested: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  "PO pending": "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  Pending: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  "Pending award": "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  Rejected: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Awarded: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
};
// Status tags carry a coloured dot as well as the word, so the state reads without relying on colour alone.
const DOT = { Rejected: "bg-red-500", Paid: "bg-emerald-500", Approved: "bg-emerald-500", Awarded: "bg-emerald-500" };
export function Tag({ tone, children }) {
  const dot = DOT[tone] || (TAG[tone] ? "bg-amber-500" : null);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TAG[tone] || "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800"
      )}
    >
      {dot && <span className={cx("size-1.5 rounded-full", dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const accentFor = (stage) =>
  ["Requested", "PO pending", "Pending", "Pending award"].includes(stage) ? "warn" : stage === "Rejected" ? "bad" : stage === "Paid" || stage === "Approved" || stage === "Awarded" ? "ok" : "brand";

export function Meta({ className, children }) {
  return <div className={cx("text-sm text-ink-500 dark:text-slate-400", className)}>{children}</div>;
}

export function Empty({ children, icon = "inbox" }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white/60 px-6 py-12 text-center dark:border-slate-800 dark:bg-transparent">
      <Icon name={icon} className="mx-auto mb-3 size-10 text-brand-300" />
      <p className="mx-auto max-w-sm text-sm text-ink-500 dark:text-slate-400">{children}</p>
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  const id = useId();
  const child = Array.isArray(children) ? children : [children];
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink-700 dark:text-slate-300">
          {label}
        </label>
      )}
      {child.map((c, i) => (i === 0 && isValidElement(c) ? cloneElement(c, { id, key: i }) : c))}
      {hint && <Meta className="text-xs">{hint}</Meta>}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold text-ink-900 sm:text-[28px] dark:text-white">{title}</h2>
        {subtitle && <Meta className="mt-1">{subtitle}</Meta>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, wide, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto max-h-[92vh] w-[min(480px,94vw)] overflow-visible rounded-2xl bg-transparent p-0 text-inherit",
        wide && "w-[min(1040px,96vw)]"
      )}
    >
      {open && (
        <div className="animate-pop flex max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_70px_-20px_rgba(7,42,61,0.45)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">{title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-900/5 hover:text-ink-700 dark:hover:bg-slate-800"
              >
                <Icon name="x" className="size-5" />
              </button>
            </div>
          </div>
          <div className="overflow-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function FileLinks({ files, label }) {
  const toast = useToast();
  if (!files?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => openFile(f).catch((e) => toast(e.message, "error"))}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-lg bg-ink-900/5 px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-brand-900/40 dark:hover:text-brand-200"
        >
          <Icon name="file" className="size-3.5 shrink-0 text-brand-500" />
          <span className="truncate">{label ? label(f) : f.no ? `${f.no} · ${f.name}` : f.name}</span>
        </button>
      ))}
    </div>
  );
}

export function useFileUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (id) getUrl(id).then((u) => live && setUrl(u)).catch(() => {});
    else setUrl(null);
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

function Sig({ id, name }) {
  const url = useFileUrl(id);
  return (
    <figure className="flex flex-col items-start gap-1">
      <div className="flex h-11 min-w-20 items-center justify-center rounded-lg border border-line bg-white px-2 dark:border-slate-700">
        {url && <img src={url} alt={`Signature: ${sl(name)}`} className="h-9" />}
      </div>
      <figcaption className="text-[11px] text-ink-500 dark:text-slate-400">{sl(name)}</figcaption>
    </figure>
  );
}

export function Signatures({ sigs }) {
  const k = Object.keys(sigs || {});
  if (!k.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {k.map((n) => (
        <Sig key={n} id={sigs[n]} name={n} />
      ))}
    </div>
  );
}

export function Checkbox({ label, ...p }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700 select-none dark:text-slate-300">
      <input type="checkbox" className="size-4 rounded accent-brand-600" {...p} />
      {label}
    </label>
  );
}

const PATHS = {
  inbox: "M3 13h4l2 3h6l2-3h4M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6M9 20h.01M17 20h.01",
  doc: "M8 3h7l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6M10 13h6M10 17h6",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  sun: "M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6L19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z",
  pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  store: "M4 9l1.5-5h13L20 9M4 9h16M4 9v1a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0V9M5 12v8h14v-8M10 20v-5h4v5",
  check: "M5 12l5 5 9-10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  wallet: "M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11M16 13h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
};
export function Icon({ name, className = "size-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
