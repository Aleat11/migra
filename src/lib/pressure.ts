export interface PressurePoint {
  t: number; // epoch ms
  p: number; // hPa
}

export interface PressureReading {
  value: number | null; // hPa
  trend: number | null; // hPa change over ~6h, negative = falling
  series: PressurePoint[]; // past 24h + next ~48h, hourly
  fetchedAt: number;
  error: string | null;
}

export interface PressureDrop {
  start: number; // epoch ms the fall begins
  end: number; // epoch ms the fall bottoms out
  drop: number; // hPa, positive number
}

const CACHE_PREFIX = "migra:pressure:";
const CACHE_MS = 30 * 60 * 1000;
const HOUR = 3600 * 1000;

function cacheKey(lat: number, lon: number): string {
  // ~1 km grid: different saved locations never share a cache entry
  return `${CACHE_PREFIX}${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function readCache(lat: number, lon: number, maxAge = CACHE_MS): PressureReading | null {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const c = JSON.parse(raw) as PressureReading;
    if (typeof c.fetchedAt !== "number" || Date.now() - c.fetchedAt > maxAge) return null;
    return { ...c, series: Array.isArray(c.series) ? c.series : [] };
  } catch {
    return null;
  }
}

function writeCache(lat: number, lon: number, r: PressureReading) {
  try {
    // drop entries for other locations so storage doesn't grow forever
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (
        k &&
        (k === "migra:pressure" || (k.startsWith(CACHE_PREFIX) && k !== cacheKey(lat, lon)))
      ) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(cacheKey(lat, lon), JSON.stringify(r));
  } catch {
    // ignore
  }
}

interface OmResponse {
  current?: { time?: number; pressure_msl?: number };
  hourly?: { time?: number[]; pressure_msl?: (number | null)[] };
}

function validCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Pure: change over the last ~6h given hourly points and the current value. */
export function trendFromSeries(
  series: PressurePoint[],
  value: number,
  now = Date.now(),
): number | null {
  const target = now - 6 * HOUR;
  let best: PressurePoint | null = null;
  for (const pt of series) {
    if (pt.t <= target && (!best || pt.t > best.t)) best = pt;
  }
  if (!best || now - best.t > 9 * HOUR) return null;
  return Math.round((value - best.p) * 10) / 10;
}

/**
 * Pure: the first upcoming fall of at least `threshold` hPa within any 12h window.
 * Rapid falls are the pattern most people associate with weather-triggered attacks.
 */
export function findUpcomingDrop(
  series: PressurePoint[],
  now = Date.now(),
  threshold = 3,
  windowH = 12,
): PressureDrop | null {
  const future = series.filter((pt) => pt.t >= now - HOUR).sort((a, b) => a.t - b.t);
  let best: PressureDrop | null = null;
  for (let i = 0; i < future.length; i++) {
    for (let j = i + 1; j < future.length && future[j].t - future[i].t <= windowH * HOUR; j++) {
      const drop = future[i].p - future[j].p;
      if (drop >= threshold && (!best || drop > best.drop)) {
        best = { start: future[i].t, end: future[j].t, drop: Math.round(drop * 10) / 10 };
      }
    }
    // report the earliest qualifying window, at its deepest
    if (best) return best;
  }
  return null;
}

export async function getPressure(
  lat: number,
  lon: number,
  force = false,
): Promise<PressureReading> {
  if (!validCoord(lat, lon)) {
    return {
      value: null,
      trend: null,
      series: [],
      fetchedAt: Date.now(),
      error: "invalid location",
    };
  }
  if (!force) {
    const cached = readCache(lat, lon);
    if (cached) return cached;
  }
  try {
    // unixtime avoids the time-zone bug: the location's local times were being
    // parsed as the browser's local time, shifting the 6h trend window.
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&current=pressure_msl&hourly=pressure_msl&past_days=1&forecast_days=3&timeformat=unixtime`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: "no-referrer" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as OmResponse;
    const raw = j.current?.pressure_msl;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const times = j.hourly?.time ?? [];
    const vals = j.hourly?.pressure_msl ?? [];
    const series: PressurePoint[] = [];
    for (let i = 0; i < Math.min(times.length, vals.length); i++) {
      const v = vals[i];
      if (typeof times[i] === "number" && typeof v === "number" && Number.isFinite(v)) {
        series.push({ t: times[i] * 1000, p: v });
      }
    }
    const trend = value != null ? trendFromSeries(series, value) : null;
    const reading: PressureReading = { value, trend, series, fetchedAt: Date.now(), error: null };
    writeCache(lat, lon, reading);
    return reading;
  } catch (e) {
    // stale data (up to 6h) beats no data
    const cached = readCache(lat, lon, 6 * HOUR);
    if (cached) return { ...cached, error: null };
    return {
      value: null,
      trend: null,
      series: [],
      fetchedAt: Date.now(),
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

export interface GeoHit {
  name: string;
  lat: number;
  lon: number;
}

/** Resolve a city name or US ZIP to coordinates. */
export async function resolveLocation(query: string): Promise<GeoHit | null> {
  const q = query.trim().slice(0, 100);
  if (!q) return null;
  try {
    if (/^\d{5}$/.test(q)) {
      const res = await fetch(`https://api.zippopotam.us/us/${q}`, {
        referrerPolicy: "no-referrer",
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        places?: { "place name"?: string; state?: string; latitude?: string; longitude?: string }[];
      };
      const p = j.places?.[0];
      if (!p?.latitude || !p?.longitude) return null;
      const lat = parseFloat(p.latitude);
      const lon = parseFloat(p.longitude);
      if (!validCoord(lat, lon)) return null;
      return {
        name: `${p["place name"] ?? q}, ${p.state ?? ""} ${q}`.trim().slice(0, 80),
        lat,
        lon,
      };
    }
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
      { referrerPolicy: "no-referrer" },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: {
        name?: string;
        admin1?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      }[];
    };
    const r = j.results?.[0];
    if (r?.latitude == null || r?.longitude == null || !validCoord(r.latitude, r.longitude))
      return null;
    const bits = [r.name, r.admin1, r.country].filter(Boolean);
    return { name: bits.join(", ").slice(0, 80), lat: r.latitude, lon: r.longitude };
  } catch {
    return null;
  }
}

/** Best-effort "City, State" label for raw coordinates. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=en`,
      { referrerPolicy: "no-referrer" },
    );
    if (!res.ok) return "Current location";
    const j = (await res.json()) as { city?: string; principalSubdivision?: string };
    const bits = [j.city, j.principalSubdivision].filter(Boolean);
    return bits.length ? bits.join(", ").slice(0, 80) : "Current location";
  } catch {
    return "Current location";
  }
}

export function riskNote(r: PressureReading): string {
  if (r.value == null) {
    return "Pressure data is unavailable right now. This changes nothing about your log; check back later.";
  }
  if (r.trend != null && r.trend <= -2) {
    return `Pressure has fallen ${Math.abs(r.trend).toFixed(1)} hPa over the last few hours. Falling pressure shows up in a lot of people's logs, so it may be worth noting how you feel today.`;
  }
  if (r.trend != null && r.trend >= 2) {
    return "Pressure has been climbing over the last few hours. Steady or rising pressure tends to be quieter in most logs.";
  }
  if (r.value < 1000) {
    return "Pressure is on the low side today. Low pressure shows up in a lot of people's logs.";
  }
  return "Pressure looks steady today. Nothing unusual on the weather front.";
}
