import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, SquarePen, Send, MessageCircle } from "lucide-react";
import { useWorkspace } from "../lib/context";
import { api, chatStream } from "../lib/api";
export function Chat() {
  const {
    state,
    user,
    chatContext,
    setChatContext,
    setActiveChat,
    refresh,
    notify,
  } = useWorkspace();
  const [text, setText] = useState(""),
    [historyOpen, setHistory] = useState(false),
    [search, setSearch] = useState("");
  const [sending, setSending] = useState(false),
    [turn, setTurn] = useState(null);
  const feed = useRef(null),
    cache = useQueryClient(),
    locked = useRef(false);
  const activeId = state.activeChatId;
  const query = useQuery({
    queryKey: ["messages", user.id, activeId],
    queryFn: () => api(`/conversations/${activeId}/messages`),
    enabled: !!activeId,
  });
  const messages = query.data || [];
  useEffect(() => {
    feed.current?.scrollTo({
      top: feed.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, turn?.reply]);
  async function send(prompt = text) {
    if (!prompt.trim() || locked.current) return;
    locked.current = true;
    setSending(true);
    setTurn({ text: prompt, reply: "" });
    let id = activeId;
    try {
      if (!id) {
        const conversation = await api("/conversations", {
          method: "POST",
          body: { title: prompt.slice(0, 100), context: chatContext },
        });
        id = conversation.id;
        setActiveChat(id);
        await refresh();
      }
      await chatStream(id, prompt, (delta) =>
        setTurn((t) => ({ ...t, reply: (t?.reply || "") + delta })),
      );
      await cache.invalidateQueries({ queryKey: ["messages", user.id, id] });
      setText("");
      setTurn(null);
      setChatContext(null);
    } catch (error) {
      notify(error.message);
      setTurn(null);
    } finally {
      locked.current = false;
      setSending(false);
    }
  }
  const newChat = () => {
    setActiveChat(null);
    setChatContext(null);
    setTurn(null);
    setHistory(false);
  };
  return (
    <div className="chat-screen">
      <div className="chat-toolbar">
        <button
          className="icon-button"
          disabled={sending}
          aria-label="Lịch sử trò chuyện"
          onClick={() => setHistory(!historyOpen)}
        >
          <History size={19} />
        </button>
        <div>
          <strong>Gia sư NEXUS</strong>
          <small>Giải thích dựa trên học liệu có nguồn</small>
        </div>
        <button
          className="icon-button"
          disabled={sending}
          aria-label="Cuộc trò chuyện mới"
          onClick={newChat}
        >
          <SquarePen size={19} />
        </button>
      </div>
      {historyOpen ? (
        <aside className="chat-history">
          <h2>Lịch sử trò chuyện</h2>
          <label className="field">
            Tìm hội thoại
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {state.chats
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveChat(c.id);
                  setChatContext(null);
                  setHistory(false);
                }}
              >
                {c.title}
              </button>
            ))}
          {!state.chats.length && <p>Chưa có hội thoại.</p>}
          <button className="secondary" onClick={() => setHistory(false)}>
            Đóng lịch sử
          </button>
        </aside>
      ) : (
        <>
          {chatContext && (
            <div className="notice">
              Đang hỏi về câu đã nộp. Gia sư sẽ lấy kết quả từ máy chủ.
              <button
                className="text-link"
                disabled={sending}
                onClick={() => setChatContext(null)}
              >
                Hỏi chủ đề khác
              </button>
            </div>
          )}
          <div
            className="chat-feed"
            ref={feed}
            role="log"
            aria-label="Nội dung hội thoại"
          >
            {query.isLoading && <p>Đang tải hội thoại…</p>}
            {query.error && <p role="alert">{query.error.message}</p>}
            {!messages.length && !turn && (
              <div className="chat-intro">
                <MessageCircle size={30} />
                <h1>
                  Bạn muốn hiểu rõ
                  <br />
                  điều gì hôm nay?
                </h1>
                <p>Hỏi theo học liệu của môn học. Câu trả lời sẽ kèm nguồn.</p>
                {(chatContext
                  ? ["Vì sao lựa chọn của tôi sai?"]
                  : [
                      "Stack khác Queue thế nào?",
                      "Giải thích SELECT trong SQL",
                      "Tìm kiếm nhị phân hoạt động ra sao?",
                    ]
                ).map((t) => (
                  <button
                    className="suggestion"
                    key={t}
                    onClick={() => send(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => (
              <div className={"chat-message " + m.role} key={m.id}>
                <small>{m.role === "user" ? "Bạn" : "Gia sư NEXUS"}</small>
                <p>{m.text}</p>
                {m.sources?.map((s) => (
                  <a
                    key={`${s.number}-${s.id}`}
                    className="source-link"
                    href={`/api/v1/materials/${s.materialId}/source?releaseId=${s.releaseId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    [{s.number}] {s.title} · trang {s.page}
                  </a>
                ))}
              </div>
            ))}
            {turn && (
              <>
                <div className="chat-message user">
                  <small>Bạn</small>
                  <p>{turn.text}</p>
                </div>
                <div className="chat-message assistant">
                  <small>Gia sư · đang trả lời</small>
                  <p>{turn.reply || "Đang tìm tài liệu phù hợp…"}</p>
                </div>
              </>
            )}
          </div>
          <p className="chat-disclaimer">
            Đối chiếu nguồn khi ôn tập. Tối đa 30 lượt mỗi ngày.
          </p>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="sr-only" htmlFor="message">
              Tin nhắn
            </label>
            <input
              id="message"
              value={text}
              maxLength={2000}
              disabled={sending}
              placeholder="Hỏi về kiến thức CNTT…"
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="primary"
              aria-label="Gửi câu hỏi"
              disabled={sending || !text.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
