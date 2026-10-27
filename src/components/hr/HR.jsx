import { useState } from "react";
import { useHub } from "../../lib/store";
import { CONTRACT_WARN_DAYS, hrAlerts, monthLabel } from "../../lib/hr";
import { Icon, SectionTitle, cx } from "../ui";
import Staff from "./Staff";
import Timesheets from "./Timesheets";
import Appraisals from "./Appraisals";
import Leave from "./Leave";
import { leaveNeeds } from "../../lib/leave";

const SECTIONS = [
  { id: "staff", label: "Staff & contracts", icon: "users" },
  { id: "ts", label: "Timesheets", icon: "clock" },
  { id: "appr", label: "Appraisals", icon: "check" },
  { id: "leave", label: "Leave", icon: "doc" },
];

export default function HR() {
  const hub = useHub();
  const a = hrAlerts(hub);
  const pendingLeave = hub.hrleave.filter((l) => leaveNeeds(l) === hub.role).length;
  const [section, setSection] = useState("staff");

  const stats = [
    { label: "Staff on contract", value: a.active.length, icon: "users", go: "staff" },
    { label: `Contracts expired or ending in ${CONTRACT_WARN_DAYS} days`, value: a.ending.length, icon: "clock", go: "staff", warn: a.ending.length },
    { label: `Timesheets missing for ${monthLabel(a.due)}`, value: a.missingTs.length, icon: "doc", go: "ts", warn: a.missingTs.length },
    { label: "Appraisals due", value: a.appraisalsDue.length, icon: "check", go: "appr", warn: a.appraisalsDue.length },
  ];
  const badge = { ts: a.missingTs.length + a.toApproveTs.length, appr: a.appraisalsDue.length + a.toReview.length, leave: pendingLeave };

  return (
    <section>
      <SectionTitle title="HR" subtitle="Staff contracts, monthly timesheets, appraisals and leave." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSection(s.go)}
            style={{ animationDelay: `${i * 50}ms` }}
            className="group cursor-pointer rounded-xl border border-line bg-white p-5 text-left transition hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className={cx("grid size-10 place-items-center rounded-xl transition", s.warn ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" : "bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-300")}>
              <Icon name={s.icon} className="size-5" />
            </div>
            <div className="tabular mt-4 text-2xl font-semibold text-ink-900 sm:text-3xl dark:text-white">{s.value}</div>
            <div className="mt-1 text-sm text-ink-500 dark:text-slate-400">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 dark:border-slate-800 dark:bg-slate-900" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cx(
              "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              section === s.id ? "bg-brand-600 text-white shadow-sm" : "text-ink-700 hover:bg-ink-900/5 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <Icon name={s.icon} className="size-4" />
            {s.label}
            {badge[s.id] > 0 && (
              <span className={cx("grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5 font-semibold", section === s.id ? "bg-white text-brand-700" : "bg-brand-500 text-white")}>
                {badge[s.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div key={section} className="animate-fade-up">
        {section === "staff" && <Staff />}
        {section === "ts" && <Timesheets />}
        {section === "appr" && <Appraisals />}
        {section === "leave" && <Leave />}
      </div>
    </section>
  );
}
