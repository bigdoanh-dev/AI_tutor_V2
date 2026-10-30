import { ProgressRadar } from "./ProgressRadar";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  Code2,
  CalendarDays,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import { topics, topicById } from "../data/catalog";
import {
  allAnswers,
  pct,
  topicStats,
  reviewItems,
  rhythm,
} from "../lib/learning";
import { Title, Empty, Meter, Heading, Panel } from "./ui";
const dateLabel = (s) =>
  new Date(s).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });
export function Home() {
  const { state, go, resumeQuiz } = useWorkspace();
  const answers = allAnswers(state.sessions);
  const stats = topicStats(state.sessions);
  const focus =
    stats.find((t) => t.id === state.recommendations?.[0]?.topicId) || stats[0];
  const week = rhythm(state.sessions);
  return (
    <>
      <div className="greeting">
        <p>Chào {state.name},</p>
        <h1>
          Học một chút,
          <br />
          vững một bước.
        </h1>
        <p>Chọn một việc nhỏ để bắt đầu hôm nay.</p>
      </div>
      <section className="daily">
        <Code2 className="daily-art" size={42} aria-hidden="true" />
        <small>
          {state.draft ? "Bài luyện đang làm" : "Bài luyện hôm nay"}
        </small>
        <h2>
          {state.draft
            ? "Tiếp tục từ câu " + (state.draft.index + 1)
            : focus.name}
        </h2>
        <p>
          {state.draft
            ? `${state.draft.ids.length} câu đã mở · tiến độ đã lưu`
            : "5 câu hỏi · ưu tiên kiến thức cần củng cố"}
        </p>
        <button
          className="primary"
          onClick={() => (state.draft ? resumeQuiz() : go("practice"))}
        >
          {state.draft ? "Tiếp tục bài luyện" : "Thiết lập bài luyện"}
          <ArrowRight size={17} />
        </button>
      </section>
      <button className="path-link" onClick={() => go("path")}>
        <span className="small-icon">
          <BookOpen size={19} />
        </span>
        <span>
          <strong>Lộ trình cá nhân</strong>
          <small>
            {answers.length
              ? `Bước tiếp theo: ${focus.name}`
              : "Xem các bước học và thiết lập mục tiêu"}
          </small>
        </span>
        <ChevronRight size={18} />
      </button>
      <button className="summary-link" onClick={() => go("progress")}>
        <span>
          <small>Câu đã làm</small>
          <strong>{answers.length}</strong>
        </span>
        <span>
          <small>Trả lời đúng</small>
          <strong>
            {pct(answers.filter((a) => a.correct).length, answers.length)}%
          </strong>
        </span>
        <span className="summary-arrow">
          <BarChart3 size={19} />
          <small>Tiến độ</small>
        </span>
      </button>
      <Heading
        title="Mục tiêu 7 ngày"
        action={() => go("schedule")}
        label="Lịch học"
      />
      <p className="muted">
        {week.activeDays}/{state.weekGoal} ngày có bài luyện hoàn thành
      </p>
      <Meter
        value={Math.min(100, pct(week.activeDays, state.weekGoal))}
        label="Mục tiêu 7 ngày"
      />
      <Heading title="Tiếp tục học" action={() => go("study")} />
      {stats.map((t) => (
        <button
          className="topic-row"
          key={t.id}
          onClick={() => go("lesson", t.id)}
        >
          <span className="small-icon">
            <BookOpen size={19} />
          </span>
          <span className="grow">
            <strong>{t.name}</strong>
            <small>
              {state.read.includes(t.id)
                ? "Đã đọc học liệu"
                : `${t.minutes} phút đọc`}{" "}
              · {t.seen}/{t.totalQuestions} câu đã gặp
            </small>
            <Meter value={t.coverage} label={`Độ bao phủ ${t.name}`} />
          </span>
          <ChevronRight size={17} />
        </button>
      ))}
    </>
  );
}
export function Path() {
  const { state, go } = useWorkspace();
  const stats = topicStats(state.sessions);
  const ordered =
    state.recommendations
      ?.map((r) => stats.find((t) => t.id === r.topicId))
      .filter(Boolean) || stats;
  const wrong = reviewItems(state.sessions);
  return (
    <>
      <Title title="Lộ trình cá nhân" back="home">
        Đề xuất dựa trên 12 câu trả lời gần nhất của mỗi chủ đề.
      </Title>
      <Panel title="Bước tiếp theo">
        <p>
          {state.sessions.length
            ? `Ưu tiên ${ordered[0].name}: ${ordered[0].total ? ordered[0].accuracy + "% đúng trong các câu gần nhất" : "chưa có bài làm"}.`
            : "Làm bài luyện đầu tiên để xác định kiến thức cần ôn."}
        </p>
        <button
          className="primary"
          onClick={() => go("practice", ordered[0].id)}
        >
          Luyện chủ đề này
          <ArrowRight size={16} />
        </button>
      </Panel>
      <ol className="path-steps">
        {ordered.map((t) => (
          <li key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <span className="status-tag">
                {!t.total
                  ? "Chưa đánh giá"
                  : t.accuracy >= 80
                    ? "Đang vững"
                    : "Cần củng cố"}
              </span>
            </div>
            <p>
              {t.total
                ? `${t.accuracy}% đúng gần đây · ${t.seen}/{t.totalQuestions} câu đã gặp`
                : "Bắt đầu ở mức cơ bản, tăng dần khi trả lời tốt."}
            </p>
            <Meter value={t.coverage} label={t.name} />
            <div className="actions">
              <button className="secondary" onClick={() => go("lesson", t.id)}>
                Đọc học liệu
              </button>
              <button
                className="secondary"
                onClick={() => go("practice", t.id)}
              >
                Luyện tập
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button className="list-link" onClick={() => go("review")}>
        Ôn lại {wrong.length} câu chưa vững
        <ArrowRight size={16} />
      </button>
      <p className="fine">
        Đây là gợi ý bằng quy tắc thích ứng từ kết quả học, chưa phải chẩn đoán
        năng lực hay mô hình AI trực tuyến.
      </p>
    </>
  );
}
export function Study() {
  const { state, go, change } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const items = topics.filter(
    (t) =>
      (filter !== "saved" || state.saved.includes(t.id)) &&
      (t.name + " " + t.lesson)
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  return (
    <>
      <Title title="Góc ôn tập">Học liệu và những câu cần quay lại.</Title>
      <div className="actions">
        <button className="secondary" onClick={() => go("practice")}>
          Tạo bài luyện
        </button>
        <button className="secondary" onClick={() => go("review")}>
          Câu sai ({reviewItems(state.sessions).length})
        </button>
      </div>
      <label className="search">
        <span className="sr-only">Tìm học liệu</span>
        <input
          placeholder="Tìm chủ đề hoặc tài liệu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="tabs">
        {[
          ["all", "Tất cả"],
          ["saved", "Đã lưu"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {items.length ? (
        items.map((t) => (
          <div className="resource-row" key={t.id}>
            <button
              className="resource-main"
              onClick={() => go("lesson", t.id)}
            >
              <small>{t.name}</small>
              <strong>{t.lesson}</strong>
              <span>
                {t.minutes} phút đọc {state.read.includes(t.id) && "· Đã đọc"}
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={
                (state.saved.includes(t.id) ? "Bỏ lưu " : "Lưu ") + t.name
              }
              aria-pressed={state.saved.includes(t.id)}
              onClick={() =>
                change((s) => ({
                  ...s,
                  saved: s.saved.includes(t.id)
                    ? s.saved.filter((id) => id !== t.id)
                    : [...s.saved, t.id],
                }))
              }
            >
              <Bookmark
                size={18}
                fill={state.saved.includes(t.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
        ))
      ) : (
        <Empty
          title={
            filter === "saved"
              ? "Chưa có tài liệu đã lưu"
              : "Không tìm thấy học liệu"
          }
        >
          Thử tìm chủ đề khác hoặc lưu một tài liệu ở danh sách Tất cả.
        </Empty>
      )}
    </>
  );
}
export function Lesson({ id }) {
  const { state, change, go, track } = useWorkspace();
  const t = topicById[id];
  if (!t)
    return (
      <Empty
        title="Không tìm thấy tài liệu"
        action={() => go("study")}
        label="Về thư viện"
      />
    );
  return (
    <>
      <Title title={t.lesson} back="study">
        {t.name} · {t.minutes} phút đọc
      </Title>
      <article className="reading">
        {t.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <div className="source">
          <strong>Nguồn & quyền sử dụng</strong>
          <p>
            {t.source?.title} · trang {t.source?.page}
          </p>
          <a
            className="text-link"
            href={`/api/v1/materials/${id}/source`}
            target="_blank"
            rel="noreferrer"
          >
            Xem tài liệu nguồn
          </a>
        </div>
      </article>
      <button
        className="secondary full"
        onClick={async () => {
          if (!state.read.includes(id)) {
            if (await change((s) => ({ ...s, read: [...s.read, id] })))
              track("resource_viewed", { topic: id, completed: true });
          }
        }}
        disabled={state.read.includes(id)}
      >
        <Check size={17} />
        {state.read.includes(id) ? "Đã đánh dấu đọc xong" : "Đánh dấu đọc xong"}
      </button>
      <button className="primary full" onClick={() => go("practice", id)}>
        Luyện kiến thức này
        <ArrowRight size={17} />
      </button>
    </>
  );
}
export function Progress() {
  const { state, go } = useWorkspace();
  const [tab, setTab] = useState("skills");
  const [scope, setScope] = useState("all");
  const sessions =
    scope === "recent" ? state.sessions.slice(-3) : state.sessions;
  const answers = allAnswers(sessions);
  const stats = topicStats(sessions);
  const week = rhythm(state.sessions);
  return (
    <>
      <Title title="Tiến độ học tập">
        Số liệu từ bài luyện đã nộp trong tài khoản của bạn.
      </Title>
      <div className="tabs">
        {[
          ["skills", "Năng lực"],
          ["rhythm", "Nhịp học"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "skills" ? (
        <>
          <label className="field">
            Phạm vi thống kê
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Tất cả bài luyện</option>
              <option value="recent">3 bài gần nhất</option>
            </select>
          </label>
          <div className="metric-grid">
            <div>
              <strong>{answers.length}</strong>
              <small>Câu đã làm</small>
            </div>
            <div>
              <strong>
                {pct(answers.filter((a) => a.correct).length, answers.length)}%
              </strong>
              <small>Tỷ lệ đúng</small>
            </div>
            <div>
              <strong>{sessions.length}</strong>
              <small>Bài đã nộp</small>
            </div>
            <div>
              <strong>
                {state.read.length}/{topics.length}
              </strong>
              <small>Học liệu đã đọc</small>
            </div>
          </div>
          {!answers.length && (
            <Empty title="Chưa có bài làm" action={() => go("practice")}>
              Hoàn thành một bài để xem độ chính xác và độ bao phủ kiến thức.
            </Empty>
          )}
          <ProgressRadar sessions={sessions} />
          <Heading title="Chi tiết theo chủ đề" />
          {stats.map((t) => (
            <button
              className="topic-row"
              key={t.id}
              onClick={() => go("practice", t.id)}
            >
              <span className="grow">
                <strong>{t.name}</strong>
                <small>
                  {t.total
                    ? `${t.accuracy}% đúng / ${t.recent} lượt gần nhất`
                    : "Chưa có dữ liệu"}{" "}
                  · đã gặp {t.seen}/{t.totalQuestions} câu
                </small>
                <Meter value={t.coverage} label={`Độ bao phủ ${t.name}`} />
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
          <p className="fine">
            Thanh biểu thị số câu khác nhau đã gặp, không phải mức thành thạo.
            Tỷ lệ đúng chủ đề tính trên tối đa 12 lượt gần nhất.
          </p>
        </>
      ) : (
        <>
          <div className="metric-grid">
            <div>
              <strong>
                {week.activeDays}/{state.weekGoal}
              </strong>
              <small>Ngày học / mục tiêu tuần</small>
            </div>
            <div>
              <strong>{week.minutes}</strong>
              <small>Phút làm bài trong 7 ngày</small>
            </div>
          </div>
          <Panel title="7 ngày gần đây">
            <div className="week-chart">
              {week.days.map((d) => (
                <div key={d.key}>
                  <span>{d.count}</span>
                  <i
                    style={{ height: Math.max(4, Math.min(80, d.count * 20)) }}
                  />
                  <small>{d.label}</small>
                </div>
              ))}
            </div>
            <p className="fine">
              Mỗi cột là số bài luyện đã hoàn thành trong ngày. Thời gian chỉ
              ghi khi bài đang mở.
            </p>
          </Panel>
          <button className="list-link" onClick={() => go("schedule")}>
            Điều chỉnh lịch và mục tiêu
            <CalendarDays size={17} />
          </button>
        </>
      )}
      <Heading title="Lịch sử bài luyện" />
      {state.sessions.length ? (
        [...state.sessions].reverse().map((s) => (
          <button
            className="history-row"
            key={s.id}
            onClick={() => go("result", s.id)}
          >
            <span>
              <strong>
                {s.mode === "fixed"
                  ? "Đề tuần cố định"
                  : s.topic
                    ? topicById[s.topic]?.name
                    : "Bài luyện thích ứng"}
              </strong>
              <small>
                {dateLabel(s.at)} · {s.answers.length} câu
              </small>
            </span>
            <span>
              {s.answers.filter((a) => a.correct).length}/{s.answers.length}
              <ChevronRight size={16} />
            </span>
          </button>
        ))
      ) : (
        <p className="muted">Chưa có bài luyện hoàn thành.</p>
      )}
    </>
  );
}
