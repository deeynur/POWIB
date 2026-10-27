import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { money, today } from "../../lib/logic";
import { openFile } from "../../lib/files";
import { STEPS, bankCheck, matchVendor, nextStep, payNeeds, sigKey, waitingText } from "../../lib/payments";
import { Button, Card, Field, FileLinks, Icon, Meta, Tag, cx, Select } from "../ui";

// Roles that see the payee's bank details.
const BANK_ROLES = ["Finance", "ED", "PM"];
const TONE = { "RFP pending": "Pending", "PV pending": "Pending", "RFP approved": "Approved", "PV approved": "Approved", Paid: "Paid", Rejected: "Rejected" };

// RFP requested → checked → approved → PV prepared → checked → approved → paid.
function Progress({ p }) {
  const dots = [
    ...STEPS.rfp.map((s) => ({ label: `RFP ${s.label.toLowerCase()}`, done: !!p.sigs?.[sigKey("rfp", s.key)] })),
    ...STEPS.pv.map((s) => ({ label: `PV ${s.label.toLowerCase()}`, done: !!p.sigs?.[sigKey("pv", s.key)] })),
    { label: "Paid", done: p.stage === "Paid" },
  ];
  const current = p.stage === "Rejected" ? -1 : dots.findIndex((d) => !d.done);
  return (
    <ol className="mt-4 flex items-center gap-1" aria-label="Progress">
      {dots.map((d, i) => (
        <li key={d.label} className="flex flex-1 items-center gap-1" title={d.label}>
          <span
            className={cx(
              "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold transition",
              d.done ? "bg-emerald-500 text-white" : i === current ? "bg-brand-500 text-white ring-4 ring-brand-500/20" : "bg-ink-900/10 text-ink-500 dark:bg-slate-700"
            )}
          >
            {d.done ? <Icon name="check" className="size-3" /> : i === 6 ? "₦" : i + 1}
          </span>
          {i < dots.length - 1 && <span className={cx("h-0.5 flex-1 rounded", d.done ? "bg-emerald-400" : "bg-ink-900/10 dark:bg-slate-700")} />}
        </li>
      ))}
    </ol>
  );
}

export default function PaymentCard({ p, actions, onView, style }) {
  const { role, vendors, templates } = useHub();
  const pvInput = useRef(null);
  const attInput = useRef(null);
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ date: today(), ref: "" });
  const step = nextStep(p);
  const mine = payNeeds(p).includes(role);
  const vendor = p.pv ? matchVendor(p.pv.payee, vendors) : null;
  const bank = p.pv ? bankCheck(p.pv, vendor) : null;
  const showBank = BANK_ROLES.includes(role);

  return (
    <Card accent={p.stage === "Rejected" ? "bad" : p.stage === "Paid" ? "ok" : mine ? "warn" : "brand"} style={style} className="hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-ink-900 dark:text-white">
          <span className="text-brand-600 dark:text-brand-300">{p.ref}</span> · {p.purpose || "Payment"}
        </h3>
        <Tag tone={TONE[p.stage]}>{p.stage}</Tag>
      </div>
      <Meta className="mt-1">
        {p.requester} · <b className="text-ink-800 dark:text-slate-100">{money(p.amount)}</b>
        {p.expenseDate && ` · expense ${p.expenseDate}`}
        {p.grant && ` · grant ${p.grant}`}
        {p.requestNo && ` · for ${p.requestNo}`}
      </Meta>

      {p.pv && (
        <div className="mt-3 rounded-xl bg-paper p-3 text-sm dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>PV {p.pv.no}</b> · {p.pv.payee}
            </span>
            {bank === "match" && <Tag tone="Approved">Bank matches vendor list</Tag>}
            {bank === "differs" && <Tag tone="Rejected">Bank differs from vendor list</Tag>}
          </div>
          <div className="mt-1 text-ink-700 dark:text-slate-300">
            Gross {money(p.pv.gross)}
            {p.pv.wht > 0 && ` · WHT ${money(p.pv.wht)}`}
            {p.pv.other > 0 && ` · other ${money(p.pv.other)}`} · <b>Net {money(p.pv.net)}</b>
          </div>
          {showBank && (p.pv.accountNo || p.pv.bankName) && (
            <div className="mt-1 text-ink-700 dark:text-slate-300">
              {p.pv.bankName} · {p.pv.accountNo}
              {bank === "differs" && vendor && <span className="text-red-600 dark:text-red-400"> (vendor list: {vendor.bankName} {vendor.accountNo})</span>}
            </div>
          )}
        </div>
      )}
      {p.paid && (
        <Meta className="mt-2">
          Paid on {p.paid.date}
          {p.paid.ref && ` · ref ${p.paid.ref}`}
        </Meta>
      )}

      <FileLinks files={p.files} />
      {p.stage !== "Rejected" && <Progress p={p} />}

      {paying && (
        <div className="animate-fade-up mt-4 grid gap-3 rounded-xl border border-brand-200 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-brand-800">
          <Field label="Payment date">
            <input type="date" className="input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
          </Field>
          <Field label="Transfer / cheque reference">
            <input className="input" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => { actions.markPaid(p, pay); setPaying(false); }} disabled={!pay.date}>Confirm paid</Button>
            <Button variant="ghost" onClick={() => setPaying(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {step && mine ? (
          <Button variant="primary" onClick={() => onView(p, step.kind)}>
            View &amp; sign {step.kind.toUpperCase()}
          </Button>
        ) : (
          <Button onClick={() => onView(p, "rfp")}>View RFP</Button>
        )}
        {p.pv && !(step && mine && step.kind === "pv") && <Button onClick={() => onView(p, "pv")}>View PV</Button>}
        {p.stage === "RFP approved" && role === "Finance" && (
          <>
            <Button variant="primary" onClick={() => pvInput.current.click()}>Upload PV (filled template)</Button>
            {templates.pv && (
              <Button size="sm" variant="ghost" onClick={() => openFile(templates.pv)}>
                <Icon name="download" className="size-4" /> PV template
              </Button>
            )}
          </>
        )}
        {p.stage === "PV approved" && role === "Finance" && !paying && (
          <Button variant="primary" onClick={() => setPaying(true)}>
            <Icon name="wallet" className="size-4" /> Mark as paid
          </Button>
        )}
        {!mine && waitingText(p) && <Meta>{waitingText(p)}</Meta>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => attInput.current.click()}>Attach file</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.download("rfp", p)}>Download RFP</Button>
        {p.pv && <Button size="sm" variant="ghost" onClick={() => actions.download("pv", p)}>Download PV</Button>}
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-1 border-t border-line pt-3 text-xs text-ink-500 dark:border-slate-800 dark:text-slate-400">
        {p.log.map((l, i) => (
          <li key={i}>
            {i > 0 && <span className="mx-1 text-brand-400">→</span>}
            {l}
          </li>
        ))}
      </ol>

      <input
        ref={pvInput}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files[0];
          e.target.value = "";
          if (f) actions.uploadPV(p, f);
        }}
      />
      <input
        ref={attInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const f = Array.from(e.target.files);
          e.target.value = "";
          if (f.length) actions.attach(p, f);
        }}
      />
    </Card>
  );
}
