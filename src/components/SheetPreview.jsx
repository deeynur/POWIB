import { useEffect, useRef, useState } from "react";
import { getBytes } from "../lib/files";
import { readWorkbook, sheetModel } from "../lib/excel";
import { Button, Empty, Meta } from "./ui";

// Scales the sheet down to the width of the window, like Excel's "fit to page width",
// but never below 55% so the text stays readable (wider sheets then scroll sideways).
function useFitScale(model, fit) {
  const box = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || !model) return;
    const update = () => setScale(fit ? Math.min(1, Math.max(0.55, (el.clientWidth - 2) / model.width)) : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [model, fit]);
  return [box, scale];
}

// Renders one sheet of an uploaded Excel file.
// pick(wb) chooses the sheet; marks(ws) returns signatures and dates to show in cells; reloadKey re-renders when they change.
export default function SheetPreview({ file, pick, marks, reloadKey }) {
  const [model, setModel] = useState(null);
  const [err, setErr] = useState(false);
  const [fit, setFit] = useState(true);
  const [box, scale] = useFitScale(model, fit);

  useEffect(() => {
    setModel(null);
    setErr(false);
    if (!file) return;
    let live = true;
    (async () => {
      const wb = await readWorkbook(await getBytes(file));
      const ws = pick ? pick(wb) : wb.worksheets[0];
      const m = marks ? await marks(ws) : {};
      if (live) setModel(sheetModel(ws, m));
    })().catch(() => live && setErr(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, reloadKey]);

  if (!file) return <Empty>No file is attached.</Empty>;
  if (err) return <Empty>Could not display this file. Use Download.</Empty>;
  if (!model) return <Meta>Loading…</Meta>;
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setFit(!fit)}>
          {fit ? "Actual size" : "Fit to width"}
        </Button>
      </div>
      <div ref={box} className="max-h-[66vh] overflow-auto rounded-lg border border-line bg-white text-black dark:border-slate-700">
        <table className="table-fixed border-collapse bg-white" style={{ width: model.width, zoom: scale }}>
          <colgroup>
            {model.widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <tbody>
            {model.rows.map((r, i) => (
              <tr key={i} style={{ height: r.height }}>
                {r.cells.map((c) => (
                  <td key={c.key} rowSpan={c.rowSpan} colSpan={c.colSpan} style={c.style}>
                    {c.img ? <img src={c.img} alt="Signature" className="mx-auto block max-h-12" /> : c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
