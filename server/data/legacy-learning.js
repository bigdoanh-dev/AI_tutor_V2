import { questions, questionById, topics } from "../data/catalog.js";
export const dayKey = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
export const allAnswers = (sessions) =>
  sessions.flatMap((s) =>
    s.answers.map((a) => ({ ...a, at: s.at, sessionId: s.id })),
  );
export function topicStats(sessions) {
  const answers = allAnswers(sessions);
  return topics.map((t) => {
    const a = answers.filter((a) => a.topic === t.id);
    const recent = a.slice(-12);
    const correct = recent.filter((a) => a.correct).length;
    const seen = new Set(a.map((a) => a.questionId));
    return {
      ...t,
      total: a.length,
      recent: recent.length,
      correct,
      accuracy: pct(correct, recent.length),
      coverage: pct(
        seen.size,
        questions.filter((q) => q.topic === t.id).length,
      ),
      seen: seen.size,
    };
  });
}
export function reviewItems(sessions) {
  const latest = new Map();
  for (const a of allAnswers(sessions)) latest.set(a.questionId, a);
  return [...latest.values()]
    .filter((a) => !a.correct)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}
export function nextQuestion(draft, sessions) {
  const candidates = questions.filter(
    (q) =>
      !draft.ids.includes(q.id) &&
      (!draft.topic || q.topic === draft.topic) &&
      (!draft.pool || draft.pool.includes(q.id)),
  );
  if (!candidates.length) return null;
  if (draft.mode === "fixed")
    return candidates.sort(
      (a, b) =>
        (draft.fixedOrder?.indexOf(a.id) ?? a.id) -
        (draft.fixedOrder?.indexOf(b.id) ?? b.id),
    )[0];
  const past = allAnswers(sessions);
  // Include previous answers in the active quiz to adjust the next difficulty without revealing results early.
  const provisional = draft.ids
    .filter((id) => draft.answers[id] !== undefined)
    .map((id) => ({
      topic: questionById[id].topic,
      questionId: id,
      correct: draft.answers[id] === questionById[id].answer,
    }));
  const evidence = [...past, ...provisional];
  const latest = new Map(past.map((a) => [a.questionId, a]));
  const score = (q) => {
    const recent = evidence.filter((a) => a.topic === q.topic).slice(-6);
    const rate = recent.length
      ? recent.filter((a) => a.correct).length / recent.length
      : 0.5;
    const target =
      recent.length < 2 ? 1 : rate >= 0.8 ? 3 : rate >= 0.5 ? 2 : 1;
    const weakness = recent.length ? 1 - rate : 0.65;
    return (
      weakness * 4 -
      Math.abs(q.level - target) * 1.3 +
      (latest.has(q.id) ? (latest.get(q.id).correct ? -0.6 : 0.2) : 0.4)
    );
  };
  return candidates.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}
export function rhythm(sessions, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + i);
    const key = dayKey(date);
    const items = sessions.filter((s) => dayKey(s.at) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("vi", {
        timeZone: "Asia/Ho_Chi_Minh",
        weekday: "short",
      }).format(date),
      count: items.length,
      seconds: items.reduce((n, s) => n + (s.elapsedMs || 0) / 1000, 0),
    };
  });
  return {
    days,
    activeDays: days.filter((d) => d.count).length,
    minutes: Math.round(days.reduce((n, d) => n + d.seconds, 0) / 60),
  };
}
export function makeSession(draft) {
  return {
    id: draft.id,
    at: new Date().toISOString(),
    mode: draft.mode,
    topic: draft.topic,
    elapsedMs: draft.elapsedMs || 0,
    answers: draft.ids.map((id) => {
      const q = questionById[id];
      return {
        questionId: id,
        topic: q.topic,
        level: q.level,
        selected: draft.answers[id],
        flagged: (draft.flagged || []).includes(id),
        correct: draft.answers[id] === q.answer,
        responseMs: draft.responseMs?.[id] || 0,
      };
    }),
  };
}

export const skillGroups = [
  { id: "linear", name: "Ngăn xếp & hàng đợi", ids: [1, 6, 7, 10] },
  { id: "trees", name: "Cây & danh sách liên kết", ids: [8, 9] },
  { id: "sql", name: "Truy vấn SQL", ids: [2, 11, 12, 13] },
  { id: "integrity", name: "Khóa & giao dịch", ids: [5, 14] },
  { id: "search", name: "Tìm kiếm", ids: [3, 15] },
  { id: "algorithm", name: "Phân tích giải thuật", ids: [16, 17, 18, 19] },
  { id: "flow", name: "Vòng lặp", ids: [4, 21] },
  { id: "functions", name: "Biến & hàm", ids: [20, 22, 23, 24] },
];
// Null distinguishes an unobserved axis from a measured 0% success rate.
export function radarStats(sessions, dimension = "topic") {
  const answers = allAnswers(sessions);
  const axes =
    dimension === "skill"
      ? skillGroups.map((g, i) => ({ ...g, labels: [String(i + 1)] }))
      : dimension === "level"
        ? [
            { id: 1, name: "Cơ bản", labels: ["Cơ bản"] },
            { id: 2, name: "Trung bình", labels: ["Trung bình"] },
            { id: 3, name: "Nâng cao", labels: ["Nâng cao"] },
          ]
        : topics.map((t) => ({
            id: t.id,
            name: t.name,
            labels: {
              ds: ["Cấu trúc", "dữ liệu"],
              db: ["Cơ sở", "dữ liệu"],
              algo: ["Giải thuật"],
              prog: ["Lập trình", "cơ bản"],
            }[t.id],
          }));
  return axes.map((axis) => {
    const records = answers.filter((a) =>
      dimension === "skill"
        ? axis.ids.includes(a.questionId)
        : dimension === "level"
          ? a.level === axis.id
          : a.topic === axis.id,
    );
    const correct = records.filter((a) => a.correct).length;
    return {
      ...axis,
      total: records.length,
      correct,
      value: records.length ? pct(correct, records.length) : null,
    };
  });
}
