import { useState } from "react";
import {
  CalendarDays,
  ArrowRight,
  Download,
  BarChart3,
  BookOpen,
  ShieldCheck,
  Info,
  Bell,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import { Title, Heading, Panel } from "./ui";
import { api } from "../lib/api";
export function Schedule() {
  const { state, savePlan, run, notify } = useWorkspace();
  const [days, setDays] = useState(state.days),
    [time, setTime] = useState(state.reminder),
    [goal, setGoal] = useState(state.weekGoal);
  const [enabled, setEnabled] = useState(state.plan.enabled),
    [email, setEmail] = useState(state.plan.email),
    [suggestion, setSuggestion] = useState(null);
  const save = (e) => {
    e.preventDefault();
    savePlan({ days, reminder: time, weekGoal: goal, enabled, email });
  };
  const suggest = () =>
    run(async () => {
      const p = await api("/study-plan/suggestion");
      setDays(p.days);
      setTime(p.reminder);
      setGoal(p.weekGoal);
      setEnabled(p.enabled);
      setEmail(p.email);
      setSuggestion(p);
      notify("Đã điền lịch gợi ý. Bấm lưu để áp dụng.");
    });
  return (
    <>
      <Title title="Lịch ôn tập" back="home">
        Thời gian Việt Nam (GMT+7).
      </Title>
      <form className="panel" onSubmit={save}>
        <h2>Thiết lập nhịp học</h2>
        <p>15 phút mỗi buổi. Lịch gợi ý: 3 ngày mỗi tuần.</p>
        <button type="button" className="secondary" onClick={suggest}>
          Dùng lịch gợi ý
        </button>
        <fieldset className="choice-group">
          <legend>Ngày ôn trong tuần</legend>
          <div className="days">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
              <button
                type="button"
                key={d}
                aria-pressed={days.includes(d)}
                className={days.includes(d) ? "chosen" : ""}
                onClick={() =>
                  setDays(
                    days.includes(d)
                      ? days.filter((x) => x !== d)
                      : [...days, d],
                  )
                }
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          Giờ ôn
          <input
            type="time"
            value={time}
            required
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="field">
          Mục tiêu số ngày học mỗi tuần
          <select
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option value={n} key={n}>
                {n} ngày
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Bật nhắc ôn trong app
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
          />
          Gửi thêm email nhắc ôn
        </label>
        <button className="primary">Lưu lịch ôn tập</button>
      </form>
      {suggestion && (
        <Panel title="Nội dung nên ôn">
          {suggestion.recommendations.slice(0, 3).map((r) => (
            <p key={r.materialId}>
              <strong>{r.title}</strong>
              <br />
              {r.reason}
            </p>
          ))}
        </Panel>
      )}
      <Panel title="Lịch đã lưu">
        <p>
          {state.days.join(" · ") || "Chưa chọn ngày"} · {state.reminder} · 15
          phút
        </p>
        <p>
          {state.plan.enabled ? "Đã bật nhắc ôn" : "Chưa bật nhắc ôn"}
          {state.plan.email && " · Có email"}
        </p>
        <a className="secondary" href="/api/v1/study-plan/calendar.ics">
          <Download size={16} /> Tải lịch (.ics)
        </a>
        <p className="fine">
          Lịch tải về cần được nhập vào ứng dụng Lịch. Email được gửi khi đã bật
          nhắc ôn và chọn nhận email.
        </p>
      </Panel>
    </>
  );
}
export function Profile() {
  const { state, change, go, notify, logout, user, catalog } = useWorkspace();
  const [name, setName] = useState(state.name),
    [editing, setEditing] = useState(false);
  const initials = state.name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  async function save(e) {
    e.preventDefault();
    if (await change((s) => ({ ...s, name: name.trim() }))) {
      setEditing(false);
      notify("Đã cập nhật hồ sơ.");
    }
  }
  return (
    <>
      <Title title="Cá nhân">Hồ sơ và thiết lập học tập.</Title>
      <section className="profile-summary">
        <div className="profile-identity">
          <span className="profile-avatar">{initials}</span>
          <div className="grow">
            <h2>{state.name}</h2>
            <p>{user.email}</p>
          </div>
          <button className="text-link" onClick={() => setEditing(!editing)}>
            {editing ? "Đóng" : "Chỉnh sửa"}
          </button>
        </div>
        {editing && (
          <form className="profile-edit" onSubmit={save}>
            <label className="field">
              Tên hiển thị
              <input
                value={name}
                required
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="primary">Lưu hồ sơ</button>
          </form>
        )}
        <div className="profile-highlights">
          <div>
            <strong>{state.sessions.length}</strong>
            <span>Bài đã hoàn thành</span>
          </div>
          <div>
            <strong>
              {state.read.length}/{catalog.topics.length}
            </strong>
            <span>Học liệu đã đọc</span>
          </div>
        </div>
        <p className="profile-local">
          Dữ liệu được lưu theo tài khoản trên máy chủ.
        </p>
      </section>
      <Heading title="Học tập" />
      <div className="settings-group">
        {[
          [
            "progress",
            BarChart3,
            "Tiến độ học tập",
            "Kết quả, biểu đồ và lịch sử",
          ],
          ["path", BookOpen, "Lộ trình cá nhân", "Chủ đề ưu tiên và học liệu"],
          [
            "schedule",
            CalendarDays,
            "Lịch và mục tiêu học",
            `${state.weekGoal} ngày mỗi tuần`,
          ],
          [
            "notifications",
            Bell,
            "Nhắc ôn tập",
            `${state.notifications.filter((n) => !n.read_at).length} thông báo chưa đọc`,
          ],
        ].map(([page, Icon, title, detail]) => (
          <button key={page} className="settings-row" onClick={() => go(page)}>
            <Icon size={20} />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <Heading title="Dữ liệu & ứng dụng" />
      <details className="settings-details">
        <summary>
          <ShieldCheck size={20} />
          <span>Quyền riêng tư & dữ liệu</span>
        </summary>
        <div className="settings-body">
          <p>
            Bài làm và hội thoại được lưu theo tài khoản. Bạn có thể xuất dữ
            liệu học tập của mình.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.logging}
              onChange={async (e) => {
                const value = e.target.checked;
                if (await change((s) => ({ ...s, logging: value })))
                  notify(
                    value
                      ? "Đã bật nhật ký thao tác."
                      : "Đã tắt nhật ký thao tác mới.",
                  );
              }}
            />
            Ghi thêm nhật ký thao tác học tập
          </label>
          <p className="fine">
            Tắt tùy chọn vẫn giữ bài làm, dữ liệu cần để vận hành và kết quả
            học. Nhật ký thao tác không chứa nội dung hội thoại.
          </p>
          <div className="actions">
            <a className="secondary" href="/api/v1/export">
              Tải dữ liệu JSON
            </a>
            <a className="secondary" href="/api/v1/export?format=csv">
              Tải bài làm CSV
            </a>
          </div>
        </div>
      </details>
      <details className="settings-details">
        <summary>
          <BookOpen size={20} />
          <span>Học liệu & nguồn</span>
        </summary>
        <div className="settings-body">
          <p>
            {catalog.questions.length} câu hỏi · {catalog.topics.length} học
            liệu · phiên bản {catalog.version}.
          </p>
          {catalog.demo && (
            <p>
              Đây là nội dung demo. Chưa thay thế slide hoặc bài tập đã được
              giảng viên duyệt.
            </p>
          )}
        </div>
      </details>
      <details className="settings-details">
        <summary>
          <Info size={20} />
          <span>Về NEXUS</span>
        </summary>
        <div className="settings-body">
          <p>
            Ôn tập theo kết quả gần đây, đề tuần cố định và Gia sư dựa trên học
            liệu. Phần quản trị thực nghiệm sẽ triển khai sau.
          </p>
        </div>
      </details>
      <button className="secondary" onClick={logout}>
        Đăng xuất
      </button>
    </>
  );
}
