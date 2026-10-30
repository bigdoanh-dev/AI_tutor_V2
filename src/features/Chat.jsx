import { useState, useRef, useEffect } from "react";
import { History, SquarePen, Send, MessageCircle } from "lucide-react";
import { useWorkspace } from "../lib/context";
import { uid } from "../lib/storage";
import { questionById, topicById } from "../data/catalog";
const nowIso = () => new Date().toISOString();
export function Chat() {
  const { state, change, chatContext, setChatContext, go, track } =
    useWorkspace();
  const [text, setText] = useState("");
  const [historyOpen, setHistory] = useState(false);
  const [search, setSearch] = useState("");
  const feed = useRef(null);
  const active = state.chats.find((c) => c.id === state.activeChatId);
  const messages = active?.messages || [];
  useEffect(() => {
    feed.current?.scrollTo({
      top: feed.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);
  const send = (prompt = text) => {
    if (!prompt.trim()) return;
    const p = prompt.trim();
    const q = chatContext && questionById[chatContext.questionId];
    const normalized = p.toLocaleLowerCase("vi");
    let source = null,
      reply =
        "Bản minh họa chưa xử lý được câu hỏi này. Mình có thể giải thích nội dung trong 4 học liệu, hoặc phân tích một câu từ trang kết quả. Thử hỏi về Stack/Queue, SQL, tìm kiếm nhị phân hoặc vòng lặp.";
    if (q) {
      source = q.topic;
      reply = `Bạn đang hỏi về: ${q.stem}\n\nBạn chọn: ${q.options[chatContext.selected] ?? "Chưa chọn"}. Đáp án đúng: ${q.options[q.answer]}.\n\n${q.wrong?.[chatContext.selected] || ""} ${q.explanation}`;
    } else {
      const matches = [
        [/stack|queue|ngăn xếp|hàng đợi|lifo|fifo|cây|liên kết/, "ds"],
        [/sql|select|where|khóa|dữ liệu|join|having/, "db"],
        [/nhị phân|big.?o|phức tạp|merge|bfs|giải thuật|thuật toán/, "algo"],
        [/for|while|vòng lặp|biến|đệ quy|const|hàm/, "prog"],
      ];
      source = matches.find(([rx]) => rx.test(normalized))?.[1] || null;
      if (source) {
        const t = topicById[source];
        reply = t.sections
          .map(([heading, body]) => `${heading}\n${body}`)
          .join("\n\n");
      }
    }
    const current = state.activeChatId || uid();
    const next = {
      id: current,
      title: active?.title || p.slice(0, 55),
      at: nowIso(),
      messages: [
        ...messages,
        { role: "user", text: p },
        { role: "assistant", text: reply, source },
      ],
    };
    change((s) => ({
      ...s,
      activeChatId: current,
      chats: [next, ...s.chats.filter((c) => c.id !== current)].slice(0, 30),
    }));
    track("tutor_question", { contextQuestionId: q?.id || null });
    setText("");
  };
  return (
    <div className="chat-screen">
      <div className="chat-toolbar">
        <button
          className="icon-button"
          aria-label="Lịch sử trò chuyện"
          aria-expanded={historyOpen}
          onClick={() => setHistory(!historyOpen)}
        >
          <History size={19} />
        </button>
        <div>
          <strong>Gia sư NEXUS</strong>
          <small>Tra cứu học liệu mẫu</small>
        </div>
        <button
          className="icon-button"
          aria-label="Cuộc trò chuyện mới"
          onClick={() => {
            change((s) => ({ ...s, activeChatId: null }));
            setChatContext(null);
            setHistory(false);
          }}
        >
          <SquarePen size={19} />
        </button>
      </div>
      {historyOpen ? (
        <aside className="chat-history">
          <h2>Lịch sử trò chuyện</h2>
          <label className="search">
            <span className="sr-only">Tìm cuộc trò chuyện</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm trong lịch sử"
            />
          </label>
          {state.chats
            .filter((c) =>
              c.title
                .toLocaleLowerCase("vi")
                .includes(search.toLocaleLowerCase("vi")),
            )
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  change((s) => ({ ...s, activeChatId: c.id }));
                  setChatContext(null);
                  setHistory(false);
                }}
              >
                {c.title}
              </button>
            ))}
          {!state.chats.length && <p>Chưa có hội thoại nào.</p>}
          <button className="secondary" onClick={() => setHistory(false)}>
            Đóng lịch sử
          </button>
        </aside>
      ) : (
        <>
          {chatContext && (
            <div className="notice">
              <strong>Đang hỏi về câu đã làm</strong>
              <p>{questionById[chatContext.questionId]?.stem}</p>
              <button
                className="text-link"
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
            {!messages.length && (
              <div className="chat-intro">
                <MessageCircle size={30} />
                <h1>
                  Bạn muốn hiểu rõ
                  <br />
                  điều gì hôm nay?
                </h1>
                <p>Chọn một gợi ý hoặc nhập câu hỏi.</p>
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
            {messages.map((m, i) => (
              <div className={"chat-message " + m.role} key={i}>
                <small>
                  {m.role === "user" ? "Bạn" : "Gia sư · bản minh họa"}
                </small>
                <p>{m.text}</p>
                {m.source && (
                  <button
                    className="source-link"
                    onClick={() => go("lesson", m.source)}
                  >
                    Nguồn: {topicById[m.source].lesson}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="chat-disclaimer">
            Tra cứu nội dung mẫu trên thiết bị, chưa kết nối AI trực tuyến.
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
              placeholder="Hỏi về kiến thức CNTT…"
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="primary"
              aria-label="Gửi câu hỏi"
              disabled={!text.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
