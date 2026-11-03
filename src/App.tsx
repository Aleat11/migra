import { useState } from "react";
import { Toaster } from "sonner";
import { Shell } from "./components/Shell";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Insights } from "./pages/Insights";
import { Report } from "./pages/Report";

export type Tab = "today" | "history" | "insights" | "report";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  return (
    <>
      <Toaster position="top-center" richColors closeButton />
      <Shell tab={tab} onTab={setTab}>
        {tab === "today" && <Today />}
        {tab === "history" && <History />}
        {tab === "insights" && <Insights />}
        {tab === "report" && <Report />}
      </Shell>
    </>
  );
}
