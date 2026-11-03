import QRCode from "qrcode";
import type { Attack, Dose, QResult } from "./store";
import { fmtDate, fmtDateTime, fmtDuration, sortAttacks } from "./store";
import { HIT6, MIDAS } from "./scores";
import { headacheDays, medEffectiveness, medicationDays, rankTriggers } from "./analytics";
import { APP_NAME } from "./brand";

export interface ReportInput {
  attacks: Attack[]; // last 90 days
  doses: Dose[]; // last 90 days
  results: QResult[];
  detailed?: boolean; // Pro: include triggers, med effectiveness, and attack table
}

function summarizeAttacks(attacks: Attack[]) {
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
  const hDays30 = headacheDays(input.attacks, 30);
  const mDays30 = medicationDays(input.doses, 30);
  const lines = [
    `${APP_NAME} report ${fmtDate(Date.now())}`,
    `Last 30d: ${hDays30} headache days, ${mDays30} med days`,
    `Last 90d: ${s.count} attacks, avg pain ${s.avgPain}/10, avg duration ${s.avgDur}`,
  ];
  const triggers = rankTriggers(input.attacks, 3);
  if (triggers.length) {
    lines.push(`Top triggers: ${triggers.map((t) => `${t.name} (${t.count})`).join(", ")}`);
  }
  const meds = medEffectiveness(input.doses, input.attacks).slice(0, 3);
  if (meds.length) {
    lines.push(
      `Meds: ${meds.map((m) => `${m.name}${m.score != null ? ` ${m.score}%` : ""}`).join(", ")}`,
    );
  }
  for (const r of input.results.slice(0, 2)) {
    const q = r.type === "midas" ? MIDAS : HIT6;
    lines.push(`${q.title}: ${r.score} (${q.grade(r.score).label}) on ${fmtDate(r.date)}`);
  }
  return lines.join("\n");
}

export async function exportReportPdf(input: ReportInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt" });
  const W = 595;
  const H = 842;
  let y = 52;
  const checkPage = (need = 40) => {
    if (y + need > H - 48) {
      doc.addPage();
      y = 52;
    }
  };
  const line = (t: string, size = 10.5, bold = false, gap = 12) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const split = doc.splitTextToSize(t, W - 96);
    checkPage(split.length * size * 1.25 + gap);
    doc.text(split, 48, y);
    y += split.length * size * 1.25 + gap;
  };

  line(`${APP_NAME} — Clinician Summary`, 18, true, 4);
  line(`Generated ${fmtDate(Date.now())} · Period: last 90 days`, 10, false, 16);

  const s = summarizeAttacks(input.attacks);
  const h30 = headacheDays(input.attacks, 30);
  const h90 = headacheDays(input.attacks, 90);
  const m30 = medicationDays(input.doses, 30);
  line("Frequency & severity", 13, true, 4);
  line(`Headache days: ${h30} in the last 30 days · ${h90} in the last 90 days`, 10.5, false, 2);
  line(`Acute-medication days (last 30 days): ${m30}`, 10.5, false, 2);
  line(
    `Attacks logged (90 days): ${s.count} · Avg pain: ${s.avgPain}/10 · Avg duration: ${s.avgDur}`,
    10.5,
    false,
    14,
  );

  const midas = input.results.find((r) => r.type === "midas");
  const hit6 = input.results.find((r) => r.type === "hit6");
  line("Standard questionnaires", 13, true, 4);
  if (midas) {
    const g = MIDAS.grade(midas.score);
    line(`MIDAS: ${midas.score} — ${g.label} (${fmtDate(midas.date)})`, 10.5, true, 2);
    line(g.detail, 9.5, false, 6);
  } else {
    line("MIDAS: not completed yet", 10.5, false, 6);
  }
  if (hit6) {
    const g = HIT6.grade(hit6.score);
    line(`HIT-6: ${hit6.score} — ${g.label} (${fmtDate(hit6.date)})`, 10.5, true, 2);
    line(g.detail, 9.5, false, 12);
  } else {
    line("HIT-6: not completed yet", 10.5, false, 12);
  }

  if (input.detailed) {
    const triggers = rankTriggers(input.attacks, 6);
    line("Top reported triggers", 13, true, 4);
    if (triggers.length === 0) {
      line("None logged in this period.", 10, false, 12);
    } else {
      line(
        triggers
          .map((t) => `${t.name}: ${t.count} (${Math.round(t.share * 100)}% of attacks)`)
          .join(" · "),
        10,
        false,
        12,
      );
    }

    const meds = medEffectiveness(input.doses, input.attacks);
    line("Medication effectiveness (from 2-hour follow-ups)", 13, true, 4);
    if (meds.length === 0) {
      line("No medications logged in this period.", 10, false, 12);
    } else {
      for (const m of meds) {
        const rate =
          m.score != null
            ? `${m.score}% helpful (${m.helped} yes, ${m.partly} partial, ${m.noHelp} no)`
            : "no follow-up answered";
        const relief =
          m.avgReliefMin != null ? `, avg relief ${fmtDuration(m.avgReliefMin * 60000)}` : "";
        line(
          `• ${m.name}: ${m.doses} dose(s) across ${m.attacks || m.doses} attack(s) — ${rate}${relief}`,
          10,
          false,
          3,
        );
      }
      y += 9;
    }

    const ordered = sortAttacks(input.attacks).slice(0, 30);
    if (ordered.length > 0) {
      line(`Recent attacks (up to 30 of ${input.attacks.length})`, 13, true, 4);
      for (const a of ordered) {
        const dur = a.end != null ? fmtDuration(a.end - a.start) : "ongoing";
        const pain = a.pain != null ? `${a.pain}/10` : "pain n/a";
        const mList = input.doses
          .filter((x) => x.attackId === a.id)
          .map((x) => `${x.med} ${x.dose}`.trim())
          .join(", ");
        const parts = [
          `${fmtDateTime(a.start)} (${dur}, ${pain})`,
          a.locations.length ? `at ${a.locations.join("/")}` : "",
          a.symptoms.length ? `symptoms: ${a.symptoms.join(", ")}` : "",
          a.triggers.length ? `triggers: ${a.triggers.join(", ")}` : "",
          mList ? `meds: ${mList}` : "",
          a.pressureAtOnset != null ? `${Math.round(a.pressureAtOnset)} hPa` : "",
        ].filter(Boolean);
        line(`• ${parts.join(" · ")}`, 9.5, false, 2);
      }
      y += 10;
    }
  }

  line(
    "This report is a patient-recorded diary summary, not a medical device. It does not diagnose or recommend treatment.",
    8.5,
    false,
    14,
  );

  try {
    checkPage(140);
    const qr = await QRCode.toDataURL(reportSummaryText(input), { margin: 1, width: 160 });
    line("Scan for plain-text summary:", 9.5, false, 4);
    doc.addImage(qr, "PNG", 48, y, 108, 108);
  } catch {
    // QR is a bonus; the report stands without it
  }

  doc.save(`auraguard-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function reportQrDataUrl(input: ReportInput): Promise<string | null> {
  try {
    return await QRCode.toDataURL(reportSummaryText(input), { margin: 1, width: 220 });
  } catch {
    return null;
  }
}
