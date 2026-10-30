import { useState } from "react";
import { radarStats } from "../lib/learning";
const polar = (index, count, radius) => {
  const a = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [170 + Math.cos(a) * radius, 148 + Math.sin(a) * radius];
};
export function ProgressRadar({ sessions }) {
  const [dimension, setDimension] = useState("skill");
  const [selected, setSelected] = useState(null);
  const axes = radarStats(sessions, dimension);
  const count = axes.length;
  const complete = axes.every((a) => a.value !== null);
  const active = axes.find((a) => a.id === selected);
  const points = axes.map((a, i) =>
    polar(i, count, (92 * (a.value ?? 0)) / 100),
  );
  return (
    <section className="radar-panel" aria-labelledby="radar-title">
      <div className="radar-heading">
        <h2 id="radar-title">Tỷ lệ trả lời đúng</h2>
        <p>Nhìn kết quả theo từng nhóm kiến thức.</p>
      </div>
      <div className="radar-switch" role="group" aria-label="Góc nhìn biểu đồ">
        {[
          ["skill", "Kỹ năng"],
          ["topic", "Chủ đề"],
          ["level", "Độ khó"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={dimension === id}
            onClick={() => {
              setDimension(id);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <svg
        className="radar-svg"
        viewBox="0 0 340 310"
        role="img"
        aria-labelledby="radar-svg-title radar-svg-desc"
      >
        <title id="radar-svg-title">
          Biểu đồ radar tỷ lệ đúng{" "}
          {dimension === "skill"
            ? "theo nhóm kỹ năng"
            : dimension === "topic"
              ? "theo chủ đề"
              : "theo độ khó"}
        </title>
        <desc id="radar-svg-desc">
          {axes
            .map(
              (a) =>
                `${a.name}: ${a.value === null ? "chưa có dữ liệu" : a.value + "%, " + a.correct + "/" + a.total + " lượt đúng"}`,
            )
            .join(". ")}
          . Chỉ nối vùng kết quả khi tất cả trục đã có bài làm.
        </desc>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon
            key={r}
            points={axes
              .map((_, i) => polar(i, count, 92 * r).join(","))
              .join(" ")}
            fill="none"
            stroke="#d6dfec"
            strokeWidth="1"
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = polar(i, count, 92);
          const [lx, ly] = polar(i, count, 123);
          return (
            <g key={a.id}>
              <line
                x1="170"
                y1="148"
                x2={x}
                y2={y}
                stroke="#d6dfec"
                strokeDasharray={a.value === null ? "3 3" : undefined}
              />
              <text
                x={lx}
                y={ly - (a.labels.length - 1) * 7}
                textAnchor="middle"
                className={
                  a.value === null ? "radar-label muted-axis" : "radar-label"
                }
              >
                {a.labels.map((label, j) => (
                  <tspan x={lx} dy={j ? 14 : 0} key={label}>
                    {label}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        {[0, 50, 100].map((v) => (
          <text key={v} x="176" y={148 - v * 0.92 - 4} className="radar-tick">
            {v}%
          </text>
        ))}
        {complete && (
          <polygon
            points={points.map((p) => p.join(",")).join(" ")}
            fill="#537bb322"
            stroke="#5279b0"
            strokeWidth="2"
          />
        )}
        {axes.map(
          (a, i) =>
            a.value !== null && (
              <circle
                key={a.id}
                cx={points[i][0]}
                cy={points[i][1]}
                r={a.id === selected ? 5 : 3.5}
                fill="#3e69a5"
                stroke="white"
                strokeWidth="1.5"
              />
            ),
        )}
      </svg>
      <div className="radar-key">
        <span />
        <small>Tỷ lệ đúng trên các bài trong phạm vi đã chọn</small>
      </div>
      <div className="radar-values">
        {axes.map((a, i) => (
          <button
            key={a.id}
            aria-pressed={selected === a.id}
            onClick={() => setSelected(a.id)}
          >
            <span>
              {dimension === "skill" ? `${i + 1}. ` : ""}
              {a.name}
            </span>
            <strong>
              {a.value === null ? "Chưa có dữ liệu" : a.value + "%"}
            </strong>
          </button>
        ))}
      </div>
      {active && (
        <p className="radar-detail" role="status">
          <strong>{active.name}:</strong>{" "}
          {active.total
            ? `${active.correct}/${active.total} lượt trả lời đúng. Tính cả những lần luyện lại.`
            : "Hoàn thành bài luyện ở nhóm này để xem kết quả."}
        </p>
      )}
      <p className="fine radar-note">
        {dimension === "skill"
          ? `${axes.length} nhóm kỹ năng được phân theo nội dung câu hỏi.`
          : dimension === "level"
            ? "Ngân hàng hiện có 3 mức độ khó."
            : `${axes.length} chủ đề trong ngân hàng.`}{" "}
        Trục chưa có dữ liệu không được tính là 0%. Vùng kết quả xuất hiện khi
        tất cả trục đều có bài làm.
      </p>
    </section>
  );
}
