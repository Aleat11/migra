const REGIONS: { id: string; d: string; lx: number; ly: number }[] = [
  { id: "Top of head", d: "M60 40 Q100 5 140 40 L130 55 Q100 35 70 55 Z", lx: 100, ly: 32 },
  { id: "Forehead", d: "M70 55 Q100 35 130 55 L130 80 L70 80 Z", lx: 100, ly: 68 },
  { id: "Left temple", d: "M60 40 L70 55 L70 100 L48 95 Q45 60 60 40 Z", lx: 58, ly: 75 },
  { id: "Right temple", d: "M140 40 L130 55 L130 100 L152 95 Q155 60 140 40 Z", lx: 142, ly: 75 },
  { id: "Left eye", d: "M70 80 L100 80 L100 105 L70 105 Z", lx: 85, ly: 94 },
  { id: "Right eye", d: "M100 80 L130 80 L130 105 L100 105 Z", lx: 115, ly: 94 },
  { id: "Jaw / face", d: "M70 105 L130 105 L125 145 Q100 165 75 145 Z", lx: 100, ly: 130 },
  { id: "Left neck", d: "M75 150 Q85 158 98 162 L98 195 L70 195 Z", lx: 85, ly: 180 },
  { id: "Right neck", d: "M125 150 Q115 158 102 162 L102 195 L130 195 Z", lx: 115, ly: 180 },
];

export function HeadMap({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const back = value.includes("Back of head");
  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="40 0 120 200"
        className="w-64 max-w-full"
        role="group"
        aria-label="Head map, select all painful areas"
      >
        {REGIONS.map((r) => {
          const on = value.includes(r.id);
          return (
            <path
              key={r.id}
              d={r.d}
              role="checkbox"
              aria-checked={on}
              aria-label={r.id}
              tabIndex={0}
              onClick={() => toggle(r.id)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(r.id))
              }
              className={`cursor-pointer stroke-foreground transition-colors ${on ? "fill-accent" : "fill-card hover:fill-muted"}`}
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
      <button
        type="button"
        className="chip"
        aria-pressed={back}
        onClick={() => toggle("Back of head")}
      >
        Back of head
      </button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {value.length ? value.join(", ") : "Tap every area that hurts"}
      </p>
    </div>
  );
}
