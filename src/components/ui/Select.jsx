import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const cx = (...c) => c.filter(Boolean).join(" ");

// options: strings, or { value, label, hint?, group? }. Long lists (more than 8) get a search box.
const norm = (o) => (typeof o === "object" && o !== null ? { label: String(o.value), ...o } : { value: o, label: String(o) });

function Chevron({ open }) {
  return (
    <svg viewBox="0 0 20 20" className={cx("size-4 shrink-0 text-ink-400 transition-transform duration-200", open && "rotate-180 text-brand-600")} aria-hidden="true">
      <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Tick() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-brand-600" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A styled dropdown that replaces the browser's <select>.
 * Keyboard: ↑ ↓ to move, Enter to choose, Esc to close, type letters to jump (or to search on long lists).
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  id,
  size = "md",
  variant = "field",
  searchable,
  className,
  disabled,
  "aria-label": ariaLabel,
}) {
  const opts = useMemo(() => options.map(norm), [options]);
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const search = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const withSearch = searchable ?? opts.length > 8;
  const selected = opts.find((o) => String(o.value) === String(value ?? ""));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? opts.filter((o) => `${o.label} ${o.hint || ""}`.toLowerCase().includes(q)) : opts;
  }, [opts, query]);

  // Open below the trigger, or above it when there is not enough room; follows scrolling.
  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const want = Math.min(320, 52 + shown.length * 44 + (withSearch ? 52 : 0));
    const below = window.innerHeight - r.bottom - 12;
    const up = below < Math.min(want, 220) && r.top > below;
    const width = Math.max(r.width, 240);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left: Math.max(8, left), width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, maxHeight: Math.max(160, (up ? r.top : below) - 12), up });
  }, [shown.length, withSearch]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onDown = (e) => {
      if (!panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, place]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, opts.findIndex((o) => String(o.value) === String(value ?? ""))));
    setOpen(true);
  }
  // Move focus into the list once it is on screen (it appears after its position is measured).
  const shownNow = open && !!pos;
  useEffect(() => {
    if (shownNow) (withSearch ? search.current : panel.current)?.focus({ preventScroll: true });
  }, [shownNow, withSearch]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(o) {
    if (!o) return;
    onChange?.(o.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home" && !withSearch) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && !withSearch) {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (!withSearch && e.key.length === 1) {
      // Jump to the first option starting with the typed letters.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  // Inside a modal dialog the list must live in the dialog's layer to appear above it.
  const host = open ? trigger.current?.closest("dialog") || document.body : null;
  const dark = variant === "onDark";

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (open) return onKey(e);
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
        className={cx(
          "group flex w-full cursor-pointer items-center gap-2 rounded-lg border text-left transition outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "min-h-8 px-2.5 py-1 text-[13px]" : "min-h-10 px-3 py-2 text-sm",
          dark
            ? "border-white bg-white text-ink-800 shadow-sm hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-white/50"
            : cx(
                "border-line bg-white text-ink-800 hover:border-brand-400 focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/15",
                "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                open && "border-brand-500 ring-4 ring-brand-500/15"
              ),
          className
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", !selected && "text-ink-400")}>{selected ? selected.label : placeholder}</span>
        <Chevron open={open} />
      </button>

      {open &&
        pos &&
        host &&
        createPortal(
          <div
            ref={panel}
            tabIndex={-1}
            onKeyDown={onKey}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, zIndex: 80 }}
            className={cx(
              "picker-panel flex flex-col overflow-hidden rounded-xl border border-line bg-white text-ink-800 shadow-[0_18px_40px_-12px_rgba(11,58,83,0.35)] outline-none",
              "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
              pos.up ? "origin-bottom" : "origin-top"
            )}
          >
            {withSearch && (
              <div className="border-b border-line p-2 dark:border-slate-800">
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Search…"
                  aria-label="Search options"
                  aria-controls={listId}
                  className="w-full rounded-md bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/30 dark:bg-slate-800"
                />
              </div>
            )}
            <ul id={listId} role="listbox" aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined} className="overflow-y-auto overscroll-contain p-1.5">
              {shown.map((o, i) => {
                const isSel = String(o.value) === String(value ?? "");
                const showGroup = o.group && o.group !== shown[i - 1]?.group;
                return (
                  <li key={`${o.value}-${i}`} role="presentation">
                    {showGroup && <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-ink-400">{o.group}</div>}
                    <div
                      id={`${listId}-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={isSel}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={cx(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                        i === active ? "bg-brand-50 dark:bg-brand-900/40" : "",
                        isSel && "font-medium text-brand-700 dark:text-brand-200"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && <span className="mt-0.5 block text-xs font-normal text-ink-500 dark:text-slate-400">{o.hint}</span>}
                      </span>
                      <span className="mt-0.5 w-4">{isSel && <Tick />}</span>
                    </div>
                  </li>
                );
              })}
              {!shown.length && <li className="px-3 py-6 text-center text-sm text-ink-400">No match for “{query}”</li>}
            </ul>
          </div>,
          host
        )}
    </>
  );
}
