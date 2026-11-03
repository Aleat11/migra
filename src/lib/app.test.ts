import { describe, expect, it } from "vitest";
import {
  checkInStreak,
  headacheDays,
  medEffectiveness,
  medicationDays,
  overuseLevel,
  rankTriggers,
  smartInsights,
} from "./analytics";
import { attacksCsv, mergeBackup, parseBackup } from "./backup";
import { findUpcomingDrop, trendFromSeries } from "./pressure";
import { trialDaysLeft, verifyLicense } from "./pro";
import { HIT6, MIDAS } from "./scores";
import {
  DEFAULT_SETTINGS,
  dayKey,
  emptyDaily,
  sortAttacks,
  type Attack,
  type DailyLog,
  type Data,
  type Dose,
} from "./store";

const DAY = 86400000;
const HOUR = 3600000;

function mkAttack(over: Partial<Attack> & { id: string; start: number }): Attack {
  return {
    end: over.start + 2 * HOUR,
    pain: 6,
    locations: [],
    symptoms: [],
    triggers: [],
    notes: "",
    pressureAtOnset: null,
    ...over,
  };
}

describe("scores", () => {
  it("scores MIDAS and grades all four bands", () => {
    expect(MIDAS.score([1, 1, 1, 1, 1])).toBe(5);
    expect(MIDAS.grade(5).label).toMatch(/Grade I:/);
    expect(MIDAS.grade(8).label).toMatch(/Grade II:/);
    expect(MIDAS.grade(15).label).toMatch(/Grade III:/);
    expect(MIDAS.grade(21).label).toMatch(/Grade IV:/);
  });

  it("scores HIT-6 within 36..78", () => {
    expect(HIT6.score([0, 0, 0, 0, 0, 0])).toBe(36);
    expect(HIT6.score([4, 4, 4, 4, 4, 4])).toBe(78);
    expect(HIT6.grade(49).label).toMatch(/Little/);
    expect(HIT6.grade(60).label).toMatch(/Severe/);
  });
});

describe("store ordering", () => {
  it("keeps attacks newest-first even when a past attack is logged later", () => {
    const older = mkAttack({ id: "old", start: 1000 });
    const newer = mkAttack({ id: "new", start: 5000 });
    expect(sortAttacks([older, newer]).map((a) => a.id)).toEqual(["new", "old"]);
  });
});

describe("pressure", () => {
  it("computes the 6-hour trend from unix-timestamp series regardless of timezone", () => {
    const now = 1_700_000_000_000;
    const series = [
      { t: now - 7 * HOUR, p: 1018 },
      { t: now - 6 * HOUR, p: 1016 },
      { t: now - 1 * HOUR, p: 1012 },
    ];
    expect(trendFromSeries(series, 1011.4, now)).toBe(-4.6);
  });

  it("detects an upcoming >=3 hPa drop within a 12-hour window", () => {
    const now = 1_700_000_000_000;
    const series = [
      { t: now, p: 1015 },
      { t: now + 3 * HOUR, p: 1014 },
      { t: now + 9 * HOUR, p: 1009.5 },
      { t: now + 15 * HOUR, p: 1012 },
    ];
    const drop = findUpcomingDrop(series, now);
    expect(drop).toEqual({ start: now, end: now + 9 * HOUR, drop: 5.5 });
  });
});

describe("analytics", () => {
  it("ranks triggers once per attack and computes share", () => {
    const attacks = [
      mkAttack({ id: "1", start: 1, triggers: ["Stress", "Stress", "Lack of sleep"] }),
      mkAttack({ id: "2", start: 2, triggers: ["Stress"] }),
    ];
    const r = rankTriggers(attacks);
    expect(r[0]).toEqual({ name: "Stress", count: 2, share: 1 });
    expect(r[1]).toEqual({ name: "Lack of sleep", count: 1, share: 0.5 });
  });

  it("ranks medications from best to worst and keeps unrated ones at the end", () => {
    const doses: Dose[] = [
      {
        id: "d1",
        med: "Sumatriptan",
        dose: "50mg",
        time: 1,
        attackId: "a1",
        followUp: { result: "yes", reliefMinutes: 60, answeredAt: 2 },
      },
      {
        id: "d2",
        med: "sumatriptan",
        dose: "50mg",
        time: 3,
        attackId: "a2",
        followUp: { result: "little", reliefMinutes: 120, answeredAt: 4 },
      },
      {
        id: "d3",
        med: "Ibuprofen",
        dose: "400mg",
        time: 5,
        attackId: "a1",
        followUp: { result: "no", answeredAt: 6 },
      },
      { id: "d4", med: "Magnesium", dose: "400mg", time: 7 },
    ];
    const m = medEffectiveness(doses, [
      mkAttack({ id: "a1", start: 1, pain: 8 }),
      mkAttack({ id: "a2", start: 3, pain: 6 }),
    ]);
    expect(m.map((x) => x.name)).toEqual(["Sumatriptan", "Ibuprofen", "Magnesium"]);
    expect(m[0].score).toBe(75);
    expect(m[0].avgReliefMin).toBe(90);
    expect(m[1].score).toBe(0);
    expect(m[2].score).toBeNull();
  });

  it("counts distinct headache days and medication days, and flags overuse at >=10", () => {
    const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
    const attacks = [
      mkAttack({ id: "1", start: now - 2 * DAY, end: now - 2 * DAY + HOUR }),
      mkAttack({ id: "2", start: now - 2 * DAY + 3 * HOUR, end: now - 2 * DAY + 4 * HOUR }), // same day
    ];
    expect(headacheDays(attacks, 30, now)).toBe(1);
    const doses: Dose[] = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      med: "Rizatriptan",
      dose: "10mg",
      time: now - i * DAY,
    }));
    expect(medicationDays(doses, 30, now)).toBe(10);
    expect(overuseLevel(9)).toBe("ok");
    expect(overuseLevel(10)).toBe("watch");
    expect(overuseLevel(15)).toBe("high");
  });

  it("surfaces a personal trigger when attack rate is higher on factor days", () => {
    const base = new Date(2026, 9, 1, 12, 0, 0).getTime();
    const daily: Record<string, DailyLog> = {};
    const attacks: Attack[] = [];
    for (let i = 0; i < 12; i++) {
      const t = base + i * DAY;
      const k = dayKey(t);
      const shortSleep = i < 4;
      daily[k] = { ...emptyDaily(k), sleepHours: shortSleep ? 4.5 : 7.5, stress: 2 };
      if (shortSleep || i === 11) attacks.push(mkAttack({ id: `a${i}`, start: t + 2 * HOUR }));
    }
    const ins = smartInsights(attacks, daily);
    expect(ins[0]?.id).toBe("sleep");
    expect(ins[0]?.lift).toBeGreaterThan(2);
    expect(checkInStreak(daily, base + 11 * DAY)).toBe(12);
  });
});

describe("backup security & merge", () => {
  it("strips unknown fields, prototype keys, out-of-range values, and license keys", () => {
    const raw = JSON.stringify({
      __proto__: { polluted: true },
      attacks: [
        {
          id: "ok_1",
          start: 1000,
          end: 500,
          pain: 99,
          locations: ["Forehead"],
          notes: "fine",
          extra: "dropped",
        },
        { id: "../bad id", start: 1000 },
      ],
      doses: [{ id: "d_1", med: "Naproxen", dose: "500mg", time: 1000 }],
      settings: {
        license: "forged",
        firstUse: 1,
        highContrast: true,
        lat: 33.94,
        lon: -117.23,
        locName: "Moreno Valley",
      },
    });
    const parsed = parseBackup(raw);
    expect(parsed.attacks).toHaveLength(1);
    expect(parsed.attacks[0].end).toBeNull(); // end < start was rejected
    expect(parsed.attacks[0].pain).toBeNull(); // pain 99 out of 0..10 was rejected
    expect("extra" in parsed.attacks[0]).toBe(false);
    expect("license" in parsed.settings).toBe(false);
    expect("firstUse" in parsed.settings).toBe(false);

    const cur: Data = {
      attacks: [],
      doses: [],
      results: [],
      daily: {},
      settings: { ...DEFAULT_SETTINGS, firstUse: 12345 },
    };
    const { data, added } = mergeBackup(cur, parsed);
    expect(added).toBe(2);
    expect(data.settings.firstUse).toBe(12345);
    expect(data.settings.license).toBeNull();
  });

  it("neutralises spreadsheet formula injection in CSV export", () => {
    const csv = attacksCsv([mkAttack({ id: "1", start: 1000, notes: "=cmd|' /C calc'!A0" })], []);
    expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
  });
});

describe("pro licensing", () => {
  it("accepts a genuinely signed ECDSA key and rejects a tampered one", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const payload = new TextEncoder().encode(
      JSON.stringify({ app: "migra", id: "buyer-1", iat: 1000, exp: 9999999999999 }),
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload),
    );
    const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
    const token = `${b64u(payload)}.${b64u(sig)}`;

    expect(await verifyLicense(token, pub, 2000)).toEqual({
      id: "buyer-1",
      issued: 1000,
      expires: 9999999999999,
    });
    // expired
    expect(await verifyLicense(token, pub, 9999999999999 + 1)).toBeNull();
    // tampered payload
    const forgedPayload = new TextEncoder().encode(
      JSON.stringify({ app: "migra", id: "attacker", iat: 1000 }),
    );
    expect(await verifyLicense(`${b64u(forgedPayload)}.${b64u(sig)}`, pub, 2000)).toBeNull();
    // trial math
    expect(trialDaysLeft(1000, 1000 + 3 * DAY)).toBe(11);
    expect(trialDaysLeft(1000, 1000 + 30 * DAY)).toBe(0);
  });
});
