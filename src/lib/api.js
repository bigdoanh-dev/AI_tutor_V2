let csrf = "";
export function setCsrf(value) {
  csrf = value;
}
export async function api(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    signal,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    const error = new Error(
      data.message || `Không thể kết nối máy chủ (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}
export async function chatStream(id, text, onDelta) {
  const response = await fetch(`/api/v1/conversations/${id}/messages`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify({ text, requestId: crypto.randomUUID() }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Gia sư chưa phản hồi");
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    done;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const item = JSON.parse(part.slice(6));
      if (item.type === "error") throw new Error(item.message);
      if (item.type === "delta") onDelta(item.text);
      if (item.type === "done") done = item;
    }
    if (chunk.done) break;
  }
  if (!done)
    throw new Error(
      "Kết nối bị gián đoạn. Hãy kiểm tra lịch sử trước khi gửi lại.",
    );
  return done;
}
