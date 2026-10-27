import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { DEPARTMENTS, uid } from "../../lib/logic";
import { saveFiles } from "../../lib/files";
import { CONTRACT_TYPES, CONTRACT_WARN_DAYS, addDaysTo, contractEnd, contractLabel, daysUntil } from "../../lib/hr";
import { Button, Card, Empty, Field, FileLinks, Icon, Meta, Modal, Tag, cx, Select } from "../ui";
import { useToast } from "../ui/Toast";

const BLANK = { name: "", pos: "", dept: DEPARTMENTS[0], contractType: "6m", start: "", end: "" };
const monthsOf = (t) => CONTRACT_TYPES.find((c) => c.value === t)?.months || 0;

function StaffForm({ initial, onSave, onCancel }) {
  const [s, setS] = useState(initial);
  const months = monthsOf(s.contractType);
  const end = months ? contractEnd(s.start, months) : s.end;
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...s, end });
      }}
    >
      <Field label="Full name" className="sm:col-span-2">
        <input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </Field>
      <Field label="Position">
        <input className="input" value={s.pos} onChange={(e) => setS({ ...s, pos: e.target.value })} />
      </Field>
      <Field label="Department">
        <Select value={s.dept} onChange={(v) => setS({ ...s, dept: v })} options={DEPARTMENTS} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-slate-300">Contract length</legend>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_TYPES.map((c) => (
            <label
              key={c.value}
              className={cx(
                "cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition",
                s.contractType === c.value ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:border-brand-400 dark:border-slate-700"
              )}
            >
              <input type="radio" className="sr-only" name="ctype" checked={s.contractType === c.value} onChange={() => setS({ ...s, contractType: c.value })} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Contract start">
        <input type="date" className="input" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} />
      </Field>
      {months ? (
        <Field label="Contract ends">
          <input className="input bg-paper dark:bg-slate-800" readOnly value={end || "Choose a start date"} />
        </Field>
      ) : (
        <Field label="Contract ends">
          <input type="date" className="input" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} />
        </Field>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" type="submit">{initial.id ? "Save changes" : "Add staff"}</Button>
      </div>
    </form>
  );
}

function StaffCard({ x, onEdit, onAttach, onRenew }) {
  const [renewing, setRenewing] = useState(false);
  const d = daysUntil(x.end);
  const warn = d !== null && d <= CONTRACT_WARN_DAYS;
  const left = x.status === "Left";
  return (
    <Card accent={left ? undefined : warn ? (d < 0 ? "bad" : "warn") : "brand"} className={cx("", left && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold text-ink-900 dark:text-white">{x.name}</h4>
        <div className="flex gap-1.5">
          {x.contractType && <Tag>{contractLabel(x.contractType)}</Tag>}
          <Tag>{x.dept}</Tag>
          {left && <Tag tone="Rejected">Left</Tag>}
        </div>
      </div>
      <Meta className="mt-1">
        {x.pos || "—"} · {x.start || "n/a"} to {x.end || "n/a"}
        {warn && !left && <b className={d < 0 ? "text-red-600" : "text-amber-600"}> ({d < 0 ? `expired ${-d} days ago` : `${d} days left`})</b>}
      </Meta>
      {x.history?.length > 0 && (
        <Meta className="mt-1 text-xs">
          Earlier contracts: {x.history.map((h) => `${h.start} to ${h.end}${h.type ? ` (${contractLabel(h.type)})` : ""}`).join(" · ")}
        </Meta>
      )}
      <FileLinks files={x.files} />
      {renewing && (
        <div className="animate-fade-up mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-900/30">
          New contract from {x.end ? addDaysTo(x.end, 1) : "today"} for:
          {CONTRACT_TYPES.filter((c) => c.months).map((c) => (
            <Button key={c.value} size="sm" variant="primary" onClick={() => { onRenew(x, c.value); setRenewing(false); }}>
              {c.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setRenewing(false)}>Cancel</Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!left && !renewing && (
          <Button size="sm" onClick={() => setRenewing(true)}>
            <Icon name="clock" className="size-3.5" /> Renew contract
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onEdit(x)}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => onAttach(x)}>Attach contract or file</Button>
      </div>
    </Card>
  );
}

export default function Staff() {
  const { hrstaff, put } = useHub();
  const toast = useToast();
  const att = useRef(null);
  const [attachTo, setAttachTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const staff = hrstaff.slice().sort((a, b) => (a.status === "Left") - (b.status === "Left") || a.name.localeCompare(b.name));

  function save(s) {
    if (!s.name.trim()) return toast("Enter the staff member's name.", "error");
    if (!s.start) return toast("Enter the contract start date.", "error");
    if (!s.end) return toast("Choose when the contract ends.", "error");
    if (s.end < s.start) return toast("The contract must end after it starts.", "error");
    put("hrstaff", { files: [], ...s, id: s.id || uid(), name: s.name.trim(), pos: s.pos.trim() });
    toast(s.id ? "Staff record updated." : "Staff member added.", "success");
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  function renew(x, type) {
    const start = x.end ? addDaysTo(x.end, 1) : new Date().toISOString().slice(0, 10);
    const end = contractEnd(start, monthsOf(type));
    put("hrstaff", { ...x, history: [...(x.history || []), { start: x.start, end: x.end, type: x.contractType }], contractType: type, start, end });
    toast(`Contract renewed: ${start} to ${end}.`, "success");
  }

  async function onAttach(e) {
    const f = e.target.files;
    const x = attachTo;
    if (x && f.length) {
      try {
        const r = await saveFiles(f);
        put("hrstaff", { ...x, files: [...(x.files || []), ...r] });
        toast("File attached.", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    }
    e.target.value = "";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr] lg:items-start">
      <Card className="lg:sticky lg:top-20">
        <h3 className="mb-4 font-semibold text-ink-900 dark:text-white">Add a staff member</h3>
        <StaffForm key={formKey} initial={BLANK} onSave={save} />
      </Card>
      <div>
        {staff.length ? (
          <div className="space-y-3">
            {staff.map((x) => (
              <StaffCard
                key={x.id}
                x={x}
                onEdit={(s) => setEditing({ ...BLANK, contractType: "other", ...s })}
                onAttach={(s) => { setAttachTo(s); att.current.click(); }}
                onRenew={renew}
              />
            ))}
          </div>
        ) : (
          <Empty icon="users">No staff added yet.</Empty>
        )}
        <input ref={att} type="file" multiple hidden onChange={onAttach} />
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit staff record">
        {editing && (
          <>
            <StaffForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />
            <div className="mt-4 border-t border-line pt-4 dark:border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save({ ...editing, status: editing.status === "Left" ? "" : "Left" })}
              >
                {editing.status === "Left" ? "Mark as current staff" : "Mark as left the organization"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
