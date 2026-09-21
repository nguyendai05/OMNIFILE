# OMNIFILE

**Your files. Your workspace.**

OMNIFILE là không gian làm việc với tệp ngay trong trình duyệt. Xem tài liệu, khám phá dữ liệu và kết nối các bước xử lý trong cùng một giao diện.

## Làm việc với tệp

- **PDF:** xem trang, tìm văn bản, trích xuất bảng và xuất ảnh.
- **Bảng dữ liệu:** mở CSV và Excel, lọc, sắp xếp, làm sạch dữ liệu và xuất kết quả.
- **Hình ảnh:** xem, xoay, đổi kích thước, chuyển định dạng và nhận diện chữ.
- **Văn bản và tài liệu:** đọc Markdown, JSON, XML, YAML và DOCX.
- **Archive:** xem danh sách tệp và giải nén ZIP vào workspace.

Mở nhiều tệp bằng tab, tìm kiếm trong workspace hoặc dùng pipeline để nối các thao tác. Mỗi bước chuyển đổi tạo một tệp kết quả mới và giữ liên kết với tệp nguồn.

## Bắt đầu

1. Kéo tệp vào workspace hoặc chọn **Open**.
2. Xem nội dung và các thao tác phù hợp trong bảng bên phải.
3. Chạy một thao tác hoặc chọn quy trình như **PDF → Excel**.
4. Xuất và tải xuống kết quả cần lưu giữ.

Các tệp mẫu có sẵn để thử trước khi mở tài liệu của bạn. Giao diện hỗ trợ chế độ sáng/tối và màn hình nhỏ.

## Dữ liệu của bạn

Việc xử lý tệp diễn ra trong trình duyệt. Workspace được lưu trên thiết bị bằng IndexedDB và không đồng bộ giữa các thiết bị. Xóa dữ liệu trình duyệt sẽ xóa workspace đã lưu.

OCR có thể tải thư viện và dữ liệu ngôn ngữ qua mạng. Hãy tải xuống các kết quả quan trọng trước khi xóa dữ liệu trang web.

## Chạy từ mã nguồn

Yêu cầu Node.js 22 và npm.

```bash
npm ci
npm run dev
```

Kiểm tra và build:

```bash
npm run typecheck
npm test
npm run build
```

## Giấy phép

[MIT](LICENSE) · Nguyễn Xuân Đại
