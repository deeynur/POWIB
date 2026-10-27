import { useState } from "react";
import { useHub } from "../../lib/store";
import { canApprove, fd } from "../../lib/logic";
import { getUrl } from "../../lib/files";
import { signSlots } from "../../lib/excel";
import { Button, Field, Modal } from "../ui";
import SheetPreview from "../SheetPreview";

// Shows the attached PR or PO spreadsheet, with Approve / Reject for whoever is next.
export default function SheetViewer({ x, onClose, actions }) {
  const { role } = useHub();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (!x) return <Modal open={false} onClose={onClose} />;

  const po = x.stage === "PO pending";
  const kind = po ? "po" : "pr";
  const file = po ? x.pof : x.prf;
  const can = canApprove(x, role);

  // Approval dates and signatures go into the template's own sign-off boxes.
  async function marks(ws) {
    const m = {};
    for (const s of signSlots(ws, kind, x)) {
      if (x.dates?.[s.key] && s.dateRow) m[`${s.dateRow}_${s.col}`] = { text: fd(x.dates[s.key]) };
      if (x.sigs?.[s.key]) m[`${s.sigRow}_${s.col}`] = { text: "", img: await getUrl(x.sigs[s.key]).catch(() => null) };
    }
    return m;
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${po ? x.po : x.no} · ${x.item}`}
      actions={
        <>
          {can && !rejecting && (
            <>
              <Button variant="primary" onClick={() => actions.approve(x) && onClose()}>Approve</Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
            </>
          )}
          {file && <Button onClick={() => actions.downloadForm(kind, x)}>Download</Button>}
        </>
      }
    >
      {rejecting && (
        <div className="animate-fade-up mb-4 rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/40">
          <Field label="Reason for rejecting (optional)">
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={() => { actions.reject(x, reason.trim()); onClose(); }}>Confirm reject</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <SheetPreview
        file={file}
        pick={(wb) => wb.getWorksheet(po ? "PO" : "PR") || wb.worksheets[0]}
        marks={marks}
        reloadKey={JSON.stringify([kind, x.sigs, x.dates])}
      />
    </Modal>
  );
}
