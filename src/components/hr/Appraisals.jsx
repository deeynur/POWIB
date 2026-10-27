import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { lbl, stamp, today, uid } from "../../lib/logic";
import { saveFiles } from "../../lib/files";
import { APPRAISAL_LEAD_DAYS, APPRAISAL_TYPES, RATINGS, appraisalDue, currentAppraisal, daysUntil, ratingLabel } from "../../lib/hr";
import { readAppraisal, sameName, typeFromReason } from "../../lib/hrForms";
import { Button, Card, Empty, Field, FileLinks, Meta, Tag, cx, Select } from "../ui";
import { useToast } from "../ui/Toast";
import HrTemplate from "./HrTemplates";

function dueText(st) {
  const due = appraisalDue(st);
  const d = daysUntil(due);
  if (d === null) return { text: "No contract end date", tone: "" };
  if (d < 0) return { text: `Due ${due} (${-d} days overdue)`, tone: "text-red-600 dark:text-red-400" };
  if (d <= APPRAISAL_LEAD_DAYS) return { text: `Due ${due} (in ${d} days)`, tone: "text-amber-600 dark:text-amber-400" };
  return { text: `Due ${due}`, tone: "" };
}

// What was read from the Word appraisal form: overall rating, section averages, and the full breakdown on request.
export function FormSummary({ f }) {
  const [more, setMore] = useState(false);
  const chip = (label, v) =>
    v != null && (
      <span className="rounded-md bg-ink-900/5 px-2 py-0.5 dark:bg-slate-800">
        {label} <b>{v}</b>/5
      </span>
    );
  const rated = (items) =>
    items.map((x, i) => (
      <li key={i} className="flex gap-2">
        <b className="w-6 shrink-0 text-brand-600 dark:text-brand-300">{x.rating ?? "–"}</b>
        <span>
          {x.text || x.name}
          {x.comment && <span className="text-ink-500"> · {x.comment}</span>}
        </span>
      </li>
    ));
  return (
    <div className="mt-3 rounded-xl bg-paper p-3 text-sm dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {f.overall && (
          <span className="rounded-md bg-brand-600 px-2 py-0.5 font-semibold text-white">Overall {ratingLabel(f.overall)}</span>
        )}
        {chip("Objectives", f.scores?.objectives)}
        {chip("Personal skills", f.scores?.factors)}
        {chip("Responsibilities", f.scores?.responsibilities)}
        {f.jobTitle && <span className="text-ink-500">{f.jobTitle}</span>}
        <button type="button" className="ml-auto cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-300" onClick={() => setMore(!more)}>
          {more ? "Hide details" : "Details"}
        </button>
      </div>
      {f.evaluatorComment && <p className="mt-2 text-ink-700 dark:text-slate-300">“{f.evaluatorComment}”</p>}
      {more && (
        <div className="animate-fade-up mt-3 grid gap-4 md:grid-cols-2">
          {f.objectives.length > 0 && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Part I · Objectives</h5>
              <ul className="space-y-1">{rated(f.objectives)}</ul>
            </section>
          )}
          {f.factors.length > 0 && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Part II · Personal skills</h5>
              <ul className="space-y-1">{rated(f.factors)}</ul>
            </section>
          )}
          {f.responsibilities.length > 0 && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Part III · Main responsibilities</h5>
              <ul className="space-y-1">{rated(f.responsibilities)}</ul>
            </section>
          )}
          {f.newObjectives.length > 0 && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Part IV · New objectives</h5>
              <ol className="list-decimal space-y-1 pl-5">{f.newObjectives.map((o, i) => <li key={i}>{o}</li>)}</ol>
            </section>
          )}
          {f.training.length > 0 && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Training needs</h5>
              <ul className="list-disc space-y-1 pl-5">{f.training.map((t, i) => <li key={i}>{t.area}{t.course && <span className="text-ink-500"> · {t.course}</span>}</li>)}</ul>
            </section>
          )}
          {(f.staffComment || f.wishes) && (
            <section>
              <h5 className="mb-1 text-xs font-semibold text-ink-500 uppercase">Staff member</h5>
              {f.staffComment && <p>“{f.staffComment}”</p>}
              {f.wishes && <p className="mt-1 text-ink-500">Wishes: {f.wishes}</p>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function StaffRow({ s, list, onUpload, onReview }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(APPRAISAL_TYPES[2]);
  const [reviewing, setReviewing] = useState(false);
  const [rating, setRating] = useState(RATINGS[2]);
  // The form's own reason box sets the type when a Word form is read; this picker is for other files.
  const [comment, setComment] = useState("");
  const cur = currentAppraisal(list, s);
  const due = dueText(s);
  const history = list.filter((a) => a.staffId === s.id).sort((a, b) => (a.submitted < b.submitted ? 1 : -1));
  const st = cur ? cur.status : daysUntil(appraisalDue(s)) !== null && daysUntil(appraisalDue(s)) <= APPRAISAL_LEAD_DAYS ? "Due" : "Not yet due";

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-900 dark:text-white">{s.name}</div>
          <Meta className="text-xs">
            Contract ends {s.end || "n/a"} · <span className={due.tone}>{due.text}</span>
          </Meta>
        </div>
        <Tag tone={st === "Reviewed" ? "Approved" : st === "Submitted" ? "Pending" : st === "Due" ? "Rejected" : undefined}>
          {st}
          {(cur?.rating || cur?.form?.overall) && ` · ${(cur.rating || ratingLabel(cur.form.overall)).split(" · ")[0]}/5`}
        </Tag>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="w-48">
          <Select size="sm" aria-label="Appraisal type" value={type} onChange={setType} options={APPRAISAL_TYPES} />
        </div>
        <Button size="sm" onClick={() => onUpload(s, type)}>Upload appraisal form</Button>
        {cur?.status === "Submitted" && !reviewing && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (cur.form?.overall) setRating(ratingLabel(cur.form.overall));
              setReviewing(true);
            }}
          >
            Mark reviewed
          </Button>
        )}
        {history.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide" : `History (${history.length})`}
          </Button>
        )}
      </div>

      {reviewing && cur && (
        <div className="animate-fade-up mt-3 grid gap-3 rounded-xl border border-brand-200 p-3 sm:grid-cols-[200px_1fr_auto] sm:items-end dark:border-brand-800">
          <Field label="Overall rating">
            <Select value={rating} onChange={setRating} options={RATINGS} />
          </Field>
          <Field label="Comment (optional)">
            <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. recommend contract renewal" />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => { onReview(cur, rating, comment.trim()); setReviewing(false); setComment(""); }}>Save</Button>
            <Button variant="ghost" onClick={() => setReviewing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {cur?.form && <FormSummary f={cur.form} />}
      {cur?.staffAck && (
        <Meta className="mt-2 text-xs">
          {s.name} read and acknowledged it on {cur.staffAck.date}
          {cur.staffAck.comment && `: “${cur.staffAck.comment}”`}
        </Meta>
      )}
      {cur && <FileLinks files={cur.files} />}

      {open && (
        <ul className="animate-fade-up mt-3 space-y-2 border-l-2 border-brand-200 pl-3 text-sm dark:border-brand-800">
          {history.map((a) => (
            <li key={a.id}>
              <b className="font-medium">{a.type}</b> · submitted {a.submitted} · {a.status}
              {a.rating && ` · ${a.rating}`}
              {a.comment && <span className="text-ink-500"> · “{a.comment}”</span>}
              <FileLinks files={a.files} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Appraisals: one per contract, due before the contract ends, then reviewed with a rating.
export default function Appraisals() {
  const { hrstaff, appraisals, role, put } = useHub();
  const toast = useToast();
  const input = useRef(null);
  const [target, setTarget] = useState(null);
  const [filter, setFilter] = useState("all");

  const staff = hrstaff.filter((s) => s.status !== "Left").sort((a, b) => (appraisalDue(a) || "9") .localeCompare(appraisalDue(b) || "9"));
  const stateOf = (s) => {
    const cur = currentAppraisal(appraisals, s);
    if (cur) return cur.status;
    const d = daysUntil(appraisalDue(s));
    return d !== null && d <= APPRAISAL_LEAD_DAYS ? "Due" : "Not yet due";
  };
  const shown = staff.filter((s) => filter === "all" || stateOf(s) === filter);
  const by = () => `(${lbl(role)}, ${stamp()})`;

  async function onFile(e) {
    const files = Array.from(e.target.files);
    const t = target;
    e.target.value = "";
    if (!t || !files.length) return;
    // Read the POWIB Professional Evaluation form when it is a Word file.
    const docx = files.find((f) => /\.docx$/i.test(f.name));
    const form = docx ? await readAppraisal(await docx.arrayBuffer()).catch(() => null) : null;
    if (form?.name && !sameName(form.name, t.s.name)) toast(`Check: the form is for ${form.name}, not ${t.s.name}.`, "error");
    const type = (form && typeFromReason(form.reason)) || t.type;
    try {
      const saved = await saveFiles(files);
      put("appraisals", { id: uid(), staffId: t.s.id, staffName: t.s.name, type, files: saved, form, submitted: today(), status: "Submitted", log: [`Submitted ${by()}`] });
      toast(`${type} appraisal saved for ${t.s.name}${form?.overall ? `: overall ${ratingLabel(form.overall)}` : ""}.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function review(a, rating, comment) {
    put("appraisals", { ...a, status: "Reviewed", rating, comment, reviewedBy: role, log: [...(a.log || []), `Reviewed: ${rating} ${by()}`] });
    toast("Appraisal marked as reviewed.", "success");
  }

  if (!staff.length) return <Empty icon="users">Add staff first. Appraisals are tracked against each contract.</Empty>;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink-900 dark:text-white">Appraisals</h3>
          <Meta>Each staff member's appraisal is due {APPRAISAL_LEAD_DAYS} days before their contract ends.</Meta>
        </div>
        <HrTemplate kind="appraisal" label="Appraisal form" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["all", "Due", "Submitted", "Reviewed", "Not yet due"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cx(
              "cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition",
              filter === k ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-700 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {k === "all" ? "All" : k} <span className="opacity-70">{k === "all" ? staff.length : staff.filter((s) => stateOf(s) === k).length}</span>
          </button>
        ))}
      </div>
      <ul className="mt-2 divide-y divide-line dark:divide-slate-800">
        {shown.map((s) => (
          <StaffRow key={s.id} s={s} list={appraisals} onUpload={(st, type) => { setTarget({ s: st, type }); input.current.click(); }} onReview={review} />
        ))}
      </ul>
      {!shown.length && <Meta className="mt-4">No staff in this group.</Meta>}
      <input ref={input} type="file" multiple hidden onChange={onFile} />
    </Card>
  );
}
