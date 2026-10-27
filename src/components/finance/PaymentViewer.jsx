import { useState } from "react";
import { useHub } from "../../lib/store";
import { getUrl } from "../../lib/files";
import { sheetMatching } from "../../lib/excel";
import { SHEET, nextStep, paymentMarks } from "../../lib/payments";
import { Button, Field, Modal, cx } from "../ui";
import SheetPreview from "../SheetPreview";

// Shows the signed RFP or PV form, with Sign / Reject for whoever is next.
export default function PaymentViewer({ p, initial = "rfp", onClose, actions }) {
  const { role } = useHub();
  const [kind, setKind] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (!p) return null;

  const step = nextStep(p);
  const canSign = step && step.kind === kind && step.role === role;
  const file = kind === "rfp" ? p.rfpFile : p.pv?.file;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${p.ref} · ${kind === "rfp" ? "Request for payment" : `Payment voucher ${p.pv?.no || ""}`}`}
      actions={
        <>
          {canSign && !rejecting && (
            <>
              <Button variant="primary" onClick={() => actions.approve(p) && onClose()}>
                Sign as {step.label.toLowerCase()}
              </Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
            </>
          )}
          {file && <Button onClick={() => actions.download(kind, p)}>Download</Button>}
        </>
      }
    >
      {p.pv && (
        <div className="mb-4 inline-flex rounded-lg border border-line p-1 dark:border-slate-700" role="tablist">
          {["rfp", "pv"].map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => { setKind(k); setRejecting(false); }}
              className={cx("cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition", kind === k ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-900/5 dark:text-slate-300 dark:hover:bg-slate-800")}
            >
              {k === "rfp" ? "RFP" : "Payment voucher"}
            </button>
          ))}
        </div>
      )}
      {rejecting && (
        <div className="animate-fade-up mb-4 rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/40">
          <Field label={kind === "pv" ? "Reason (the PV goes back to Finance to correct)" : "Reason for rejecting (optional)"}>
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={() => { actions.reject(p, reason.trim()); onClose(); }}>Confirm reject</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <SheetPreview
        key={kind}
        file={file}
        pick={(wb) => sheetMatching(wb, SHEET[kind])}
        marks={(ws) => paymentMarks(ws, kind, p, getUrl)}
        reloadKey={JSON.stringify([kind, p.sigs, p.dates])}
      />
    </Modal>
  );
}
