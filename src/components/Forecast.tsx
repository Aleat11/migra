import { useEffect, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CloudSun } from "lucide-react";
import { findUpcomingDrop, type PressureReading } from "@/lib/pressure";
import { notifyOnce } from "@/lib/notify";
import { useData } from "@/lib/store";

function fmtWhen(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const day =
    d.toDateString() === today.toDateString()
      ? "today"
      : d.toDateString() === tomorrow.toDateString()
        ? "tomorrow"
        : d.toLocaleDateString([], { weekday: "long" });
  return `${day} around ${d.toLocaleTimeString([], { hour: "numeric" })}`;
}

export function Forecast({ reading }: { reading: PressureReading }) {
  const d = useData();
  const now = Date.now();
  const future = useMemo(
    () => reading.series.filter((pt) => pt.t >= now - 3600e3 && pt.t <= now + 48 * 3600e3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reading.fetchedAt],
  );
  const drop = useMemo(() => findUpcomingDrop(reading.series, now), [reading.series, now]);

  useEffect(() => {
    if (!drop || !d.settings.notify) return;
    notifyOnce(
      `drop-${Math.round(drop.start / 3600e3)}`,
      "Pressure drop ahead",
      `Pressure is forecast to fall ${drop.drop} hPa starting ${fmtWhen(drop.start)}.`,
    );
  }, [drop, d.settings.notify]);

  if (future.length < 6) return null;
  const data = future.map((pt) => ({ t: pt.t, p: Math.round(pt.p * 10) / 10 }));

  return (
    <section aria-label="48-hour pressure forecast" className="card-soft">
      <p className="label-caps mb-1 text-muted-foreground">Next 48 hours</p>
      {drop ? (
        <p className="mb-3 flex items-start gap-2 text-sm font-semibold">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
          Pressure is forecast to fall {drop.drop} hPa starting {fmtWhen(drop.start)}. If weather is
          one of your triggers, plan a lighter day, keep water and meds close.
        </p>
      ) : (
        <p className="mb-3 flex items-start gap-2 text-sm">
          <CloudSun size={17} className="mt-0.5 shrink-0 text-primary" />
          No sharp pressure drops in the forecast.
        </p>
      )}
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-1)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--brand-2)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={(t: number) =>
                new Date(t).toLocaleTimeString([], { weekday: "short", hour: "numeric" })
              }
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            {drop && (
              <ReferenceArea x1={drop.start} x2={drop.end} fill="#f59e0b" fillOpacity={0.15} />
            )}
            <Tooltip
              labelFormatter={(t) =>
                new Date(Number(t)).toLocaleString([], { weekday: "short", hour: "numeric" })
              }
              formatter={(v) => [`${v} hPa`, "Pressure"]}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="p"
              stroke="var(--brand-1)"
              strokeWidth={2}
              fill="url(#fcFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
