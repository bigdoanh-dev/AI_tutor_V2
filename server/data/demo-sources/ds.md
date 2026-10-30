# Ngăn xếp, hàng đợi và cây

## Ngăn xếp (Stack)
Phần tử được đưa vào sau cùng sẽ được lấy ra trước (LIFO). Hai thao tác chính là push và pop. Stack được dùng để quản lý lời gọi hàm và chức năng Undo.

## Hàng đợi (Queue)
Phần tử vào trước được lấy ra trước (FIFO). Enqueue thêm vào cuối hàng; dequeue lấy ở đầu hàng. Cấu trúc này phù hợp để xử lý tác vụ theo thứ tự đến.

## Danh sách và cây
Danh sách liên kết lưu các nút nối với nhau qua tham chiếu. Cây tìm kiếm nhị phân đặt giá trị nhỏ hơn về nhánh trái và lớn hơn về nhánh phải, với giả định khóa không trùng. Cây cân bằng giúp giữ thao tác tìm kiếm ở O(log n).