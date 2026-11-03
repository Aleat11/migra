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

export interface Settings {
  migraineMode: boolean;
  highContrast: boolean;
  locName: string;
  lat: number | null;
  lon: number | null;
}

export interface Data {
  attacks: Attack[];
  doses: Dose[];
  results: QResult[];
  settings: Settings;
}

const KEY = "migra:v1";

const DEFAULTS: Data = {
  attacks: [],
  doses: [],
  results: [],
  settings: { migraineMode: false, highContrast: false, locName: "", lat: null, lon: null },
};

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Data>;
    return {
      attacks: Array.isArray(parsed.attacks) ? parsed.attacks : [],
      doses: Array.isArray(parsed.doses) ? parsed.doses : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

let data: Data = load();
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
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addAttack(a: Omit<Attack, "id">): string {
  const id = uid();
  update((d) => ({ ...d, attacks: [{ ...a, id }, ...d.attacks] }));
  return id;
}

export function upsertAttack(id: string, patch: Partial<Attack>) {
  update((d) => ({ ...d, attacks: d.attacks.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
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

export function removeDose(id: string) {
  update((d) => ({ ...d, doses: d.doses.filter((x) => x.id !== id) }));
}

export function saveResult(r: Omit<QResult, "date">) {
  update((d) => ({ ...d, results: [{ ...r, date: Date.now() }, ...d.results].slice(0, 50) }));
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
