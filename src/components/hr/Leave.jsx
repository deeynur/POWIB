import { useState } from "react";
import { useHub } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { lbl, today, uid } from "../../lib/logic";
import { STATUS, blankLeave, isPending, leaveNeeds, reasonText, statusLabel, toneOf } from "../../lib/leave";
import { Button, Card, Empty, Icon, Meta, Modal, Tag, accentFor, cx } from "../ui";
import { useToast } from "../ui/Toast";
import { LeaveFields, LeaveMeta, LeaveSheet, leaveProblem, leaveRecord, usePrintSheet } from "./LeaveForm";

// HR approves or rejects a leave form and signs it.
export function useLeaveDecision() {
  const { role, mysig, put } = useHub();
  const { profile } = useAuth();
  const toast = useToast();
  return (l, ok) => {
    if (leaveNeeds(l) !== role) return;
    if (ok && !mysig) return toast("Upload your signature first, using the My signature button at the top.", "error");
    const by = profile?.full_name || lbl(role);
    put("hrleave", {
      ...l,
      status: ok ? STATUS.ok : STATUS.no,
      sigs: ok ? { ...(l.sigs || {}), HR: mysig } : l.sigs || {},
      decisions: { ...(l.decisions || {}), HR: { ok, by, date: today() } },
      log: [...(l.log || []), `${ok ? "Approved" : "Rejected"} by ${by} (HR)`],
    });
    toast(ok ? "Leave approved and signed." : "Leave request rejected.", ok ? "success" : "info");
  };
}

// One leave request in a list, with the filled form behind "View form".
export function LeaveCard({ l }) {
  const { role } = useHub();
  const decide = useLeaveDecision();
  const [open, setOpen] = useState(false);
  const [ref, print] = usePrintSheet();
  const mine = leaveNeeds(l) === role;
  const buttons = mine && (
    <>
      <Button variant="primary" onClick={() => decide(l, true)}>Approve and sign</Button>
      <Button variant="danger" onClick={() => decide(l, false)}>Reject</Button>
    </>
  );
  return (
    <Card accent={accentFor(isPending(l) ? "Pending" : l.status)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-ink-900 dark:text-white">{l.staffName}</h4>
          {l.designation && <Meta className="text-xs">{l.designation}</Meta>}
        </div>
        <Tag tone={toneOf(l)}>{statusLabel(l)}</Tag>
      </div>
      <div className="mt-2 text-sm text-ink-700 dark:text-slate-300">{reasonText(l)}</div>
      <LeaveMeta l={l} />
      <div className="mt-4 flex flex-wrap gap-2">
        {buttons}
        <Button variant={mine ? "ghost" : "default"} onClick={() => setOpen(true)}>
          <Icon name="doc" className="size-4" /> View form
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={`Leave request · ${l.staffName}`}
        actions={
          <Button size="sm" onClick={() => print(`Leave request - ${l.staffName} - ${l.from}`)}>
            <Icon name="download" className="size-4" /> Print / PDF
          </Button>
        }
      >
        <div ref={ref} className="rounded-lg ring-1 ring-line">
          <LeaveSheet l={l} />
        </div>
        {mine && <div className="mt-4 flex flex-wrap gap-2">{buttons}</div>}
      </Modal>
    </Card>
  );
}

// Leave requests: staff send the LEAVE REQUEST FORM from My HR (or HR fills it in for them here),
// then HR approves or rejects and signs. The supervisor signs the printed form by hand.
export default function Leave() {
  const { hrstaff, hrleave, role, me, mysig, online, put } = useHub();
  const { profile } = useAuth();
  const toast = useToast();
  const staff = hrstaff.filter((s) => s.status !== "Left").sort((a, b) => a.name.localeCompare(b.name));
  const [lv, setLv] = useState(null);
  const [filter, setFilter] = useState("open");

  function submit() {
    const st = staff.find((x) => x.id === lv.staff);
    const problem = leaveProblem(lv, st);
    if (problem) return toast(problem, "error");
    // Filling in your own form signs it as the employee; otherwise HR logs it for the staff member.
    const own = online && st.userId === me;
    if (own && !mysig) return toast("Upload your signature first, using the My signature button at the top.", "error");
    const by = profile?.full_name || lbl(role);
    put("hrleave", {
      id: uid(),
      ...leaveRecord(lv, st),
      status: STATUS.hr,
      sigs: own ? { Employee: mysig } : {},
      submitted: today(),
      loggedBy: own ? "" : by,
      log: [own ? `Sent by ${st.name}` : `Logged by ${by} for ${st.name}`],
    });
    setLv(null);
    toast("Leave request sent to HR.", "success");
  }

  const list = hrleave
    .filter((l) => (filter === "open" ? isPending(l) : filter === "mine" ? leaveNeeds(l) === role : true))
    .slice()
    .reverse();
  const FILTERS = [
    { id: "open", label: "Waiting", n: hrleave.filter(isPending).length },
    { id: "mine", label: "Waiting on me", n: hrleave.filter((l) => leaveNeeds(l) === role).length },
    { id: "all", label: "All", n: hrleave.length },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-ink-900/5 p-1 dark:bg-slate-800">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cx("cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition", filter === f.id ? "bg-white text-ink-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-ink-600 hover:text-ink-900 dark:text-slate-400")}
            >
              {f.label} <span className="tabular text-ink-400">{f.n}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setLv({ ...blankLeave(), staff: staff[0]?.id || "" })} disabled={!staff.length}>
          <Icon name="plus" className="size-4" /> New leave request
        </Button>
      </div>
      <Meta className="mb-4 text-xs">
        Leave request form: the employee signs, then HR approves and signs. The supervisor box is left blank for the supervisor to tick and sign by hand on the printed form. Staff send their own from My HR.
      </Meta>

      {list.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((l) => (
            <LeaveCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <Empty>{filter === "all" ? "No leave requests yet." : "Nothing waiting."}</Empty>
      )}

      <Modal
        open={!!lv}
        onClose={() => setLv(null)}
        wide
        title="Leave request form"
        actions={<Button variant="primary" size="sm" onClick={submit}>Send to HR</Button>}
      >
        {lv && (
          <>
            <LeaveFields lv={lv} setLv={setLv} staff={staff} />
            <Meta className="mt-5 text-xs">
              {online && staff.find((x) => x.id === lv.staff)?.userId === me
                ? "This is your own request: it is signed with your signature as the employee."
                : "Logged by HR for this staff member: the employee signature box shows who logged it."}
            </Meta>
            <Button variant="primary" className="mt-4" onClick={submit}>Send to HR</Button>
          </>
        )}
      </Modal>
    </div>
  );
}
