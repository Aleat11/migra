import { useSyncExternalStore } from "react";

export interface FollowUp {
  result: "yes" | "little" | "no";
  reliefMinutes?: number;
  answeredAt: number;
}

export interface Dose {
  id: string;
  med: string;
  dose: string;
  time: number;
  attackId?: string;
  followUp?: FollowUp;
}

export interface Attack {
  id: string;
  start: number;
  end: number | null;
  pain: number | null; // 0-10
  locations: string[];
  symptoms: string[];
  triggers: string[];
  notes: string;
  pressureAtOnset: number | null; // hPa
  endedInSleep?: boolean; // end time is approximate: it ended while asleep
  recovery?: "clear" | "recovering" | null; // postdrome state after the pain stopped
}

export interface QResult {
  type: "midas" | "hit6";
  score: number;
  date: number;
  answers: number[];
}

/** One short check-in per calendar day. Feeds Smart Insights. */
export interface DailyLog {
  date: string; // YYYY-MM-DD, local time
  sleepHours: number | null;
  stress: number | null; // 1-5
  water: "low" | "ok" | "good" | null;
  skippedMeal: boolean;
  caffeine: number; // cups
  alcohol: boolean;
  period: boolean;
  screen: "low" | "normal" | "high" | null;
  pressure?: number | null; // hPa snapshot, filled automatically
  pressureTrend?: number | null; // hPa / 6h snapshot, filled automatically
}

export interface Settings {
  migraineMode: boolean;
  highContrast: boolean;
  locName: string;
  lat: number | null;
  lon: number | null;
  notify: boolean;
  firstUse: number | null; // starts the Pro trial clock
  license: string | null;
}

export interface Data {
  attacks: Attack[];
  doses: Dose[];
  results: QResult[];
  daily: Record<string, DailyLog>;
  settings: Settings;
}

export const KEY = "migra:v1";

export const DEFAULT_SETTINGS: Settings = {
  migraineMode: false,
  highContrast: false,
  locName: "",
  lat: null,
  lon: null,
  notify: false,
  firstUse: null,
  license: null,
};

const DEFAULTS: Data = {
  attacks: [],
  doses: [],
  results: [],
  daily: {},
  settings: DEFAULT_SETTINGS,
};

/** Newest first, always. Past attacks can be logged out of order. */
export function sortAttacks(attacks: Attack[]): Attack[] {
  return [...attacks].sort((a, b) => b.start - a.start);
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, settings: { ...DEFAULT_SETTINGS, firstUse: Date.now() } };
    const parsed = JSON.parse(raw) as Partial<Data>;
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    if (settings.firstUse == null) settings.firstUse = Date.now();
    return {
      attacks: Array.isArray(parsed.attacks) ? sortAttacks(parsed.attacks) : [],
      doses: Array.isArray(parsed.doses) ? parsed.doses : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
      daily:
        parsed.daily && typeof parsed.daily === "object" && !Array.isArray(parsed.daily)
          ? parsed.daily
          : {},
      settings,
    };
  } catch {
    return { ...DEFAULTS, settings: { ...DEFAULT_SETTINGS, firstUse: Date.now() } };
  }
}

let data: Data = typeof localStorage === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable; keep in-memory copy
  }
  listeners.forEach((l) => l());
}

export function update(fn: (d: Data) => Data) {
  data = fn(data);
  save();
}

export function getData(): Data {
  return data;
}

export function useData(): Data {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => data,
  );
}

export function setSettings(patch: Partial<Settings>) {
  update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function uid(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd}`;
}

export function liveAttack(d: Data): Attack | null {
  return d.attacks.find((a) => a.end == null) ?? null;
}

export function addAttack(a: Omit<Attack, "id">): string {
  const id = uid();
  update((d) => ({ ...d, attacks: sortAttacks([{ ...a, id }, ...d.attacks]) }));
  return id;
}

export function upsertAttack(id: string, patch: Partial<Attack>) {
  update((d) => ({
    ...d,
    attacks: sortAttacks(d.attacks.map((a) => (a.id === id ? { ...a, ...patch } : a))),
  }));
}

export function deleteAttack(id: string) {
  update((d) => ({
    ...d,
    attacks: d.attacks.filter((a) => a.id !== id),
    doses: d.doses.filter((x) => x.attackId !== id),
  }));
}

export function addDose(x: Omit<Dose, "id">): string {
  const id = uid();
  update((d) => ({ ...d, doses: [{ ...x, id }, ...d.doses] }));
  return id;
}

export function updateDose(id: string, patch: Partial<Omit<Dose, "id">>) {
  update((d) => ({ ...d, doses: d.doses.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}

export function removeDose(id: string) {
  update((d) => ({ ...d, doses: d.doses.filter((x) => x.id !== id) }));
}

export function saveResult(r: Omit<QResult, "date">) {
  update((d) => ({ ...d, results: [{ ...r, date: Date.now() }, ...d.results].slice(0, 50) }));
}

export function dayKey(t: number | Date = Date.now()): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDaily(date: string): DailyLog {
  return {
    date,
    sleepHours: null,
    stress: null,
    water: null,
    skippedMeal: false,
    caffeine: 0,
    alcohol: false,
    period: false,
    screen: null,
  };
}

export function saveDaily(log: DailyLog) {
  update((d) => {
    const prev = d.daily[log.date];
    // keep auto-filled pressure snapshot if the form didn't carry it
    const merged: DailyLog = {
      ...log,
      pressure: log.pressure ?? prev?.pressure ?? null,
      pressureTrend: log.pressureTrend ?? prev?.pressureTrend ?? null,
    };
    return { ...d, daily: { ...d.daily, [log.date]: merged } };
  });
}

/** Store today's pressure so Smart Insights can line weather up with attack days. */
export function recordPressureSnapshot(value: number | null, trend: number | null) {
  if (value == null) return;
  const date = dayKey();
  const prev = data.daily[date];
  // keep the most negative trend seen today: that's the one that matters
  const worstTrend =
    prev?.pressureTrend != null && trend != null
      ? Math.min(prev.pressureTrend, trend)
      : (trend ?? prev?.pressureTrend ?? null);
  if (prev && prev.pressure === value && prev.pressureTrend === worstTrend) return;
  update((d) => ({
    ...d,
    daily: {
      ...d.daily,
      [date]: { ...(prev ?? emptyDaily(date)), pressure: value, pressureTrend: worstTrend },
    },
  }));
}

/** True when the user filled the check-in form for that day (not just a pressure snapshot). */
export function isCheckedIn(log: DailyLog | undefined): boolean {
  if (!log) return false;
  return (
    log.sleepHours != null ||
    log.stress != null ||
    log.water != null ||
    log.screen != null ||
    log.skippedMeal ||
    log.alcohol ||
    log.period ||
    log.caffeine > 0
  );
}

export function replaceAll(next: Data) {
  data = { ...next, attacks: sortAttacks(next.attacks) };
  save();
}

export function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  return `${h}h ${mm}m`;
}

export function fmtDateTime(t: number): string {
  return new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function attackDoses(d: Data, attackId: string): Dose[] {
  return d.doses.filter((x) => x.attackId === attackId);
}
