# HRM SOP API

Backend Node.js/TypeScript dạng **modular monolith** cho kho kiến thức SOP. API dùng Fastify, SQL Server qua driver `mssql`, validation bằng TypeBox và tài liệu OpenAPI tại `/docs`.

Frontend gọi API này để tải toàn bộ dữ liệu runtime; chỉ backend kết nối trực tiếp tới SQL Server.

## Kiến trúc

```text
Vercel Frontend ── HTTPS/JSON ──> Node.js Fastify API ── T-SQL ──> SQL Server
                                      │
                                      ├─ auth + scoped permissions
                                      ├─ modules
                                      ├─ SOP + version + workflow graph
                                      └─ audit + RAG source metadata
```

## Cấu trúc thư mục

```text
src/
  auth/                 xác thực, principal và phân quyền system/module/sop
  common/               lỗi và ID dùng chung
  config/               kiểm tra biến môi trường
  database/             connection pool, transaction và migration SQL
  modules/
    access/             account, group, grant
    health/             liveness/readiness
    knowledge/          tài liệu, thuật ngữ và bài hướng dẫn
    me/                 hồ sơ hiện tại và menu được phép xem
    modules/            phân hệ HRM
    sops/               SOP, phiên bản, bước và chuyển bước
  app.ts                composition root của HTTP API
  server.ts             process entrypoint và graceful shutdown
tests/                  test API cô lập, không phụ thuộc SQL Server thật
```

## Chạy local

Yêu cầu Node.js 22 trở lên và một SQL Server có thể truy cập. Có thể dùng SQL Server cài trực tiếp hoặc container Docker.

1. Sao chép `.env.example` thành `.env`, thay toàn bộ giá trị `change-me...` bằng mật khẩu local mạnh. Không commit `.env`.
2. Nếu dùng Docker, chạy `docker compose up -d`. Volume `hrm_sop_sql_data` giữ dữ liệu khi container được tạo lại.
3. Tạo database lần đầu bằng tài khoản quản trị:

   ```powershell
   sqlcmd -S 127.0.0.1,1433 -U sa -P "<your-local-password>" -C -Q "IF DB_ID(N'HrmSopKnowledge') IS NULL CREATE DATABASE HrmSopKnowledge"
   ```

4. Chạy `npm run db:setup` để tạo bảng, dữ liệu phân quyền và seed dataset giao diện vào SQL Server.
5. Chạy `npm run dev` và mở `http://127.0.0.1:3000/docs`.

Trong `AUTH_MODE=development`, header `x-user-id` bắt buộc và chọn tài khoản kiểm thử. Chế độ này bị chặn khi `NODE_ENV=production`. Khi tích hợp HRM thật, dùng `AUTH_MODE=jwt`, cấu hình secret, issuer, audience và ánh xạ claim `sub` sang `Account.ExternalSubject`. Adapter hiện tại xác minh JWT bằng secret/key cấu hình trực tiếp; nếu HRM dùng OIDC/JWKS (ví dụ Microsoft Entra ID), cần thay lớp xác minh token bằng public-key/JWKS adapter tương ứng trước khi production.

Migration `005_module_access_demo.sql` tạo 9 phân hệ và ba danh tính kiểm thử:

- `demo-admin`: toàn bộ phân hệ và chức năng quản trị.
- `demo-hr`: tuyển dụng, nhân sự, onboarding, chấm công, nghỉ phép và ESS/MSS.
- `demo-accounting`: tiền lương, bảo hiểm, thuế và ESS/MSS.

`GET /api/v1/auth/development-accounts` chỉ tồn tại khi `AUTH_MODE=development`, phục vụ màn chọn tài khoản local. `GET /me` trả về cả `modules`, `menuItems` và `capabilities` đã lọc. `GET /bootstrap` tiếp tục kiểm tra cùng phạm vi ở Backend và không gửi workflow ngoài quyền xuống trình duyệt.

Không nên dùng tài khoản `sa` cho API ở staging/production. Hãy tạo login/user riêng chỉ có quyền trên database ứng dụng, lưu secret trong hệ thống quản lý secret của nền tảng host và bật mã hóa kết nối.

## API chính

Tất cả API nghiệp vụ có prefix `/api/v1`.

| Method | Path | Mục đích |
|---|---|---|
| GET | `/health`, `/ready` | Kiểm tra process và SQL Server |
| GET | `/me` | Account, nhóm, quyền và menu sau khi lọc |
| GET/POST/PATCH | `/modules` | Tra cứu và quản trị phân hệ |
| GET/POST/PATCH | `/sops` | Tra cứu, tạo hoặc sửa header/mapping của SOP |
| GET | `/sops/:sopId?versionId=...` | Đọc bản published hoặc version được phép xem |
| POST | `/sops/:sopId/drafts` | Sao chép version gần nhất thành draft mới |
| PUT | `/sop-versions/:versionId` | Thay nội dung/graph draft, kiểm tra `rowVersion` |
| POST | `/sop-versions/:versionId/submit` | Gửi duyệt |
| POST | `/sop-versions/:versionId/reject` | Trả về chỉnh sửa, kèm lý do |
| POST | `/sop-versions/:versionId/publish` | Xuất bản và archive bản cũ trong transaction |
| GET/POST/PUT | `/accounts`, `/groups`, `/permissions` | Quản trị account, nhóm và scoped grants |
| GET/POST | `/documents`, `/terms`, `/guidance` | Tài liệu liên kết, thuật ngữ và hướng dẫn |

Chi tiết request/response và validation nằm trong OpenAPI `/docs`; `requests.http` có các request kiểm tra nhanh.

## Mô hình quyền

Permission được cấp cho **nhóm**, account tham gia một hoặc nhiều nhóm. Mỗi grant có một phạm vi:

- `system/*`: áp dụng toàn hệ thống.
- `module/<moduleId>`: kế thừa xuống SOP thuộc phân hệ.
- `sop/<sopId>`: chỉ áp dụng một SOP.

Các quyền seed ban đầu: `sop.read`, `sop.create`, `sop.edit`, `sop.review`, `sop.publish`, `module.manage`, `permission.manage`.

## Dữ liệu và version

- `Sop` giữ ID/code/title ổn định; `SopVersion` giữ nội dung thay đổi theo thời gian.
- `SopStep.StableKey` giữ định danh logic của một bước giữa các version; `SopStepId` là ID vật lý riêng cho từng version.
- `SopTransition` biểu diễn nhánh, quay lại, song song, hợp nhất và quy trình con; đây là dữ liệu sơ đồ, không phải workflow engine.
- `rowversion` ngăn cập nhật mù khi hai người cùng sửa draft.
- Bảng `RagChunk` dành cho pipeline lập chỉ mục sau này; nguồn dẫn phải giữ `SopId`, `SopVersionId` và `SopStepId`.
- Migration `003_knowledge_content.sql` bổ sung thuật ngữ, bài hướng dẫn và liên kết tài liệu. Chưa có binary upload; file thực nên đặt ở object storage/DMS, SQL Server chỉ giữ URL/checksum/metadata.

## Kết nối Frontend

Frontend chỉ gọi HTTP API, không chứa database hoặc driver database trong trình duyệt:

- `GET /api/v1/bootstrap` tải các dataset giao diện từ `dbo.AppConfig`.
- `GET/PUT /api/v1/policy-acknowledgements/:policyId` đọc và ghi xác nhận chính sách trong SQL Server.
- `npm run db:setup` chạy migration và seed các dataset giao diện lần đầu.
- Khi chạy local, Vite proxy `/api` tới `http://127.0.0.1:3000`; khi deploy đặt `VITE_API_BASE_URL` thành URL backend.

## Kiểm chứng

```powershell
npm run build
npm run lint
npm test
```

Migration cần được chạy thử thêm trên SQL Server local/staging trước khi coi là sẵn sàng triển khai. Unit test hiện không thay thế integration test với SQL Server thật.
