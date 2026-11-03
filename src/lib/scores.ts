export interface Questionnaire {
  type: "midas" | "hit6";
  title: string;
  intro: string;
  questions: string[];
  options?: string[]; // hit6 only
  score: (answers: number[]) => number;
  grade: (score: number) => { label: string; detail: string };
  answerLabel: (i: number, a: number) => string;
}

export const MIDAS: Questionnaire = {
  type: "midas",
  title: "MIDAS",
  intro:
    "Over the last 3 months, on how many days did migraines affect each of these? Answer with a number of days (0-90).",
  questions: [
    "Missed work or school because of headaches",
    "Productivity at work or school reduced by half or more",
    "Did not do household work because of headaches",
    "Productivity in household work reduced by half or more",
    "Missed family, social, or leisure activities",
  ],
  score: (a) => a.reduce((s, x) => s + x, 0),
  grade: (s) =>
    s <= 5
      ? {
          label: "Grade I: little or no disability",
          detail: "Score 0-5. Your headaches are having minimal impact on daily life.",
        }
      : s <= 10
        ? {
            label: "Grade II: mild disability",
            detail: "Score 6-10. Some impact; worth mentioning at your next checkup.",
          }
        : s <= 20
          ? {
              label: "Grade III: moderate disability",
              detail: "Score 11-20. Noticeable impact; bring this to your clinician.",
            }
          : {
              label: "Grade IV: severe disability",
              detail:
                "Score 21+. Strong impact on daily life; this is worth a dedicated appointment.",
            },
  answerLabel: (_i, a) => `${a} day${a === 1 ? "" : "s"}`,
};

const HIT6_OPTIONS = ["Never", "Rarely", "Sometimes", "Very often", "Always"];
const HIT6_POINTS = [6, 8, 10, 11, 13];

export const HIT6: Questionnaire = {
  type: "hit6",
  title: "HIT-6",
  intro: "Over the last 4 weeks, how often did each of these happen?",
  questions: [
    "When you have headaches, how often is the pain severe?",
    "How often do headaches limit your ability to do usual daily activities, including housework, work, school, or social activities?",
    "When you have a headache, how often do you wish you could lie down?",
    "In the past 4 weeks, how often have you felt too tired to do work or daily activities because of your headaches?",
    "In the past 4 weeks, how often have you felt fed up or irritated because of your headaches?",
    "In the past 4 weeks, how often did headaches limit your ability to concentrate on work or daily activities?",
  ],
  options: HIT6_OPTIONS,
  score: (a) => a.reduce((s, x) => s + HIT6_POINTS[x], 0),
  grade: (s) =>
    s <= 49
      ? {
          label: "Little or no impact",
          detail: "Score 36-49. Headaches are having limited effect on your life.",
        }
      : s <= 55
        ? {
            label: "Some impact",
            detail: "Score 50-55. Headaches are having some effect; worth tracking.",
          }
        : s <= 59
          ? {
              label: "Substantial impact",
              detail: "Score 56-59. Clear impact on daily life; bring this to your clinician.",
            }
          : {
              label: "Severe impact",
              detail: "Score 60-78. Very strong impact; this deserves a dedicated appointment.",
            },
  answerLabel: (_i, a) => HIT6_OPTIONS[a] ?? "",
};

export const SYMPTOM_OPTIONS = [
  "Nausea",
  "Light sensitivity",
  "Sound sensitivity",
  "Aura",
  "Vomiting",
  "Dizziness",
  "Neck stiffness",
  "Smell sensitivity",
];

export const TRIGGER_OPTIONS = [
  "Stress",
  "Lack of sleep",
  "Weather change",
  "Dehydration",
  "Skipped meal",
  "Caffeine",
  "Screen time",
  "Hormones",
  "Alcohol",
  "Strong smells",
  "Travel",
  "Exercise",
];
