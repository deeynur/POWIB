import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { openFile, saveFiles } from "../../lib/files";
import { exportRegister, exportZip, filterForExport } from "../../lib/exports";
import { Button, Card, Checkbox, Icon, Meta, Select } from "../ui";
import { useToast } from "../ui/Toast";

export default function TemplatesPanel() {
  const { role, requests, templates, setSettings } = useHub();
  const toast = useToast();
  const input = useRef(null);
  const [kind, setKind] = useState(null);
  const [ex, setEx] = useState({ status: "all", from: "", to: "", sigs: true });
  const [zipMsg, setZipMsg] = useState("");

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

  async function zip() {
    const list = filterForExport(requests, ex);
    if (!list.length) return toast("No requests match these filters.", "error");
    try {
      const errs = await exportZip(list, ex.sigs, (i, n) => setZipMsg(`Packing ${i} of ${n}…`));
      if (errs) toast("Some files could not be added. See errors.txt in the ZIP.", "error");
    } catch (e) {
      toast("Could not export: " + (e?.message || e), "error");
    } finally {
      setZipMsg("");
    }
  }

  const link = (k, label) =>
    templates[k] ? (
      <button type="button" onClick={() => openFile(templates[k])} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600 transition hover:text-brand-800 dark:text-brand-300">
        <Icon name="download" className="size-4" />
        {label}: {templates[k].name}
      </button>
    ) : (
      <Meta>No {label.replace(" template", "")} template uploaded yet</Meta>
    );

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-ink-900 dark:text-white">Templates</h3>
          <div>{link("pr", "PR template")}</div>
          <div>{link("po", "PO template")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setKind("pr"); input.current.click(); }}>Upload PR template</Button>
          <Button size="sm" onClick={() => { setKind("po"); input.current.click(); }}>Upload PO template</Button>
        </div>
      </div>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={onFile} />

      {role === "Logistics" && (
        <div className="mt-5 border-t border-line pt-5 dark:border-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Export records</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              aria-label="Which requests"
              value={ex.status}
              onChange={(v) => setEx({ ...ex, status: v })}
              options={[
                { value: "all", label: "All requests" },
                { value: "done", label: "Completed (paid)" },
                { value: "open", label: "Still open" },
              ]}
            />
            <input type="date" className="input" value={ex.from} onChange={(e) => setEx({ ...ex, from: e.target.value })} aria-label="From date" />
            <input type="date" className="input" value={ex.to} onChange={(e) => setEx({ ...ex, to: e.target.value })} aria-label="To date" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Checkbox label="Signatures in signed copies" checked={ex.sigs} onChange={(e) => setEx({ ...ex, sigs: e.target.checked })} />
            <div className="flex-1" />
            <Button size="sm" onClick={() => exportRegister(requests).catch((e) => toast(String(e.message || e), "error"))}>
              Export register (xlsx)
            </Button>
            <Button size="sm" variant="primary" onClick={zip} disabled={!!zipMsg}>
              {zipMsg || "Export everything (ZIP)"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
