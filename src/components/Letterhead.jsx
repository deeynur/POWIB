import { useId } from "react";
import { LogoMark } from "./Logo";

// The POWIB letterhead's signature shape: a white "bell" rising from the page into the blue band,
// edged with the orange patterned border, holding the blue logo mark.
// It is drawn 3:1 (width:height) and sits on the bottom edge of its band, so it flows into the white page below.
export function Bell({ className = "", markScale = 0.5 }) {
  const id = useId().replace(/:/g, "");
  const edge = "M0 100 C 70 100 92 78 100 42 C 106 14 112 0 128 0 L172 0 C 188 0 194 14 200 42 C 208 78 230 100 300 100";
  return (
    <div className={`relative aspect-[3/1] ${className}`} aria-hidden="true">
      <svg viewBox="0 0 300 100" className="absolute inset-0 h-full w-full">
        <defs>
          {/* The letterhead edge: orange with faint white rings. */}
          <pattern id={`rings-${id}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <rect width="16" height="16" fill="#FAAA37" />
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
          </pattern>
        </defs>
        <path d={edge} fill="none" stroke={`url(#rings-${id})`} strokeWidth="20" />
        <path d={`${edge} Z`} fill="#fff" />
      </svg>
      <div className="absolute inset-x-0 bottom-[8%] flex justify-center" style={{ height: `${markScale * 100}%` }}>
        <LogoMark className="h-full w-auto" color="#1D9EEF" />
      </div>
    </div>
  );
}

// A blue band with the bell on the left. `size` sets the band height.
// The large version stacks on phones: name and email first, then the bell rising from the page below.
export default function Letterhead({ size = "sm", children, className = "" }) {
  const lg = size === "lg";
  if (lg)
    return (
      <div className={`relative overflow-hidden bg-band text-white ${className}`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pt-8 text-center sm:min-h-52 sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:pt-0 sm:text-left">
          <Bell className="h-24 shrink-0 sm:order-first sm:h-44" markScale={0.52} />
          <div className="order-first flex min-w-0 justify-center sm:order-none sm:flex-1 sm:self-center sm:justify-start sm:py-8">{children}</div>
        </div>
      </div>
    );
  return (
    <div className={`relative bg-band text-white ${className}`}>
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-end gap-4 px-4 sm:min-h-[84px] sm:gap-6 sm:px-6">
        <Bell className="h-[60px] shrink-0 self-end sm:h-[72px]" markScale={0.56} />
        <div className="flex min-w-0 flex-1 self-center py-3">{children}</div>
      </div>
    </div>
  );
}
