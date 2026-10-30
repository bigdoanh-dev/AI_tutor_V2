import { useState } from "react";
import {
  ArrowRight,
  Flag,
  MessageCircle,
  Pause,
  RotateCcw,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import {
  topics,
  questions,
  questionById,
  topicById,
  levelNames,
} from "../data/catalog";
import { reviewItems } from "../lib/learning";
import { Title, Empty, Meter, Heading } from "./ui";
export function Practice({ topic }) {
  const { state, startQuiz, resumeQuiz, go } = useWorkspace();
  const [mode, setMode] = useState("adaptive");
  const [selected, setSelected] = useState(topicById[topic] ? topic : "");
  const [count, setCount] = useState(5);
  const available = questions.filter(
    (q) => !selected || q.topic === selected,
  ).length;
  return (
    <>
      <Title title="Thiết lập bài luyện" back="home">
        Chọn cách ôn phù hợp với buổi học hôm nay.
      </Title>
      {state.draft && (
        <div className="notice">
          <strong>Bạn có một bài đang làm.</strong>
          <p>
            Tiếp tục để giữ các câu đã chọn. Bắt đầu bài mới sẽ thay bài đang
            làm.
          </p>
          <button className="secondary" onClick={resumeQuiz}>
            Tiếp tục bài đang làm
          </button>
        </div>
      )}
      <fieldset className="choice-group">
        <legend>Cách luyện tập</legend>
        {[
          [
            "adaptive",
            "Thích ứng",
            "Ưu tiên chủ đề yếu, chọn độ khó từ kết quả gần đây.",
          ],
          [
            "fixed",
            "Đề tuần cố định",
            "Bộ câu ổn định để tự ôn; không tự phân nhóm thực nghiệm.",
          ],
        ].map(([id, label, desc]) => (
          <label
            className={"choice " + (mode === id ? "selected" : "")}
            key={id}
          >
            <input
              type="radio"
              name="mode"
              value={id}
              checked={mode === id}
              onChange={() => setMode(id)}
            />
            <span>
              <strong>{label}</strong>
              <small>{desc}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        Chủ đề
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Tổng hợp các chủ đề</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Số câu
        <select
          value={Math.min(count, available)}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[5, 10]
            .filter((n) => n <= available)
            .map((n) => (
              <option key={n} value={n}>
                {n} câu
              </option>
            ))}
        </select>
      </label>
      <p className="fine">
        Ngân hàng mẫu có {available} câu phù hợp. Kết quả chỉ hiện sau khi nộp;
        bài đang làm được lưu để tiếp tục.
      </p>
      <button
        className="primary full"
        onClick={() =>
          startQuiz({
            mode,
            topic: selected,
            count: Math.min(count, available),
          })
        }
      >
        Bắt đầu bài mới
        <ArrowRight size={17} />
      </button>
      <button className="list-link" onClick={() => go("review")}>
        Ôn riêng các câu đã sai
        <ArrowRight size={16} />
      </button>
    </>
  );
}
export function Quiz() {
  const { state, answerQuestion, next, previous, pause, submitQuiz, change } =
    useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const draft = state.draft;
  if (!draft)
    return (
      <Empty
        title="Chưa có bài đang làm"
        action={() => (location.hash = "practice")}
      />
    );
  const q = questionById[draft.ids[draft.index]];
  const complete = draft.index === draft.count - 1;
  return (
    <>
      <div className="quiz-toolbar">
        <button className="back" onClick={pause}>
          <Pause size={17} /> Lưu & thoát
        </button>
        <span>{draft.mode === "fixed" ? "Đề cố định" : "Luyện thích ứng"}</span>
      </div>
      <div className="quiz-top">
        <strong>
          Câu {draft.index + 1} / {draft.count}
        </strong>
        <span>{Object.keys(draft.answers).length} đã trả lời</span>
      </div>
      <Meter
        value={((draft.index + 1) / draft.count) * 100}
        label="Tiến độ bài luyện"
      />
      <div className="question-meta">
        <span>{topicById[q.topic].name}</span>
        <span className="status-tag">{levelNames[q.level]}</span>
      </div>
      <h1 className="question-stem">{q.stem}</h1>
      <p className="fine">Chọn một đáp án đúng nhất.</p>
      <div className="options" role="group" aria-label="Lựa chọn đáp án">
        {q.options.map((text, i) => (
          <button
            aria-pressed={draft.answers[q.id] === i}
            className={draft.answers[q.id] === i ? "selected" : ""}
            key={text}
            onClick={() => answerQuestion(q.id, i)}
          >
            <span>{"ABCD"[i]}</span>
            {text}
          </button>
        ))}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.flagged?.includes(q.id) || false}
          onChange={() =>
            change((s) => ({
              ...s,
              draft: {
                ...s.draft,
                flagged: s.draft.flagged?.includes(q.id)
                  ? s.draft.flagged.filter((id) => id !== q.id)
                  : [...(s.draft.flagged || []), q.id],
              },
            }))
          }
        />
        <Flag size={15} /> Đánh dấu chưa chắc chắn
      </label>
      <div className="actions quiz-actions">
        <button
          className="secondary"
          disabled={draft.index === 0}
          onClick={previous}
        >
          Câu trước
        </button>
        <button
          className="primary"
          disabled={draft.answers[q.id] === undefined}
          onClick={() => (complete ? setConfirm(true) : next())}
        >
          {complete ? "Nộp bài" : "Câu tiếp theo"}
          <ArrowRight size={16} />
        </button>
      </div>
      {confirm && (
        <div className="modal-scrim">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
          >
            <h2 id="submit-title">Nộp bài luyện?</h2>
            <p>
              Bạn đã trả lời {Object.keys(draft.answers).length}/{draft.count}{" "}
              câu. Kết quả và giải thích sẽ hiện ngay sau khi nộp.
            </p>
            <div className="actions">
              <button className="secondary" onClick={() => setConfirm(false)}>
                Kiểm tra lại
              </button>
              <button className="primary" onClick={submitQuiz}>
                Xác nhận nộp
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function Explanation({ record }) {
  const { go, askTutor } = useWorkspace();
  const q = questionById[record.questionId];
  if (!q) return null;
  return (
    <article className="review">
      <small className={record.correct ? "right" : "wrong"}>
        {record.correct ? "Đúng" : "Cần ôn lại"} · {topicById[q.topic].name} ·{" "}
        {levelNames[q.level]}
      </small>
      <h3>{q.stem}</h3>
      <p>
        Bạn chọn:{" "}
        <strong>{q.options[record.selected] ?? "Chưa trả lời"}</strong>
      </p>
      <p>
        Đáp án đúng: <strong>{q.options[q.answer]}</strong>
      </p>
      {!record.correct && q.wrong?.[record.selected] && (
        <p className="chosen-analysis">
          Vì sao lựa chọn này chưa đúng: {q.wrong[record.selected]}
        </p>
      )}
      <p>{q.explanation}</p>
      <div className="actions">
        <button className="secondary" onClick={() => go("lesson", q.topic)}>
          Đọc kiến thức liên quan
        </button>
        <button
          className="secondary"
          onClick={() => askTutor(q.id, record.selected)}
        >
          <MessageCircle size={14} /> Hỏi gia sư
        </button>
      </div>
    </article>
  );
}
export function Result({ id }) {
  const { state, go } = useWorkspace();
  const session = state.sessions.find((s) => s.id === id);
  if (!session)
    return (
      <Empty
        title="Không tìm thấy bài luyện"
        action={() => go("progress")}
        label="Về tiến độ"
      />
    );
  const correct = session.answers.filter((a) => a.correct).length;
  return (
    <>
      <Title title="Kết quả bài luyện" back="progress">
        {correct === session.answers.length
          ? "Bạn đã trả lời chính xác tất cả câu hỏi."
          : "Xem lại lựa chọn để hiểu phần kiến thức cần củng cố."}
      </Title>
      <div className="score-block">
        <strong>
          {correct}
          <small>/{session.answers.length}</small>
        </strong>
        <span>Câu trả lời đúng</span>
        <p>
          {Math.round((session.elapsedMs || 0) / 1000)} giây làm bài ·{" "}
          {session.mode === "fixed" ? "Đề cố định" : "Luyện thích ứng"}
        </p>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => go("review")}>
          Ôn câu chưa vững
        </button>
        <button className="secondary" onClick={() => go("progress")}>
          Xem tiến độ
        </button>
      </div>
      <Heading title="Phân tích từng câu" />
      {session.answers.map((a) => (
        <Explanation record={a} key={a.questionId} />
      ))}
    </>
  );
}
export function Review() {
  const { state, startQuiz, go } = useWorkspace();
  const [filter, setFilter] = useState("wrong");
  const wrong = reviewItems(state.sessions);
  const latest = new Map();
  for (const s of state.sessions)
    for (const a of s.answers) latest.set(a.questionId, a);
  const items =
    filter === "wrong" ? wrong : [...latest.values()].filter((a) => a.flagged);
  return (
    <>
      <Title title="Ôn câu chưa vững" back="study">
        Câu sai được bỏ khỏi hàng đợi khi bạn trả lời đúng ở lượt sau.
      </Title>
      <div className="tabs">
        <button
          className={filter === "wrong" ? "active" : ""}
          onClick={() => setFilter("wrong")}
        >
          Câu sai ({wrong.length})
        </button>
        <button
          className={filter === "flagged" ? "active" : ""}
          onClick={() => setFilter("flagged")}
        >
          Đã đánh dấu ({[...latest.values()].filter((a) => a.flagged).length})
        </button>
      </div>
      {items.length ? (
        <>
          <button
            className="primary full"
            onClick={() =>
              startQuiz({
                mode: "adaptive",
                topic: "",
                count: Math.min(5, items.length),
                pool: items.map((a) => a.questionId),
              })
            }
          >
            <RotateCcw size={16} /> Luyện lại {Math.min(5, items.length)} câu
          </button>
          {items.map((a) => (
            <Explanation record={a} key={a.questionId} />
          ))}
        </>
      ) : (
        <Empty
          title={
            filter === "wrong"
              ? "Không có câu sai cần ôn"
              : "Chưa đánh dấu câu nào"
          }
          action={() => go("practice")}
        >
          Làm bài luyện hoặc đánh dấu câu chưa chắc chắn để quay lại sau.
        </Empty>
      )}
    </>
  );
}
