import { useEffect, useState } from "react";
import { update, useData, type FollowUp } from "@/lib/store";

const DUE_MS = 2 * 3600e3;

export function useNow(ms = 1000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(Date.now());
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

export function answerFollowUp(id: string, f: FollowUp) {
  update((d) => ({ ...d, doses: d.doses.map((x) => (x.id === id ? { ...x, followUp: f } : x)) }));
}

export function FollowUps({ includeEarly = false }: { includeEarly?: boolean }) {
  const d = useData();
  const now = useNow(30000);
  const [step, setStep] = useState<Record<string, "yes" | "little">>({});
  const due = d.doses.filter((x) => !x.followUp && (includeEarly || now - x.time >= DUE_MS) && now - x.time < 7 * 864e5);

  useEffect(() => {
    if (!now || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const seen = JSON.parse(sessionStorage.getItem("ml-notified") ?? "[]") as string[];
    const fresh = due.filter((x) => !seen.includes(x.id) && now - x.time >= DUE_MS);
    fresh.forEach((x) => new Notification("Did it help?", { body: `${x.med} ${x.dose} — tap to answer in Migraine Log`, tag: x.id, silent: true }));
    if (fresh.length) sessionStorage.setItem("ml-notified", JSON.stringify([...seen, ...fresh.map((x) => x.id)]));
  }, [due, now]);

  if (!due.length) return null;
  return (
    <section aria-label="Medication check-ins" className="card-soft space-y-4">
      {due.map((x) => (
        <div key={x.id} className="space-y-2">
          <p className="font-bold">
            Did {x.med} {x.dose} help?{" "}
            <span className="font-normal text-muted-foreground">
              taken {new Date(x.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </p>
          {!step[x.id] ? (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn" onClick={() => setStep({ ...step, [x.id]: "yes" })}>Yes</button>
              <button className="btn btn-ghost" onClick={() => setStep({ ...step, [x.id]: "little" })}>A little</button>
              <button className="btn btn-ghost" onClick={() => answerFollowUp(x.id, { result: "no", answeredAt: Date.now() })}>No</button>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm">When did you start feeling relief?</p>
              <div className="grid grid-cols-3 gap-2">
                {[30, 60, 120, 180, 240, 480].map((m) => (
                  <button key={m} className="btn btn-ghost" onClick={() => answerFollowUp(x.id, { result: step[x.id], reliefMinutes: m, answeredAt: Date.now() })}>
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
