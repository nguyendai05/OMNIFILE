# OMNIFILE

**Your files. Your workspace.**

Không gian xử lý tệp ngay trong trình duyệt: xem nội dung PDF, bảng dữ liệu, hình ảnh và archive; tạo bản chuyển đổi và theo dõi nguồn gốc của từng kết quả.

## Tính năng

- Nhập tệp, xem metadata, mở nhiều tab và tìm kiếm trong workspace.
- Xử lý bảng dữ liệu, PDF, hình ảnh, văn bản và archive.
- Kết nối các bước xử lý bằng pipeline và recipe.
- Lưu workspace trong trình duyệt bằng IndexedDB.
- Giao diện sáng/tối, hỗ trợ màn hình nhỏ.

Tệp được xử lý phía trình duyệt. Bản hiện tại không yêu cầu tài khoản, database hay API key. Xóa dữ liệu trình duyệt sẽ xóa workspace đã lưu; hãy tải xuống các kết quả cần giữ. OCR có thể tải thư viện và dữ liệu ngôn ngữ từ mạng.

SheetJS được ghim ở phiên bản 0.20.3 từ [nguồn phân phối chính thức](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), thay cho bản 0.18.5 cũ trên npm. `package-lock.json` lưu checksum để kiểm tra tính toàn vẹn khi cài đặt.

## Phát triển

Yêu cầu **Node.js 22** và npm.

```bash
npm ci
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Kiểm tra giao diện desktop/mobile khi ứng dụng đang chạy:

```bash
npx playwright install chromium
npm run test:smoke
```

## Cấu trúc

```text
src/
  config/site.ts    # Tên, mô tả và màu thương hiệu
  routes/           # Document shell và các trang
  workspace/        # Giao diện workspace
  core/             # Engine, state, pipeline và kiểm thử
  parsers/          # Đọc và phân tích định dạng tệp
  components/       # Thành phần UI
  lib/              # Tiện ích chung
public/             # Favicon, icon, manifest và ảnh chia sẻ
scripts/            # Kiểm tra giao diện
vite.config.ts      # Vite, TanStack Start và Nitro
vercel.json         # Cài dependencies và build trên Vercel
```

## Đưa lên GitHub

Tạo repository trống tên `omnifile` trong tài khoản của bạn. Không khởi tạo README từ GitHub vì project đã có sẵn.

```bash
git add .
git commit -m "Prepare OMNIFILE for deployment"
git remote add origin https://github.com/YOUR_USERNAME/omnifile.git
git push -u origin main
```

Thay `YOUR_USERNAME` bằng tài khoản GitHub của bạn. Các thư mục build, dữ liệu máy cá nhân và công cụ phát triển đã được loại khỏi commit bằng `.gitignore`.

## Deploy Vercel

1. Chọn **Add New → Project** rồi import repository `omnifile` từ GitHub.
2. Giữ **Root Directory** là thư mục gốc của repository.
3. Để Vercel tự nhận diện framework. Build Command là `npm run build`, Install Command là `npm ci` theo `vercel.json`.
4. Giữ **Output Directory** ở mặc định; không đặt thành `dist`. Nitro tạo cả static assets và server function trong `.vercel/output`.
5. Chọn Node.js **22.x** nếu cần; không cần thêm biến môi trường.
6. Nhấn **Deploy**. Các lần push tiếp theo sẽ kích hoạt deploy tự động khi Git integration đã kết nối.

Tài liệu chính thức: [TanStack Start trên Vercel](https://vercel.com/docs/frameworks/full-stack/tanstack-start).

## Thương hiệu

Sửa `src/config/site.ts` cho tên, mô tả và màu trình duyệt; cập nhật `public/manifest.webmanifest`, `public/favicon.svg`, `public/icons/apple-touch-icon.png` và `public/og.jpg` khi thay bộ nhận diện. OMNIFILE là tên đang dùng trong giao diện và metadata.
