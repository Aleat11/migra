import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Attack, QResult } from "./store";
import { fmtDate, fmtDuration } from "./store";
import { HIT6, MIDAS } from "./scores";

export interface ReportInput {
  attacks: Attack[]; // last 90 days, newest first
  results: QResult[];
}

function summarizeAttacks(attacks: Attack[]): { count: number; avgPain: string; avgDur: string } {
  const done = attacks.filter((a) => a.end != null);
  const pains = attacks.map((a) => a.pain).filter((p): p is number => p != null);
  return {
    count: attacks.length,
    avgPain: pains.length ? (pains.reduce((s, p) => s + p, 0) / pains.length).toFixed(1) : "n/a",
    avgDur: done.length
      ? fmtDuration(done.reduce((s, a) => s + (a.end as number) - a.start, 0) / done.length)
      : "n/a",
  };
}

export function reportSummaryText(input: ReportInput): string {
  const s = summarizeAttacks(input.attacks);
  const lines = [
    `Migra report ${fmtDate(Date.now())}`,
    `Attacks (90d): ${s.count}, avg pain ${s.avgPain}/10, avg duration ${s.avgDur}`,
  ];
  for (const r of input.results.slice(0, 4)) {
    const q = r.type === "midas" ? MIDAS : HIT6;
    lines.push(`${q.title}: ${r.score} (${q.grade(r.score).label}) on ${fmtDate(r.date)}`);
  }
  return lines.join("\n");
}

export async function exportReportPdf(input: ReportInput): Promise<void> {
  const doc = new jsPDF({ unit: "pt" });
  const W = 595;
  let y = 56;
  const line = (t: string, size = 11, bold = false, gap = 16) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const split = doc.splitTextToSize(t, W - 96);
    doc.text(split, 48, y);
    y += split.length * size * 1.25 + gap;
  };

  line("Migra report", 20, true, 6);
  line(fmtDate(Date.now()), 12, false, 20);

  const s = summarizeAttacks(input.attacks);
  line("Last 90 days", 14, true, 4);
  line(`Attacks logged: ${s.count}`, 11, false, 2);
  line(`Average pain: ${s.avgPain} / 10`, 11, false, 2);
  line(`Average duration: ${s.avgDur}`, 11, false, 18);

  const midas = input.results.find((r) => r.type === "midas");
  const hit6 = input.results.find((r) => r.type === "hit6");
  line("Questionnaires", 14, true, 4);
  if (midas) {
    const g = MIDAS.grade(midas.score);
    line(`MIDAS: ${midas.score} (${fmtDate(midas.date)})`, 11, true, 2);
    line(g.label, 11, false, 2);
    line(g.detail, 10, false, 10);
  } else {
    line("MIDAS: not completed yet", 11, false, 10);
  }
  if (hit6) {
    const g = HIT6.grade(hit6.score);
    line(`HIT-6: ${hit6.score} (${fmtDate(hit6.date)})`, 11, true, 2);
    line(g.label, 11, false, 2);
    line(g.detail, 10, false, 10);
  } else {
    line("HIT-6: not completed yet", 11, false, 10);
  }

  line(
    "This report is a personal diary summary, not a medical device. It does not diagnose or treat. Share it with your clinician for context.",
    9,
    false,
    20,
  );

  try {
    const qr = await QRCode.toDataURL(reportSummaryText(input), { margin: 1, width: 180 });
    line("Scan for the plain-text summary:", 10, false, 4);
    doc.addImage(qr, "PNG", 48, y, 120, 120);
  } catch {
    // QR is a bonus; the report stands without it
  }

  doc.save(`migra-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function reportQrDataUrl(input: ReportInput): Promise<string | null> {
  try {
    return await QRCode.toDataURL(reportSummaryText(input), { margin: 1, width: 220 });
  } catch {
    return null;
  }
}
