import { useEffect, type ReactNode } from "react";
import { BarChart3, Clock3, FileText, Moon, Sun, Waves } from "lucide-react";
import { setSettings, useData } from "@/lib/store";
import type { Tab } from "@/App";
import { cn } from "@/lib/utils";

const NAV: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "history", label: "History", icon: Clock3 },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "report", label: "Report", icon: FileText },
];

export function Shell({
  children,
  tab,
  onTab,
}: {
  children: ReactNode;
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  const d = useData();
  const { migraineMode, highContrast } = d.settings;

  useEffect(() => {
    const h = document.documentElement;
    h.classList.toggle("migraine", migraineMode);
    h.classList.toggle("hc", highContrast);
    h.classList.toggle("dark", migraineMode);
  }, [migraineMode, highContrast]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <span
            className="grad-dot flex h-10 w-10 items-center justify-center rounded-2xl text-white"
            aria-hidden="true"
          >
            <Waves size={22} strokeWidth={2.4} />
          </span>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Migra</h1>
        </div>
        <button
          className="chip"
          aria-pressed={migraineMode}
          onClick={() => setSettings({ migraineMode: !migraineMode })}
          aria-label={migraineMode ? "Turn off migraine mode" : "Turn on migraine mode (dim screen)"}
        >
          {migraineMode ? <Sun size={15} /> : <Moon size={15} />}
          {migraineMode ? "Exit dim" : "Dim"}
        </button>
      </header>
      <main className="flex-1 px-4 pb-32">{children}</main>
      {!migraineMode && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10">
          <div className="mx-auto max-w-xl px-4 pb-4">
            <ul className="card-soft p-2 grid grid-cols-4 gap-1">
              {NAV.map((n) => {
                const active = n.id === tab;
                const Icon = n.icon;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => onTab(n.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition-all",
                        active ? "grad-hero" : "text-muted-foreground",
                      )}
                    >
                      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                      {n.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-6 px-1 text-xs leading-relaxed text-muted-foreground">
      Migra is a personal diary, not a medical device. It does not diagnose, treat, or give dosing
      advice. Talk to your clinician about any treatment decisions.
    </p>
  );
}

export function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => (on ? onChange(value.filter((x) => x !== o)) : onChange([...value, o]))}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display mb-3 text-xl font-bold tracking-tight">{children}</h2>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-soft text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
