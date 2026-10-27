import { useRef, useState } from "react";
import { useHub } from "../lib/store";
import { DEPARTMENTS, ROLES, lbl, today, uid } from "../lib/logic";
import { saveFiles } from "../lib/files";
import { Button, Card, Checkbox, Empty, Field, FileLinks, Meta, SectionTitle, Signatures, Tag, Select } from "./ui";
import { useToast } from "./ui/Toast";

const SIGNERS = ROLES.filter((r) => r.value !== "PM");

export default function Documents() {
  const { documents, role, mysig, put } = useHub();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [signers, setSigners] = useState([]);
  const [mineOnly, setMineOnly] = useState(false);
  const fileRef = useRef(null);

  async function upload() {
    const f = fileRef.current.files;
    if (!title.trim() || !f.length) return toast("Add a title and choose a file.", "error");
    try {
      const files = await saveFiles(f);
      put("documents", { id: uid(), title: title.trim(), dept, files, signers, signed: {}, by: role, date: today() });
      fileRef.current.value = "";
      setTitle("");
      setSigners([]);
      toast("Document uploaded.", "success");
    } catch (e) {
      toast(e.message || "Upload failed.", "error");
    }
  }

  function sign(d) {
    if (!mysig) return toast("Upload your signature first, using the My signature button at the top.", "error");
    put("documents", { ...d, signed: { ...d.signed, [role]: mysig } });
    toast(`Signed as ${lbl(role)}.`, "success");
  }

  const rows = documents
    .slice()
    .reverse()
    .filter((d) => !mineOnly || (d.signers.includes(role) && !d.signed[role]));

  return (
    <section>
      <SectionTitle title="Documents" subtitle="Upload documents and collect signatures from each department." />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <Card className="lg:sticky lg:top-20">
          <h3 className="mb-4 font-semibold text-ink-900 dark:text-white">Upload a document</h3>
          <div className="space-y-4">
            <Field label="Title">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Staff contract, board memo" />
            </Field>
            <Field label="Department">
              <Select value={dept} onChange={setDept} options={DEPARTMENTS} />
            </Field>
            <Field label="File">
              <input ref={fileRef} type="file" multiple className="input" />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-slate-300">Needs signature from</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {SIGNERS.map((r) => (
                  <Checkbox
                    key={r.value}
                    label={r.label}
                    checked={signers.includes(r.value)}
                    onChange={(e) => setSigners(e.target.checked ? [...signers, r.value] : signers.filter((s) => s !== r.value))}
                  />
                ))}
              </div>
            </fieldset>
            <Button variant="primary" className="w-full" onClick={upload}>Upload</Button>
          </div>
        </Card>

        <div>
          <div className="mb-4">
            <Checkbox label="Only documents waiting for my signature" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          </div>
          {rows.length ? (
            <div className="space-y-4">
              {rows.map((d, i) => {
                const pend = d.signers.filter((r) => !d.signed[r]);
                // The ED may sign any document, even when not asked to.
                const can = pend.includes(role) || (role === "ED" && !d.signed.ED);
                const status = !d.signers.length ? "No signature needed" : pend.length ? `Waiting for ${pend.map(lbl).join(", ")}` : "Fully signed";
                return (
                  <Card key={d.id} accent={pend.length ? "warn" : "ok"} className="hover:shadow-md" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink-900 dark:text-white">{d.title}</h3>
                      <Tag tone={pend.length ? "Pending" : "Approved"}>{status}</Tag>
                    </div>
                    <Meta className="mt-1">{d.dept} · uploaded by {lbl(d.by)} · {d.date}</Meta>
                    <FileLinks files={d.files} />
                    <Signatures sigs={d.signed} />
                    {can && (
                      <Button variant="primary" className="mt-4" onClick={() => sign(d)}>Sign as {lbl(role)}</Button>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Empty icon="doc">No documents yet.</Empty>
          )}
        </div>
      </div>
    </section>
  );
}
