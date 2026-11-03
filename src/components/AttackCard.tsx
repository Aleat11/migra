import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  attackDoses,
  deleteAttack,
  fmtDateTime,
  fmtDuration,
  useData,
  type Attack,
} from "@/lib/store";
import { cn } from "@/lib/utils";

function painInfo(p: number | null): { label: string; dot: string } {
  if (p == null) return { label: "pain not logged", dot: "bg-muted-foreground/40" };
  if (p <= 3) return { label: `mild · ${p}/10`, dot: "bg-emerald-500" };
  if (p <= 6) return { label: `moderate · ${p}/10`, dot: "bg-amber-500" };
  return { label: `severe · ${p}/10`, dot: "bg-rose-500" };
}

export function AttackCard({ attack, onEdit }: { attack: Attack; onEdit: () => void }) {
  const d = useData();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const doses = attackDoses(d, attack.id);
  const live = attack.end == null;
  const pi = painInfo(attack.pain);

  return (
    <article className="card-soft p-4">
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", pi.dot)} aria-hidden="true" />
          <div>
            <p className="font-bold">
              {fmtDateTime(attack.start)}
              {live && (
                <span className="grad-dot ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white">
                  ongoing
                </span>
              )}
              {attack.recovery === "recovering" && (
                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  recovering
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {pi.label}
              {attack.end != null && ` · ${fmtDuration(attack.end - attack.start)}`}
              {attack.pressureAtOnset != null && ` · ${Math.round(attack.pressureAtOnset)} hPa`}
            </p>
          </div>
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          {attack.locations.length > 0 && (
            <p><span className="font-semibold">Where:</span> {attack.locations.join(", ")}</p>
          )}
          {attack.symptoms.length > 0 && (
            <p><span className="font-semibold">Symptoms:</span> {attack.symptoms.join(", ")}</p>
          )}
          {attack.triggers.length > 0 && (
            <p><span className="font-semibold">Triggers:</span> {attack.triggers.join(", ")}</p>
          )}
          {doses.length > 0 && (
            <p>
              <span className="font-semibold">Meds:</span>{" "}
              {doses.map((x) => `${x.med}${x.dose ? ` ${x.dose}` : ""}`).join(", ")}
            </p>
          )}
          {attack.notes && <p><span className="font-semibold">Notes:</span> {attack.notes}</p>}
          {attack.end != null && (
            <p className="text-muted-foreground">
              Ended {fmtDateTime(attack.end)}
              {attack.endedInSleep && " · ended while asleep"}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button className="btn btn-ghost min-h-10 py-2 text-sm" onClick={onEdit}>Edit</button>
            {confirming ? (
              <>
                <button className="btn btn-danger min-h-10 py-2 text-sm" onClick={() => deleteAttack(attack.id)}>Confirm delete</button>
                <button className="btn btn-ghost min-h-10 py-2 text-sm" onClick={() => setConfirming(false)}>Keep</button>
              </>
            ) : (
              <button className="btn btn-ghost min-h-10 py-2 text-sm" onClick={() => setConfirming(true)} aria-label="Delete attack">
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
