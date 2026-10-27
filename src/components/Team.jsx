import { useEffect, useState } from "react";
import { useHub } from "../lib/store";
import { localSnapshot, moveLocalOnline } from "../lib/store";
import { listProfiles, updateProfile, useAuth } from "../lib/auth";
import { ROLES, lbl } from "../lib/logic";
import { Button, Card, Empty, Meta, SectionTitle, Tag, cx, Select } from "./ui";
import { useToast } from "./ui/Toast";

const ROLE_OPTIONS = [...ROLES, { value: "Staff", label: "Staff (My HR only)" }];
const HR_LINKED = ["hrleave", "timesheets", "appraisals"];

// Admins: approve sign-ups, set roles, link accounts to staff records, and move this browser's old data online.
export default function Team() {
  const { profile, refreshProfile } = useAuth();
  const hub = useHub();
  const { hrstaff, put } = hub;
  const toast = useToast();
  const [people, setPeople] = useState(null);
  const [moving, setMoving] = useState("");
  const snap = localSnapshot();

  const load = () => listProfiles().then(setPeople).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function change(p, patch, msg, ask) {
    if (ask && !window.confirm(ask)) return;
    try {
      await updateProfile(p.id, patch);
      setPeople((l) => l.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
      if (p.id === profile.id) refreshProfile();
      if (msg) toast(msg, "success");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Linking gives the person access to their own staff record, timesheets, appraisals and leave.
  function link(p, staffId) {
    const prev = hrstaff.find((s) => s.userId === p.id);
    if (prev && prev.id !== staffId) put("hrstaff", { ...prev, userId: null });
    const st = hrstaff.find((s) => s.id === staffId);
    if (!st) return;
    put("hrstaff", { ...st, userId: p.id, email: st.email || p.email });
    HR_LINKED.forEach((col) => hub[col].filter((r) => (r.staffId || r.staff) === st.id).forEach((r) => put(col, { ...r, staffUserId: p.id })));
    toast(`${p.full_name || p.email} linked to the staff record of ${st.name}.`, "success");
  }

  async function moveOnline() {
    setMoving("Starting…");
    try {
      const r = await moveLocalOnline(setMoving);
      toast(`Moved online: ${r.records} records and ${r.files} files. Reloading…`, "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast("Could not move the data: " + e.message, "error");
      setMoving("");
    }
  }

  // The tab is only shown to admins, and the database refuses account changes from anyone else.
  if (!profile?.is_admin || !profile?.approved) return <Empty>Only admins can manage accounts.</Empty>;

  const pending = (people || []).filter((p) => !p.approved);
  const approved = (people || []).filter((p) => p.approved);

  const row = (p) => {
    const linked = hrstaff.find((s) => s.userId === p.id);
    return (
      <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-900 dark:text-white">
            {p.full_name || "—"} {p.id === profile.id && <span className="text-xs text-ink-500">(you)</span>}
          </div>
          <Meta className="truncate text-xs">{p.email}</Meta>
        </div>
        {p.is_admin && <Tag tone="Approved">Admin</Tag>}
        <div className="w-44">
          <Select size="sm" aria-label="Role" value={p.role} onChange={(v) => change(p, { role: v }, `${p.full_name || p.email} is now ${lbl(v)}.`)} options={ROLE_OPTIONS} />
        </div>
        <div className="w-52">
          <Select
            size="sm"
            aria-label="Staff record"
            value={linked?.id || ""}
            onChange={(v) => link(p, v)}
            options={[
              { value: "", label: "Not linked to a staff record" },
              ...hrstaff.filter((s) => !s.userId || s.userId === p.id).map((s) => ({ value: s.id, label: s.name, hint: s.pos || s.dept })),
            ]}
          />
        </div>
        {p.approved ? (
          p.id !== profile.id && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  p.is_admin
                    ? change(p, { is_admin: false }, `${p.full_name || p.email} is no longer an admin.`)
                    : change(p, { is_admin: true }, `${p.full_name || p.email} is now an admin.`, `Make ${p.full_name || p.email} an admin? Admins can approve accounts, change roles and give admin rights.`)
                }
              >
                {p.is_admin ? "Remove admin" : "Make admin"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => change(p, { approved: false }, "Access removed.", `Remove ${p.full_name || p.email}'s access to the Hub?`)}>Remove access</Button>
            </>
          )
        ) : (
          <Button size="sm" variant="primary" onClick={() => change(p, { approved: true }, `${p.full_name || p.email} can now sign in.`)}>Approve</Button>
        )}
      </li>
    );
  };

  return (
    <section>
      <SectionTitle title="Team" subtitle="Staff accounts: approve new sign-ups, set roles and link each person to their staff record." />

      {people === null ? (
        <Meta>Loading…</Meta>
      ) : (
        <div className="space-y-6">
          <Card accent={pending.length ? "warn" : undefined}>
            <h3 className="font-semibold text-ink-900 dark:text-white">Waiting for approval ({pending.length})</h3>
            {pending.length ? <ul className="divide-y divide-line dark:divide-slate-800">{pending.map(row)}</ul> : <Meta className="mt-2">No one is waiting.</Meta>}
          </Card>
          <Card>
            <h3 className="font-semibold text-ink-900 dark:text-white">Active accounts ({approved.length})</h3>
            {approved.length ? <ul className="divide-y divide-line dark:divide-slate-800">{approved.map(row)}</ul> : <Empty>No accounts yet.</Empty>}
            <Meta className="mt-3 text-xs">
              Staff create their own account from the sign-in page. Set their role, link them to their staff record so they see their own timesheets and appraisals, then approve.
            </Meta>
          </Card>

          {snap && snap.total > 0 && (
            <Card accent="brand">
              <h3 className="font-semibold text-ink-900 dark:text-white">Data saved in this browser</h3>
              <Meta className="mt-1">
                This browser still holds data from before the Hub went online:{" "}
                {Object.entries(snap.counts).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(", ")}. Move it online so everyone can use it.
              </Meta>
              <Button variant="primary" className={cx("mt-3")} onClick={moveOnline} disabled={!!moving}>
                {moving || "Move this data online"}
              </Button>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
