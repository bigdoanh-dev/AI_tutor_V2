# Tìm kiếm và độ phức tạp

## Tìm kiếm nhị phân
Dữ liệu phải được sắp xếp. So sánh giá trị cần tìm với phần tử giữa, rồi tiếp tục ở nửa phù hợp. Vì mỗi bước giảm một nửa phạm vi, thời gian tìm kiếm là O(log n).

## Độ phức tạp
Một vòng lặp duyệt n phần tử thường là O(n). Hai vòng lặp lồng nhau, mỗi vòng n lần, là O(n²). Big O mô tả mức tăng của số phép toán theo kích thước đầu vào, không phải thời gian tuyệt đối.

## Sắp xếp và đồ thị
Merge sort chia dữ liệu rồi trộn các phần đã sắp xếp, đạt O(n log n) trong trường hợp xấu nhất. BFS duyệt đồ thị theo từng lớp bằng hàng đợi. Với danh sách kề, thời gian BFS là O(V + E).