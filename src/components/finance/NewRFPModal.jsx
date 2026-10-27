import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { lbl, money } from "../../lib/logic";
import { openFile } from "../../lib/files";
import { readRFP } from "../../lib/payments";
import { Button, Field, Meta, Modal, Select } from "../ui";
import usePaymentActions from "./usePaymentActions";

// Raise a Request for Payment from the filled RFP form, optionally for a purchase request.
export default function NewRFPModal({ open, onClose, requestId: initialRequest = "" }) {
  const { requests, payments, templates, role, mysig } = useHub();
  const actions = usePaymentActions();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [requestId, setRequestId] = useState(initialRequest);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const attRef = useRef(null);

  // Purchase requests that can still be paid and have no payment raised yet.
  const linked = new Set(payments.filter((p) => p.stage !== "Rejected").map((p) => p.requestId));
  const payable = requests.filter((r) => ["Ordered", "Received"].includes(r.stage) && !linked.has(r.id));
  const req = requests.find((r) => r.id === requestId);

  async function onFile(e) {
    setData(null);
    setErr("");
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = await readRFP(await f.arrayBuffer());
      if (!(d.amount > 0)) return setErr("The amount in figure is empty on this RFP.");
      setData(d);
    } catch {
      setErr("Could not read this file. Use the RFP template (.xlsx).");
    }
  }

  async function submit() {
    if (!data) return setErr("Choose the filled RFP form first.");
    setBusy(true);
    try {
      const p = await actions.create({ file: fileRef.current.files[0], data, attachments: attRef.current.files, requestId });
      if (p) close();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setData(null);
    setErr("");
    onClose();
  }

  const row = (label, value) =>
    value ? (
      <div className="flex gap-3">
        <dt className="w-32 shrink-0 text-ink-500">{label}</dt>
        <dd className="min-w-0 font-medium">{value}</dd>
      </div>
    ) : null;

  return (
    <Modal open={open} onClose={close} title="New request for payment (RFP)">
      <div className="space-y-4">
        {templates.rfp ? (
          <Meta>
            Fill in the{" "}
            <button type="button" className="cursor-pointer font-medium text-brand-600 hover:underline" onClick={() => openFile(templates.rfp)}>
              RFP template
            </button>{" "}
            and attach it below.
          </Meta>
        ) : (
          <Meta>Finance can upload the RFP template on the Finance tab so everyone can download it.</Meta>
        )}
        <Field label="Filled RFP form (Excel)">
          <input ref={fileRef} type="file" accept=".xlsx" className="input" onChange={onFile} />
        </Field>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{err}</p>}
        {data && (
          <dl className="animate-fade-up space-y-1 rounded-xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            {row("Requested by", data.requester)}
            {row("Amount", money(data.amount))}
            {row("In words", data.words)}
            {row("Purpose", data.purpose)}
            {row("Date of expense", data.expenseDate)}
            {row("Grant code", data.grant)}
            {row("Instructions", data.instructions)}
          </dl>
        )}
        <Field label="For a purchase request (optional)" hint="When this payment is made, the purchase request is marked paid too.">
          <Select
            value={requestId}
            onChange={setRequestId}
            options={[
              { value: "", label: "Not a purchase", hint: "Allowance, advance, training and other payments" },
              ...payable.map((r) => ({ value: r.id, label: r.no, hint: `${r.vendor || r.item} · ${money(r.amount || r.est)} · ${r.stage}` })),
            ]}
          />
        </Field>
        {req && data && Math.abs((req.amount || req.est) - data.amount) > 1 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            The RFP amount {money(data.amount)} differs from {req.po ? "the PO" : "the request"} ({money(req.amount || req.est)}).
          </p>
        )}
        <Field label="Supporting documents (optional)" hint="Invoice, receipts, attendance list, delivery note…">
          <input ref={attRef} type="file" multiple className="input" />
        </Field>
        <Meta className="text-xs">
          You sign the “Requested by” box as {lbl(role)}.{!mysig && " Upload your signature first with the My signature button at the top."}
        </Meta>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!data || busy}>
            {busy ? "Submitting…" : "Submit RFP"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
