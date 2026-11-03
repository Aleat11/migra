import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Disclaimer, Empty, SectionTitle } from "@/components/Shell";
import { ProGate } from "@/components/ProGate";
import { fmtDate, fmtDateTime, fmtDuration, saveResult, useData } from "@/lib/store";
import { HIT6, MIDAS, type Questionnaire } from "@/lib/scores";
import { exportReportPdf, reportQrDataUrl } from "@/lib/pdf";
import { headacheDays, medEffectiveness, medicationDays, rankTriggers } from "@/lib/analytics";
import { attacksCsv, downloadText } from "@/lib/backup";
import { usePro } from "@/lib/pro";
import { cn } from "@/lib/utils";

function gradePill(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("severe")) return "bg-rose-500/15 text-rose-700";
  if (l.includes("moderate") || l.includes("substantial"))
    return "bg-orange-500/15 text-orange-700";
  if (l.includes("mild") || l.includes("some")) return "bg-amber-500/15 text-amber-700";
  return "bg-emerald-500/15 text-emerald-700";
}

function QuestionnaireCard({ q }: { q: Questionnaire }) {
  const d = useData();
  const [open, setOpen] = useState(false);
  // -1 for HIT-6 forces every question to be chosen explicitly instead of pre-selecting "Rarely"
  const fresh = () => q.questions.map(() => (q.type === "midas" ? 0 : -1));
  const [answers, setAnswers] = useState<number[]>(fresh);
  const latest = d.results.find((r) => r.type === q.type);
  const allAnswered = answers.every((a) => a >= 0);

  const toggle = () => {
    if (!open) setAnswers(fresh());
    setOpen(!open);
  };

  const done = () => {
    if (!allAnswered) {
      toast.error("Please answer every question first.");
      return;
    }
    const score = q.score(answers);
    saveResult({ type: q.type, score, answers: [...answers] });
    setOpen(false);
    toast.success(`${q.title} scored: ${score}.`);
  };

  return (
    <section aria-label={q.title} className="card-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold tracking-tight">{q.title}</p>
          {latest && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="stat-num text-2xl">{latest.score}</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  gradePill(q.grade(latest.score).label),
                )}
              >
                {q.grade(latest.score).label}
              </span>
            </div>
          )}
          {latest && <p className="mt-1 text-xs text-muted-foreground">{fmtDate(latest.date)}</p>}
        </div>
        <button
          className="btn btn-ghost min-h-10 py-2 text-sm shrink-0"
          onClick={toggle}
          aria-expanded={open}
        >
          {latest ? "Retake" : "Take"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{q.intro}</p>
          {q.questions.map((text, i) => (
            <div key={i}>
              <p className="mb-2 text-sm font-medium">
                {i + 1}. {text}
              </p>
              {q.type === "midas" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={answers[i]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(90, Number(e.target.value) || 0));
                      setAnswers(answers.map((a, j) => (j === i ? v : a)));
                    }}
                    className="w-24"
                    aria-label={`Days for question ${i + 1}`}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label={`Question ${i + 1}`}
                >
                  {(q.options ?? []).map((opt, oi) => (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={answers[i] === oi}
                      className={cn("chip", answers[i] === oi && "border-primary bg-accent")}
                      onClick={() => setAnswers(answers.map((a, j) => (j === i ? oi : a)))}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={done} disabled={!allAnswered}>
              Score it
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {latest && !open && (
        <p className="mt-2 text-sm text-muted-foreground">{q.grade(latest.score).detail}</p>
      )}
    </section>
  );
}

export function Report() {
  const d = useData();
  const pro = usePro();
  const [qr, setQr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const cutoff = Date.now() - 90 * 86400000;
  const recent = useMemo(() => d.attacks.filter((a) => a.start >= cutoff), [d.attacks, cutoff]);
  const recentDoses = useMemo(() => d.doses.filter((x) => x.time >= cutoff), [d.doses, cutoff]);
  const triggers = useMemo(() => rankTriggers(recent, 5), [recent]);
  const meds = useMemo(() => medEffectiveness(recentDoses, recent), [recentDoses, recent]);

  useEffect(() => {
    let live = true;
    reportQrDataUrl({ attacks: recent, doses: recentDoses, results: d.results }).then((url) => {
      if (live) setQr(url);
    });
    return () => {
      live = false;
    };
  }, [recent, recentDoses, d.results]);

  const doExport = async (detailed: boolean) => {
    setExporting(true);
    try {
      await exportReportPdf({ attacks: recent, doses: recentDoses, results: d.results, detailed });
      toast.success("PDF downloaded.");
    } catch {
      toast.error("Could not build the PDF. Try again.");
    }
    setExporting(false);
  };

  const doCsv = () => {
    downloadText(
      `auraguard-attacks-${new Date().toISOString().slice(0, 10)}.csv`,
      attacksCsv(d.attacks, d.doses),
      "text/csv",
    );
    toast.success("CSV downloaded.");
  };

  const history = d.results;

  return (
    <div className="space-y-5 pt-2">
      <SectionTitle>Report</SectionTitle>

      <QuestionnaireCard q={MIDAS} />
      <QuestionnaireCard q={HIT6} />

      <section aria-label="Export" className="grad-hero rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-white">Doctor-ready summary</p>
            <p className="text-sm text-white/80">
              {pro.isPro
                ? "Full 90-day report: headache days, triggers, medication effectiveness, attack log, and scores."
                : "90-day summary + MIDAS/HIT-6 scores as a PDF."}
            </p>
          </div>
          <button
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-60"
            onClick={() => doExport(pro.isPro)}
            disabled={exporting}
          >
            <Download size={15} /> {exporting ? "..." : "PDF"}
          </button>
        </div>
        {qr ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
            <img
              src={qr}
              alt="QR code with the plain-text report summary"
              className="h-24 w-24 shrink-0 rounded-xl bg-white p-1"
            />
            <p className="text-sm text-white/85">
              Scan this at an appointment to share the summary as plain text.
            </p>
          </div>
        ) : null}
      </section>

      <ProGate
        feature="Full clinician view & CSV export"
        teaser="Adds the complete 90-day attack log, ranked triggers, medication effectiveness table, print view, and spreadsheet export."
      >
        <section aria-label="Clinician preview" className="card-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-caps text-muted-foreground">90-day clinician view</p>
            <div className="flex gap-2">
              <button className="chip text-xs" onClick={doCsv}>
                <FileSpreadsheet size={13} className="mr-1" /> CSV
              </button>
              <button className="chip text-xs" onClick={() => window.print()}>
                <Printer size={13} className="mr-1" /> Print
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="stat-num text-2xl">{headacheDays(recent, 30)}</p>
              <p className="text-xs text-muted-foreground">Headache days (30d)</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="stat-num text-2xl">{medicationDays(recentDoses, 30)}</p>
              <p className="text-xs text-muted-foreground">Med days (30d)</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="stat-num text-2xl">{recent.length}</p>
              <p className="text-xs text-muted-foreground">Attacks (90d)</p>
            </div>
          </div>

          {triggers.length > 0 && (
            <div className="text-sm">
              <p className="font-bold">Top triggers</p>
              <p className="text-muted-foreground">
                {triggers
                  .map((t) => `${t.name} (${t.count}, ${Math.round(t.share * 100)}%)`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {meds.length > 0 && (
            <div className="text-sm">
              <p className="font-bold">Medications</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {meds.map((m) => (
                  <li key={m.name}>
                    <span className="font-medium text-foreground">{m.name}:</span> {m.doses} dose
                    {m.doses === 1 ? "" : "s"}
                    {m.score != null && ` · ${m.score}% helpful`}
                    {m.avgReliefMin != null &&
                      ` · avg relief ${fmtDuration(m.avgReliefMin * 60000)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recent.length > 0 && (
            <div className="text-sm">
              <p className="font-bold">Recent attacks</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {recent.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-foreground">{fmtDateTime(a.start)}</span>
                    {a.end != null && ` · ${fmtDuration(a.end - a.start)}`}
                    {a.pain != null && ` · ${a.pain}/10`}
                    {a.triggers.length > 0 && ` · ${a.triggers.join(", ")}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </ProGate>

      <section aria-label="Past scores">
        <p className="label-caps mb-2 text-muted-foreground">Past scores</p>
        {history.length === 0 ? (
          <Empty
            title="No scores yet"
            body="Complete MIDAS or HIT-6 above and your results will collect here."
          />
        ) : (
          <ul className="space-y-2">
            {history.map((r, i) => {
              const q = r.type === "midas" ? MIDAS : HIT6;
              return (
                <li key={`${r.date}-${i}`} className="card-soft p-4 flex items-center gap-3">
                  <span
                    className="grad-dot flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
                    aria-hidden="true"
                  >
                    <FileText size={18} />
                  </span>
                  <div>
                    <p className="font-bold">
                      {q.title}: {r.score}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.grade(r.score).label} · {fmtDate(r.date)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Disclaimer />
    </div>
  );
}
