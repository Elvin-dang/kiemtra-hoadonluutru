# Nhật ký thay đổi

## 1.2.0 — 2026-09-28
- Sửa ngày check-out ngay trong bảng (nút bút chì, hoặc "Nhập ngày" ở dòng không xác định); trạng thái, số ngày chậm và file kết quả cập nhật theo.
- Kiểm tra nội dung trước khi gửi AI: dòng không thể chứa ngày (như "Thuê phòng nghỉ", "Thuê phòng nghỉ (504)") không gửi AI nữa — nhanh hơn, đỡ tốn phí; bật/tắt trong Cài đặt AI.
- Ngày đã nhập được ghi nhớ theo từng dòng hóa đơn: mở lại file (hoặc file xuất sau có cùng dòng) thì ngày tự điền lại.
- Sau khi nhập ngày, có thể áp dụng cùng ngày cho các dòng khác chưa có ngày của cùng hóa đơn.
- Nhấn Enter sau khi nhập ngày để chuyển ngay sang dòng tiếp theo chưa có ngày.
- Thanh tiến độ khi hỏi AI và nút "Dừng".
- Nhớ ngày AI đã tìm được: nội dung đã gặp không phải hỏi AI lại (xóa được trong Cài đặt AI).
- Nút "Kiểm tra khóa" để thử khóa OpenAI và model.
- Nhớ các cột đã chọn cho từng mẫu file Excel.
- Danh sách "Mở gần đây" (5 file).
- Xem kết quả "Theo khách hàng": khách nào có nhiều hóa đơn cảnh báo nhất.
- Số yêu cầu song song trên 50 nay được dùng đầy đủ.
- Số phiên bản và cập nhật gọn trong một nút ở góc trên.

## 1.1.0 — 2026-09-28
- Tự động cập nhật: khi có phiên bản mới, ứng dụng hỏi trước rồi tự tải và khởi động lại.
- Hiển thị số phiên bản và mục "Có gì mới".
- Chọn hoặc kéo thả nhiều file cùng lúc: mỗi file được kiểm tra và lưu kết quả ngay cạnh file gốc.
- Nút "Lưu Cảnh báo" lưu riêng các dòng cảnh báo.
- Nút "Mở file" mở ngay file kết quả vừa lưu.
- Phím tắt: Ctrl+O mở file, Ctrl+S lưu kết quả, Ctrl+Shift+S lưu thành…
- Hộp thoại mở/lưu nhớ thư mục dùng lần trước.
- Tự thử lại khi AI báo quá tải (HTTP 429) hoặc lỗi máy chủ.
- Giao diện dùng toàn bộ chiều rộng cửa sổ; nới giới hạn cài đặt AI (100000 dòng, 1000 ký tự, 100 yêu cầu song song).

## 1.0.0 — 2026-09-27
- Phiên bản đầu tiên cho Windows.
