import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { lbl, stamp, today, uid } from "../../lib/logic";
import { getBytes, getUrl, saveAs, saveFiles } from "../../lib/files";
import { activeIn, lastMonths, monthLabel, shiftMonth, thisMonth, timesheetFor } from "../../lib/hr";
import { readTimesheet, sameName, signedTimesheet, timesheetMarks } from "../../lib/hrForms";
import { Button, Card, Empty, FileLinks, Meta, Modal, Tag, cx } from "../ui";
import { useToast } from "../ui/Toast";
import HrTemplate from "./HrTemplates";
import SheetPreview from "../SheetPreview";

const DOT = {
  Approved: "bg-emerald-500",
  Submitted: "bg-amber-400",
  Returned: "bg-red-500",
  Missing: "bg-white ring-2 ring-red-300 dark:bg-slate-900 dark:ring-red-800",
  "n/a": "bg-ink-900/10 dark:bg-slate-700",
};
const TONE = { Approved: "Approved", Submitted: "Pending", Returned: "Rejected", Missing: "Rejected" };

// Monthly timesheets: one per staff member per month, uploaded by HR, then approved or returned.
export default function Timesheets() {
  const { hrstaff, timesheets, role, mysig, put } = useHub();
  const toast = useToast();
  const [month, setMonth] = useState(shiftMonth(thisMonth(), -1));
  const [viewing, setViewing] = useState(null);
  const view = timesheets.find((t) => t.id === viewing);
  const [returning, setReturning] = useState(null);
  const [note, setNote] = useState("");
  const input = useRef(null);
  const [target, setTarget] = useState(null);

  const staff = hrstaff.filter((s) => s.status !== "Left").sort((a, b) => a.name.localeCompare(b.name));
  const months = lastMonths(6);
  const expected = staff.filter((s) => activeIn(s, month));
  const status = (s, m) => {
    if (!activeIn(s, m)) return "n/a";
    return timesheetFor(timesheets, s.id, m)?.status || "Missing";
  };
  const counts = expected.reduce((c, s) => ({ ...c, [status(s, month)]: (c[status(s, month)] || 0) + 1 }), {});
  const by = () => `(${lbl(role)}, ${stamp()})`;

  async function onFile(e) {
    const files = Array.from(e.target.files);
    const s = target;
    e.target.value = "";
    if (!s || !files.length) return;
    // Read the POWIB timesheet form when it is an Excel file: month, days, hours, overtime, leave.
    let summary = null;
    const xlsx = files.find((f) => /\.xlsx$/i.test(f.name));
    if (xlsx) summary = await readTimesheet(await xlsx.arrayBuffer()).catch(() => null);
    let m = month;
    if (summary?.month && summary.month !== month) {
      m = summary.month;
      setMonth(m);
      toast(`This timesheet is for ${monthLabel(m)}, so it was saved under that month.`, "info");
    }
    if (summary?.name && !sameName(summary.name, s.name))
      toast(`Check: the timesheet is in the name of ${summary.name}, not ${s.name}.`, "error");
    try {
      const saved = await saveFiles(files);
      const old = timesheetFor(timesheets, s.id, m);
      put("timesheets", {
        id: old?.id || uid(),
        staffId: s.id,
        staffName: s.name,
        month: m,
        files: saved,
        summary,
        submitted: today(),
        status: "Submitted",
        log: [...(old?.log || []), `${old ? "Resubmitted" : "Submitted"} ${by()}`],
      });
      if (!summary || summary.month === month) toast(`${monthLabel(m)} timesheet saved for ${s.name}.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // Approving signs the "Supervisor's / Manager's certification" box on the form.
  const decide = (t, ok) => {
    if (ok && !mysig) return toast("Upload your signature first, using the My signature button at the top.", "error");
    put("timesheets", {
      ...t,
      status: ok ? "Approved" : "Returned",
      note: ok ? "" : note.trim(),
      ...(ok ? { sig: mysig, approvedOn: today(), approvedBy: role } : {}),
      log: [...(t.log || []), `${ok ? "Approved" : `Returned${note.trim() ? `: ${note.trim()}` : ""}`} ${by()}`],
    });
    setReturning(null);
    setNote("");
  };

  const formFile = (t) => t.files?.find((f) => /\.xlsx$/i.test(f.name));
  async function download(t) {
    const f = formFile(t);
    try {
      saveAs(await signedTimesheet(await getBytes(f), t), `Timesheet ${t.staffName} ${t.month}.xlsx`);
    } catch (err) {
      toast("Could not build the file: " + (err?.message || err), "error");
    }
  }

  if (!staff.length) return <Empty icon="users">Add staff first. Timesheets are tracked for everyone on contract.</Empty>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink-900 dark:text-white">Last 6 months</h3>
            <Meta className="text-xs">Click a month to work on it.</Meta>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-ink-500">
            {["Approved", "Submitted", "Returned", "Missing"].map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cx("size-3 rounded-full", DOT[k])} /> {k}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th className="py-2 pr-3 font-medium">Staff</th>
                {months.map((m) => (
                  <th key={m} className="px-1 py-2 text-center font-medium">
                    <button
                      type="button"
                      onClick={() => setMonth(m)}
                      className={cx("cursor-pointer rounded-md px-2 py-1 transition", m === month ? "bg-brand-600 text-white" : "hover:bg-ink-900/5 dark:hover:bg-slate-800")}
                    >
                      {monthLabel(m, true)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-line dark:border-slate-800">
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  {months.map((m) => {
                    const st = status(s, m);
                    return (
                      <td key={m} className="px-1 py-2 text-center">
                        <button type="button" title={`${monthLabel(m)}: ${st === "n/a" ? "not on contract" : st}`} onClick={() => setMonth(m)} className="cursor-pointer p-1">
                          <span className={cx("inline-block size-4 rounded-full transition hover:scale-125", DOT[st])} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-900 dark:text-white">{monthLabel(month)}</h3>
            <Meta>
              {expected.length - (counts.Missing || 0)} of {expected.length} submitted
              {counts.Approved ? ` · ${counts.Approved} approved` : ""}
              {counts.Missing ? ` · ${counts.Missing} missing` : ""}
            </Meta>
          </div>
          <HrTemplate kind="timesheet" label="Timesheet" />
        </div>

        <ul className="mt-4 divide-y divide-line dark:divide-slate-800">
          {expected.map((s) => {
            const t = timesheetFor(timesheets, s.id, month);
            const st = t?.status || "Missing";
            return (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink-900 dark:text-white">{s.name}</div>
                    <Meta className="text-xs">
                      {s.pos || s.dept}
                      {t && ` · submitted ${t.submitted}`}
                      {t?.status === "Approved" && t.approvedOn && ` · approved ${t.approvedOn}`}
                      {t?.note && ` · returned: ${t.note}`}
                    </Meta>
                    {t?.summary && (
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                          {t.summary.daysWorked} days · {t.summary.hours} h
                        </span>
                        {t.summary.overtime > 0 && <span className="rounded-md bg-ink-900/5 px-2 py-0.5 dark:bg-slate-800">{t.summary.overtime} h overtime</span>}
                        {t.summary.holidays > 0 && <span className="rounded-md bg-ink-900/5 px-2 py-0.5 dark:bg-slate-800">{t.summary.holidays} public holiday{t.summary.holidays === 1 ? "" : "s"}</span>}
                        {t.summary.leaveDays > 0 && (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            {t.summary.leaveDays} leave day{t.summary.leaveDays === 1 ? "" : "s"}
                            {t.summary.leaveType && ` (${t.summary.leaveType})`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Tag tone={TONE[st]}>{st}</Tag>
                  {t && formFile(t) && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setViewing(t.id)}>View</Button>
                      <Button size="sm" variant="ghost" onClick={() => download(t)}>Download</Button>
                    </>
                  )}
                  <Button size="sm" onClick={() => { setTarget(s); input.current.click(); }}>
                    {t ? "Replace" : "Upload timesheet"}
                  </Button>
                  {t?.status === "Submitted" && returning !== t.id && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => decide(t, true)}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => setReturning(t.id)}>Return</Button>
                    </>
                  )}
                </div>
                {returning === t?.id && (
                  <div className="animate-fade-up mt-2 flex flex-wrap gap-2">
                    <input className="input max-w-md flex-1" placeholder="What needs fixing? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button size="sm" variant="danger" onClick={() => decide(t, false)}>Return to staff</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReturning(null)}>Cancel</Button>
                  </div>
                )}
                {t && <FileLinks files={t.files} />}
              </li>
            );
          })}
        </ul>
        {!expected.length && <Meta className="mt-4">No one was on contract in {monthLabel(month)}.</Meta>}
        <input ref={input} type="file" multiple hidden onChange={onFile} />
      </Card>

      {view && (
        <Modal
          open
          wide
          onClose={() => setViewing(null)}
          title={`Timesheet · ${view.staffName} · ${monthLabel(view.month)}`}
          actions={
            <>
              {view.status === "Submitted" && (
                <Button variant="primary" onClick={() => { decide(view, true); setViewing(null); }}>Approve and sign</Button>
              )}
              <Button onClick={() => download(view)}>Download</Button>
            </>
          }
        >
          <SheetPreview
            file={formFile(view)}
            pick={(wb) => wb.worksheets.find((w) => /time/i.test(w.name)) || wb.worksheets[0]}
            marks={(ws) => timesheetMarks(ws, view, getUrl)}
            reloadKey={view.status + view.approvedOn}
          />
        </Modal>
      )}
    </div>
  );
}
