import { dayKey, isCheckedIn, type Attack, type DailyLog, type Dose } from "./store";

const DAY = 86400000;

/* ---------- Trigger ranking ---------- */

export interface TriggerRank {
  name: string;
  count: number;
  share: number; // fraction of attacks that listed it
}

export function rankTriggers(attacks: Attack[], limit = 8): TriggerRank[] {
  const m = new Map<string, number>();
  for (const a of attacks) for (const t of new Set(a.triggers)) m.set(t, (m.get(t) ?? 0) + 1);
  const total = attacks.length || 1;
  return [...m.entries()]
    .map(([name, count]) => ({ name, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/* ---------- Medication effectiveness ---------- */

export interface MedStat {
  name: string;
  doses: number;
  attacks: number;
  answered: number;
  helped: number; // "yes"
  partly: number; // "a little"
  noHelp: number;
  avgReliefMin: number | null;
  avgPainWhenTaken: number | null;
  score: number | null; // 0-100, null until at least one check-in answered
}

export function medEffectiveness(doses: Dose[], attacks: Attack[]): MedStat[] {
  const byId = new Map(attacks.map((a) => [a.id, a]));
  const groups = new Map<string, Dose[]>();
  const display = new Map<string, string>();
  for (const x of doses) {
    const name = x.med.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (!display.has(k)) display.set(k, name);
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const out: MedStat[] = [];
  for (const [k, list] of groups) {
    const answered = list.filter((x) => x.followUp);
    const helped = answered.filter((x) => x.followUp!.result === "yes").length;
    const partly = answered.filter((x) => x.followUp!.result === "little").length;
    const reliefs = answered
      .map((x) => x.followUp!.reliefMinutes)
      .filter((m): m is number => typeof m === "number");
    const pains = list
      .map((x) => (x.attackId ? byId.get(x.attackId)?.pain : null))
      .filter((p): p is number => typeof p === "number");
    const attackIds = new Set(list.map((x) => x.attackId).filter(Boolean));
    out.push({
      name: display.get(k)!,
      doses: list.length,
      attacks: attackIds.size,
      answered: answered.length,
      helped,
      partly,
      noHelp: answered.length - helped - partly,
      avgReliefMin: reliefs.length
        ? Math.round(reliefs.reduce((s, m) => s + m, 0) / reliefs.length)
        : null,
      avgPainWhenTaken: pains.length
        ? Math.round((pains.reduce((s, p) => s + p, 0) / pains.length) * 10) / 10
        : null,
      score: answered.length ? Math.round(((helped + partly * 0.5) / answered.length) * 100) : null,
    });
  }
  // rated meds first (best to worst), then unrated by usage
  return out.sort((a, b) => {
    if (a.score == null && b.score == null) return b.doses - a.doses;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score || b.answered - a.answered;
  });
}

/* ---------- Monthly load & medication overuse ---------- */

export function headacheDays(attacks: Attack[], days = 30, now = Date.now()): number {
  const since = now - days * DAY;
  const set = new Set<string>();
  for (const a of attacks) {
    const end = a.end ?? now;
    if (end < since || a.start > now) continue;
    // count every calendar day the attack touched
    for (let t = Math.max(a.start, since); t <= end; t += DAY) set.add(dayKey(t));
    set.add(dayKey(Math.min(end, now)));
  }
  return set.size;
}

export function medicationDays(doses: Dose[], days = 30, now = Date.now()): number {
  const since = now - days * DAY;
  return new Set(doses.filter((x) => x.time >= since && x.time <= now).map((x) => dayKey(x.time)))
    .size;
}

/**
 * Acute-medication days per month. ICHD-3 flags medication-overuse risk at
 * ≥10 days/month (triptans, combination analgesics) or ≥15 (simple analgesics).
 * We can't classify drugs reliably, so we surface the count and the thresholds.
 */
export function overuseLevel(medDays: number): "ok" | "watch" | "high" {
  if (medDays >= 15) return "high";
  if (medDays >= 10) return "watch";
  return "ok";
}

/* ---------- Time patterns ---------- */

export interface TimePatterns {
  partOfDay: { label: string; count: number }[];
  weekday: { label: string; count: number }[];
  peakPart: string | null;
  peakDay: string | null;
}

export function timePatterns(attacks: Attack[]): TimePatterns {
  const parts = [
    { label: "Night", from: 0, to: 6 },
    { label: "Morning", from: 6, to: 12 },
    { label: "Afternoon", from: 12, to: 18 },
    { label: "Evening", from: 18, to: 24 },
  ];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const partOfDay = parts.map((p) => ({
    label: p.label,
    count: attacks.filter((a) => {
      const h = new Date(a.start).getHours();
      return h >= p.from && h < p.to;
    }).length,
  }));
  const weekday = days.map((label, i) => ({
    label,
    count: attacks.filter((a) => new Date(a.start).getDay() === i).length,
  }));
  const peak = <T extends { label: string; count: number }>(xs: T[]) => {
    const total = xs.reduce((s, x) => s + x.count, 0);
    if (total < 4) return null;
    const top = [...xs].sort((a, b) => b.count - a.count)[0];
    // only call it a peak if it's clearly above an even spread
    return top.count / total >= (1 / xs.length) * 1.5 ? top.label : null;
  };
  return { partOfDay, weekday, peakPart: peak(partOfDay), peakDay: peak(weekday) };
}

/* ---------- Smart insights (daily check-ins × attack days) ---------- */

export interface Insight {
  id: string;
  title: string;
  detail: string;
  lift: number; // how many times more likely on factor days
  withRate: number;
  withoutRate: number;
  nWith: number;
  nWithout: number;
  confidence: "early" | "moderate" | "strong";
}

interface Factor {
  id: string;
  title: string;
  phrase: string;
  test: (log: DailyLog, ctx: { periodWindow: Set<string> }) => boolean | null; // null = unknown that day
}

const FACTORS: Factor[] = [
  {
    id: "sleep",
    title: "Short sleep",
    phrase: "you slept under 6 hours",
    test: (l) => (l.sleepHours == null ? null : l.sleepHours < 6),
  },
  {
    id: "longsleep",
    title: "Oversleeping",
    phrase: "you slept over 9 hours",
    test: (l) => (l.sleepHours == null ? null : l.sleepHours > 9),
  },
  {
    id: "stress",
    title: "High stress",
    phrase: "stress was 4 or 5 out of 5",
    test: (l) => (l.stress == null ? null : l.stress >= 4),
  },
  {
    id: "water",
    title: "Low water",
    phrase: "you drank little water",
    test: (l) => (l.water == null ? null : l.water === "low"),
  },
  { id: "meal", title: "Skipped meals", phrase: "you skipped a meal", test: (l) => l.skippedMeal },
  {
    id: "caffeine",
    title: "Heavy caffeine",
    phrase: "you had 3+ caffeinated drinks",
    test: (l) => l.caffeine >= 3,
  },
  { id: "alcohol", title: "Alcohol", phrase: "you drank alcohol", test: (l) => l.alcohol },
  {
    id: "screen",
    title: "Heavy screen time",
    phrase: "screen time was high",
    test: (l) => (l.screen == null ? null : l.screen === "high"),
  },
  {
    id: "cycle",
    title: "Menstrual window",
    phrase: "you were within 2 days before to 3 days after a period started",
    test: (l, ctx) => ctx.periodWindow.has(l.date),
  },
  {
    id: "pressure",
    title: "Falling pressure",
    phrase: "barometric pressure dropped 2+ hPa",
    test: (l) => (l.pressureTrend == null ? null : l.pressureTrend <= -2),
  },
];

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/** Days within -2..+3 of each period start (start = period day not preceded by one). */
export function periodWindow(daily: Record<string, DailyLog>): Set<string> {
  const out = new Set<string>();
  for (const [k, l] of Object.entries(daily)) {
    if (!l.period || daily[shiftKey(k, -1)]?.period) continue;
    for (let i = -2; i <= 3; i++) out.add(shiftKey(k, i));
  }
  return out;
}

/**
 * For each factor compare: share of days WITH it that had an attack (that day or
 * the next morning, since triggers precede onset) vs share of days WITHOUT it.
 */
export function smartInsights(attacks: Attack[], daily: Record<string, DailyLog>): Insight[] {
  const attackDays = new Set(attacks.map((a) => dayKey(a.start)));
  const hasCycleData = Object.values(daily).some((l) => l.period);
  const ctx = { periodWindow: periodWindow(daily) };
  const logs = Object.values(daily).filter((l) => isCheckedIn(l) || l.pressureTrend != null);
  const attackFollows = (k: string) => {
    if (attackDays.has(k)) return true;
    // early-morning attack the next day still counts toward the previous day's factors
    const next = shiftKey(k, 1);
    return attacks.some((a) => dayKey(a.start) === next && new Date(a.start).getHours() < 10);
  };
  const out: Insight[] = [];
  for (const f of FACTORS) {
    if (f.id === "cycle" && !hasCycleData) continue;
    let w = 0,
      wA = 0,
      wo = 0,
      woA = 0;
    for (const l of logs) {
      if (f.id !== "pressure" && f.id !== "cycle" && !isCheckedIn(l)) continue;
      const v = f.test(l, ctx);
      if (v == null) continue;
      const a = attackFollows(l.date);
      if (v) {
        w++;
        if (a) wA++;
      } else {
        wo++;
        if (a) woA++;
      }
    }
    if (w < 3 || wo < 3 || wA < 2) continue;
    const withRate = wA / w;
    // Laplace smoothing keeps a single lucky day from producing a huge ratio
    const withoutRate = (woA + 0.5) / (wo + 1);
    const lift = withRate / withoutRate;
    if (lift < 1.3) continue;
    const n = Math.min(w, wo);
    const confidence: Insight["confidence"] =
      n >= 15 && wA >= 5 ? "strong" : n >= 7 ? "moderate" : "early";
    out.push({
      id: f.id,
      title: f.title,
      detail: `Attacks followed ${Math.round(withRate * 100)}% of days when ${f.phrase}, vs ${Math.round((woA / wo) * 100)}% of other days.`,
      lift: Math.round(lift * 10) / 10,
      withRate,
      withoutRate: woA / wo,
      nWith: w,
      nWithout: wo,
      confidence,
    });
  }
  return out.sort((a, b) => b.lift - a.lift);
}

export function checkInStreak(daily: Record<string, DailyLog>, now = Date.now()): number {
  let n = 0;
  let k = dayKey(now);
  if (!isCheckedIn(daily[k])) k = shiftKey(k, -1); // today not done yet doesn't break the streak
  while (isCheckedIn(daily[k])) {
    n++;
    k = shiftKey(k, -1);
  }
  return n;
}

export function checkInCount(daily: Record<string, DailyLog>): number {
  return Object.values(daily).filter(isCheckedIn).length;
}
