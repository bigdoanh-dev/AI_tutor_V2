import { useState } from "react";
import {
  CalendarDays,
  ArrowRight,
  Download,
  BarChart3,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  Info,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import { downloadCalendar, exportFile } from "../lib/storage";
import { dayKey } from "../lib/learning";
import { Title, Panel, Heading } from "./ui";
export function Schedule() {
  const { state, change, notify, go, track } = useWorkspace();
  const [days, setDays] = useState(state.days);
  const [time, setTime] = useState(state.reminder);
  const [goal, setGoal] = useState(state.weekGoal);
  const [today] = useState(() => dayKey());
  const codes = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const upcoming = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const key = dayKey(d);
    return { key, weekday: codes[new Date(key + "T00:00:00Z").getUTCDay()] };
  }).filter((d) => state.days.includes(d.weekday));
  const save = (e) => {
    e.preventDefault();
    change((s) => ({ ...s, days, reminder: time, weekGoal: goal }));
    track("schedule_saved", { days, reminder: time, goal });
    notify("Đã lưu lịch ôn tập.");
  };
  return (
    <>
      <Title title="Lịch ôn tập" back="home">
        Thời gian theo múi giờ Việt Nam (GMT+7).
      </Title>
      <form className="panel" onSubmit={save}>
        <h2>Thiết lập nhịp học</h2>
        <p className="muted">Gợi ý ban đầu: 15 phút, 3 ngày mỗi tuần.</p>
        <fieldset className="choice-group">
          <legend>Ngày ôn trong tuần</legend>
          <div className="days">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
              <button
                type="button"
                aria-pressed={days.includes(d)}
                className={days.includes(d) ? "chosen" : ""}
                key={d}
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
            required
            value={time}
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
        <button className="primary full">Lưu lịch học</button>
      </form>
      <Heading title="7 ngày sắp tới" />
      {upcoming.length ? (
        upcoming.map((d) => (
          <div className="schedule-row" key={d.key}>
            <CalendarDays size={18} />
            <span>
              <strong>
                {d.weekday} · {d.key.split("-").reverse().join("/")}
              </strong>
              <small>{state.reminder} · 15 phút ôn tập</small>
            </span>
            <button className="text-link" onClick={() => go("practice")}>
              Học ngay
            </button>
          </div>
        ))
      ) : (
        <p className="muted">
          Chọn ngày rồi lưu lịch để hiện các buổi ôn sắp tới.
        </p>
      )}
      <Panel title="Nhắc học qua lịch điện thoại">
        <p>
          Tải lịch 7 ngày, mở tệp bằng ứng dụng Lịch và thêm các buổi ôn. Mỗi
          buổi có nhắc trước 10 phút. Bạn cần chấp nhận thêm lịch và bật nhắc
          trong ứng dụng Lịch.
        </p>
        <button
          className="secondary"
          disabled={!upcoming.length}
          onClick={() => {
            downloadCalendar(state);
            notify("Đã tải tệp lịch. Mở tệp để thêm vào ứng dụng Lịch.");
          }}
        >
          <Download size={16} /> Tải lịch (.ics)
        </button>
        <p className="fine">NEXUS chưa gửi thông báo nền khi ứng dụng đóng.</p>
      </Panel>
    </>
  );
}
export function Profile() {
  const { state, change, go, notify } = useWorkspace();
  const [name, setName] = useState(state.name === "bạn" ? "" : state.name);
  const [editing, setEditing] = useState(false);
  const displayName = state.name === "bạn" ? "Học viên NEXUS" : state.name;
  const initials =
    state.name === "bạn"
      ? "N"
      : state.name
          .trim()
          .split(/\s+/)
          .slice(-2)
          .map((part) => part[0])
          .join("")
          .toUpperCase();
  return (
    <>
      <Title title="Cá nhân">Hồ sơ và thiết lập học tập của bạn.</Title>
      <section className="profile-summary" aria-label="Thông tin học viên">
        <div className="profile-identity">
          <span className="profile-avatar">{initials}</span>
          <div className="grow">
            <h2>{displayName}</h2>
            <p>Sinh viên · Công nghệ thông tin</p>
          </div>
          <button
            className="text-link"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Đóng" : "Chỉnh sửa"}
          </button>
        </div>
        {editing && (
          <form
            className="profile-edit"
            onSubmit={(e) => {
              e.preventDefault();
              change((s) => ({ ...s, name: name.trim() || "bạn" }));
              setEditing(false);
              notify("Đã cập nhật tên hiển thị.");
            }}
          >
            <label className="field">
              Tên hiển thị
              <input
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên bạn muốn dùng"
                maxLength={40}
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
            <strong>{state.read.length}/4</strong>
            <span>Học liệu đã đọc</span>
          </div>
        </div>
        <p className="profile-local">Hồ sơ lưu trên thiết bị này</p>
      </section>
      <Heading title="Học tập" />
      <div className="settings-group">
        <button className="settings-row" onClick={() => go("progress")}>
          <BarChart3 size={20} />
          <span>
            <strong>Tiến độ học tập</strong>
            <small>Kết quả, biểu đồ và lịch sử bài làm</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button className="settings-row" onClick={() => go("path")}>
          <BookOpen size={20} />
          <span>
            <strong>Lộ trình cá nhân</strong>
            <small>Chủ đề ưu tiên và bước học tiếp theo</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button className="settings-row" onClick={() => go("schedule")}>
          <CalendarDays size={20} />
          <span>
            <strong>Lịch và mục tiêu học</strong>
            <small>
              {state.weekGoal} ngày mỗi tuần
              {state.days.length ? " · " + state.reminder : ""}
            </small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
      <Heading title="Dữ liệu & ứng dụng" />
      <details className="settings-details">
        <summary>
          <ShieldCheck size={20} />
          <span>
            <strong>Quyền riêng tư & dữ liệu</strong>
            <small>Bạn quyết định cách sử dụng dữ liệu học tập</small>
          </span>
          <ChevronDown size={17} />
        </summary>
        <div className="settings-body">
          <p>
            Bài làm và hội thoại chỉ lưu trên thiết bị, chưa đồng bộ tài khoản.
            Bạn có thể tải một bản dữ liệu để tự xem hoặc chủ động cung cấp cho
            nhóm nghiên cứu.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.logging}
              onChange={(e) => {
                const enabled = e.target.checked;
                change((s) => ({ ...s, logging: enabled }));
                notify(
                  enabled
                    ? "Đã bật nhật ký học tập trên thiết bị."
                    : "Đã tắt ghi nhật ký mới.",
                );
              }}
            />{" "}
            Ghi thêm nhật ký thao tác học tập
          </label>
          <p className="fine">
            Ghi câu đã mở/chọn, thời điểm và học liệu đã xem bằng mã ngẫu nhiên.
            Tắt nhật ký vẫn giữ bài làm để tính tiến độ. Không tự gửi dữ liệu
            đi.
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => exportFile(state)}>
              Tải dữ liệu JSON
            </button>
            <button
              className="secondary"
              onClick={() => exportFile(state, "csv")}
            >
              Tải bài làm CSV
            </button>
          </div>
          <small className="fine">
            {state.sessions.length} bài luyện · {state.events.length} sự kiện đã
            lưu
          </small>
        </div>
      </details>
      <details className="settings-details">
        <summary>
          <BookOpen size={20} />
          <span>
            <strong>Học liệu & nguồn tham khảo</strong>
            <small>Thông tin nội dung và quyền sử dụng</small>
          </span>
          <ChevronDown size={17} />
        </summary>
        <div className="settings-body">
          <p>
            24 câu hỏi và 4 học liệu CNTT được biên soạn cho bản demo, chưa nhập
            slide hoặc bài tập của giảng viên. Học liệu thật cần ghi tác giả,
            nguồn và quyền sử dụng.
          </p>
          <p>
            Luồng học viên tham khảo Docprep. Nội dung CNTT và mã của phiên bản
            này được triển khai riêng.
          </p>
          <a
            className="text-link"
            href="https://github.com/bigdoanh-dev/Docprep"
            target="_blank"
            rel="noreferrer"
          >
            Xem repo tham khảo
          </a>
        </div>
      </details>
      <details className="settings-details">
        <summary>
          <Info size={20} />
          <span>
            <strong>Về NEXUS</strong>
            <small>Phiên bản học viên · thử nghiệm</small>
          </span>
          <ChevronDown size={17} />
        </summary>
        <div className="settings-body">
          <p>
            Ôn tập CNTT bằng bài luyện thích ứng và học liệu theo chủ đề. Gia sư
            hiện tra nội dung mẫu trên thiết bị, chưa kết nối AI trực tuyến.
          </p>
          <p className="fine">
            Xóa dữ liệu trình duyệt có thể làm mất tiến độ. Bạn có thể tải bản
            dữ liệu trong mục Quyền riêng tư & dữ liệu.
          </p>
        </div>
      </details>
    </>
  );
}
