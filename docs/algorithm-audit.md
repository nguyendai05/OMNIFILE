# Audit thuật toán xử lý — 25/09/2026

Phạm vi: xử lý bảng/CSV, thống kê cột, lập thứ tự pipeline, giới hạn tác vụ đồng thời, gom dòng PDF và so sánh dữ liệu. Các thay đổi PDF → DOCX có sẵn trong working tree được giữ nguyên và chạy lại kiểm thử hồi quy khi tích hợp.

## Phát hiện và bản sửa

| Mức độ | Vấn đề tái hiện được | Cách sửa |
| --- | --- | --- |
| Cao | Hai dòng khác nhau có thể trùng khóa khi ô chứa ký tự `\u0001`, khiến thao tác xóa trùng loại nhầm dòng. | Mã hóa mảng ô đã chuẩn hóa bằng JSON, giữ ranh giới ô; dùng cùng khóa cho phát hiện bất thường. |
| Cao | CSV có dấu phân cách trong chuỗi được trích dẫn bị đoán sai; BOM, xuống dòng CR và bản ghi `""` cuối tệp bị đọc sai/mất. | Phân tích mẫu theo trạng thái dấu ngoặc kép và độ ổn định số cột; sửa parser cho BOM, CR/CRLF, trường nhiều dòng và ô cuối rỗng. |
| Cao | `Math.max(...rows)` vượt giới hạn đối số ở bảng lớn. | Duyệt tuyến tính tìm độ rộng, có test 150.000 dòng. Nhận diện tiêu đề có chữ Unicode. |
| Cao | Semaphore nhả lượt trước khi tác vụ chờ tiếp quản; tác vụ mới có thể chen vào và vượt giới hạn. Nhả cùng lượt hai lần cũng làm sai bộ đếm. | Bàn giao lượt trực tiếp theo FIFO; mỗi lượt chỉ được nhả một lần; hàng đợi thêm/lấy O(1). |
| Trung bình | Pipeline quét toàn bộ cạnh ở từng nút; cạnh tham chiếu nút thiếu và mã nút trùng không được chặn rõ ràng. | Lập danh sách cạnh đi/đến một lần, duyệt Kahn bằng con trỏ; xác thực nút/cạnh trước khi chạy. |
| Trung bình | Thống kê cột sao chép và quét dữ liệu nhiều lần; tổng/trung vị có thể thành vô cực dù dữ liệu hữu hạn. | Gộp đếm kiểu, giá trị duy nhất, mẫu và min/max trong một lượt; chọn trung vị bằng phân hoạch có giới hạn và dự phòng sort; trung bình có bù sai số và chuẩn hóa độ lớn. |
| Trung bình | Gom dòng PDF quét lại cả dòng để tìm chữ lớn nhất và phát hiện chữ vẽ trùng. | Lưu chữ chuẩn của dòng và chỉ tìm chữ trùng trong các nhóm tọa độ x lân cận; giữ nguyên ngưỡng nhận diện. |
| Trung bình | So sánh XML/YAML dùng văn bản chỉ mục tìm kiếm bị cắt ở 100.000 ký tự. | So sánh toàn bộ nội dung tài liệu. |
| Trung bình | So sánh JSON đệ quy bị tràn stack; khóa như `constructor` bị nhầm với thuộc tính kế thừa; đường dẫn khóa có dấu chấm bị nhập nhằng. | Duyệt và tuần tự hóa cây lồng sâu bằng stack tường minh, chỉ đọc thuộc tính riêng và ghi đường dẫn khóa đặc biệt bằng ký pháp ngoặc vuông. |
| Trung bình | So sánh bảng bỏ sót dòng rỗng được thêm/xóa; gom mọi chi tiết rồi mới cắt kết quả gây lãng phí bộ nhớ. | Phân biệt dòng thiếu với dòng rỗng; chỉ giữ tối đa 200 chi tiết bảng/400 chi tiết JSON nhưng vẫn đếm toàn bộ khác biệt. |

## Đo hiệu năng

Đây là số đo tổng hợp cục bộ trên cùng môi trường, không phải cam kết cho mọi tệp.

| Trường hợp | Trước | Sau |
| --- | --- | --- |
| Lập thứ tự pipeline, chuỗi 3.000 nút | 8.999.999 lượt đọc nguồn cạnh | 2.999 lượt; độ phức tạp O(V + E) |
| Thống kê 100.000 dòng × 6 cột; warmup rồi lấy trung vị 5 lượt | 383,5 ms | 221,9 ms; giảm khoảng 42% |
| Gom một dòng PDF gồm 16.000 mảnh chữ | khoảng 1.144 ms | khoảng 16 ms |

O(V + E) chỉ áp dụng cho bước lập thứ tự, chưa bao gồm chạy thao tác, cập nhật giao diện hay lưu trạng thái. Chọn trung vị có đường dự phòng O(n log n) để tránh phân hoạch xấu. PDF đã được đối chiếu với thuật toán trước sửa trên 3.000 ca ngẫu nhiên có seed và cho kết quả giống nhau.

## Kiểm chứng

- Bộ test ban đầu: 41/41 đạt. Sau sửa: **75/75 đạt**, gồm 34 test bổ sung.
- Test hồi quy mới kiểm tra va chạm khóa, CSV phức tạp, bảng lớn, trung vị/trung bình, tính công bằng và giới hạn semaphore, đồ thị lỗi, JSON lồng sâu và các giới hạn chi tiết so sánh.
- TypeScript (`npm run typecheck`) và build production (`npm run build`) đạt. Build còn cảnh báo dynamic import đồng thời được import tĩnh; đây chưa phải hạng mục tối ưu của đợt này.
- Smoke dev và production đạt ở cả desktop 1280×800 và mobile 390×844: nội dung/canvas hiển thị, không tràn ngang, không có lỗi console; đã xem trực tiếp ảnh chụp của cả hai kích thước. Kết quả nằm trong `screenshots/audit-final-dev.json` và `screenshots/audit-production.json`.
- Kiểm tra chéo: 2.500 phân bố trung vị và 1.200 CSV roundtrip có dấu phân cách/dấu ngoặc kép; các ca đều đạt. Sửa thêm sai số làm tròn trung vị cho hai số subnormal khác nhau, kiểm tra cả dấu dương và âm.
- Kiểm tra thao tác thực tế ở cả dev và production: pipeline PDF → trích bảng → bỏ dòng trống → chuẩn hóa tiêu đề → XLSX hoàn thành đủ các bước và tạo được tệp bảng tính.

Môi trường kiểm chứng là Windows. Dịch vụ Java hiện có giữ cổng 8080 nên phiên dev dùng cổng 8082; production preview dùng 8081. Không dừng dịch vụ đang có và không đổi cấu hình cổng mặc định của dự án. Dự án hiện không có script `preview:restart`, nên dùng `npm run preview` sau khi build xong và xác nhận cổng preview còn trống.

Đợt này không thay đổi OCR, thuật toán ảnh, giải nén hay cơ chế lưu IndexedDB. Nhận diện bảng PDF vẫn dựa trên hình học và khoảng cách chữ; các kết quả benchmark không đo thời gian OCR hoặc tải tài liệu.
