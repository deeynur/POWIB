// POWIB (Protection without Borders) mark: a figure with a head and two leaf-shaped arms.
export function LogoMark({ className = "size-10", color = "#1D9EEF" }) {
  return (
    <svg viewBox="0 0 230 125" className={className} fill={color} role="img" aria-label="POWIB logo">
      <circle cx="122" cy="21" r="19" />
      <path d="M78 121C30 113 4 78 6 30c42 14 70 46 72 91z" />
      <path d="M106 112c5-41 54-68 118-72-15 42-60 69-118 72z" />
    </svg>
  );
}

// Mark plus name. `light` is for dark or blue backgrounds.
export default function Logo({ light = false, compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark className="h-10 w-auto shrink-0" color={light ? "#fff" : "#1D9EEF"} />
      <div className={`leading-tight ${compact ? "hidden sm:block" : ""}`}>
        <div className={`text-sm font-extrabold tracking-wide ${light ? "text-white" : "text-brand-600 dark:text-brand-300"}`}>
          Protection without Borders
        </div>
        {!compact && (
          <div className={`text-[11px] font-semibold tracking-[0.25em] ${light ? "text-white/75" : "text-ink-500 dark:text-slate-400"}`}>
            POWIB
          </div>
        )}
      </div>
    </div>
  );
}
