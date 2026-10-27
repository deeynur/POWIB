import { useRef } from "react";
import { fd } from "../../lib/logic";
import { ABSENCE, OTHERS_KINDS, REASONS, absenceTotal, balanceOf, statusLabel, workingDays } from "../../lib/leave";
import { LogoMark } from "../Logo";
import { Button, Checkbox, Field, Icon, Meta, Select, cx, useFileUrl } from "../ui";

const Section = ({ children }) => (
  <h4 className="mt-6 mb-3 border-b border-line pb-1.5 text-sm font-semibold tracking-wide text-brand-700 uppercase first:mt-0 dark:border-slate-800 dark:text-brand-300">{children}</h4>
);
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// The fields of the LEAVE REQUEST FORM, in the form's order. `staff` is the list to pick from (HR logging for
// someone); without it the form is for `fixedStaff`, the signed-in employee.
export function LeaveFields({ lv, setLv, staff, fixedStaff }) {
  const set = (patch) => setLv({ ...lv, ...patch });
  const who = fixedStaff || staff?.find((x) => x.id === lv.staff);
  // Picking the dates fills in the working days, unless a number was already typed.
  const setDates = (patch) => {
    const next = { ...lv, ...patch };
    const auto = workingDays(lv.from, lv.to);
    if (!lv.days || +lv.days === auto) next.days = workingDays(next.from, next.to) || "";
    setLv(next);
  };
  const bal = balanceOf(lv);
  const setTravel = (i, patch) => set({ travel: lv.travel.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div>
      <Section>Employee details</Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee name">
          {fixedStaff ? (
            <input className="input" value={fixedStaff.name} readOnly />
          ) : (
            <Select value={lv.staff} onChange={(v) => set({ staff: v })} placeholder="Choose a staff member" options={staff.map((x) => ({ value: x.id, label: x.name, hint: x.pos }))} />
          )}
        </Field>
        <Field label="Designation">
          <input className="input" value={who?.pos || ""} readOnly placeholder="From the staff record" />
        </Field>
      </div>

      <Section>Leave details</Section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Leave days (accumulated)">
          <input type="number" min="0" className="input" value={lv.accumulated} onChange={(e) => set({ accumulated: e.target.value })} />
        </Field>
        <Field label="Leave days (requested)">
          <input className="input" value={lv.days} readOnly placeholder="From the request below" />
        </Field>
        <Field label="Leave days (balance)">
          <input className={cx("input", bal < 0 && "text-red-600")} value={bal ?? ""} readOnly placeholder="Accumulated − requested" />
        </Field>
      </div>

      <Section>Leave request details</Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starting on">
          <input type="date" className="input" value={lv.from} onChange={(e) => setDates({ from: e.target.value })} />
        </Field>
        <Field label="Ending on">
          <input type="date" className="input" value={lv.to} min={lv.from || undefined} onChange={(e) => setDates({ to: e.target.value })} />
        </Field>
        <Field label="Number of days" hint={lv.unit === "Days" ? "Working days (Monday to Friday) are filled in from the dates. Change it if needed." : undefined}>
          <input type="number" min="0" step="0.5" className="input" value={lv.days} onChange={(e) => set({ days: e.target.value })} />
        </Field>
        <Field label="Counted in">
          <Select value={lv.unit} onChange={(v) => set({ unit: v })} options={["Days", "Hours"]} />
        </Field>
      </div>

      <Section>Reason for leave request</Section>
      <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-3">
        {REASONS.map((r) => (
          <Checkbox key={r} label={r} checked={lv.reasons.includes(r)} onChange={() => set({ reasons: toggle(lv.reasons, r) })} />
        ))}
      </div>
      {lv.reasons.includes("Other") && (
        <Field label="Other reason" className="mt-3">
          <input className="input" value={lv.otherReason} onChange={(e) => set({ otherReason: e.target.value })} />
        </Field>
      )}

      <Section>Absence details</Section>
      <div className="overflow-hidden rounded-lg border border-line dark:border-slate-800">
        {ABSENCE.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 last:border-0 dark:border-slate-800">
            <span className="min-w-0 flex-1 text-sm">{r.label}</span>
            {r.key === "others" && (
              <span className="flex flex-wrap gap-3">
                {OTHERS_KINDS.map((k) => (
                  <Checkbox key={k} label={k} checked={lv.othersKinds.includes(k)} onChange={() => set({ othersKinds: toggle(lv.othersKinds, k) })} />
                ))}
              </span>
            )}
            <input
              type="number"
              min="0"
              step="0.5"
              aria-label={`${r.label}: number of days`}
              className="input w-24"
              value={lv.absence[r.key]}
              onChange={(e) => set({ absence: { ...lv.absence, [r.key]: e.target.value } })}
            />
          </div>
        ))}
        <div className="flex items-center gap-3 bg-ink-900/5 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
          <span className="flex-1">TOTAL DAYS</span>
          <span className="tabular w-24 px-3">{absenceTotal(lv.absence)}</span>
        </div>
      </div>

      <Section>Staff travel (movement route/details)</Section>
      <div className="space-y-3">
        {lv.travel.map((t, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto_auto]">
            <Field label="From">
              <input className="input" value={t.from} onChange={(e) => setTravel(i, { from: e.target.value })} placeholder="e.g. Maiduguri" />
            </Field>
            <Field label="Date">
              <input type="date" className="input" value={t.fromDate} onChange={(e) => setTravel(i, { fromDate: e.target.value })} />
            </Field>
            <Field label="To">
              <input className="input" value={t.to} onChange={(e) => setTravel(i, { to: e.target.value })} placeholder="e.g. Bauchi" />
            </Field>
            <Field label="Date">
              <input type="date" className="input" value={t.toDate} onChange={(e) => setTravel(i, { toDate: e.target.value })} />
            </Field>
            <Button variant="ghost" aria-label="Remove this trip" disabled={lv.travel.length === 1} onClick={() => set({ travel: lv.travel.filter((_, j) => j !== i) })}>
              <Icon name="x" className="size-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => set({ travel: [...lv.travel, { from: "", fromDate: "", to: "", toDate: "" }] })}>
          <Icon name="plus" className="size-4" /> Add a trip
        </Button>
      </div>
    </div>
  );
}

// What is missing before the form can be sent, or "" when it is complete.
export function leaveProblem(lv, st) {
  if (!st) return "Choose a staff member.";
  if (!lv.from || !lv.to) return "Fill in the starting and ending dates.";
  if (lv.to < lv.from) return "The ending date must be on or after the starting date.";
  if (!(+lv.days > 0)) return "Fill in the number of days.";
  if (!lv.reasons.length) return "Tick at least one reason for the leave.";
  if (lv.reasons.includes("Other") && !lv.otherReason.trim()) return "Write the other reason.";
  return "";
}

// The record saved for a completed form.
export function leaveRecord(lv, st) {
  return {
    staff: st.id,
    staffName: st.name,
    designation: st.pos || "",
    staffUserId: st.userId || null,
    accumulated: lv.accumulated,
    days: +lv.days,
    balance: balanceOf(lv),
    unit: lv.unit,
    from: lv.from,
    to: lv.to,
    reasons: lv.reasons,
    otherReason: lv.reasons.includes("Other") ? lv.otherReason.trim() : "",
    absence: lv.absence,
    othersKinds: lv.othersKinds,
    totalDays: absenceTotal(lv.absence),
    travel: lv.travel.filter((t) => t.from || t.to || t.fromDate || t.toDate),
  };
}

/* ---------- The filled form, laid out like the paper template ---------- */

const SHEET_CSS = `
.lv-sheet{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.35;max-width:780px;margin:0 auto;padding:28px 32px}
.lv-sheet *{box-sizing:border-box}
.lv-head{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid #1D9EEF;padding-bottom:10px;margin-bottom:14px}
.lv-brand{display:flex;align-items:center;gap:10px;color:#1D9EEF;font-weight:700;font-size:17px;line-height:1.1}
.lv-brand svg{height:44px;width:auto}
.lv-title{font-size:20px;font-weight:700;letter-spacing:.04em;color:#0b3a55}
.lv-sec{background:#1D9EEF;color:#fff;font-weight:700;padding:4px 8px;margin:14px 0 0}
.lv-sheet table{width:100%;border-collapse:collapse}
.lv-sheet td,.lv-sheet th{border:1px solid #9aa7b0;padding:5px 7px;vertical-align:top;text-align:left}
.lv-sheet th{background:#eef6fc;font-weight:600}
.lv-k{background:#f5f8fa;font-weight:600;width:34%}
.lv-num{text-align:center;width:90px}
.lv-box{font-family:'Segoe UI Symbol','DejaVu Sans',sans-serif;margin-right:4px}
.lv-reasons td{border:none;padding:3px 4px;width:33%}
.lv-opt{display:flex;align-items:baseline;gap:2px}
.lv-confirm{margin:12px 0 6px;font-style:italic}
.lv-sig{height:40px;display:flex;align-items:center}
.lv-sig img{max-height:38px;max-width:180px}
.lv-status{font-weight:700;color:#0b3a55}
@media print{@page{size:A4;margin:12mm}.lv-sheet{padding:0;max-width:none}}
`;

const Box = ({ on }) => <span className="lv-box">{on ? "☒" : "☐"}</span>;

function SigCell({ id }) {
  const url = useFileUrl(id);
  return <div className="lv-sig">{url && <img src={url} alt="Signature" />}</div>;
}

function Decision({ title, d, sig }) {
  return (
    <>
      <div className="lv-sec">{title}</div>
      <table>
        <tbody>
          <tr>
            <td colSpan={2}>
              <Box on={d?.ok === true} /> Approved &nbsp;&nbsp;&nbsp;&nbsp; <Box on={d?.ok === false} /> Rejected
              {d?.note && <div style={{ marginTop: 4 }}>Note: {d.note}</div>}
            </td>
          </tr>
          <tr>
            <td className="lv-k">{title === "Supervisor decision" ? "Supervisor’s signature" : "Human Resources Signature:"}</td>
            <td><SigCell id={sig} />{d?.by && <small>{d.by}</small>}</td>
          </tr>
          <tr>
            <td className="lv-k">Date</td>
            <td>{fd(d?.date)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export function LeaveSheet({ l }) {
  const reasons = l.reasons || [];
  const rows = [0, 1, 2];
  const travel = l.travel?.length ? l.travel : [{}];
  const sigs = l.sigs || {};
  return (
    <div className="lv-sheet">
      <style>{SHEET_CSS}</style>
      <div className="lv-head">
        <div className="lv-brand">
          <LogoMark className="" color="#1D9EEF" />
          <span>Protection without<br />Borders</span>
        </div>
        <div className="lv-title">LEAVE REQUEST FORM</div>
      </div>

      <div className="lv-sec">Employee details</div>
      <table>
        <tbody>
          <tr><td className="lv-k">Employee Name</td><td>{l.staffName}</td></tr>
          <tr><td className="lv-k">Designation</td><td>{l.designation || ""}</td></tr>
        </tbody>
      </table>

      <div className="lv-sec">Leave details</div>
      <table>
        <tbody>
          <tr>
            <th>No. OF LEAVE DAYS (Accumulated)</th><td className="lv-num">{l.accumulated ?? ""}</td>
            <th>No. OF LEAVE DAYS (Requested)</th><td className="lv-num">{l.days}</td>
            <th>No. OF LEAVE DAYS (Balance)</th><td className="lv-num">{l.balance ?? ""}</td>
          </tr>
        </tbody>
      </table>

      <div className="lv-sec">Leave request details</div>
      <table>
        <tbody>
          <tr>
            <td className="lv-k">Numbers of Days</td>
            <td>{l.days}</td>
            <td><Box on={(l.unit || "Days") === "Days"} /> Days</td>
            <td><Box on={l.unit === "Hours"} /> Hours</td>
          </tr>
          <tr>
            <td className="lv-k">Starting on</td>
            <td>{fd(l.from)}</td>
            <td className="lv-k">Ending on</td>
            <td>{fd(l.to)}</td>
          </tr>
        </tbody>
      </table>

      <div className="lv-sec">Reason for leave request</div>
      <table className="lv-reasons">
        <tbody>
          {rows.map((i) => (
            <tr key={i}>
              {REASONS.slice(i * 3, i * 3 + 3).map((r) => (
                <td key={r}>
                  <span className="lv-opt">
                    <Box on={reasons.includes(r)} /> <span>{r === "Other" ? `Other: ${l.otherReason || ""}` : r}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!l.reasons && l.type && <div style={{ padding: "4px" }}>Type: {l.type} leave</div>}

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr><th>Absence Details</th><th className="lv-num">No. of Days</th></tr>
        </thead>
        <tbody>
          {ABSENCE.map((r) => (
            <tr key={r.key}>
              <td>
                {r.label}
                {r.key === "others" && OTHERS_KINDS.map((k) => (
                  <span key={k} style={{ marginLeft: 14 }}><Box on={(l.othersKinds || []).includes(k)} />{k}</span>
                ))}
              </td>
              <td className="lv-num">{l.absence?.[r.key] || ""}</td>
            </tr>
          ))}
          <tr><th>TOTAL DAYS</th><th className="lv-num">{l.totalDays || ""}</th></tr>
        </tbody>
      </table>

      <div className="lv-sec">STAFF TRAVEL (MOVEMENT ROUTE/DETAILS)</div>
      <table>
        <thead>
          <tr><th>FROM</th><th>DATE</th><th>TO</th><th>DATE</th></tr>
        </thead>
        <tbody>
          {travel.map((t, i) => (
            <tr key={i}><td>{t.from || " "}</td><td>{fd(t.fromDate)}</td><td>{t.to}</td><td>{fd(t.toDate)}</td></tr>
          ))}
        </tbody>
      </table>

      <p className="lv-confirm">
        I confirm that the information provided in this leave request form is accurate and complete. I understand that this request is subject to approval by my supervisor.
      </p>
      <table>
        <tbody>
          <tr><td className="lv-k">Employee signature</td><td><SigCell id={sigs.Employee} />{!sigs.Employee && l.loggedBy && <small>Logged by {l.loggedBy}</small>}</td></tr>
          <tr><td className="lv-k">Date</td><td>{fd(l.submitted)}</td></tr>
        </tbody>
      </table>

      <Decision title="Supervisor decision" d={l.decisions?.Supervisor || (l.status === "Approved" && !l.decisions && sigs.ED ? { ok: true } : l.status === "Rejected" && !l.decisions ? { ok: false } : null)} sig={sigs.ED} />
      <Decision title="Human Resources" d={l.decisions?.HR} sig={sigs.HR} />
      <p style={{ marginTop: 10 }} className="lv-status">Status: {statusLabel(l)}</p>
    </div>
  );
}

// Opens the filled form in a print window (print or save as PDF from there).
export function usePrintSheet() {
  const ref = useRef(null);
  function print(title) {
    const html = ref.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    // The markup is the sheet React already rendered (and escaped) on this page.
    w.document.title = title;
    w.document.body.style.cssText = "margin:0;background:#fff";
    w.document.body.innerHTML = html;
    // Let the signature images load first.
    const imgs = Array.from(w.document.images);
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))).then(() => {
      w.focus();
      w.print();
    });
  }
  return [ref, print];
}

export function LeaveMeta({ l }) {
  return (
    <Meta className="mt-1">
      {fd(l.from)} to {fd(l.to)} · {l.days} {(l.unit || "Days").toLowerCase().replace(/s$/, "")}
      {+l.days === 1 ? "" : "s"}
      {l.balance != null && l.balance !== "" && ` · balance ${l.balance}`}
    </Meta>
  );
}
