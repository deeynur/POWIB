import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { docNo, money, stamp, uid } from "../../lib/logic";
import { openFile, saveFiles } from "../../lib/files";
import { readPR } from "../../lib/excel";
import { Button, Field, Meta, Modal } from "../ui";
import { useToast } from "../ui/Toast";

// New purchase request: read the filled PR template and attach BOQ / TOR / other files.
export default function NewRequestModal({ open, onClose }) {
  const { requests, templates, put } = useHub();
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const pr = useRef(null);
  const boq = useRef(null);
  const tor = useRef(null);
  const other = useRef(null);

  const dupOf = (n) => {
    n = (n || "").trim().toLowerCase();
    return n ? requests.find((x) => (x.no || "").trim().toLowerCase() === n) : null;
  };

  function close() {
    setDraft(null);
    setInfo(null);
    onClose();
  }

  async function onPR(e) {
    setDraft(null);
    setInfo(null);
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await readPR(await f.arrayBuffer());
      if (!r.no) return setInfo({ bad: true, text: "The PSR N° (cell O2) is empty." });
      const d = dupOf(r.no);
      if (d) return setInfo({ bad: true, text: `Duplicate: ${r.no} is already used by "${d.item}".` });
      setDraft(r);
      setInfo({ text: `${r.no} · ${r.by} · ${money(r.est)}`, sub: r.item });
    } catch {
      setInfo({ bad: true, text: "Could not read this file. Use the PR template (.xlsx)." });
    }
  }

  async function submit() {
    const f = pr.current.files[0];
    if (!f || !draft) return toast("Choose a filled PR template with a unique PSR number.", "error");
    if (dupOf(draft.no)) return toast("This PSR number is already used.", "error");
    setBusy(true);
    try {
      const d = draft;
      const n = {
        id: uid(),
        no: d.no,
        donor: d.donor,
        item: d.item,
        dept: d.dept,
        by: d.by || "Unknown",
        est: d.est,
        why: d.why,
        desired: d.desired,
        stage: "Requested",
        appr: [],
        log: [`Requested by ${d.by || "Unknown"} (${stamp()})`],
      };
      const num = (list, t) => list.map((q, j) => ({ ...q, no: docNo(n.no, t) + (list.length > 1 ? "-" + (j + 1) : "") }));
      const [p, b, t, o] = await Promise.all([pr, boq, tor, other].map((r) => saveFiles(r.current.files)));
      n.prf = p[0];
      if (b.length) n.boq = num(b, "BOQ");
      if (t.length) n.tor = num(t, "TOR");
      if (o.length) n.files = o;
      put("requests", n);
      toast(`${n.no} submitted for approval.`, "success");
      close();
    } catch (e) {
      toast(e.message || "Upload failed. Files must be under 20 MB.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="New purchase request">
      <div className="space-y-4">
        {templates.pr ? (
          <Meta>
            Fill in the{" "}
            <button type="button" className="cursor-pointer font-medium text-brand-600 underline-offset-2 hover:underline" onClick={() => openFile(templates.pr)}>
              PR template ({templates.pr.name})
            </button>{" "}
            and attach it below.
          </Meta>
        ) : (
          <Meta>Upload a PR template in Procurement so requesters can download it.</Meta>
        )}
        <Field label="Filled PR template (Excel)">
          <input ref={pr} type="file" accept=".xlsx" className="input" onChange={onPR} />
        </Field>
        {info && (
          <div className={`animate-fade-up rounded-lg px-3 py-2 text-sm ${info.bad ? "bg-red-50 font-medium text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"}`}>
            {info.text}
            {info.sub && <div className="text-xs opacity-80">{info.sub}</div>}
          </div>
        )}
        <Field label="BOQ (optional)">
          <input ref={boq} type="file" multiple className="input" />
        </Field>
        <Field label="TOR (optional)">
          <input ref={tor} type="file" multiple className="input" />
        </Field>
        <Field label="Other attachments (optional)">
          <input ref={other} type="file" multiple className="input" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
