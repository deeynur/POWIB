import { useEffect, useState } from "react";
import { useHub, readLocal, writeLocal } from "./lib/store";
import { useAuth } from "./lib/auth";
import { useCounts } from "./lib/counts";
import Header from "./components/Header";
import NavTabs, { visibleTabs } from "./components/NavTabs";
import Footer from "./components/Footer";
import Dashboard from "./components/Dashboard";
import Procurement from "./components/procurement/Procurement";
import NewRequestModal from "./components/procurement/NewRequestModal";
import Documents from "./components/Documents";
import Vendors from "./components/Vendors";
import Finance from "./components/finance/Finance";
import HR from "./components/hr/HR";
import MyHR from "./components/hr/MyHR";
import Team from "./components/Team";
import { Button, Meta } from "./components/ui";

function useTheme() {
  const [theme, setTheme] = useState(
    () => readLocal("powib-theme", null) || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeLocal("powib-theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export default function App() {
  const hub = useHub();
  const { profile } = useAuth();
  const counts = useCounts(hub);
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState("dash");
  const [newOpen, setNewOpen] = useState(false);

  // Only tabs this person may see; anything else falls back to their first tab.
  const visible = visibleTabs(hub.role, { online: hub.online, admin: !!profile?.is_admin });
  const current = visible.some((t) => t.id === tab) ? tab : visible[0]?.id;

  useEffect(() => {
    const n = counts.badges.dash;
    document.title = `${n ? `(${n}) ` : ""}Organization Hub · POWIB`;
  }, [counts.badges.dash]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header theme={theme} onTheme={toggleTheme} onNewRequest={() => setNewOpen(true)} />
      <NavTabs tab={current} onTab={setTab} badges={counts.badges} visible={visible} />
      {hub.syncError && (
        <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {hub.syncError}{" "}
          <Button size="sm" variant="ghost" onClick={hub.clearSyncError}>Dismiss</Button>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {!hub.ready ? (
          <Meta className="py-20 text-center">Loading the Hub…</Meta>
        ) : (
          <div key={current} className="animate-fade-up">
            {current === "dash" && <Dashboard counts={counts} onTab={setTab} />}
            {current === "proc" && <Procurement onNewRequest={() => setNewOpen(true)} />}
            {current === "fin" && <Finance />}
            {current === "vendors" && <Vendors />}
            {current === "docs" && <Documents />}
            {current === "hr" && <HR />}
            {current === "me" && <MyHR />}
            {current === "team" && <Team />}
          </div>
        )}
      </main>
      <Footer onTab={setTab} visible={visible} />
      <NewRequestModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
