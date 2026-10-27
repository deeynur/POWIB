import { createContext, useCallback, useContext, useState } from "react";

// Toast notifications replace the old browser alert() pop-ups.
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

const TONE = {
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  info: "border-brand-200 bg-white text-ink-800 dark:border-brand-800 dark:bg-slate-900 dark:text-slate-100",
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((msg, tone = "info") => {
    const id = Math.random();
    setItems((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`animate-pop pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${TONE[t.tone]}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
