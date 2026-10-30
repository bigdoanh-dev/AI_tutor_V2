import { z } from "zod";
export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  page: z.number().int().positive(),
  file: z
    .string()
    .regex(/\.(pdf|pptx|md|txt)$/i)
    .transform((s) => s.replaceAll("\\", "/")),
});
export const bankSchema = z
  .object({
    course: z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
    }),
    version: z.string().min(1),
    demo: z.boolean().default(false),
    approved: z.literal(true),
    topics: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          lesson: z.string().min(1),
          minutes: z.number().positive(),
          sections: z
            .array(z.tuple([z.string(), z.string(), sourceSchema.optional()]))
            .min(1),
          source: sourceSchema,
        }),
      )
      .min(1),
    questions: z
      .array(
        z.object({
          id: z.number().int().positive(),
          topic: z.string(),
          level: z.number().int().min(1).max(3),
          stem: z.string().min(1),
          options: z.array(z.string().min(1)).min(2).max(8),
          answer: z.number().int().min(0),
          explanation: z.string().min(1),
          wrong: z.array(z.string().nullable()),
          skills: z.array(z.string()).min(1),
          source: sourceSchema,
        }),
      )
      .min(1),
  })
  .superRefine((bank, ctx) => {
    const topics = new Set(bank.topics.map((t) => t.id));
    if (
      topics.size !== bank.topics.length ||
      new Set(bank.questions.map((q) => q.id)).size !== bank.questions.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate topic/question ID" });
    for (const q of bank.questions) {
      if (
        !topics.has(q.topic) ||
        q.answer >= q.options.length ||
        q.wrong.length !== q.options.length ||
        q.options.some((_, i) => i !== q.answer && !q.wrong[i])
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid answer/topic/option explanations: ${q.id}`,
        });
    }
  });
export type Bank = z.infer<typeof bankSchema>;
export type Question = Bank["questions"][number];
export interface Answer {
  questionId: number;
  topic: string;
  level: number;
  selected: number;
  correct: boolean;
  flagged: boolean;
  responseMs: number;
  question: Question;
}
export interface AttemptData {
  topic: string;
  count: number;
  pool: number[] | null;
  ids: number[];
  index: number;
  answers: Record<number, number>;
  flagged: number[];
  elapsedMs: number;
  responseMs: Record<number, number>;
  fixedOrder?: number[];
  decisions: { questionId: number; reason: string }[];
  paused: boolean;
  result?: Answer[];
}
export const algorithmVersion = "rules-v1";
export const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function weekKey(date = new Date()) {
  const d = new Date(dayKey(date) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function chooseQuestion(
  bank: Bank,
  draft: AttemptData,
  history: Answer[],
  mode: string,
) {
  const candidates = bank.questions.filter(
    (q) =>
      !draft.ids.includes(q.id) &&
      (!draft.topic || q.topic === draft.topic) &&
      (!draft.pool || draft.pool.includes(q.id)),
  );
  if (mode === "fixed") {
    const q = draft.fixedOrder
      ?.map((id) => candidates.find((q) => q.id === id))
      .find(Boolean);
    return q ? { q, reason: "fixed-weekly-template" } : null;
  }
  const provisional = draft.ids
    .filter((id) => draft.answers[id] !== undefined)
    .map((id) => {
      const q = bank.questions.find((q) => q.id === id)!;
      return {
        questionId: id,
        topic: q.topic,
        correct: draft.answers[id] === q.answer,
      };
    });
  const evidence = [...history, ...provisional];
  const latest = new Map(history.map((a) => [a.questionId, a]));
  const score = (q: Question) => {
    const recent = evidence.filter((a) => a.topic === q.topic).slice(-6);
    const rate = recent.length
      ? recent.filter((a) => a.correct).length / recent.length
      : 0.5;
    const target =
      recent.length < 2 ? 1 : rate >= 0.8 ? 3 : rate >= 0.5 ? 2 : 1;
    return (
      (recent.length ? 1 - rate : 0.65) * 4 -
      Math.abs(q.level - target) * 1.3 +
      (latest.has(q.id) ? (latest.get(q.id)!.correct ? -0.6 : 0.2) : 0.4)
    );
  };
  const q = candidates.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
  return q ? { q, reason: "recent-6-topic-accuracy/difficulty/unseen" } : null;
}
export function publicQuestion(q: Question) {
  return {
    id: q.id,
    topic: q.topic,
    level: q.level,
    stem: q.stem,
    options: q.options,
    skills: q.skills,
  };
}
export function topicStats(bank: Bank, history: Answer[]) {
  return bank.topics.map((t) => {
    const all = history.filter((a) => a.topic === t.id),
      recent = all.slice(-12);
    const totalQuestions = bank.questions.filter(
      (q) => q.topic === t.id,
    ).length;
    const published = new Set(
      bank.questions.filter((q) => q.topic === t.id).map((q) => q.id),
    );
    const seen = new Set(
      all.filter((a) => published.has(a.questionId)).map((a) => a.questionId),
    ).size;
    const correct = recent.filter((a) => a.correct).length;
    return {
      ...t,
      total: all.length,
      recent: recent.length,
      correct,
      accuracy: recent.length
        ? Math.round((correct / recent.length) * 100)
        : null,
      seen,
      totalQuestions,
      coverage: totalQuestions ? Math.round((seen / totalQuestions) * 100) : 0,
    };
  });
}
export const planSchema = z.object({
  days: z
    .array(z.enum(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]))
    .max(7)
    .refine((x) => new Set(x).size === x.length),
  reminder: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekGoal: z.number().int().min(1).max(7),
  enabled: z.boolean(),
  email: z.boolean(),
});
export const defaultPlan = {
  days: ["T2", "T4", "T6"],
  reminder: "19:00",
  weekGoal: 3,
  enabled: false,
  email: false,
};
export function upcoming(
  plan: z.infer<typeof planSchema>,
  now = new Date(),
  includePast = false,
) {
  const codes = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayKey(now) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10),
      weekday = codes[d.getUTCDay()];
    return { date, weekday, at: new Date(`${date}T${plan.reminder}:00+07:00`) };
  }).filter(
    (d) => plan.days.includes(d.weekday as any) && (includePast || d.at > now),
  );
}
export function calendar(plan: z.infer<typeof planSchema>, now = new Date()) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NEXUS//Study//VI",
    ...upcoming(plan, now).flatMap((d) => [
      "BEGIN:VEVENT",
      `UID:${d.date}-${plan.reminder.replace(":", "")}@nexus`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(d.at)}`,
      `DTEND:${stamp(new Date(d.at.getTime() + 900000))}`,
      "SUMMARY:Ôn tập cùng NEXUS",
      "BEGIN:VALARM",
      "TRIGGER:-PT10M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Đến giờ ôn tập",
      "END:VALARM",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
