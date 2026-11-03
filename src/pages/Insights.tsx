import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty, SectionTitle } from "@/components/Shell";
import { fmtDuration, useData } from "@/lib/store";

const DAY = 86400000;

function weekBuckets(attacks: { start: number }[]) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, i) => {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const count = attacks.filter((a) => a.start > start && a.start <= end).length;
    const d = new Date(start);
    return { week: `${d.getMonth() + 1}/${d.getDate()}`, count };
  }).reverse();
}

function ranked(items: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 24px -8px rgba(20,60,80,.25)",
};

function RankedBars({ items }: { items: [string, number][] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None logged yet.</p>;
  const max = items[0][1];
  return (
    <ul className="space-y-2.5">
      {items.map(([t, n]) => (
        <li key={t}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium">{t}</span>
            <span className="text-xs font-bold text-muted-foreground">×{n}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="grad-dot h-full rounded-full"
              style={{ width: `${Math.max(8, (n / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Insights() {
  const d = useData();
  const attacks = d.attacks;

  const stats = useMemo(() => {
    const done = attacks.filter((a) => a.end != null);
    const pains = attacks.map((a) => a.pain).filter((p): p is number => p != null);
    const last = attacks[0];
    return {
      total: attacks.length,
      avgPain: pains.length ? (pains.reduce((s, p) => s + p, 0) / pains.length).toFixed(1) : null,
      avgDur: done.length
        ? fmtDuration(done.reduce((s, a) => s + (a.end as number) - a.start, 0) / done.length)
        : null,
      daysSince: last ? Math.floor((Date.now() - last.start) / DAY) : null,
    };
  }, [attacks]);

  const weeks = useMemo(() => weekBuckets(attacks), [attacks]);
  const pressurePts = useMemo(
    () =>
      attacks
        .filter((a) => a.pressureAtOnset != null && a.pain != null)
        .map((a) => ({ pressure: Math.round(a.pressureAtOnset as number), pain: a.pain as number })),
    [attacks],
  );
  const topTriggers = useMemo(() => ranked(attacks.flatMap((a) => a.triggers)), [attacks]);
  const topSymptoms = useMemo(() => ranked(attacks.flatMap((a) => a.symptoms)), [attacks]);

  if (attacks.length === 0) {
    return (
      <div className="space-y-4 pt-2">
        <SectionTitle>Insights</SectionTitle>
        <Empty
          title="No data yet"
          body="Log a few attacks and this page will show frequency, duration, pain, and how pressure lines up with your attacks."
        />
      </div>
    );
  }

  const cards: { label: string; value: string }[] = [
    { label: "Attacks logged", value: String(stats.total) },
    { label: "Avg pain", value: stats.avgPain != null ? `${stats.avgPain}/10` : "n/a" },
    { label: "Avg duration", value: stats.avgDur ?? "n/a" },
    {
      label: "Since last",
      value: stats.daysSince == null ? "n/a" : stats.daysSince === 0 ? "today" : `${stats.daysSince}d`,
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      <SectionTitle>Insights</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div key={c.label} className={i === 0 ? "grad-hero rounded-3xl p-4" : "card-soft !p-4 text-center"}>
            {i === 0 ? (
              <>
                <p className="stat-num text-4xl text-white">{c.value}</p>
                <p className="label-caps mt-1 text-white/70">{c.label}</p>
              </>
            ) : (
              <>
                <p className="stat-num grad-text text-3xl">{c.value}</p>
                <p className="label-caps mt-1 text-muted-foreground">{c.label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <section aria-label="Attacks per week" className="card-soft">
        <p className="label-caps mb-3 text-muted-foreground">Attacks per week</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="migraBars" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-1)" />
                  <stop offset="100%" stopColor="var(--brand-2)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
              <Bar dataKey="count" fill="url(#migraBars)" radius={[7, 7, 7, 7]} name="Attacks" maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section aria-label="Pain vs pressure" className="card-soft">
        <p className="label-caps mb-3 text-muted-foreground">Pain vs pressure at onset</p>
        {pressurePts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Pressure is captured automatically when you start an attack from the Today tab with a location set.
          </p>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="pressure"
                  name="Pressure"
                  unit=" hPa"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <YAxis dataKey="pain" name="Pain" domain={[0, 10]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
                <Scatter data={pressurePts} fill="var(--chart-2)" fillOpacity={0.75} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4">
        <section aria-label="Top triggers" className="card-soft">
          <p className="label-caps mb-3 text-muted-foreground">Most logged triggers</p>
          <RankedBars items={topTriggers} />
        </section>
        <section aria-label="Top symptoms" className="card-soft">
          <p className="label-caps mb-3 text-muted-foreground">Most logged symptoms</p>
          <RankedBars items={topSymptoms} />
        </section>
      </div>
    </div>
  );
}
