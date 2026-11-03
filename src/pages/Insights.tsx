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
import { AlertTriangle, Sparkles } from "lucide-react";
import { Empty, SectionTitle } from "@/components/Shell";
import { ProGate } from "@/components/ProGate";
import { fmtDuration, useData } from "@/lib/store";
import {
  checkInCount,
  headacheDays,
  medEffectiveness,
  medicationDays,
  overuseLevel,
  rankTriggers,
  smartInsights,
  timePatterns,
} from "@/lib/analytics";

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
    // sortAttacks keeps newest at [0], but Math.max stays safe either way
    const latestStart = attacks.reduce((m, a) => Math.max(m, a.start), 0);
    return {
      total: attacks.length,
      avgPain: pains.length ? (pains.reduce((s, p) => s + p, 0) / pains.length).toFixed(1) : null,
      avgDur: done.length
        ? fmtDuration(done.reduce((s, a) => s + (a.end as number) - a.start, 0) / done.length)
        : null,
      daysSince: latestStart ? Math.max(0, Math.floor((Date.now() - latestStart) / DAY)) : null,
      hDays: headacheDays(attacks, 30),
      mDays: medicationDays(d.doses, 30),
    };
  }, [attacks, d.doses]);

  const weeks = useMemo(() => weekBuckets(attacks), [attacks]);
  const pressurePts = useMemo(
    () =>
      attacks
        .filter((a) => a.pressureAtOnset != null && a.pain != null)
        .map((a) => ({
          pressure: Math.round(a.pressureAtOnset as number),
          pain: a.pain as number,
        })),
    [attacks],
  );
  const topTriggers = useMemo(
    () =>
      rankTriggers(attacks, 6).map(
        (t) => [`${t.name} (${Math.round(t.share * 100)}%)`, t.count] as [string, number],
      ),
    [attacks],
  );
  const topSymptoms = useMemo(() => ranked(attacks.flatMap((a) => a.symptoms)), [attacks]);
  const meds = useMemo(() => medEffectiveness(d.doses, attacks), [d.doses, attacks]);
  const smart = useMemo(() => smartInsights(attacks, d.daily), [attacks, d.daily]);
  const timing = useMemo(() => timePatterns(attacks), [attacks]);
  const checkIns = useMemo(() => checkInCount(d.daily), [d.daily]);
  const overuse = overuseLevel(stats.mDays);

  if (attacks.length === 0) {
    return (
      <div className="space-y-4 pt-2">
        <SectionTitle>Insights</SectionTitle>
        <Empty
          title="No data yet"
          body="Log a few attacks and daily check-ins, and this page will show triggers, medication effectiveness, and personal patterns."
        />
      </div>
    );
  }

  const cards: { label: string; value: string }[] = [
    { label: "Headache days (30d)", value: String(stats.hDays) },
    { label: "Medication days (30d)", value: String(stats.mDays) },
    { label: "Avg pain", value: stats.avgPain != null ? `${stats.avgPain}/10` : "n/a" },
    { label: "Avg duration", value: stats.avgDur ?? "n/a" },
    { label: "Attacks logged", value: String(stats.total) },
    {
      label: "Since last",
      value:
        stats.daysSince == null ? "n/a" : stats.daysSince === 0 ? "today" : `${stats.daysSince}d`,
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      <SectionTitle>Insights</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className={i === 0 ? "grad-hero rounded-3xl p-4" : "card-soft !p-4 text-center"}
          >
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

      {overuse !== "ok" && (
        <section aria-label="Medication frequency" className="card-soft flex gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-bold">Acute medication on {stats.mDays} of the last 30 days</p>
            <p className="mt-0.5 text-muted-foreground">
              Headache guidelines flag frequent acute-med use (10+ days/month for triptans or
              combination painkillers, 15+ for simple painkillers) as worth discussing with your
              clinician to avoid rebound headaches.
            </p>
          </div>
        </section>
      )}

      <ProGate
        feature="Your likely triggers"
        teaser="Compares your attack days against your non-attack days across sleep, stress, water, meals, caffeine, alcohol, cycle and barometric pressure."
      >
        <section aria-label="Your likely triggers" className="card-soft">
          <div className="mb-2 flex items-center justify-between">
            <p className="label-caps text-muted-foreground">
              <Sparkles size={12} className="mr-1 inline" /> Your likely triggers
            </p>
            <span className="text-xs text-muted-foreground">
              {checkIns} check-in{checkIns === 1 ? "" : "s"}
            </span>
          </div>
          {smart.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {checkIns < 6
                ? "Do the 30-second daily check-in on the Today tab for a week (good days and bad days) so the app can compare what happens before attacks vs quiet days."
                : "No single factor stands out yet. Keep checking in — patterns sharpen with more quiet days and attack days to compare."}
            </p>
          ) : (
            <ul className="space-y-3">
              {smart.map((ins) => (
                <li key={ins.id} className="rounded-2xl bg-muted/60 p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold">{ins.title}</p>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">
                      {ins.lift}× as likely
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{ins.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on {ins.nWith + ins.nWithout} logged days · {ins.confidence} signal
                    (association, not proof).
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </ProGate>

      <section aria-label="Medication effectiveness" className="card-soft">
        <p className="label-caps mb-3 text-muted-foreground">Medication effectiveness</p>
        {meds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Log medications in the attack wizard, then answer the 2-hour “Did it help?” check-in on
            the Today tab.
          </p>
        ) : (
          <ul className="space-y-3">
            {meds.map((m, idx) => (
              <li key={m.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold">
                    {idx + 1}. {m.name}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {m.score != null ? `${m.score}% helpful` : "awaiting check-in"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="grad-dot h-full rounded-full"
                    style={{ width: `${m.score != null ? Math.max(8, m.score) : 8}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.doses} dose{m.doses === 1 ? "" : "s"} across {m.attacks || m.doses} attack
                  {m.attacks === 1 ? "" : "s"}
                  {m.answered > 0 && ` · ${m.helped} yes, ${m.partly} a little, ${m.noHelp} no`}
                  {m.avgReliefMin != null && ` · avg relief ${fmtDuration(m.avgReliefMin * 60000)}`}
                  {m.avgPainWhenTaken != null && ` · taken at ${m.avgPainWhenTaken}/10`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              />
              <Bar
                dataKey="count"
                fill="url(#migraBars)"
                radius={[7, 7, 7, 7]}
                name="Attacks"
                maxBarSize={34}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section aria-label="When attacks start" className="card-soft">
        <p className="label-caps mb-2 text-muted-foreground">When attacks start</p>
        {(timing.peakPart || timing.peakDay) && (
          <p className="mb-3 text-sm text-muted-foreground">
            Most common:{" "}
            <span className="font-semibold text-foreground">
              {[timing.peakPart, timing.peakDay && `${timing.peakDay}s`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 text-center">
          {timing.partOfDay.map((p) => (
            <div key={p.label} className="rounded-2xl bg-muted/60 p-2.5">
              <p className="stat-num text-xl">{p.count}</p>
              <p className="text-xs text-muted-foreground">{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Pain vs pressure" className="card-soft">
        <p className="label-caps mb-3 text-muted-foreground">Pain vs pressure at onset</p>
        {pressurePts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Pressure is captured automatically when you start an attack from the Today tab with a
            location set.
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
                <YAxis
                  dataKey="pain"
                  name="Pain"
                  domain={[0, 10]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
                <Scatter data={pressurePts} fill="var(--chart-2)" fillOpacity={0.75} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4">
        <section aria-label="Top triggers" className="card-soft">
          <p className="label-caps mb-3 text-muted-foreground">Triggers ranked from your diary</p>
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
