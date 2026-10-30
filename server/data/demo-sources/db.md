# SQL và mô hình quan hệ

## Truy vấn dữ liệu
SELECT lấy dữ liệu; WHERE lọc các hàng; ORDER BY sắp xếp kết quả. Ví dụ: SELECT ten FROM sinh_vien WHERE diem >= 5 ORDER BY ten;

## Khóa và liên kết
Khóa chính định danh duy nhất mỗi bản ghi và không nhận NULL. Khóa ngoại tham chiếu đến khóa của bảng liên quan. INNER JOIN chỉ trả về các hàng thỏa điều kiện nối ở cả hai phía.

## Nhóm và giao dịch
GROUP BY gom các hàng có cùng giá trị. HAVING lọc các nhóm sau tổng hợp, còn WHERE lọc hàng trước đó. Tính nguyên tử của giao dịch nghĩa là toàn bộ thao tác cùng thành công hoặc cùng bị hủy.