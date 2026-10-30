import test from "node:test";
import assert from "node:assert/strict";
import {
  nextQuestion,
  topicStats,
  reviewItems,
  rhythm,
  makeSession,
  dayKey,
} from "../server/data/legacy-learning.js";
import { defaults, loadWorkspace, event } from "../server/data/legacy-storage.js";
import { questions, topics } from "../server/data/catalog.js";
const draft = (overrides = {}) => ({
  id: "session-test",
  mode: "adaptive",
  topic: "",
  ids: [],
  answers: {},
  responseMs: {},
  flagged: [],
  ...overrides,
});
const session = (answers, at = "2026-10-30T01:00:00.000Z") => ({
  id: "s",
  at,
  answers,
  elapsedMs: 60000,
});
test("bank has three levels for every subject and valid answer indexes", () => {
  for (const t of topics) {
    assert.deepEqual(
      [
        ...new Set(
          questions.filter((q) => q.topic === t.id).map((q) => q.level),
        ),
      ],
      [1, 2, 3],
    );
  }
  for (const q of questions) {
    assert.ok(q.options[q.answer]);
    assert.ok(q.explanation);
  }
});
test("adaptive begins with basics, never repeats an active question, and respects topic", () => {
  const first = nextQuestion(draft({ topic: "db" }), []);
  assert.equal(first.level, 1);
  assert.equal(first.topic, "db");
  const second = nextQuestion(
    draft({ topic: "db", ids: [first.id], answers: { [first.id]: 0 } }),
    [],
  );
  assert.notEqual(second.id, first.id);
  assert.equal(second.topic, "db");
});
test("recent correct answers allow harder questions; weak topic is prioritized", () => {
  const strong = session([
    { topic: "db", questionId: 2, correct: true },
    { topic: "db", questionId: 5, correct: true },
  ]);
  assert.equal(nextQuestion(draft({ topic: "db" }), [strong]).level, 3);
  const weak = session([
    { topic: "ds", questionId: 1, correct: false },
    { topic: "ds", questionId: 6, correct: false },
  ]);
  assert.equal(nextQuestion(draft(), [weak]).topic, "ds");
});
test("fixed mode keeps recorded order despite previous results", () => {
  assert.equal(
    nextQuestion(
      draft({ mode: "fixed", fixedOrder: [14, 13, 12, 11, 5, 2], topic: "db" }),
      [],
    ).id,
    14,
  );
});
test("review queue removes a previously wrong item after correction", () => {
  const a = session([{ questionId: 1, topic: "ds", correct: false }]);
  const b = session(
    [{ questionId: 1, topic: "ds", correct: true }],
    "2026-10-30T02:00:00Z",
  );
  assert.equal(reviewItems([a]).length, 1);
  assert.equal(reviewItems([a, b]).length, 0);
});
test("coverage counts distinct questions, accuracy counts recent attempts", () => {
  const a = session([
    { questionId: 1, topic: "ds", correct: false },
    { questionId: 1, topic: "ds", correct: true },
  ]);
  const stats = topicStats([a])[0];
  assert.equal(stats.total, 2);
  assert.equal(stats.seen, 1);
  assert.equal(stats.accuracy, 50);
  assert.equal(stats.coverage, 17);
});
test("session preserves marked answers and response duration", () => {
  const s = makeSession(
    draft({
      ids: [1],
      answers: { 1: 1 },
      flagged: [1],
      responseMs: { 1: 1200 },
      elapsedMs: 1200,
    }),
  );
  assert.equal(s.answers[0].correct, true);
  assert.equal(s.answers[0].flagged, true);
  assert.equal(s.answers[0].responseMs, 1200);
});
test("date boundaries and rhythm follow Vietnam time", () => {
  assert.equal(dayKey("2026-10-29T21:00:00Z"), "2026-10-30");
  const data = rhythm([session([])], new Date("2026-10-30T04:00:00Z"));
  assert.equal(data.activeDays, 1);
  assert.equal(data.minutes, 1);
});
test("logging requires opting in and creates versioned participant/session events", () => {
  const s = defaults();
  assert.equal(event(s, "question_viewed"), s);
  const logged = event(
    { ...s, logging: true, draft: { id: "draft-1" } },
    "question_viewed",
    { questionId: 1 },
  );
  assert.equal(logged.events.length, 1);
  assert.equal(logged.events[0].sessionId, "draft-1");
  assert.equal(logged.events[0].participantId, s.participantId);
});
test("old stored learning results migrate without erasing user progress", () => {
  globalThis.localStorage = {
    getItem: (key) =>
      key === "nexus-state"
        ? JSON.stringify({
            name: "An",
            attempts: [
              {
                questionId: 1,
                selected: 1,
                correct: true,
                at: "2026-10-30T01:00:00Z",
              },
            ],
            saved: ["Cấu trúc dữ liệu"],
          })
        : null,
  };
  const loaded = loadWorkspace();
  assert.equal(loaded.name, "An");
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sessions[0].answers[0].correct, true);
  assert.deepEqual(loaded.saved, ["ds"]);
});
test("CSV columns stay aligned for legacy and newly recorded sessions", async () => {
  const { exportBody } = await import("../server/data/legacy-storage.js");
  const state = defaults();
  state.sessions = [
    session([{ questionId: 1, topic: "ds", selected: 0, correct: false }]),
    session([
      {
        questionId: 6,
        topic: "ds",
        selected: 3,
        correct: true,
        flagged: true,
        responseMs: 500,
      },
    ]),
  ];
  const lines = exportBody(state, "csv").split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.split(",").length === 11));
  assert.ok(lines[0].includes("flagged"));
});
test("calendar export uses Vietnam study time and adds a reminder", async () => {
  const { calendarBody } = await import("../server/data/legacy-storage.js");
  const text = calendarBody(
    { ...defaults(), days: ["T6"], reminder: "19:00" },
    new Date("2026-10-30T01:00:00Z"),
  );
  assert.ok(text.includes("DTSTART:20261030T120000Z"));
  assert.ok(text.includes("TRIGGER:-PT10M"));
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("radar distinguishes missing observations from 0% and aggregates three difficulty levels", async () => {
  const { radarStats } = await import("../server/data/legacy-learning.js");
  const data = [
    session([
      { topic: "ds", level: 1, correct: false },
      { topic: "ds", level: 2, correct: true },
      { topic: "db", level: 2, correct: false },
    ]),
  ];
  const byTopic = radarStats(data);
  assert.equal(byTopic.length, 4);
  assert.equal(byTopic[0].value, 50);
  assert.equal(byTopic[1].value, 0);
  assert.equal(byTopic[2].value, null);
  const byLevel = radarStats(data, "level");
  assert.equal(byLevel.length, 3);
  assert.equal(byLevel[0].value, 0);
  assert.equal(byLevel[1].value, 50);
  assert.equal(byLevel[2].value, null);
  assert.ok(radarStats([]).every((a) => a.value === null));
});

test("eight skill axes cover the complete bank without fabricating unobserved scores", async () => {
  const { radarStats, skillGroups } = await import("../server/data/legacy-learning.js");
  const assigned = skillGroups.flatMap((g) => g.ids);
  assert.equal(new Set(assigned).size, questions.length);
  assert.equal(assigned.length, questions.length);
  const axes = radarStats(
    [session([{ questionId: 1, correct: true }])],
    "skill",
  );
  assert.equal(axes.length, 8);
  assert.equal(axes[0].value, 100);
  assert.ok(axes.slice(1).every((a) => a.value === null));
});
