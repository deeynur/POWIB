import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { localFiles, uploadBlob } from "./files";

// The Hub's data. Collections mirror the original Hub: requests, payments (RFP + PV), documents, vendors,
// emails (vendor email log), hrstaff, hrleave, timesheets (one per staff per month), appraisals.
// Online (Supabase connected): every record is a row in the "records" table, updated live for everyone.
// Offline: everything is saved in this browser (localStorage), as before.
const KEY = "powib-hub-v2";
const COLLECTIONS = ["requests", "payments", "documents", "vendors", "emails", "hrstaff", "hrleave", "timesheets", "appraisals"];
const HR_COLS = new Set(["hrstaff", "hrleave", "timesheets", "appraisals"]);
const EMPTY = {
  ...Object.fromEntries(COLLECTIONS.map((c) => [c, []])),
  settings: { templates: {} },
  signatures: {},
  vendorBank: {},
};

function read(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

function initial() {
  const s = read(KEY, null);
  if (s) return { ...EMPTY, ...s, settings: { ...EMPTY.settings, ...s.settings } };
  // Pick up requests saved by the old single-file Hub, if any.
  return { ...EMPTY, requests: read("procurement-v1", []) };
}

/* ---------- online rows <-> collections ---------- */

// Online, vendor bank details are stored apart from the vendor ("vendor_bank") so the database can keep them
// from roles that should not see them. They are merged back into each vendor here.
export const BANK_FIELDS = ["bankName", "accountName", "accountNo"];
const withoutBank = (v) => Object.fromEntries(Object.entries(v).filter(([k]) => !BANK_FIELDS.includes(k)));

function applyRow(d, row, removed) {
  const { collection: col, id } = row;
  if (col === "settings") return removed ? d : { ...d, settings: { ...EMPTY.settings, ...row.data } };
  if (col === "vendor_bank") {
    const bank = { ...(d.vendorBank || {}) };
    if (removed) delete bank[id];
    else bank[id] = row.data || {};
    const vendors = d.vendors.map((v) => (v.id === id ? { ...withoutBank(v), ...(removed ? {} : pick(bank[id])) } : v));
    return { ...d, vendorBank: bank, vendors };
  }
  if (col === "vendors" && !removed) row = { ...row, data: { ...row.data, ...pick(d.vendorBank?.[id]) } };
  if (col === "signatures") {
    const s = { ...d.signatures };
    if (removed) delete s[id];
    else s[id] = row.data?.fileId;
    return { ...d, signatures: s };
  }
  const list = d[col] || [];
  if (removed) return { ...d, [col]: list.filter((x) => x.id !== id) };
  const i = list.findIndex((x) => x.id === id);
  return { ...d, [col]: i < 0 ? [...list, row.data] : list.map((x, j) => (j === i ? row.data : x)) };
}

// Tidies what was typed into a form before it is saved: removes invisible control and text-direction characters
// (used to disguise text), drops keys that could tamper with objects, and caps very long text.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​‪-‮⁦-⁩﻿]/g;
const MAX_TEXT = 20000;
export function clean(v) {
  if (typeof v === "string") return v.replace(UNSAFE_CHARS, "").slice(0, MAX_TEXT);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).filter(([k]) => !["__proto__", "constructor", "prototype"].includes(k)).map(([k, x]) => [k, clean(x)]));
  return v;
}

// Only the bank fields of a vendor_bank record.
function pick(b) {
  return Object.fromEntries(BANK_FIELDS.filter((k) => b?.[k] != null).map((k) => [k, b[k]]));
}

async function fetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("records").select("collection,id,data").order("updated_at").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// The staff member's account a HR record belongs to, so they (and only they) can see it.
function ownerFor(col, rec, d) {
  if (!HR_COLS.has(col)) return null;
  if (col === "hrstaff") return rec.userId || null;
  if (rec.staffUserId) return rec.staffUserId;
  const st = d.hrstaff.find((s) => s.id === (rec.staffId || rec.staff));
  return st?.userId || null;
}

const Ctx = createContext(null);

export function HubProvider({ children }) {
  const auth = useAuth();
  const isOnline = auth.online;
  const me = auth.user?.id;
  const approved = !!auth.profile?.approved;
  const [data, setData] = useState(() => (isOnline ? EMPTY : initial()));
  const [ready, setReady] = useState(!isOnline);
  const [syncError, setSyncError] = useState("");
  const [localRole, setLocalRole] = useState(() => read("powib-role", "Program"));
  const dataRef = useRef(data);
  dataRef.current = data;

  // Offline: save to this browser, and keep open tabs in step so an older tab never saves over newer records.
  useEffect(() => {
    if (!isOnline) write(KEY, data);
  }, [data, isOnline]);
  useEffect(() => {
    if (isOnline) return;
    const onStorage = (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          const s = JSON.parse(e.newValue);
          setData({ ...EMPTY, ...s, settings: { ...EMPTY.settings, ...s.settings } });
        } catch {
          /* ignore a malformed value */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isOnline]);

  // Online: load everything this account may see, then follow live changes.
  useEffect(() => {
    if (!isOnline || !me || !approved) return;
    let live = true;
    setReady(false);
    fetchAll()
      .then((rows) => {
        if (!live) return;
        setData(rows.reduce((d, r) => applyRow(d, r), EMPTY));
        setReady(true);
      })
      .catch((e) => live && setSyncError("Could not load data: " + e.message));
    const ch = supabase
      .channel("records-" + me)
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, (p) => {
        if (p.eventType === "DELETE") setData((d) => applyRow(d, p.old, true));
        else setData((d) => applyRow(d, p.new));
      })
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(ch);
    };
  }, [isOnline, me, approved]);

  // Reload one record from the database (used when a change is refused, so the screen shows what is really saved).
  const refetch = useCallback(async (col, id) => {
    const { data: row } = await supabase.from("records").select("collection,id,data").match({ collection: col, id }).maybeSingle();
    setData((d) => (row ? applyRow(d, row) : applyRow(d, { collection: col, id }, true)));
  }, []);

  const save = useCallback(
    async (row) => {
      const { error } = await supabase.from("records").upsert({ ...row, updated_at: new Date().toISOString() });
      if (error) {
        // The database's own rules refused it: say why, and undo it on screen.
        setSyncError("Not saved: " + error.message);
        refetch(row.collection, row.id);
      }
    },
    [refetch]
  );

  const role = isOnline ? auth.profile?.role || "Staff" : localRole;

  const setRole = useCallback((r) => {
    setLocalRole(r);
    write("powib-role", r);
  }, []);

  // Insert or replace a record by id.
  const put = useCallback(
    (col, input) => {
      const rec = clean(input);
      setData((d) => applyRow(d, { collection: col, id: rec.id, data: rec }));
      if (!isOnline) return;
      if (col === "vendors") {
        // Bank details go to their own protected record; the vendor row never holds them.
        save({ collection: "vendors", id: rec.id, data: withoutBank(rec) });
        const bank = pick(rec);
        const had = dataRef.current.vendorBank?.[rec.id];
        if ((Object.keys(bank).length || had) && ["Logistics", "Finance"].includes(auth.profile?.role))
          save({ collection: "vendor_bank", id: rec.id, data: { id: rec.id, ...bank } });
        return;
      }
      save({ collection: col, id: rec.id, data: rec, staff_user: ownerFor(col, rec, dataRef.current) });
    },
    [isOnline, save, auth.profile?.role]
  );

  const remove = useCallback(
    (col, id) => {
      setData((d) => applyRow(d, { collection: col, id }, true));
      if (!isOnline) return;
      const del = (c) =>
        supabase
          .from("records")
          .delete()
          .match({ collection: c, id })
          .then(({ error }) => {
            if (error) {
              setSyncError("Not removed: " + error.message);
              refetch(c, id);
            }
          });
      del(col);
      if (col === "vendors") del("vendor_bank");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline]
  );

  const setSettings = useCallback(
    (patch) => {
      const settings = { ...dataRef.current.settings, ...patch };
      setData((d) => ({ ...d, settings }));
      if (isOnline) save({ collection: "settings", id: "main", data: settings });
    },
    [isOnline, save]
  );

  // Signatures belong to the signed-in person online, and to the chosen role offline.
  const setSignature = useCallback(
    (r, fileId) => {
      const k = isOnline ? me : r;
      setData((d) => ({ ...d, signatures: { ...d.signatures, [k]: fileId } }));
      if (isOnline) save({ collection: "signatures", id: me, data: { fileId } });
    },
    [isOnline, me, save]
  );

  const value = useMemo(
    () => ({
      ...data,
      online: isOnline,
      ready,
      syncError,
      clearSyncError: () => setSyncError(""),
      templates: data.settings.templates,
      role,
      me,
      mysig: data.signatures[isOnline ? me : role] || null,
      setRole,
      put,
      remove,
      setSettings,
      setSignature,
    }),
    [data, isOnline, ready, syncError, role, me, setRole, put, remove, setSettings, setSignature]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useHub = () => useContext(Ctx);
export { read as readLocal, write as writeLocal };

/* ---------- moving this browser's data online ---------- */

// What this browser holds from before going online (nothing once it has been moved; the copy is kept as a backup).
const MOVED = "powib-hub-moved-online";
export function localSnapshot() {
  const s = read(KEY, null);
  if (!s || read(MOVED, null)) return null;
  const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, (s[c] || []).length]));
  return { data: s, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// Uploads this browser's files and records to Supabase. Records already online with the same id are replaced.
export async function moveLocalOnline(onProgress) {
  const snap = localSnapshot();
  if (!snap) return { records: 0, files: 0 };
  const files = await localFiles();
  let done = 0;
  for (const f of files) {
    await uploadBlob(f.id, f.blob);
    onProgress?.(`Uploading files ${++done} of ${files.length}…`);
  }
  const d = { ...EMPTY, ...snap.data };
  const now = new Date().toISOString();
  const rows = COLLECTIONS.flatMap((col) =>
    (d[col] || []).map((rec) => ({ collection: col, id: String(rec.id), data: col === "vendors" ? withoutBank(rec) : rec, staff_user: ownerFor(col, rec, d), updated_at: now }))
  );
  // Vendor bank details go to their protected records.
  (d.vendors || []).forEach((v) => {
    const bank = pick(v);
    if (Object.keys(bank).length) rows.push({ collection: "vendor_bank", id: String(v.id), data: { id: v.id, ...bank }, updated_at: now });
  });
  if (d.settings && Object.keys(d.settings.templates || {}).length) rows.push({ collection: "settings", id: "main", data: d.settings, updated_at: new Date().toISOString() });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("records").upsert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
    onProgress?.(`Saving records ${Math.min(i + 200, rows.length)} of ${rows.length}…`);
  }
  write(MOVED, new Date().toISOString());
  return { records: rows.length, files: files.length };
}
