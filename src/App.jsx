import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home as HomeIcon,
  BookOpen,
  MessageCircle,
  BarChart3,
  UserRound,
  CalendarDays,
  X,
} from "lucide-react";
import { Workspace } from "./lib/context";
import { loadWorkspace, STORAGE_KEY, uid, event } from "./lib/storage";
import { dayKey, nextQuestion, makeSession } from "./lib/learning";
import { questions } from "./data/catalog";
import { Home, Path, Study, Lesson, Progress } from "./features/LearningPages";
import { Practice, Quiz, Result, Review } from "./features/Practice";
import { Schedule, Profile } from "./features/Personal";
import { Chat } from "./features/Chat";
import "./App.css";
const pages = new Set([
  "home",
  "path",
  "study",
  "lesson",
  "progress",
  "practice",
  "quiz",
  "result",
  "review",
  "schedule",
  "profile",
  "chat",
]);
function readRoute() {
  const [page, id] = location.hash.slice(1).split("/");
  return { page: pages.has(page) ? page : "home", id };
}
function accrue(state, pause = false) {
  if (!state.draft) return state;
  const d = state.draft;
  const elapsed = d.visitedAt ? Math.max(0, Date.now() - d.visitedAt) : 0;
  const id = d.ids[d.index];
  return {
    ...state,
    draft: {
      ...d,
      elapsedMs: (d.elapsedMs || 0) + elapsed,
      responseMs: {
        ...d.responseMs,
        [id]: (d.responseMs?.[id] || 0) + elapsed,
      },
      visitedAt: pause ? null : Date.now(),
    },
  };
}
export default function App() {
  const [state, setState] = useState(() => {
    const loaded = loadWorkspace();
    return readRoute().page === "quiz" && loaded.draft
      ? { ...loaded, draft: { ...loaded.draft, visitedAt: Date.now() } }
      : loaded;
  });
  const [route, setRoute] = useState(readRoute);
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [chatContext, setChatContext] = useState(null);
  const main = useRef(null);
  const stateRef = useRef(state);

  const change = useCallback((fn) => setState((s) => fn(s)), []);
  const notify = useCallback((text) => setMessage(text), []);
  useEffect(() => {
    stateRef.current = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      queueMicrotask(() => setStorageError(false));
    } catch {
      queueMicrotask(() => setStorageError(true));
    }
  }, [state]);
  useEffect(() => {
    const onHash = () => {
      const destination = readRoute();
      change((s) =>
        destination.page === "quiz" && s.draft
          ? { ...s, draft: { ...s.draft, visitedAt: Date.now() } }
          : accrue(s, true),
      );
      setRoute(destination);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [change]);
  useEffect(() => {
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [route.page, route.id]);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    if (route.page !== "quiz") return;
    const visibility = () => change((s) => accrue(s, document.hidden));
    const hide = () => {
      const next = accrue(stateRef.current, true);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* The persistent storage warning is handled by the save effect. */
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, [route.page, change]);
  const track = (type, payload) => change((s) => event(s, type, payload));
  const go = (page, id) => {
    if (route.page === "quiz" && page !== "quiz")
      change((s) => accrue(s, true));
    if (page === "lesson") track("resource_viewed", { topic: id });
    const hash = page + (id ? "/" + id : "");
    if (location.hash === "#" + hash) setRoute({ page, id });
    else location.hash = hash;
  };
  const startQuiz = ({
    mode = "adaptive",
    topic = "",
    count = 5,
    pool = null,
  }) => {
    let eligible = questions.filter(
      (q) => (!topic || q.topic === topic) && (!pool || pool.includes(q.id)),
    );
    if (!eligible.length) {
      notify("Chưa có câu phù hợp. Hãy chọn chủ đề khác.");
      return;
    }
    const draft = {
      id: uid(),
      mode,
      topic,
      count: Math.min(count, eligible.length),
      pool,
      ids: [],
      index: 0,
      answers: {},
      flagged: [],
      elapsedMs: 0,
      responseMs: {},
      visitedAt: Date.now(),
    };
    // A fixed weekly order is explicit practice mode only; this does not assign experimental groups.
    if (mode === "fixed") {
      const week = Math.floor(
        (new Date(dayKey() + "T00:00:00Z").getTime() + 3 * 86400000) /
          (7 * 86400000),
      );
      eligible = eligible.sort((a, b) => a.id - b.id);
      const offset = week % eligible.length;
      draft.fixedOrder = [
        ...eligible.slice(offset),
        ...eligible.slice(0, offset),
      ].map((q) => q.id);
    }
    draft.ids = [nextQuestion(draft, state.sessions).id];
    change((s) =>
      event(
        event({ ...s, draft }, "quiz_started", {
          mode,
          topic,
          count: draft.count,
        }),
        "question_viewed",
        { questionId: draft.ids[0] },
      ),
    );
    go("quiz");
  };
  const resumeQuiz = () => {
    if (!state.draft) {
      go("practice");
      return;
    }
    change((s) => ({ ...s, draft: { ...s.draft, visitedAt: Date.now() } }));
    go("quiz");
  };
  const answerQuestion = (id, choice) =>
    change((s) => {
      const timed = accrue(s);
      return event(
        {
          ...timed,
          draft: {
            ...timed.draft,
            answers: { ...timed.draft.answers, [id]: choice },
          },
        },
        "answer_selected",
        { questionId: id, selected: choice },
      );
    });
  const next = () =>
    change((s) => {
      const timed = accrue(s);
      const d = timed.draft;
      if (d.answers[d.ids[d.index]] === undefined) return timed;
      let ids = d.ids;
      if (d.index === ids.length - 1) {
        const q = nextQuestion(d, s.sessions);
        if (!q) return timed;
        ids = [...ids, q.id];
      }
      const nextDraft = {
        ...d,
        ids,
        index: d.index + 1,
        visitedAt: Date.now(),
      };
      return event({ ...timed, draft: nextDraft }, "question_viewed", {
        questionId: ids[nextDraft.index],
      });
    });
  const previous = () =>
    change((s) => {
      const timed = accrue(s);
      return {
        ...timed,
        draft: { ...timed.draft, index: Math.max(0, timed.draft.index - 1) },
      };
    });
  const pause = () => {
    change((s) => event(accrue(s, true), "quiz_paused"));
    go("home");
    notify("Đã lưu bài luyện. Bạn có thể tiếp tục ở Trang chủ.");
  };
  const submitQuiz = () => {
    const timed = accrue(stateRef.current, true);
    if (
      !timed.draft ||
      timed.draft.ids.length !== timed.draft.count ||
      timed.draft.ids.some((id) => timed.draft.answers[id] === undefined)
    )
      return;
    const session = makeSession(timed.draft);
    change((s) => {
      if (s.sessions.some((x) => x.id === session.id)) return s;
      return {
        ...event(
          { ...s, sessions: [...s.sessions, session] },
          "quiz_submitted",
          {
            correct: session.answers.filter((a) => a.correct).length,
            count: session.answers.length,
          },
        ),
        draft: null,
      };
    });
    go("result", session.id);
  };
  const askTutor = (questionId, selected) => {
    setChatContext({ questionId, selected });
    change((s) => ({ ...s, activeChatId: null }));
    go("chat");
  };
  const value = {
    state,
    change,
    notify,
    go,
    track,
    startQuiz,
    resumeQuiz,
    answerQuestion,
    next,
    previous,
    pause,
    submitQuiz,
    askTutor,
    chatContext,
    setChatContext,
  };
  const page = route.page;
  const selectedTab = ["path", "practice", "quiz"].includes(page)
    ? "home"
    : ["lesson", "review"].includes(page)
      ? "study"
      : page === "result"
        ? "progress"
        : page === "schedule"
          ? "profile"
          : page;
  return (
    <Workspace.Provider value={value}>
      <div className="app">
        <header className="app-header">
          <button
            className="brand"
            aria-label="NEXUS về Trang chủ"
            onClick={() => go("home")}
          >
            <span className="brandmark">N</span>
            <span>
              <strong>NEXUS</strong>
              <small>Không ngừng học hỏi</small>
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Mở lịch ôn tập"
            onClick={() => go("schedule")}
          >
            <CalendarDays size={20} />
          </button>
        </header>
        {storageError && (
          <div role="alert" className="notice">
            Bộ nhớ thiết bị chưa lưu được thay đổi. Hãy xuất dữ liệu trước khi
            đóng trang.
          </div>
        )}
        <main ref={main} tabIndex={-1} key={page + route.id}>
          {page === "home" && <Home />}
          {page === "path" && <Path />}
          {page === "study" && <Study />}
          {page === "lesson" && <Lesson id={route.id} />}
          {page === "practice" && <Practice topic={route.id} />}
          {page === "quiz" && <Quiz />}
          {page === "result" && <Result id={route.id} />}
          {page === "review" && <Review />}
          {page === "progress" && <Progress />}
          {page === "schedule" && <Schedule />}
          {page === "profile" && <Profile />}
          {page === "chat" && <Chat />}
        </main>
        {page !== "quiz" && (
          <nav className="bottom-nav" aria-label="Điều hướng chính">
            {[
              ["home", HomeIcon, "Trang chủ"],
              ["study", BookOpen, "Ôn tập"],
              ["chat", MessageCircle, "Gia sư"],
              ["progress", BarChart3, "Tiến độ"],
              ["profile", UserRound, "Cá nhân"],
            ].map(([id, Icon, label]) => (
              <button
                aria-current={selectedTab === id ? "page" : undefined}
                className={selectedTab === id ? "active" : ""}
                onClick={() => go(id)}
                key={id}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
        {message && (
          <div className="toast" role="status">
            {message}
            <button aria-label="Đóng thông báo" onClick={() => setMessage("")}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </Workspace.Provider>
  );
}
