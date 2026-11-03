import { useCallback, useEffect, useState } from "react";
import { LocateFixed, MapPin, Minus, Pencil, Plus, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Disclaimer, Empty, SectionTitle } from "@/components/Shell";
import { FollowUps, useNow } from "@/components/FollowUps";
import { LogWizard } from "./LogWizard";
import {
  addAttack,
  fmtDuration,
  setSettings,
  upsertAttack,
  useData,
} from "@/lib/store";
import {
  getPressure,
  resolveLocation,
  reverseGeocode,
  riskNote,
  type PressureReading,
} from "@/lib/pressure";
import { cn } from "@/lib/utils";

function TrendPill({ trend }: { trend: number | null }) {
  if (trend == null || trend === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
        <Minus size={13} /> steady
      </span>
    );
  }
  const falling = trend < 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
      {falling ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
      {falling ? "falling" : "rising"} {Math.abs(trend).toFixed(1)} hPa
    </span>
  );
}

function PressureCard() {
  const d = useData();
  const [reading, setReading] = useState<PressureReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const { lat, lon, locName } = d.settings;

  const load = useCallback(
    async (force = false) => {
      if (lat == null || lon == null) return;
      setLoading(true);
      const r = await getPressure(lat, lon, force);
      setReading(r);
      setLoading(false);
    },
    [lat, lon],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const pickLocation = async (name: string, la: number, lo: number) => {
    setSettings({ locName: name, lat: la, lon: lo });
    setEditing(false);
    setQuery("");
    setLoading(true);
    const r = await getPressure(la, lo, true);
    setReading(r);
    setLoading(false);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const name = await reverseGeocode(latitude, longitude);
        setLocating(false);
        await pickLocation(name, latitude, longitude);
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location. Enter a city or ZIP instead.");
      },
      { timeout: 12000 },
    );
  };

  const search = async () => {
    if (!query.trim()) return;
    setResolving(true);
    const hit = await resolveLocation(query);
    setResolving(false);
    if (!hit) {
      toast.error("Could not find that place. Try a city name or 5-digit ZIP.");
      return;
    }
    await pickLocation(hit.name, hit.lat, hit.lon);
  };

  return (
    <section aria-label="Barometric pressure" className="grad-hero rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="label-caps text-white/70">Barometric pressure</p>
        <button
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          onClick={() => setEditing(!editing)}
          aria-expanded={editing}
        >
          <MapPin size={14} /> {locName || "Set location"}
        </button>
      </div>

      {editing && (
        <div className="mb-4 space-y-2 rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
          <div className="flex gap-2">
            <input
              placeholder="City or ZIP"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="flex-1"
              aria-label="City or ZIP code"
            />
            <button className="btn min-h-10 py-2" onClick={search} disabled={resolving}>
              {resolving ? "..." : "Set"}
            </button>
          </div>
          <button
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-white/25 disabled:opacity-60"
            onClick={useMyLocation}
            disabled={locating}
          >
            <LocateFixed size={14} /> {locating ? "Locating..." : "Use my location"}
          </button>
          <p className="pt-1 text-xs text-white/60">
            Manual entry only — Migra never tracks your location in the background.
          </p>
        </div>
      )}

      {lat == null || lon == null ? (
        <div className="py-3 text-center">
          <p className="text-lg font-bold">No location set</p>
          <p className="mt-1 text-sm text-white/80">
            Set a city, ZIP, or your current location to see live barometric pressure.
          </p>
        </div>
      ) : loading && !reading ? (
        <p className="py-6 text-center text-sm text-white/80">Checking pressure...</p>
      ) : reading?.value == null ? (
        <div className="space-y-2 py-3 text-center">
          <p className="text-lg font-bold">Pressure unavailable</p>
          <p className="text-sm text-white/80">
            Could not reach the weather service. Your log still works; try again later.
          </p>
          <button
            className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-2xl bg-white/15 px-5 py-2 text-sm font-bold text-white hover:bg-white/25"
            onClick={() => load(true)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-center gap-3">
            <p className="stat-num text-7xl text-white">{Math.round(reading.value)}</p>
            <div className="pb-2">
              <p className="text-sm font-semibold text-white/70">hPa</p>
            </div>
          </div>
          <div className="mt-3 flex justify-center">
            <TrendPill trend={reading.trend} />
          </div>
          <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-white/85">
            {riskNote(reading)}
          </p>
          <p className="mt-3 text-center text-xs text-white/60">
            {locName} · updated{" "}
            {new Date(reading.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {" · "}
            <button className="font-semibold text-white/85 underline" onClick={() => load(true)}>refresh</button>
          </p>
        </div>
      )}
    </section>
  );
}

function LiveAttack({ onLogDetails }: { onLogDetails: () => void }) {
  const d = useData();
  const now = useNow(1000);
  const live = d.attacks.find((a) => a.end == null) ?? null;
  const [pressure, setPressure] = useState<number | null>(null);

  useEffect(() => {
    if (d.settings.lat != null && d.settings.lon != null) {
      getPressure(d.settings.lat, d.settings.lon).then((r) => setPressure(r.value));
    }
  }, [d.settings.lat, d.settings.lon]);

  if (!live) {
    return (
      <button
        className="btn w-full rounded-3xl py-5 text-lg"
        onClick={() => {
          const id = addAttack({
            start: Date.now(),
            end: null,
            pain: null,
            locations: [],
            symptoms: [],
            triggers: [],
            notes: "",
            pressureAtOnset: pressure,
          });
          if (id) toast.success("Attack started. Timer is running.");
        }}
      >
        <Timer size={22} strokeWidth={2.4} /> Migraine starting now
      </button>
    );
  }

  return (
    <div className="card-soft relative overflow-hidden" role="status" aria-live="polite">
      <div className="grad-dot absolute inset-y-0 left-0 w-1.5" aria-hidden="true" />
      <div className="pl-2">
        <p className="label-caps text-muted-foreground">Attack in progress</p>
        <p className="stat-num grad-text my-1 text-5xl">{fmtDuration(now - live.start)}</p>
        <p className="text-sm text-muted-foreground">
          Started{" "}
          {new Date(live.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {live.pressureAtOnset != null && ` · pressure ${Math.round(live.pressureAtOnset)} hPa`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="btn"
            onClick={() => {
              upsertAttack(live.id, { end: Date.now() });
              toast.success("Attack ended and logged.");
            }}
          >
            End attack
          </button>
          <button className="btn btn-ghost" onClick={onLogDetails}>
            <Pencil size={15} /> Log details
          </button>
        </div>
      </div>
    </div>
  );
}

export function Today() {
  const d = useData();
  const [wizardFor, setWizardFor] = useState<"new" | "live" | null>(null);
  const live = d.attacks.find((a) => a.end == null) ?? null;

  return (
    <div className="space-y-5 pt-2">
      <PressureCard />

      <section aria-label="Current attack">
        <LiveAttack onLogDetails={() => setWizardFor("live")} />
        {!live && (
          <button
            className={cn(
              "mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
            )}
            onClick={() => setWizardFor("new")}
          >
            <Plus size={14} /> Log a past attack instead
          </button>
        )}
      </section>

      <FollowUps />

      <section aria-label="Display settings" className="card-soft">
        <SectionTitle>Display</SectionTitle>
        <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
          <span className="text-sm font-medium">High contrast</span>
          <input
            type="checkbox"
            checked={d.settings.highContrast}
            onChange={(e) => setSettings({ highContrast: e.target.checked })}
            className="h-5 w-5 accent-[var(--primary)]"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Migraine mode (dim) is in the top bar. Both are one tap, no menus.
        </p>
      </section>

      <Disclaimer />

      {wizardFor && (
        <LogWizard
          attack={wizardFor === "live" ? live : null}
          onClose={() => setWizardFor(null)}
        />
      )}
    </div>
  );
}
