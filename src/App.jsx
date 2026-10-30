import { useCallback, useEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { api, setCsrf } from "./lib/api";
import { hydrateCatalog } from "./data/catalog";
import { Home, Path, Study, Lesson, Progress } from "./features/LearningPages";
import { Practice, Quiz, Result, Review } from "./features/Practice";
import { Schedule, Profile } from "./features/Personal";
import { Chat } from "./features/Chat";
import { Auth } from "./features/Auth";
import "./App.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
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
  "notifications",
]);
function readRoute() {
  const [page, id] = location.hash.slice(1).split("/");
  return { page: pages.has(page) ? page : "home", id };
}
async function fetchWorkspace() {
  const data = await api("/workspace");
  setCsrf(data.csrf);
  hydrateCatalog(data.catalog, data.state.draft);
  return data;
}
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <StudentApp />
    </QueryClientProvider>
  );
}
function StudentApp() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [route, setRoute] = useState(readRoute),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [chatContext, setChatContext] = useState(null),
    [activeChatId, setActiveChat] = useState(null),
    [pending, setPending] = useState(null);
  const current = useRef(null),
    running = useRef(false),
    main = useRef(null);
  useEffect(() => {
    current.current = query.data;
  }, [query.data]);
  const notify = useCallback((text) => setMessage(text), []);
  const go = useCallback((page, id) => {
    location.hash = page + (id ? "/" + id : "");
    setRoute(readRoute());
    if (page === "lesson" && id) api(`/materials/${id}`).catch(() => {});
  }, []);
  async function refresh() {
    const data = await fetchWorkspace();
    current.current = data;
    cache.setQueryData(["workspace"], data);
    return data;
  }
  const run = async (fn) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (error) {
      notify(
        error.status === 409
          ? error.message + " Đang tải phiên bản mới nhất."
          : error.message || "Mất kết nối máy chủ. Hãy thử đồng bộ lại.",
      );
      if (error.status === 409) await refresh().catch(() => {});
      if (error.status === 401) {
        cache.removeQueries({ queryKey: ["workspace"] });
        query.refetch();
      }
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const hash = () => {
      setRoute(readRoute());
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route.page, route.id]);
  const draft = query.data?.state.draft,
    userId = query.data?.user.id;
  useEffect(() => {
    if (!userId || !["home", "path"].includes(route.page)) return;
    api("/recommendations")
      .then((recommendations) =>
        cache.setQueryData(["workspace"], (before) =>
          before
            ? { ...before, state: { ...before.state, recommendations } }
            : before,
        ),
      )
      .catch(() => {});
  }, [userId, route.page, cache]);
  const pendingKey =
    userId && draft ? `nexus-unsynced-${userId}-${draft.id}` : null;
  useEffect(() => {
    if (!pendingKey) return;
    try {
      const stored = localStorage.getItem(pendingKey);
      if (stored) queueMicrotask(() => setPending(JSON.parse(stored)));
    } catch {
      /* Storage is optional. */
    }
  }, [pendingKey]);
  useEffect(() => {
    if (route.page !== "quiz" || !draft || draft.paused) return;
    const beat = () =>
      api(`/attempts/${draft.id}/heartbeat`, {
        method: "POST",
        body: { questionId: draft.ids[draft.index], visible: !document.hidden },
      }).catch(() => {});
    const timer = setInterval(beat, 15000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [route.page, draft]);
  async function command(action, body = {}) {
    const d = current.current.state.draft;
    if (!d) throw new Error("Không còn bài đang làm");
    const next = await api(`/attempts/${d.id}/${action}`, {
      method: "POST",
      body: { revision: d.revision, requestId: crypto.randomUUID(), ...body },
    });
    const updated = {
      ...current.current,
      state: {
        ...current.current.state,
        draft: next.status === "active" ? next : null,
      },
    };
    hydrateCatalog(updated.catalog, updated.state.draft);
    current.current = updated;
    cache.setQueryData(["workspace"], updated);
    return next;
  }
  async function syncPending() {
    if (!pending) return;
    await command("answer", pending);
    if (pendingKey) localStorage.removeItem(pendingKey);
    setPending(null);
  }
  const answerQuestion = (questionId, selected) => {
    const value = { questionId, selected };
    setPending(value);
    try {
      if (pendingKey) localStorage.setItem(pendingKey, JSON.stringify(value));
    } catch {
      notify("Không lưu được bản tạm. Hãy giữ trang mở đến khi đồng bộ.");
    }
    return run(async () => {
      await command("answer", value);
      if (pendingKey) localStorage.removeItem(pendingKey);
      setPending(null);
    });
  };
  const change = (fn) =>
    run(async () => {
      const before = { ...current.current.state, activeChatId },
        after = fn(before);
      if (after.activeChatId !== before.activeChatId)
        setActiveChat(after.activeChatId);
      if (after.name !== before.name || after.logging !== before.logging)
        await api("/me", {
          method: "PATCH",
          body: { name: after.name, logging: after.logging },
        });
      for (const materialId of new Set([
        ...before.read,
        ...before.saved,
        ...after.read,
        ...after.saved,
      ])) {
        if (
          before.read.includes(materialId) !==
            after.read.includes(materialId) ||
          before.saved.includes(materialId) !== after.saved.includes(materialId)
        )
          await api(`/materials/${materialId}/state`, {
            method: "PUT",
            body: {
              saved: after.saved.includes(materialId),
              read: after.read.includes(materialId),
            },
          });
      }
      if (
        after.draft &&
        before.draft &&
        after.draft.flagged !== before.draft.flagged
      ) {
        await syncPending();
        const questionId = before.draft.ids[before.draft.index];
        await command("answer", {
          questionId,
          flagged: after.draft.flagged.includes(questionId),
        });
      }
      await refresh();
    });
  const track = (type, data) => {
    if (current.current?.state.logging)
      api("/events", {
        method: "POST",
        body: {
          events: [
            {
              id: crypto.randomUUID(),
              type,
              attemptId: current.current.state.draft?.id || null,
              data,
            },
          ],
        },
      }).catch(() => {});
  };
  if (query.isPending)
    return (
      <main className="app panel" role="status">
        Đang kết nối NEXUS…
      </main>
    );
  if (query.error?.status === 401 || location.hash.startsWith("#auth/"))
    return <Auth onLogin={() => query.refetch()} />;
  if (query.isError)
    return (
      <main className="app panel">
        <h1>Chưa kết nối được hệ thống</h1>
        <p>{query.error.message}</p>
        <button className="primary" onClick={() => query.refetch()}>
          Thử lại
        </button>
      </main>
    );
  const state = {
    ...query.data.state,
    activeChatId,
    draft:
      pending && draft
        ? {
            ...draft,
            answers: {
              ...draft.answers,
              [pending.questionId]: pending.selected,
            },
          }
        : draft,
  };
  const value = {
    state,
    change,
    notify,
    go,
    track,
    busy,
    pending,
    user: query.data.user,
    catalog: query.data.catalog,
    refresh,
    run,
    startQuiz: (options) =>
      run(async () => {
        if (current.current.state.draft) {
          notify("Bạn có bài đang làm. Hãy tiếp tục hoặc bỏ bài trước.");
          go("practice");
          return;
        }
        const created = await api("/attempts", {
          method: "POST",
          body: { ...options, requestId: crypto.randomUUID() },
        });
        await refresh();
        go("quiz");
        if (created.count < (options.count || 5))
          notify(`Ngân hàng hiện có ${created.count} câu phù hợp.`);
      }),
    resumeQuiz: () =>
      run(async () => {
        await syncPending();
        await command("resume");
        go("quiz");
      }),
    answerQuestion,
    next: () =>
      run(async () => {
        await syncPending();
        await command("next");
      }),
    previous: () =>
      run(async () => {
        await syncPending();
        await command("navigate", {
          index: Math.max(0, current.current.state.draft.index - 1),
        });
      }),
    pause: () =>
      run(async () => {
        await syncPending();
        await command("pause");
        go("home");
        notify("Đã lưu bài trên máy chủ.");
      }),
    abandon: () =>
      run(async () => {
        await command("abandon");
        if (pendingKey) localStorage.removeItem(pendingKey);
        setPending(null);
        await refresh();
      }),
    submitQuiz: () =>
      run(async () => {
        await syncPending();
        const submitted = await command("submit");
        await refresh();
        go("result", submitted.id);
      }),
    askTutor: (questionId, attemptId) => {
      setChatContext({ questionId, attemptId });
      setActiveChat(null);
      go("chat");
    },
    chatContext,
    setChatContext,
    setActiveChat,
    savePlan: (plan) =>
      run(async () => {
        await api("/study-plan", { method: "PUT", body: plan });
        await refresh();
        notify("Đã lưu lịch ôn tập.");
      }),
    logout: () =>
      run(async () => {
        await api("/auth/logout", { method: "POST" });
        cache.clear();
        setActiveChat(null);
        setChatContext(null);
        setPending(null);
        location.hash = "home";
        await query.refetch();
      }),
  };
  const page = route.page;
  const selectedTab = ["path", "practice", "quiz"].includes(page)
    ? "home"
    : ["lesson", "review"].includes(page)
      ? "study"
      : page === "result"
        ? "progress"
        : ["schedule", "notifications"].includes(page)
          ? "profile"
          : page;
  return (
    <Workspace.Provider value={value}>
      <div className="app">
        <header className="app-header">
          <button className="brand" onClick={() => go("home")}>
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
        {message && (
          <div className="notice" role="status">
            {message}
            <button
              className="icon-button"
              aria-label="Đóng thông báo"
              onClick={() => setMessage("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {pending && (
          <div className="notice" role="alert">
            Đáp án đang chờ đồng bộ.{" "}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => run(syncPending)}
            >
              Thử đồng bộ
            </button>
          </div>
        )}
        {busy && (
          <p className="sync-status" role="status">
            Đang lưu với máy chủ…
          </p>
        )}
        <main ref={main} tabIndex={-1} key={page + route.id}>
          <fieldset className="workspace-controls" disabled={busy}>
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
            {page === "notifications" && (
              <>
                <h1>Nhắc ôn tập</h1>
                {state.notifications.length === 0 && <p>Chưa có thông báo.</p>}
                {state.notifications.map((n) => (
                  <button
                    className="panel notification-item"
                    key={n.id}
                    onClick={() =>
                      run(async () => {
                        await api(`/notifications/${n.id}/read`, {
                          method: "POST",
                        });
                        await refresh();
                        go("path");
                      })
                    }
                  >
                    <strong>
                      {n.title}
                      {!n.read_at && " · Mới"}
                    </strong>
                    <p>{n.body}</p>
                  </button>
                ))}
              </>
            )}
          </fieldset>
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
                key={id}
                aria-current={selectedTab === id ? "page" : undefined}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </Workspace.Provider>
  );
}
