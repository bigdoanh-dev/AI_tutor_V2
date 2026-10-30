# NEXUS — ôn tập CNTT cho học viên

Giao diện React/Vite tối ưu điện thoại; có cấu hình Capacitor để tiếp tục đóng gói Android/iOS. Bản hiện tại chạy trên trình duyệt, chưa có bản cài đặt native.

## Chạy dự án

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Kiểm tra: `npm test`, `npm run lint`, `npm run build`.

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
- Thời gian tính từ lúc bài đang mở, bỏ khoảng tạm dừng/ẩn trang. Các bài cũ di chuyển từ bản trước không có dữ liệu thời gian và được ghi 0.
- Tất cả dữ liệu ở localStorage của trình duyệt/thiết bị. Lưu dữ liệu theo phiên bản, chuyển kết quả từ khóa cũ, cảnh báo nếu bộ nhớ không lưu được. Chưa có tài khoản, máy chủ, đồng bộ hoặc thu thập tập trung.
- Nhật ký thao tác chỉ bắt đầu sau khi bật; tắt không xóa bài làm hoặc nhật ký cũ. Không ghi nội dung trò chuyện vào nhật ký; hội thoại lưu riêng trên thiết bị. File xuất không tự gửi đi.
- Gia sư tra nội dung mẫu bằng quy tắc, chưa gọi mô hình AI. Chưa sinh câu hỏi từ tài liệu, chưa có tìm kiếm tăng cường theo slide.
- Tệp `.ics` cần được người học nhập vào ứng dụng Lịch. NEXUS chưa gửi thông báo nền. Phần admin, phân nhóm và quản lý A/B/C được dành cho giai đoạn sau.

## Đóng gói mobile

Cài `@capacitor/android` và/hoặc `@capacitor/ios`, thêm nền tảng bằng `npx cap add android` / `npx cap add ios`, chạy `npm run build` rồi `npx cap sync`. Cần Android Studio hoặc Xcode tương ứng. Cấu hình app: `capacitor.config.json`.
