import { useEffect, useState } from "react";
import { api, setCsrf } from "../lib/api";
export function Auth({ onLogin }) {
  const parts = location.hash.slice(1).split("/");
  const initial =
    parts[0] === "auth" && ["verify", "reset"].includes(parts[1])
      ? parts[1]
      : "login";
  const [mode, setMode] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  useEffect(() => {
    const update = () => {
      const path = location.hash.slice(1).split("/");
      if (path[0] === "auth" && ["verify", "reset"].includes(path[1])) {
        setMode(path[1]);
        setMessage("");
      }
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const names = {
    login: "Đăng nhập",
    register: "Tạo tài khoản",
    verify: "Xác minh email",
    reset: "Đặt lại mật khẩu",
    forgot: "Quên mật khẩu",
    resend: "Gửi lại email xác minh",
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const endpoints = {
        login: "login",
        register: "register",
        verify: "verify",
        reset: "reset-password",
        forgot: "forgot-password",
        resend: "resend",
      };
      const body =
        mode === "verify"
          ? { token: parts[2] || "" }
          : mode === "reset"
            ? { token: parts[2] || "", password }
            : mode === "register"
              ? { email, password, name }
              : mode === "login"
                ? { email, password }
                : { email };
      const result = await api(`/auth/${endpoints[mode]}`, {
        method: "POST",
        body,
      });
      if (mode === "login") {
        setCsrf(result.csrf);
        location.hash = "home";
        onLogin();
      } else {
        setMessage(result.message);
        if (mode === "reset" || mode === "verify") {
          setMode("login");
          location.hash = "home";
        }
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="app auth-screen">
      <div className="panel">
        <h1>NEXUS</h1>
        <p>Ôn tập thích ứng, học theo tiến độ của bạn.</p>
        <h2>{names[mode]}</h2>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              Tên hiển thị
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          {!["verify", "reset"].includes(mode) && (
            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <label className="field">
              Mật khẩu
              <input
                aria-label="Mật khẩu"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              <small>Tối thiểu 10 ký tự.</small>
            </label>
          )}
          {mode === "verify" && (
            <p>Bấm để xác minh email theo liên kết bạn vừa mở.</p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Đang xử lý…" : names[mode]}
          </button>
        </form>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <div className="auth-links">
          {["login", "register", "forgot", "resend"]
            .filter((m) => m !== mode)
            .map((m) => (
              <button
                className="text-link"
                key={m}
                onClick={() => {
                  setMode(m);
                  setMessage("");
                }}
              >
                {names[m]}
              </button>
            ))}
        </div>
      </div>
    </main>
  );
}
