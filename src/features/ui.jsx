import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { useWorkspace } from "../lib/context";
export function Title({ title, children, back }) {
  const { go } = useWorkspace();
  return (
    <div className="page-title">
      {back && (
        <button className="back" onClick={() => go(back)}>
          <ArrowLeft size={17} /> Quay lại
        </button>
      )}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Empty({ title, children, action, label = "Bắt đầu luyện" }) {
  return (
    <div className="empty">
      <BookOpen size={26} />
      <h2>{title}</h2>
      <p>{children}</p>
      {action && (
        <button className="primary" onClick={action}>
          {label}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Meter({ value, label }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
export function Heading({ title, action, label = "Xem tất cả" }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action && (
        <button onClick={action}>
          {label}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
