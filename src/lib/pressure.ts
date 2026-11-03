export interface PressureReading {
  value: number | null; // hPa
  trend: number | null; // hPa change over ~6h, negative = falling
  fetchedAt: number;
  error: string | null;
}

const CACHE_KEY = "migra:pressure";
const CACHE_MS = 30 * 60 * 1000;

function readCache(): PressureReading | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as PressureReading;
    if (Date.now() - c.fetchedAt > CACHE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(r: PressureReading) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(r));
  } catch {
    // ignore
  }
}

interface OmCurrent {
  current?: { pressure_msl?: number };
  hourly?: { time: string[]; pressure_msl?: (number | null)[] };
}

export async function getPressure(lat: number, lon: number, force = false): Promise<PressureReading> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=pressure_msl&hourly=pressure_msl&past_days=1&forecast_days=1&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as OmCurrent;
    const value = j.current?.pressure_msl ?? null;
    let trend: number | null = null;
    const times = j.hourly?.time ?? [];
    const vals = j.hourly?.pressure_msl ?? [];
    if (value != null && times.length && vals.length) {
      const sixHoursAgo = Date.now() - 6 * 3600 * 1000;
      let idx = -1;
      for (let i = times.length - 1; i >= 0; i--) {
        if (new Date(times[i]).getTime() <= sixHoursAgo) {
          idx = i;
          break;
        }
      }
      if (idx >= 0 && vals[idx] != null) {
        trend = Math.round((value - (vals[idx] as number)) * 10) / 10;
      }
    }
    const reading: PressureReading = { value, trend, fetchedAt: Date.now(), error: null };
    writeCache(reading);
    return reading;
  } catch (e) {
    const cached = readCache();
    if (cached) return { ...cached, error: null };
    return {
      value: null,
      trend: null,
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
  const q = query.trim();
  if (!q) return null;
  try {
    if (/^\d{5}$/.test(q)) {
      const res = await fetch(`https://api.zippopotam.us/us/${q}`);
      if (!res.ok) return null;
      const j = (await res.json()) as {
        places?: { "place name"?: string; state?: string; latitude?: string; longitude?: string }[];
      };
      const p = j.places?.[0];
      if (!p?.latitude || !p?.longitude) return null;
      return {
        name: `${p["place name"] ?? q}, ${p.state ?? ""} ${q}`.trim(),
        lat: parseFloat(p.latitude),
        lon: parseFloat(p.longitude),
      };
    }
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: { name?: string; admin1?: string; country?: string; latitude?: number; longitude?: number }[];
    };
    const r = j.results?.[0];
    if (r?.latitude == null || r?.longitude == null) return null;
    const bits = [r.name, r.admin1, r.country].filter(Boolean);
    return { name: bits.join(", "), lat: r.latitude, lon: r.longitude };
  } catch {
    return null;
  }
}

/** Best-effort "City, State" label for raw coordinates. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    if (!res.ok) return "Current location";
    const j = (await res.json()) as { city?: string; principalSubdivision?: string };
    const bits = [j.city, j.principalSubdivision].filter(Boolean);
    return bits.length ? bits.join(", ") : "Current location";
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
