import { useRef, useState } from "react";
import { useHub } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { today, uid } from "../../lib/logic";
import { saveFiles } from "../../lib/files";
import { activeIn, contractLabel, daysUntil, lastMonths, monthLabel, ratingLabel, shiftMonth, thisMonth, timesheetFor } from "../../lib/hr";
import { readTimesheet, sameName } from "../../lib/hrForms";
import { STATUS, blankLeave } from "../../lib/leave";
import { Button, Card, Empty, Field, FileLinks, Icon, Meta, Modal, SectionTitle, Tag } from "../ui";
import { useToast } from "../ui/Toast";
import HrTemplate from "./HrTemplates";
import { FormSummary } from "./Appraisals";
import { LeaveCard } from "./Leave";
import { LeaveFields, leaveProblem, leaveRecord } from "./LeaveForm";

const TONE = { Approved: "Approved", Submitted: "Pending", Returned: "Rejected", Missing: "Rejected" };

// The signed-in staff member's own HR page: contract, monthly timesheets, appraisals and leave.
export default function MyHR() {
  const { hrstaff, timesheets, appraisals, hrleave, me, mysig, put } = useHub();
  const { profile } = useAuth();
  const toast = useToast();
  const input = useRef(null);
  const [month, setMonth] = useState(null);
  const [ackFor, setAckFor] = useState(null);
  const [ack, setAck] = useState("");
  const [lv, setLv] = useState(null);
  const st = hrstaff.find((s) => s.userId === me);

  if (!st)
    return (
      <section>
        <SectionTitle title="My HR" subtitle="Your contract, timesheets, appraisals and leave." />
        <Empty icon="users">Your account isn't linked to a staff record yet. Ask HR to link {profile?.email} on the Team page.</Empty>
      </section>
    );

  const months = lastMonths(6).filter((m) => activeIn(st, m)).reverse();
  const mine = appraisals.filter((a) => a.staffId === st.id).sort((a, b) => (a.submitted < b.submitted ? 1 : -1));
  const d = daysUntil(st.end);

  async function onFile(e) {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (!files.length || !month) return;
    const xlsx = files.find((f) => /\.xlsx$/i.test(f.name));
    const summary = xlsx ? await readTimesheet(await xlsx.arrayBuffer()).catch(() => null) : null;
    const m = summary?.month || month;
    if (summary?.name && !sameName(summary.name, st.name)) return toast(`This timesheet is in the name of ${summary.name}. Upload your own timesheet.`, "error");
    const old = timesheetFor(timesheets, st.id, m);
    if (old?.status === "Approved") return toast(`Your ${monthLabel(m)} timesheet is already approved.`, "error");
    try {
      const saved = await saveFiles(files);
      put("timesheets", {
        id: old?.id || uid(),
        staffId: st.id,
        staffName: st.name,
        staffUserId: me,
        month: m,
        files: saved,
        summary,
        submitted: today(),
        status: "Submitted",
        log: [...(old?.log || []), `${old ? "Resubmitted" : "Submitted"} by ${st.name}`],
      });
      toast(`${monthLabel(m)} timesheet sent to HR${m !== month ? " (the form is for that month)" : ""}.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const myLeave = hrleave.filter((l) => l.staff === st.id).slice().reverse();

  function sendLeave() {
    const problem = leaveProblem(lv, st);
    if (problem) return toast(problem, "error");
    if (!lv.confirm) return toast("Tick the box to confirm the information is accurate and complete.", "error");
    if (!mysig) return toast("Upload your signature first, using the My signature button at the top.", "error");
    put("hrleave", {
      id: uid(),
      ...leaveRecord(lv, { ...st, userId: me }),
      status: STATUS.hr,
      sigs: { Employee: mysig },
      submitted: today(),
      log: [`Sent by ${st.name}`],
    });
    setLv(null);
    toast("Leave request sent to HR.", "success");
  }

  function acknowledge(a) {
    put("appraisals", { ...a, staffUserId: me, staffAck: { date: today(), comment: ack.trim() }, log: [...(a.log || []), `Read and acknowledged by ${st.name}`] });
    setAckFor(null);
    setAck("");
    toast("Thank you. HR can see you have read your appraisal.", "success");
  }

  return (
    <section>
      <SectionTitle title="My HR" subtitle={`${st.name}${st.pos ? ` · ${st.pos}` : ""}`} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-900 dark:text-white">My contract</h3>
          {st.contractType && <Tag>{contractLabel(st.contractType)}</Tag>}
        </div>
        <Meta className="mt-1">
          {st.start || "n/a"} to {st.end || "n/a"}
          {d !== null && d >= 0 && d <= 60 && <b className="text-amber-600"> · ends in {d} days</b>}
          {d !== null && d < 0 && <b className="text-red-600"> · ended</b>}
        </Meta>
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink-900 dark:text-white">My timesheets</h3>
            <Meta className="text-xs">Fill in the timesheet in Excel, then upload it for the month. HR approves it.</Meta>
          </div>
          <HrTemplate kind="timesheet" label="Timesheet" />
        </div>
        <ul className="mt-3 divide-y divide-line dark:divide-slate-800">
          {months.map((m) => {
            const t = timesheetFor(timesheets, st.id, m);
            const status = t?.status || (m === thisMonth() ? "Due at month end" : "Missing");
            return (
              <li key={m} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{monthLabel(m)}</div>
                  <Meta className="text-xs">
                    {t?.summary && `${t.summary.daysWorked} days · ${t.summary.hours} h · `}
                    {t ? `sent ${t.submitted}` : ""}
                    {t?.note && ` · HR: ${t.note}`}
                  </Meta>
                  {t && <FileLinks files={t.files} />}
                </div>
                <Tag tone={TONE[status]}>{status}</Tag>
                {t?.status !== "Approved" && (
                  <Button size="sm" variant={t?.status === "Returned" || (!t && m !== thisMonth()) ? "primary" : "default"} onClick={() => { setMonth(m); setTimeout(() => input.current.click(), 0); }}>
                    {t ? "Send again" : "Upload timesheet"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <input ref={input} type="file" multiple hidden onChange={onFile} />
        {!months.length && <Meta className="mt-2">No months to show for your contract dates.</Meta>}
        {months.length > 0 && <Meta className="mt-2 text-xs">Earlier months: {monthLabel(shiftMonth(months[months.length - 1], -1))} and before are with HR.</Meta>}
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink-900 dark:text-white">My leave</h3>
            <Meta className="text-xs">Fill in the leave request form and sign it. HR approves it. Print it for your supervisor to sign the supervisor box by hand.</Meta>
          </div>
          <Button variant="primary" size="sm" onClick={() => setLv(blankLeave())}>
            <Icon name="plus" className="size-4" /> Request leave
          </Button>
        </div>
        {myLeave.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {myLeave.map((l) => (
              <LeaveCard key={l.id} l={l} />
            ))}
          </div>
        ) : (
          <Meta className="mt-2">No leave requests yet.</Meta>
        )}
      </Card>

      <Modal open={!!lv} onClose={() => setLv(null)} wide title="Leave request form" actions={<Button variant="primary" size="sm" onClick={sendLeave}>Sign and send</Button>}>
        {lv && (
          <>
            <LeaveFields lv={lv} setLv={setLv} fixedStaff={st} />
            <label className="mt-6 flex cursor-pointer items-start gap-2 text-sm text-ink-700 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={lv.confirm} onChange={(e) => setLv({ ...lv, confirm: e.target.checked })} />
              <span>I confirm that the information provided in this leave request form is accurate and complete. I understand that this request is subject to approval by my supervisor.</span>
            </label>
            <Meta className="mt-2 text-xs">{mysig ? "Your signature goes in the employee signature box." : "Upload your signature first, using the My signature button at the top."}</Meta>
            <Button variant="primary" className="mt-4" onClick={sendLeave}>Sign and send</Button>
          </>
        )}
      </Modal>

      <Card>
        <h3 className="font-semibold text-ink-900 dark:text-white">My appraisals</h3>
        {mine.length ? (
          <ul className="mt-2 space-y-4">
            {mine.map((a) => (
              <li key={a.id} className="border-t border-line pt-4 first:border-0 first:pt-0 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1">{a.type} appraisal · {a.submitted}</b>
                  <Tag tone={a.status === "Reviewed" ? "Approved" : "Pending"}>{a.status}</Tag>
                  {a.staffAck && <Tag tone="Approved">You acknowledged {a.staffAck.date}</Tag>}
                </div>
                {a.rating && <Meta className="mt-1">HR rating: {a.rating}</Meta>}
                {!a.rating && a.form?.overall && <Meta className="mt-1">Overall: {ratingLabel(a.form.overall)}</Meta>}
                {a.form && <FormSummary f={a.form} />}
                <FileLinks files={a.files} />
                {!a.staffAck &&
                  (ackFor === a.id ? (
                    <div className="animate-fade-up mt-3 space-y-2">
                      <Field label="Your comments (optional)">
                        <textarea className="input" rows={2} value={ack} onChange={(e) => setAck(e.target.value)} placeholder="Anything you disagree with or would like to add" />
                      </Field>
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={() => acknowledge(a)}>I have read my appraisal</Button>
                        <Button variant="ghost" onClick={() => setAckFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" className="mt-3" onClick={() => setAckFor(a.id)}>Read and acknowledge</Button>
                  ))}
                {a.staffAck?.comment && <Meta className="mt-2">Your comment: “{a.staffAck.comment}”</Meta>}
              </li>
            ))}
          </ul>
        ) : (
          <Meta className="mt-2">No appraisals yet. Your line manager completes your appraisal before your contract ends.</Meta>
        )}
      </Card>
    </section>
  );
}
