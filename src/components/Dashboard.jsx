import { useHub } from "../lib/store";
import { amountOf, lbl, money } from "../lib/logic";
import { monthLabel } from "../lib/hr";
import { Card, Empty, Icon, Meta, SectionTitle, Tag, accentFor, cx } from "./ui";

function Stat({ value, label, icon, onClick, delay }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="group cursor-pointer rounded-xl border border-line bg-white p-5 text-left transition hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
    >
      <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-300">
        <Icon name={icon} className="size-5" />
      </div>
      <div className="tabular mt-4 text-2xl font-semibold text-ink-900 sm:text-3xl dark:text-white">{value}</div>
      <div className="mt-1 text-sm text-ink-500 dark:text-slate-400">{label}</div>
    </button>
  );
}

export default function Dashboard({ counts, onTab }) {
  const { role } = useHub();
  const { mine, act, pay, sign, open, leave, hr, canApprove, canProcess } = counts;
  const value = mine.reduce((t, x) => t + amountOf(x), 0);

  const stats = [
    canApprove && { value: mine.length, label: "Waiting for your approval", icon: "check", tab: "proc" },
    canProcess && { value: act.length, label: "Waiting for you to process", icon: "clock", tab: "proc" },
    ["PM", "Finance", "ED"].includes(role) && { value: pay.length, label: "Payments waiting for you", icon: "wallet", tab: "fin" },
    { value: sign.length, label: "Documents to sign", icon: "pen", tab: "docs" },
    role === "HR" && { value: leave.length, label: "Leave requests to approve", icon: "users", tab: "hr" },
    role === "HR" && { value: hr.missingTs.length, label: `Timesheets missing for ${monthLabel(hr.due)}`, icon: "clock", tab: "hr" },
    role === "HR" && { value: hr.appraisalsDue.length, label: "Appraisals due", icon: "check", tab: "hr" },
    ["HR", "ED"].includes(role) && { value: hr.ending.length, label: "Contracts expired or ending in 60 days", icon: "users", tab: "hr" },
    { value: open.length, label: "Open requests", icon: "cart", tab: "proc" },
    (role === "ED" || role === "Finance") && { value: money(value), label: "Value awaiting your approval", icon: "wallet", tab: "proc" },
  ].filter(Boolean);

  const items = [
    ...mine.concat(act).map((x) => ({ key: x.id, title: x.item, tag: x.stage, meta: `${x.dept} · ${money(amountOf(x))}`, tab: "proc" })),
    ...pay.map((p) => ({ key: p.id, title: `${p.ref} · ${p.purpose || "Payment"}`, tag: p.stage, meta: `${p.requester} · ${money(p.pv?.net || p.amount)}`, tab: "fin" })),
    ...sign.map((d) => ({ key: d.id, title: d.title, tag: "Sign document", meta: d.dept, tab: "docs" })),
    ...leave.map((l) => ({ key: l.id, title: `Leave · ${l.staffName}`, tag: "Pending", meta: `${l.from} to ${l.to} · ${l.days} days`, tab: "hr" })),
  ];

  return (
    <section>
      <SectionTitle title={`${lbl(role)} dashboard`} subtitle="What is waiting on you across the organization." />
      <div className={cx("grid gap-4 grid-cols-2 lg:grid-cols-4")}>
        {stats.map((s, i) => (
          <Stat key={s.label} {...s} delay={i * 50} onClick={() => onTab(s.tab)} />
        ))}
      </div>

      <h3 className="mt-10 mb-4 text-lg font-semibold text-ink-900 dark:text-white">Needs your attention</h3>
      {items.length ? (
        <div className="space-y-3">
          {items.map((it, i) => (
            <Card
              key={it.key}
              accent={accentFor(it.tag)}
              style={{ animationDelay: `${i * 40}ms` }}
              className="cursor-pointer hover:border-brand-300"
              onClick={() => onTab(it.tab)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="font-semibold text-ink-900 dark:text-white">{it.title}</b>
                <Tag tone={it.tag}>{it.tag}</Tag>
              </div>
              <Meta className="mt-1">{it.meta}</Meta>
            </Card>
          ))}
        </div>
      ) : (
        <Empty icon="check">Nothing is waiting for you.</Empty>
      )}
    </section>
  );
}
