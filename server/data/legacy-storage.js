import { topics, questionById } from "../data/catalog.js";
export const STORAGE_KEY = "nexus-workspace-v2";
export const uid = () => crypto.randomUUID();
export const defaults = () => ({
  version: 2,
  participantId: uid(),
  name: "bạn",
  sessions: [],
  read: [],
  saved: [],
  events: [],
  draft: null,
  days: [],
  reminder: "19:00",
  weekGoal: 3,
  logging: false,
  chats: [],
  activeChatId: null,
});
export function loadWorkspace() {
  const base = defaults();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      return {
        ...base,
        ...s,
        sessions: Array.isArray(s.sessions) ? s.sessions : [],
        events: Array.isArray(s.events) ? s.events : [],
        read: Array.isArray(s.read) ? s.read : [],
        saved: Array.isArray(s.saved) ? s.saved : [],
        chats: Array.isArray(s.chats) ? s.chats : [],
      };
    }
    const old = JSON.parse(localStorage.getItem("nexus-state") || "null");
    if (!old) return base;
    const groups = new Map();
    for (const a of old.attempts || []) {
      if (!questionById[a.questionId] || !a.at) continue;
      const key = a.at;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        questionId: a.questionId,
        topic: questionById[a.questionId].topic,
        level: questionById[a.questionId].level,
        selected: a.selected,
        correct: a.correct,
        responseMs: 0,
      });
    }
    return {
      ...base,
      name: old.name || base.name,
      days: old.days || [],
      reminder: old.reminder || "19:00",
      chats: JSON.parse(localStorage.getItem("nexus-chat-history") || "[]").map(
        (c) => ({ ...c, id: uid() }),
      ),
      saved: (old.saved || [])
        .map((name) => topics.find((t) => t.name === name)?.id)
        .filter(Boolean),
      sessions: [...groups].map(([at, answers]) => ({
        id: uid(),
        at,
        answers,
        mode: "legacy",
        elapsedMs: 0,
      })),
    };
  } catch {
    return base;
  }
}
export function event(state, type, payload = {}) {
  if (!state.logging) return state;
  return {
    ...state,
    events: [
      ...state.events,
      {
        id: uid(),
        type,
        at: new Date().toISOString(),
        participantId: state.participantId,
        sessionId: state.draft?.id || null,
        schemaVersion: 1,
        ...payload,
      },
    ],
  };
}
export function exportBody(state, format = "json") {
  const rows = state.sessions.flatMap((s) =>
    s.answers.map((a) => ({
      participantId: state.participantId,
      sessionId: s.id,
      at: s.at,
      mode: s.mode,
      ...a,
    })),
  );
  const body =
    format === "json"
      ? JSON.stringify(
          {
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            participantId: state.participantId,
            sessions: state.sessions,
            events: state.events,
            notes: "Dữ liệu học tập cục bộ; không có phân nhóm thực nghiệm.",
          },
          null,
          2,
        )
      : "\uFEFF" +
        [
          [
            "participantId",
            "sessionId",
            "at",
            "mode",
            "questionId",
            "topic",
            "level",
            "selected",
            "correct",
            "flagged",
            "responseMs",
          ].join(","),
          ...rows.map((row) =>
            [
              "participantId",
              "sessionId",
              "at",
              "mode",
              "questionId",
              "topic",
              "level",
              "selected",
              "correct",
              "flagged",
              "responseMs",
            ]
              .map(
                (key) =>
                  '"' + String(row[key] ?? "").replaceAll('"', '""') + '"',
              )
              .join(","),
          ),
        ].join("\r\n");
  return body;
}
export function exportFile(state, format = "json") {
  const body = exportBody(state, format);
  const url = URL.createObjectURL(
    new Blob([body], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `nexus-learning-${Date.now()}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function calendarBody(state, now = new Date()) {
  const selected = state.days;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NEXUS//Study Planner//VI",
    "CALSCALE:GREGORIAN",
  ];
  const codes = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const day = dayKeyLocal(date);
    const vietnamDay = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!selected.includes(codes[vietnamDay])) continue;
    const [h, m] = state.reminder.split(":").map(Number);
    const start = new Date(
      `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`,
    );
    if (start <= now) continue;
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const stamp = (d) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid()}@nexus`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      "SUMMARY:Ôn tập CNTT cùng NEXUS",
      "BEGIN:VALARM",
      "TRIGGER:-PT10M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Đến giờ ôn tập",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
export function downloadCalendar(state) {
  const url = URL.createObjectURL(
    new Blob([calendarBody(state)], {
      type: "text/calendar;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexus-lich-on-tap.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dayKeyLocal(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
