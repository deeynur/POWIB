import { useRef } from "react";
import { useHub } from "../../lib/store";
import { openFile, saveFiles } from "../../lib/files";
import { Button, Icon, Meta } from "../ui";
import { useToast } from "../ui/Toast";

// Download link for a blank HR form, with an upload button for HR. `kind` is "timesheet" or "appraisal".
export default function HrTemplate({ kind, label }) {
  const { role, templates, setSettings } = useHub();
  const toast = useToast();
  const input = useRef(null);
  const t = templates[kind];

  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const [r] = await saveFiles([f]);
      setSettings({ templates: { ...templates, [kind]: r } });
      toast(`${label} template uploaded.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {t ? (
        <button type="button" onClick={() => openFile(t)} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 dark:text-brand-300">
          <Icon name="download" className="size-4" /> {label} template: {t.name}
        </button>
      ) : (
        <Meta>No {label.toLowerCase()} template uploaded yet.</Meta>
      )}
      {role === "HR" && (
        <Button size="sm" variant="ghost" onClick={() => input.current.click()}>
          <Icon name="upload" className="size-4" /> {t ? "Replace" : "Upload"} template
        </Button>
      )}
      <input ref={input} type="file" hidden onChange={onFile} />
    </div>
  );
}
