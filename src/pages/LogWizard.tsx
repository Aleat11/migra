import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { HeadMap } from "@/components/HeadMap";
import { Chips, SectionTitle } from "@/components/Shell";
import {
  addAttack,
  addDose,
  removeDose,
  upsertAttack,
  useData,
  type Attack,
  type Dose,
} from "@/lib/store";
import { SYMPTOM_OPTIONS, TRIGGER_OPTIONS } from "@/lib/scores";
import { cn } from "@/lib/utils";

const STEPS = ["When", "Pain", "Location", "Symptoms & triggers", "Meds & notes"];

function toLocalInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

interface MedRow {
  key: string;
  med: string;
  dose: string;
  existingId?: string;
}

export function LogWizard({
  attack,
  onClose,
}: {
  attack: Attack | null; // null = new attack
  onClose: () => void;
}) {
  const d = useData();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState(toLocalInput(attack?.start ?? Date.now()));
  const [end, setEnd] = useState(attack?.end ? toLocalInput(attack.end) : "");
  const [endedInSleep, setEndedInSleep] = useState(attack?.endedInSleep ?? false);
  const [recovery, setRecovery] = useState<"clear" | "recovering" | null>(
    attack?.recovery ?? null,
  );
  const [pain, setPain] = useState<number | null>(attack?.pain ?? null);
  const [locations, setLocations] = useState<string[]>(attack?.locations ?? []);
  const [symptoms, setSymptoms] = useState<string[]>(attack?.symptoms ?? []);
  const [triggers, setTriggers] = useState<string[]>(attack?.triggers ?? []);
  const [notes, setNotes] = useState(attack?.notes ?? "");
  const [meds, setMeds] = useState<MedRow[]>(() => {
    if (!attack) return [];
    return d.doses
      .filter((x) => x.attackId === attack.id)
      .map((x) => ({ key: x.id, med: x.med, dose: x.dose, existingId: x.id }));
  });
  const [removed, setRemoved] = useState<string[]>([]);

  const startMs = fromLocalInput(start);
  const endMs = fromLocalInput(end);
  const canNext = step !== 0 || startMs != null;

  const removeMed = (key: string, existingId?: string) => {
    setMeds(meds.filter((m) => m.key !== key));
    if (existingId) setRemoved([...removed, existingId]);
  };

  const save = () => {
    if (startMs == null) {
      toast.error("Set a start time first.");
      setStep(0);
      return;
    }
    if (endMs != null && endMs < startMs) {
      toast.error("End time is before start time.");
      setStep(0);
      return;
    }
    const patch = {
      start: startMs,
      end: endMs,
      pain,
      locations,
      symptoms,
      triggers,
      notes: notes.trim(),
      endedInSleep: endMs != null ? endedInSleep : false,
      recovery: endMs != null ? recovery : null,
    };
    let id = attack?.id;
    if (id) {
      upsertAttack(id, patch);
    } else {
      id = addAttack({ ...patch, pressureAtOnset: null });
    }
    for (const rid of removed) removeDose(rid);
    for (const m of meds) {
      if (m.existingId || !m.med.trim()) continue;
      addDose({ med: m.med.trim(), dose: m.dose.trim(), time: startMs, attackId: id });
    }
    toast.success(attack ? "Attack updated." : "Attack logged.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Log attack">
      <div className="mx-auto max-w-xl px-4 pt-4 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{attack ? "Edit attack" : "Log attack"}</h2>
          <button className="chip" onClick={onClose} aria-label="Close">
            <X size={15} /> Close
          </button>
        </div>

        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="grad-dot h-full rounded-full"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <SectionTitle>When did it happen?</SectionTitle>
            <div>
              <label className="field-label" htmlFor="wz-start">Started</label>
              <input id="wz-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="field-label" htmlFor="wz-end">Ended (leave blank if still going)</label>
              <input id="wz-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full" />
              {end && (
                <button className="chip mt-2" onClick={() => setEnd("")}>Clear end time</button>
              )}
            </div>
            {endMs != null && (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={endedInSleep}
                    onChange={(e) => setEndedInSleep(e.target.checked)}
                    className="h-5 w-5 accent-[var(--primary)]"
                  />
                  It ended while I was asleep
                </label>
                <div>
                  <p className="field-label">How did it end?</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="How did it end">
                    {(["clear", "recovering"] as const).map((r) => {
                      const label = r === "clear" ? "Fully clear" : "Still recovering";
                      const on = recovery === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          className={cn("chip", on && "border-primary bg-accent")}
                          aria-pressed={on}
                          onClick={() => setRecovery(on ? null : r)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <SectionTitle>How bad is the pain?</SectionTitle>
            <p className="stat-num grad-text text-center text-6xl" aria-live="polite">
              {pain == null ? "-" : pain}
              <span className="text-xl text-muted-foreground">/10</span>
            </p>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={pain ?? 5}
              onChange={(e) => setPain(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
              aria-label="Pain level 0 to 10"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPain(i)}
                  aria-pressed={pain === i}
                  aria-label={`Pain ${i}`}
                  className={cn(
                    "chip min-h-10 justify-center px-0",
                    pain === i && "border-primary bg-accent",
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SectionTitle>Where does it hurt?</SectionTitle>
            <HeadMap value={locations} onChange={setLocations} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <SectionTitle>Symptoms</SectionTitle>
              <Chips options={SYMPTOM_OPTIONS} value={symptoms} onChange={setSymptoms} label="Symptoms" />
            </div>
            <div>
              <SectionTitle>Possible triggers</SectionTitle>
              <Chips options={TRIGGER_OPTIONS} value={triggers} onChange={setTriggers} label="Triggers" />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <SectionTitle>Medication taken</SectionTitle>
              <div className="space-y-2">
                {meds.map((m) => (
                  <div key={m.key} className="flex gap-2">
                    <input
                      placeholder="Medication"
                      value={m.med}
                      onChange={(e) => setMeds(meds.map((x) => (x.key === m.key ? { ...x, med: e.target.value } : x)))}
                      className="flex-1"
                      aria-label="Medication name"
                    />
                    <input
                      placeholder="Dose"
                      value={m.dose}
                      onChange={(e) => setMeds(meds.map((x) => (x.key === m.key ? { ...x, dose: e.target.value } : x)))}
                      className="w-24"
                      aria-label="Dose"
                    />
                    <button
                      className="chip shrink-0"
                      onClick={() => removeMed(m.key, m.existingId)}
                      aria-label="Remove medication"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="chip mt-2"
                onClick={() => setMeds([...meds, { key: `${Date.now()}-${meds.length}`, med: "", dose: "" }])}
              >
                <Plus size={14} /> Add medication
              </button>
            </div>
            <div>
              <label className="field-label" htmlFor="wz-notes">Notes</label>
              <textarea
                id="wz-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else worth remembering"
                className="w-full"
              />
            </div>
          </div>
        )}

        <div className="mt-8 flex gap-2">
          {step > 0 && (
            <button className="btn btn-ghost flex-1" onClick={() => setStep(step - 1)}>Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn flex-1" onClick={() => canNext && setStep(step + 1)} disabled={!canNext}>
              Next
            </button>
          ) : (
            <button className="btn flex-1" onClick={save}>Save attack</button>
          )}
        </div>
      </div>
    </div>
  );
}

export type { Dose };
