import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { money } from "../../lib/logic";
import { openFile, saveFiles } from "../../lib/files";
import { PAY_STAGES, payNeeds, paymentsXlsx } from "../../lib/payments";
import { Button, Card, Empty, Icon, Meta, SectionTitle, cx } from "../ui";
import { useToast } from "../ui/Toast";
import NewRFPModal from "./NewRFPModal";
import PaymentCard from "./PaymentCard";
import PaymentViewer from "./PaymentViewer";
import usePaymentActions from "./usePaymentActions";

function Templates() {
  const { role, templates, setSettings } = useHub();
  const toast = useToast();
  const input = useRef(null);
  const [kind, setKind] = useState(null);
  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f || !kind) return;
    try {
      const [r] = await saveFiles([f]);
      setSettings({ templates: { ...templates, [kind]: r } });
      toast(`${kind.toUpperCase()} template uploaded.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }
  const link = (k, label) =>
    templates[k] ? (
      <button type="button" onClick={() => openFile(templates[k])} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 dark:text-brand-300">
        <Icon name="download" className="size-4" /> {label}: {templates[k].name}
      </button>
    ) : (
      <Meta>No {label} uploaded yet</Meta>
    );
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-ink-900 dark:text-white">Templates</h3>
          <div>{link("rfp", "RFP template")}</div>
          <div>{link("pv", "PV template")}</div>
        </div>
        {role === "Finance" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { setKind("rfp"); input.current.click(); }}>Upload RFP template</Button>
            <Button size="sm" onClick={() => { setKind("pv"); input.current.click(); }}>Upload PV template</Button>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={onFile} />
    </Card>
  );
}

export default function Finance() {
  const { payments, role } = useHub();
  const actions = usePaymentActions();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [view, setView] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const month = new Date().toISOString().slice(0, 7);
  const mine = payments.filter((p) => payNeeds(p).includes(role));
  const inApproval = payments.filter((p) => p.stage === "RFP pending" || p.stage === "PV pending");
  const toPay = payments.filter((p) => p.stage === "PV approved");
  const paidMonth = payments.filter((p) => p.stage === "Paid" && (p.paid?.date || "").startsWith(month));

  const query = q.trim().toLowerCase();
  const rows = payments
    .filter((p) => filter === "all" || (filter === "mine" ? payNeeds(p).includes(role) : p.stage === filter))
    .filter((p) => !query || [p.ref, p.purpose, p.requester, p.requestNo, p.pv?.no, p.pv?.payee, p.grant].some((v) => String(v || "").toLowerCase().includes(query)))
    .slice()
    .reverse();
  const viewing = view && payments.find((p) => p.id === view.id);

  const stats = [
    { label: "Waiting for you", value: mine.length, icon: "pen", f: "mine" },
    { label: "In approval", value: inApproval.length, icon: "clock", f: "all" },
    { label: "Approved, to pay", value: `${toPay.length} · ${money(toPay.reduce((t, p) => t + (+p.pv?.net || 0), 0))}`, icon: "wallet", f: "PV approved" },
    { label: "Paid this month", value: money(paidMonth.reduce((t, p) => t + (+p.pv?.net || +p.amount || 0), 0)), icon: "check", f: "Paid" },
  ];

  return (
    <section>
      <SectionTitle
        title="Finance"
        subtitle="Requests for payment (RFP) and payment vouchers (PV), from request to payment."
        action={
          <div className="flex flex-wrap gap-2">
            {role === "Finance" && payments.length > 0 && (
              <Button onClick={() => paymentsXlsx(payments).catch((e) => toast(String(e.message || e), "error"))}>
                <Icon name="download" className="size-4" /> Export payments
              </Button>
            )}
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Icon name="plus" className="size-4" /> New RFP
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setFilter(s.f)}
            style={{ animationDelay: `${i * 50}ms` }}
            className="group cursor-pointer rounded-xl border border-line bg-white p-5 text-left transition hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-300">
              <Icon name={s.icon} className="size-5" />
            </div>
            <div className="tabular mt-4 text-xl font-semibold text-ink-900 sm:text-2xl dark:text-white">{s.value}</div>
            <div className="mt-1 text-sm text-ink-500 dark:text-slate-400">{s.label}</div>
          </button>
        ))}
      </div>

      <Templates />

      <div className="mb-4 flex flex-wrap gap-2">
        {[["all", "All", payments.length], ["mine", "Waiting for me", mine.length], ...PAY_STAGES.map((s) => [s, s, payments.filter((p) => p.stage === s).length])].map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={cx(
              "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition",
              filter === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-700 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            )}
          >
            {label} <span className="opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-5">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
        <input type="search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by RFP ref, purpose, requester, PV no, payee or grant" aria-label="Search payments" />
      </div>

      {rows.length ? (
        <div className="space-y-4">
          {rows.map((p, i) => (
            <PaymentCard key={p.id} p={p} actions={actions} onView={(x, kind) => setView({ id: x.id, kind })} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} />
          ))}
        </div>
      ) : (
        <Empty icon="wallet">{payments.length ? "No payments match." : "No payments yet. Raise a request for payment with New RFP."}</Empty>
      )}

      {newOpen && <NewRFPModal open onClose={() => setNewOpen(false)} />}
      {viewing && <PaymentViewer key={viewing.id + view.kind} p={viewing} initial={view.kind} onClose={() => setView(null)} actions={actions} />}
    </section>
  );
}
