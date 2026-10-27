import { useState } from "react";
import { useHub } from "../../lib/store";
import { STAGES } from "../../lib/logic";
import { Button, Empty, Icon, SectionTitle, cx } from "../ui";
import RequestCard from "./RequestCard";
import SheetViewer from "./SheetViewer";
import TemplatesPanel from "./TemplatesPanel";
import useRequestActions from "./useRequestActions";
import NewRFPModal from "../finance/NewRFPModal";

export default function Procurement({ onNewRequest }) {
  const { requests } = useHub();
  const actions = useRequestActions();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState(null);
  const [rfpFor, setRfpFor] = useState(null);

  const query = q.trim().toLowerCase();
  const rows = requests
    .filter((x) => filter === "all" || x.stage === filter)
    .filter((x) => !query || [x.no, x.item, x.dept, x.by, x.po, x.vendor].some((v) => String(v || "").toLowerCase().includes(query)))
    .slice()
    .reverse();
  const pipe = [["all", "All", requests.length], ...STAGES.slice(0, 6).map((s) => [s, s, requests.filter((x) => x.stage === s).length])];

  return (
    <section>
      <SectionTitle
        title="Procurement"
        subtitle="Purchase requests from approval to payment."
        action={
          <Button variant="primary" onClick={onNewRequest}>
            <Icon name="plus" className="size-4" /> New purchase request
          </Button>
        }
      />
      <TemplatesPanel />

      <div className="mb-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:grid-cols-7 dark:border-slate-800 dark:bg-slate-900">
        {pipe.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={cx(
              "cursor-pointer border-r border-b border-line px-2 py-3 text-center transition sm:border-b-0 dark:border-slate-800",
              filter === k ? "bg-brand-600 text-white" : "hover:bg-brand-50 dark:hover:bg-slate-800"
            )}
          >
            <b className="block text-xl font-bold sm:text-2xl">{n}</b>
            <span className={cx("text-[11px] sm:text-xs", filter === k ? "text-white/85" : "text-ink-500 dark:text-slate-400")}>{label}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-5">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by number, item, department, requester or vendor"
          className="input pl-9"
          aria-label="Search requests"
        />
      </div>

      {rows.length ? (
        <div className="space-y-4">
          {rows.map((x, i) => (
            <RequestCard key={x.id} x={x} actions={actions} onView={(r) => setViewId(r.id)} onRaiseRFP={(r) => setRfpFor(r.id)} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} />
          ))}
        </div>
      ) : (
        <Empty>{requests.length ? "No requests match." : "Nothing here yet. Start with a new purchase request."}</Empty>
      )}

      {rfpFor && <NewRFPModal open requestId={rfpFor} onClose={() => setRfpFor(null)} />}
      <SheetViewer x={requests.find((r) => r.id === viewId)} onClose={() => setViewId(null)} actions={actions} />
    </section>
  );
}
