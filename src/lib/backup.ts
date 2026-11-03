import {
  DEFAULT_SETTINGS,
  sortAttacks,
  type Attack,
  type DailyLog,
  type Data,
  type Dose,
  type FollowUp,
  type QResult,
} from "./store";

/**
 * Backup import is untrusted input: a file from anywhere. Everything is
 * re-built field by field with type, range, and size checks; unknown fields
 * are dropped. Nothing from the file is ever rendered as HTML or executed.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 20000;
const MAX_STR = 2000;
const MAX_TAGS = 40;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = MAX_STR): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const time = (v: unknown) => num(v, 0, 4102444800000); // year 2100
const tags = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80))),
      ].slice(0, MAX_TAGS)
    : [];
const safeId = (v: unknown): string | null =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;

function cleanAttack(v: unknown): Attack | null {
  if (!isObj(v)) return null;
  const id = safeId(v.id);
  const start = time(v.start);
  if (!id || start == null) return null;
  const end = v.end == null ? null : time(v.end);
  return {
    id,
    start,
    end: end != null && end >= start ? end : null,
    pain: num(v.pain, 0, 10),
    locations: tags(v.locations),
    symptoms: tags(v.symptoms),
    triggers: tags(v.triggers),
    notes: str(v.notes),
    pressureAtOnset: num(v.pressureAtOnset, 850, 1100),
    endedInSleep: v.endedInSleep === true,
    recovery: v.recovery === "clear" || v.recovery === "recovering" ? v.recovery : null,
  };
}

function cleanFollowUp(v: unknown): FollowUp | undefined {
  if (!isObj(v)) return undefined;
  if (v.result !== "yes" && v.result !== "little" && v.result !== "no") return undefined;
  const answeredAt = time(v.answeredAt);
  if (answeredAt == null) return undefined;
  const relief = num(v.reliefMinutes, 0, 10080);
  return { result: v.result, answeredAt, ...(relief != null ? { reliefMinutes: relief } : {}) };
}

function cleanDose(v: unknown): Dose | null {
  if (!isObj(v)) return null;
  const id = safeId(v.id);
  const t = time(v.time);
  const med = str(v.med, 120).trim();
  if (!id || t == null || !med) return null;
  const attackId = safeId(v.attackId) ?? undefined;
  const followUp = cleanFollowUp(v.followUp);
  return {
    id,
    med,
    dose: str(v.dose, 60),
    time: t,
    ...(attackId ? { attackId } : {}),
    ...(followUp ? { followUp } : {}),
  };
}

function cleanResult(v: unknown): QResult | null {
  if (!isObj(v)) return null;
  if (v.type !== "midas" && v.type !== "hit6") return null;
  const date = time(v.date);
  const score = num(v.score, 0, 450);
  if (date == null || score == null) return null;
  const answers = Array.isArray(v.answers)
    ? v.answers.map((a) => num(a, 0, 90) ?? 0).slice(0, 10)
    : [];
  return { type: v.type, score, date, answers };
}

function cleanDaily(k: string, v: unknown): DailyLog | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(v)) return null;
  const water = v.water === "low" || v.water === "ok" || v.water === "good" ? v.water : null;
  const screen =
    v.screen === "low" || v.screen === "normal" || v.screen === "high" ? v.screen : null;
  return {
    date: k,
    sleepHours: num(v.sleepHours, 0, 24),
    stress: num(v.stress, 1, 5),
    water,
    skippedMeal: v.skippedMeal === true,
    caffeine: num(v.caffeine, 0, 30) ?? 0,
    alcohol: v.alcohol === true,
    period: v.period === true,
    screen,
    pressure: num(v.pressure, 850, 1100),
    pressureTrend: num(v.pressureTrend, -100, 100),
  };
}

/** Parse and sanitize a backup. Throws with a user-readable message. */
export function parseBackup(
  text: string,
): Omit<Data, "settings"> & { settings: Partial<Data["settings"]> } {
  if (text.length > MAX_IMPORT_BYTES)
    throw new Error("That file is too large to be a diary backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a valid backup (not JSON).");
  }
  if (!isObj(raw)) throw new Error("That file isn't a diary backup.");
  const body = isObj(raw.data) ? raw.data : raw; // accept {app, version, data} or a bare Data
  if (!Array.isArray(body.attacks) && !Array.isArray(body.doses))
    throw new Error("No diary entries found in that file.");
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
  const attacks = list(body.attacks)
    .map(cleanAttack)
    .filter((x): x is Attack => !!x);
  const doses = list(body.doses)
    .map(cleanDose)
    .filter((x): x is Dose => !!x);
  const results = list(body.results)
    .map(cleanResult)
    .filter((x): x is QResult => !!x)
    .slice(0, 50);
  const daily: Record<string, DailyLog> = {};
  if (isObj(body.daily)) {
    for (const [k, v] of Object.entries(body.daily).slice(0, MAX_ITEMS)) {
      const c = cleanDaily(k, v);
      if (c) daily[k] = c;
    }
  }
  // Only harmless display prefs are restored. License and trial clock are never imported.
  const s = isObj(body.settings) ? body.settings : {};
  const settings: Partial<Data["settings"]> = {};
  if (typeof s.highContrast === "boolean") settings.highContrast = s.highContrast;
  const lat = num(s.lat, -90, 90);
  const lon = num(s.lon, -180, 180);
  if (lat != null && lon != null)
    Object.assign(settings, { lat, lon, locName: str(s.locName, 80) });
  return { attacks, doses, results, daily, settings };
}

/** Non-destructive merge: existing entries win on id clash, nothing is deleted. */
export function mergeBackup(
  current: Data,
  incoming: ReturnType<typeof parseBackup>,
): { data: Data; added: number } {
  const aIds = new Set(current.attacks.map((a) => a.id));
  const dIds = new Set(current.doses.map((x) => x.id));
  const rKeys = new Set(current.results.map((r) => `${r.type}:${r.date}`));
  const newAttacks = incoming.attacks.filter((a) => !aIds.has(a.id));
  const newDoses = incoming.doses.filter((x) => !dIds.has(x.id));
  const newResults = incoming.results.filter((r) => !rKeys.has(`${r.type}:${r.date}`));
  const daily = { ...current.daily };
  let newDaily = 0;
  for (const [k, v] of Object.entries(incoming.daily)) {
    if (!daily[k]) {
      daily[k] = v;
      newDaily++;
    }
  }
  const settings = { ...DEFAULT_SETTINGS, ...current.settings };
  if (settings.lat == null && incoming.settings.lat != null) {
    settings.lat = incoming.settings.lat;
    settings.lon = incoming.settings.lon ?? null;
    settings.locName = incoming.settings.locName ?? "";
  }
  return {
    data: {
      attacks: sortAttacks([...current.attacks, ...newAttacks]),
      doses: [...current.doses, ...newDoses].sort((a, b) => b.time - a.time),
      results: [...current.results, ...newResults].sort((a, b) => b.date - a.date).slice(0, 50),
      daily,
      settings,
    },
    added: newAttacks.length + newDoses.length + newResults.length + newDaily,
  };
}

export function backupJson(d: Data): string {
  // license key stays out of backups so a shared file doesn't share Pro
  const { license: _license, ...settings } = d.settings;
  void _license;
  return JSON.stringify(
    { app: "migra", version: 2, exportedAt: new Date().toISOString(), data: { ...d, settings } },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function attacksCsv(attacks: Attack[], doses: Dose[]): string {
  const esc = (s: string) => {
    // neutralise spreadsheet formula injection (=, +, -, @ at cell start)
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      "start",
      "end",
      "duration_min",
      "pain",
      "locations",
      "symptoms",
      "triggers",
      "meds",
      "pressure_hpa",
      "notes",
    ],
  ];
  for (const a of attacks) {
    const meds = doses.filter((x) => x.attackId === a.id).map((x) => `${x.med} ${x.dose}`.trim());
    rows.push([
      new Date(a.start).toISOString(),
      a.end ? new Date(a.end).toISOString() : "",
      a.end ? String(Math.round((a.end - a.start) / 60000)) : "",
      a.pain == null ? "" : String(a.pain),
      a.locations.join("; "),
      a.symptoms.join("; "),
      a.triggers.join("; "),
      meds.join("; "),
      a.pressureAtOnset == null ? "" : String(Math.round(a.pressureAtOnset)),
      a.notes,
    ]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
