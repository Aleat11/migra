import { useState } from "react";
import { Check, ChevronDown, Flame } from "lucide-react";
import { toast } from "sonner";
import { dayKey, emptyDaily, isCheckedIn, saveDaily, useData, type DailyLog } from "@/lib/store";
import { checkInStreak } from "@/lib/analytics";
import { cn } from "@/lib/utils";

function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            className="chip"
            aria-pressed={value === o.v}
            onClick={() => onChange(value === o.v ? null : o.v)}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={() => onChange(!on)}>
      {label}
    </button>
  );
}

/** 30-second daily check-in. Feeds Smart Insights; never required. */
export function CheckIn() {
  const d = useData();
  const today = dayKey();
  const existing = d.daily[today];
  const done = isCheckedIn(existing);
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<DailyLog>(existing ?? emptyDaily(today));
  const streak = checkInStreak(d.daily);
  const set = (patch: Partial<DailyLog>) => setLog((l) => ({ ...l, ...patch }));

  const toggleOpen = () => {
    if (!open) setLog(d.daily[today] ?? emptyDaily(today));
    setOpen(!open);
  };

  const save = () => {
    saveDaily({ ...log, date: today });
    setOpen(false);
    toast.success(
      streak > 0 && !done ? `Checked in. ${streak + 1}-day streak!` : "Check-in saved.",
    );
  };

  return (
    <section aria-label="Daily check-in" className="card-soft">
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <div>
          <p className="font-bold">
            {done ? (
              <span className="inline-flex items-center gap-1.5">
                <Check size={16} className="text-primary" /> Checked in today
              </span>
            ) : (
              "How was your day?"
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {done ? "Tap to edit." : "30 seconds. Powers your personal trigger insights."}
            {streak > 1 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-foreground">
                <Flame size={13} className="text-orange-500" /> {streak} days
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-muted-foreground", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <Seg
            label="Sleep last night"
            value={log.sleepHours}
            onChange={(v) => set({ sleepHours: v })}
            options={[
              { v: 4, l: "<5h" },
              { v: 5.5, l: "5-6h" },
              { v: 7, l: "6-8h" },
              { v: 8.5, l: "8-9h" },
              { v: 10, l: "9h+" },
            ]}
          />
          <Seg
            label="Stress"
            value={log.stress}
            onChange={(v) => set({ stress: v })}
            options={[1, 2, 3, 4, 5].map((v) => ({
              v,
              l: ["Calm", "Low", "Some", "High", "Very high"][v - 1],
            }))}
          />
          <Seg
            label="Water"
            value={log.water}
            onChange={(v) => set({ water: v })}
            options={[
              { v: "low", l: "Not much" },
              { v: "ok", l: "Okay" },
              { v: "good", l: "Plenty" },
            ]}
          />
          <Seg
            label="Screen time"
            value={log.screen}
            onChange={(v) => set({ screen: v })}
            options={[
              { v: "low", l: "Light" },
              { v: "normal", l: "Normal" },
              { v: "high", l: "Heavy" },
            ]}
          />
          <Seg
            label="Caffeinated drinks"
            value={log.caffeine}
            onChange={(v) => set({ caffeine: v ?? 0 })}
            options={[0, 1, 2, 3, 4].map((v) => ({ v, l: v === 4 ? "4+" : String(v) }))}
          />
          <div>
            <p className="field-label">Today I...</p>
            <div className="flex flex-wrap gap-2">
              <Toggle
                label="Skipped a meal"
                on={log.skippedMeal}
                onChange={(v) => set({ skippedMeal: v })}
              />
              <Toggle label="Had alcohol" on={log.alcohol} onChange={(v) => set({ alcohol: v })} />
              <Toggle label="Have my period" on={log.period} onChange={(v) => set({ period: v })} />
            </div>
          </div>
          <button className="btn w-full" onClick={save}>
            Save check-in
          </button>
        </div>
      )}
    </section>
  );
}
