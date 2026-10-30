# NEXUS — ôn tập CNTT cho học viên

Giao diện React/Vite tối ưu điện thoại; có cấu hình Capacitor để tiếp tục đóng gói Android/iOS. Bản hiện tại chạy trên trình duyệt, chưa có bản cài đặt native.

## Chạy frontend và backend trên Windows

Yêu cầu Node.js 24+, Docker Desktop đang chạy và Python 3.12+ nếu kiểm tra backup. Mở terminal trong **thư mục có file `package.json` này**, không phải thư mục ngoài `AI_TuTor-V2`.

```powershell
cd D:\InternAIRC\AI_TuTor-V2\AI_tutor_V2
npm.cmd ci
npm.cmd --prefix server ci
Copy-Item server/.env.example server/.env
docker compose up -d postgres redis mailpit
npm.cmd --prefix server run migrate
npm.cmd --prefix server run seed
```

Mở ba terminal tại cùng thư mục dự án:

```powershell
# Terminal 1: API
npm.cmd --prefix server run dev

# Terminal 2: email, lịch nhắc và lập chỉ mục tài liệu
npm.cmd --prefix server run worker

# Terminal 3: giao diện
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

- Giao diện: http://127.0.0.1:5173
- Hộp thư thử Mailpit: http://127.0.0.1:8027
- Tài liệu API: http://127.0.0.1:3001/api/docs
- Health: http://127.0.0.1:3001/api/v1/health

Đăng ký tài khoản trên giao diện, mở Mailpit để lấy liên kết xác minh rồi đăng nhập. **Không có tài khoản/mật khẩu mặc định.** Worker kiểm tra email mỗi phút; Mailpit chỉ nhận email thử trong máy, không gửi ra internet.

Gia sư cần `AI_GATEWAY_API_KEY` trong `server/.env`. Sau khi thêm khóa, khởi động lại API và worker; worker sẽ lập chỉ mục học liệu. Khi chưa có khóa, Gia sư báo chưa cấu hình, quiz vẫn hoạt động. Không đặt khóa AI trong biến `VITE_*`.

Chi tiết API, nhập học liệu, kiểm thử và vận hành: [server/README.md](server/README.md).

## Kiểm tra

```sh
npm.cmd test
npm.cmd --prefix server test
npm.cmd run lint
npm.cmd run build
npm.cmd --prefix server run build
```

Kiểm thử tích hợp và trình duyệt cần PostgreSQL, Redis, Mailpit và worker; xem hướng dẫn backend.

## Các luồng học viên đã có

| Chức năng           | Thao tác                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lộ trình cá nhân    | Bấm từ Trang chủ/Cá nhân; xem thứ tự chủ đề cần củng cố, mở học liệu hoặc luyện ngay                                                              |
| Thiết lập quiz      | Chọn thích ứng hoặc đề tuần cố định, tổng hợp hoặc theo chủ đề, 5/10 câu tùy ngân hàng                                                            |
| Bài luyện thích ứng | Chọn từng câu theo độ chính xác gần đây, ưu tiên chủ đề yếu, điều chỉnh độ khó và tránh lặp câu trong cùng bài                                    |
| Bài đang làm        | Lưu/thoát, tiếp tục sau khi tải lại, quay lại sửa đáp án, đánh dấu chưa chắc chắn và xác nhận nộp                                                 |
| Kết quả             | Đáp án đã chọn, đáp án đúng, lý do phương án sai, giải thích và học liệu liên quan                                                                |
| Ôn điểm yếu         | Hàng đợi câu sai và câu đã đánh dấu; luyện lại; câu sai được bỏ khi trả lời đúng ở lần mới nhất                                                   |
| Học liệu            | Tìm, lưu/bỏ lưu, lọc đã lưu, đánh dấu đọc xong, luyện theo chủ đề                                                                                 |
| Tiến độ             | Năng lực/nhịp học; tất cả hoặc 3 bài gần nhất; độ chính xác chủ đề, độ bao phủ, phút làm bài, số ngày học, mục tiêu 7 ngày và lịch sử mở lại được |
| Gia sư              | Hỏi từ câu cụ thể có ngữ cảnh phương án đã chọn; tra học liệu mẫu; nguồn nội bộ, lịch sử và hội thoại mới                                         |
| Lịch ôn             | Lưu ngày, giờ GMT+7, mục tiêu; tải tệp lịch 7 ngày có nhắc trước 10 phút để thêm vào lịch điện thoại                                              |
| Nhật ký             | Học viên chủ động bật ghi thao tác; mã người học/phiên, câu mở/chọn, thời điểm, tài liệu xem, sự kiện nộp; xuất JSON/CSV                          |

Tham khảo các luồng học viên trong [Docprep](https://github.com/bigdoanh-dev/Docprep): Progress (năng lực/nhịp học), PracticeHub, Chat/QuizChat, Review và LearnerWorkspace. Nội dung chuyên môn đã được viết riêng cho CNTT; không sao chép học liệu y học.

## Cách tính và giới hạn

- 24 câu, 4 chủ đề, 3 mức độ; nội dung và tài liệu là mẫu biên soạn cho demo, chưa được giảng viên thẩm định hoặc nhập từ slide thật.
- Độ chính xác chủ đề: tối đa 12 lượt trả lời gần nhất trong phạm vi đã chọn. Độ bao phủ: số câu khác nhau đã gặp / số câu của chủ đề. Không dùng độ bao phủ để dự đoán năng lực hay điểm thi.
- Khi chọn câu mới, quy tắc thích ứng dùng tối đa 6 kết quả gần nhất trong chủ đề (bao gồm câu đã trả lời trong phiên hiện tại), chọn độ khó mục tiêu, rồi ưu tiên câu chưa gặp và điểm yếu. Khi hết câu phù hợp mức đó, chọn mức gần nhất trong ngân hàng còn lại.
- Đề cố định giữ thứ tự trong cùng tuần (thứ Hai, giờ Việt Nam), theo chủ đề và số câu đã chọn. Đây là chế độ tự ôn của học viên, chưa phải phân nhóm thực nghiệm hoặc randomization do admin quản lý.
- Thời gian hoạt động được ước lượng bằng heartbeat khi bài đang hiển thị và thời điểm thao tác, bỏ khoảng tạm dừng/ẩn trang. Không coi đây là bằng chứng tuyệt đối về mức độ tập trung.
- Tài khoản, bài làm, tiến độ, lịch và hội thoại lưu trong PostgreSQL. Browser chỉ giữ lựa chọn chưa đồng bộ và dữ liệu demo cũ; backend không tự nhập kết quả demo vào tài khoản.
- Server chọn câu, chấm điểm và giữ phiên bản ngân hàng. Chỉ trả đáp án/giải thích của câu hỏi sau khi nộp bài. Đề tuần được lưu cố định, không thay đổi khi nhập thêm câu giữa tuần.
- Nhật ký tương tác chỉ thu khi bật. Bài làm và sự kiện cần để vận hành vẫn được lưu; nội dung hội thoại không nằm trong nhật ký thao tác.
- Gia sư dùng AI truy xuất học liệu đã duyệt và dẫn nguồn, cần khóa AI cùng chỉ mục tài liệu. Chưa tự sinh câu hỏi hoặc OCR. Nội dung trả lời cần được đối chiếu với tài liệu.
- Backend nhắc ôn qua email/trong app sau khi sinh viên bật và lưu lịch. File `.ics` vẫn cần nhập vào ứng dụng Lịch. Admin và quản lý thực nghiệm A/B/C triển khai sau.

## Đóng gói mobile

Cài `@capacitor/android` và/hoặc `@capacitor/ios`, thêm nền tảng bằng `npx cap add android` / `npx cap add ios`, chạy `npm run build` rồi `npx cap sync`. Cần Android Studio hoặc Xcode tương ứng. Cấu hình app: `capacitor.config.json`.
