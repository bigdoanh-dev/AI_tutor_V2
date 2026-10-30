# Backend NEXUS

NestJS/TypeScript, PostgreSQL 17 + pgvector, Drizzle ORM, BullMQ/Redis, SMTP và AI Gateway. Frontend dùng React/Vite + TanStack Query, gọi `/api/v1` qua Vite proxy hoặc Caddy.

## Chạy local

Làm theo [README gốc](../README.md). Chạy lệnh `npm.cmd --prefix server ...` từ thư mục chứa `compose.yaml`; hoặc `cd server` rồi chạy `npm.cmd ...`. File `.env` được đọc theo thư mục chạy tiến trình, nên các script root có sẵn dùng `npm --prefix server run ...` sẽ chạy đúng trong `server`.

Các cổng local: PostgreSQL `5437`, Redis `6387`, SMTP `1027`, Mailpit `8027`, API `3001`, frontend `5173`. Nếu đổi frontend URL, đổi `APP_URL` và cấu hình kiểm thử tương ứng. Không mở API bằng `localhost` trong khi `APP_URL` là `127.0.0.1`: kiểm tra Origin và cookie yêu cầu dùng cùng địa chỉ.

## Nhập ngân hàng đã duyệt

Không có giao diện/API admin nhập dữ liệu. Người phụ trách chạy CLI:

```powershell
npm.cmd --prefix server run import -- --file C:/nexus-content/bank.json --sources C:/nexus-content --dry-run
npm.cmd --prefix server run import -- --file C:/nexus-content/bank.json --sources C:/nexus-content
```

`--dry-run` kiểm tra cấu trúc, ID, phương án, nguồn và file trước khi ghi. Nhập lại cùng version/nội dung không nhân đôi dữ liệu. Sửa nội dung phải tăng version. Release và file nguồn cũ được giữ để bài đã làm/các trích dẫn vẫn dùng đúng nội dung.

Cấu trúc tối thiểu của `bank.json`:

```json
{
  "course": { "id": "cntt", "name": "Công nghệ thông tin" },
  "version": "2026-01",
  "demo": false,
  "approved": true,
  "topics": [
    {
      "id": "ds",
      "name": "Cấu trúc dữ liệu",
      "lesson": "Stack",
      "minutes": 8,
      "sections": [
        ["Ngăn xếp", "Nội dung Markdown/văn bản đã duyệt từ slide."]
      ],
      "source": {
        "id": "slides-01",
        "title": "Bài giảng 1",
        "page": 3,
        "file": "slides.pdf"
      }
    }
  ],
  "questions": [
    {
      "id": 1,
      "topic": "ds",
      "level": 1,
      "skills": ["linear"],
      "stem": "Stack sử dụng nguyên tắc nào?",
      "options": ["LIFO", "FIFO"],
      "answer": 0,
      "explanation": "Phần tử vào sau được lấy ra trước.",
      "wrong": [null, "FIFO là nguyên tắc của hàng đợi."],
      "source": {
        "id": "slides-01",
        "title": "Bài giảng 1",
        "page": 3,
        "file": "slides.pdf"
      }
    }
  ]
}
```

`answer` là chỉ số từ 0. Mỗi phương án sai phải có phân tích. `file` là đường dẫn tương đối trong `--sources`; không cho phép đường dẫn thoát thư mục hoặc symlink trỏ ra ngoài. Đầu vào đã được chuẩn hóa; hệ thống chưa đọc/OCR PDF/PPTX để tạo nội dung. File gốc phục vụ đối chiếu nguồn, không được đưa nguyên bộ đáp án vào kho RAG. `approved: true` là xác nhận của người nhập, không thay thế việc giảng viên duyệt.

`npm run seed` nhập bộ **demo** 24 câu/4 chủ đề; bị chặn khi `NODE_ENV=production`. Giữ ID câu hỏi ổn định giữa các version; câu hỏi có ý nghĩa khác phải dùng ID mới để thống kê không trộn kiến thức.

Nếu học liệu có nhiều nguồn/trang, mỗi section có thể thêm phần tử thứ ba: `["Tiêu đề", "Nội dung", {"id":"slides-01","title":"Bài giảng 1","page":4,"file":"slides.pdf"}]`. Gia sư dùng nguồn của section, mặc định dùng nguồn chung của học liệu.

## API và dữ liệu

OpenAPI tại `/api/docs` và JSON `/api/docs-json` trong development; ẩn ở production. API dùng cookie `nexus_session`; gọi `GET /api/v1/auth/session` lấy CSRF, truyền `x-csrf-token` cho thao tác ghi. Mọi request ghi phải có `Origin` bằng origin của `APP_URL`. Client ngoài browser cũng cần hai header này.

Nhóm endpoint: `/auth/*`, `/me`, `/courses`, `/topics`, `/materials`, `/attempts`, `/review-items`, `/dashboard`, `/progress`, `/recommendations`, `/study-plan`, `/notifications`, `/conversations`, `/events`, `/export`. `/workspace` cấp trạng thái ban đầu tương thích giao diện, chỉ chứa metadata câu hỏi và những câu server đã cấp; đáp án nằm trong kết quả bài đã nộp.

Tạo bài: `{courseId, mode, topic, count, pool, requestId}`. Mặc định `courseId=cntt`, `mode=adaptive`, `count=5`. Mọi thao tác `/attempts/:id/{answer,next,navigate,pause,resume,abandon,submit}` cần `{revision, requestId}`; `answer` thêm `{questionId,selected?,flagged?}`, `navigate` thêm `{index}`. `409` nghĩa là xung đột hoặc bài đã kết thúc: tải lại trước khi ghi tiếp. Mỗi môn chỉ có một bài active. `heartbeat` nhận `{questionId,visible}`; đây là số đo hoạt động ước lượng, không phải bằng chứng tập trung.

Lệnh được lưu trong transaction với khóa bài; request lặp không nhân đôi thao tác. Bài đã nộp không được sửa. Trả kết quả theo snapshot của release lúc tạo bài. Đề tuần khóa theo môn/tuần Việt Nam/chủ đề/số câu, tự luyện chưa phải phân nhóm thực nghiệm.

`PUT /study-plan` nhận `{days,reminder,weekGoal,enabled,email}`. Giờ Việt Nam, buổi 15 phút. Email chỉ gửi khi cả `enabled` và `email` được bật. Job kiểm tra version lịch trước gửi, bỏ nhắc trễ quá 2 giờ. SMTP không cung cấp bảo đảm exactly-once: nếu tiến trình chết sau khi SMTP đã nhận nhưng trước khi database ghi `sent`, retry có thể gửi lại; mỗi email giữ `Message-ID` ổn định để giảm trùng.

Nhật ký tương tác do sinh viên bật/tắt tách với dữ liệu vận hành. Xuất JSON/CSV chỉ lấy dữ liệu của tài khoản hiện tại. Dữ liệu demo cũ trong localStorage được giữ, không được coi là kết quả thực nghiệm.

## Gia sư AI

Cấu hình `AI_GATEWAY_API_KEY`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`, `AI_INDEX_VERSION`. Mặc định chat `google/gemini-3.8-flash`, embedding `cohere/embed-v4.0`, 1536 chiều. Kiểm tra model có trong danh mục AI Gateway trước triển khai. Thay embedding model/index version sẽ tạo chỉ mục riêng; không trộn vector khác model.

Worker phát hiện release chưa có chỉ mục và tạo job embeddings. Chỉ nội dung học liệu được lập chỉ mục; không lập chỉ mục bảng câu hỏi/đáp án. Khi chưa có khóa/chỉ mục, chat trả `503` có thông báo cụ thể.

Chat truy xuất tối đa 6 đoạn cùng môn và release mới nhất, lọc theo `AI_RETRIEVAL_MIN_SCORE`. Chỉ nguồn server cung cấp được đưa thành link; thiếu nguồn hợp lệ sẽ trả thông báo thiếu căn cứ. Cần hiệu chỉnh ngưỡng bằng tài liệu thật. Tin nhắn `POST /conversations/:id/messages` nhận `{text,requestId}`, trả SSE `delta`, `done` hoặc `error`. Chỉ `done` xác nhận câu trả lời đã lưu. Timeout 90 giây, tối đa 1.500 token đầu ra, 30 yêu cầu/ngày/người và một yêu cầu đang xử lý. Yêu cầu lỗi cũng tính vào hạn mức để hạn chế gọi lặp gây tốn phí.

Luồng hỏi từ kết quả gửi `{attemptId,questionId}` khi tạo hội thoại; server lấy kết quả của chính sinh viên, không nhận đáp án đúng từ client. Nguồn/hội thoại được coi là dữ liệu không đáng tin để ra lệnh. Các biện pháp này cần được kiểm thử thêm bằng bộ đánh giá RAG trên ngân hàng thật trước pilot.

Có bộ đánh giá mẫu `data/rag-eval.json` cho nguồn đúng, câu ngoài tài liệu và prompt injection. Sau khi cấu hình AI và tài khoản đã xác minh, đặt `RAG_EVAL_EMAIL`, `RAG_EVAL_PASSWORD` trong môi trường server rồi chạy `npm.cmd --prefix server run eval:rag`. Lệnh này gọi AI thật và phát sinh phí. Có thể truyền đường dẫn dataset khác sau `--`; cần chỉnh dataset theo học liệu pilot và duyệt chất lượng câu trả lời bằng người. Bộ mẫu chưa được chạy với nhà cung cấp thật khi chưa có khóa.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd --prefix server test
npm.cmd run lint
npm.cmd run build
npm.cmd --prefix server run build

# Chỉ lần đầu: database riêng cho integration, tuyệt đối không dùng DB ứng dụng
docker compose exec -T postgres createdb -U nexus nexus_test
npm.cmd --prefix server run test:integration

npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Integration từ chối database không kết thúc bằng `_test`. `TEST_DATABASE_URL` cho phép dùng DB test riêng. Test thực sự ghi dữ liệu test và gửi thư vào Mailpit; không gửi tới SMTP production. Bài test browser dùng Mailpit local và yêu cầu worker đang chạy. Unit test legacy giữ những ca kiểm thử của phiên bản frontend trước khi chuyển server; unit test backend kiểm tra thuật toán hiện dùng.

Integration bao gồm quyền truy cập, CSRF, xác minh một lần, bài active, xung đột revision, nộp đồng thời, đề tuần qua version ngân hàng, trạng thái học liệu, lịch/worker và SMTP. Kiểm thử tải 50 request tiến độ đồng thời là smoke test trên môi trường chạy test, không thay thế đo tải máy pilot. Screenshot/trace Playwright nằm trong thư mục tạm của hệ điều hành.

## Triển khai pilot và backup

Trên VPS mới, sao chép `.env.example` ở root thành `.env`, đặt `DOMAIN`, `APP_URL=https://...`, mật khẩu PostgreSQL đủ mạnh, SMTP thật, `MAIL_FROM` và khóa AI. Xác minh domain gửi email với nhà cung cấp SMTP. Không dùng Mailpit để gửi ra internet. Mật khẩu PostgreSQL lúc khởi tạo volume phải khớp `DATABASE_URL`; sửa `.env` không tự đổi mật khẩu của volume đã có.

```sh
docker compose --profile app up -d --build
# Đường dẫn /srv/bank bên VPS chứa ngân hàng thật và file nguồn đã duyệt
docker compose --profile app run --rm -v /srv/bank:/import:ro api node dist/import.js --file /import/bank.json --sources /import
docker compose logs --tail 100 api worker
```

Kiểm tra `/api/v1/health`, đăng ký/xác minh qua email thật, tiếp tục bài giữa hai thiết bị và nguồn chat trước khi mời sinh viên. Caddy cần domain trỏ đúng VPS và cổng 80/443 mở. Các cổng database/Redis/Mailpit chỉ bind loopback. Hiện chưa tự cấu hình nhà cung cấp cloud/domain hay tài khoản SMTP/AI.

Backup dùng Python để giữ nguyên binary của `pg_dump` trên Windows:

```powershell
# Local: thử dump, phục hồi DB riêng và so sánh file
python ops/backup.py --dest backups --local-files server/data/files --restore-check
```

Trên VPS, dùng `--dest /mnt/nexus-offsite/backups --retain 14` và bỏ `--local-files` để sao lưu volume API. Thư mục đích phải là bộ nhớ gắn ngoài máy chủ. Script chỉ xóa các bản hoàn chỉnh có tên timestamp bên dưới đúng thư mục đích. `--restore-check` **tạo lại database dùng riêng cho kiểm thử `nexus_restore_test`** rồi phục hồi vào đó; không đặt dữ liệu cần giữ trong DB kiểm thử này. Database ứng dụng không bị ghi đè. Hai file systemd trong `ops/` là mẫu cài timer hằng ngày; chỉnh đường dẫn VPS và mount đích, rồi mới bật timer. Timer chưa được cài vào máy của bạn.

Theo dõi health, log lỗi API/worker, số `mail_outbox.status=failed`, lỗi index, dung lượng ổ đĩa và mức dùng AI Gateway. Test phục hồi trước mỗi đợt pilot; khóa AI/SMTP và file backup không đưa vào Git.
