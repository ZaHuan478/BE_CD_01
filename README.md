# HRM SOP API

Backend Node.js/TypeScript dạng **layered monolith**, gom file theo lớp kỹ thuật cho kho kiến thức SOP. API dùng Fastify, MySQL 8.4/InnoDB qua driver `mysql2`, validation bằng TypeBox và tài liệu OpenAPI tại `/docs`.

Frontend chỉ gọi HTTP API; chỉ backend kết nối trực tiếp tới MySQL.

Kết quả rà soát, số liệu snapshot, cách nhập dữ liệu hiện có và giải thích `dist`: [Hướng dẫn chuyển MySQL](docs/mysql-migration.md).

## Kiến trúc

```text
React Frontend ── HTTPS/JSON ──> Node.js Fastify API ── SQL ──> MySQL 8.4
                                      │
                                      ├─ auth + scoped permissions
                                      ├─ modules
                                      ├─ SOP + version + workflow graph
                                      └─ audit + RAG source metadata
```

## Cấu trúc thư mục

```text
src/
  routes/               URL, method, schema; chuyển request tới controller
  controllers/          nhận request, identity và HTTP response
  services/             quyền truy cập và điều phối nghiệp vụ
  repositories/         SQL, mapping dữ liệu và transaction
  schemas/              TypeBox validation và kiểu request
  auth/                 helper xác thực/phân quyền, principal và guards
  common/               lỗi, ID và bộ lọc phạm vi dataset
  config/               kiểm tra biến môi trường
  database/             connection pool, transaction và migration SQL
  types/                khai báo mở rộng kiểu Fastify
  app.ts                composition root của HTTP API
  server.ts             process entrypoint và graceful shutdown
tests/                  test API cô lập, không phụ thuộc MySQL thật
```

Ví dụ: `routes/sop.routes.ts → controllers/sop.controller.ts → services/sop.service.ts → repositories/sop.repository.ts`. Các file giữ tiền tố nghiệp vụ (`sop`, `access`, `knowledge`...) để dễ tìm trong từng lớp. Không còn thư mục `src/modules` và không thay đổi URL API.

Thư mục `dist` đã được xóa theo yêu cầu; chạy local bằng `npm run dev`. Dùng `npm run typecheck` để kiểm tra TypeScript mà không sinh output. Khi cần production, `npm run build` sẽ tạo lại `dist` trước `npm start`.

## Chạy local

Yêu cầu Node.js 22 trở lên và MySQL 8.4. Có thể dùng MySQL cài trực tiếp hoặc container Docker.

1. Sao chép `.env.example` thành `.env`, thay toàn bộ giá trị `change-me...` bằng mật khẩu local mạnh. Không commit `.env`.
2. Nếu dùng Docker, chạy `docker compose up -d`. Volume `hrm_sop_mysql_data` giữ dữ liệu khi container được tạo lại.
3. Nếu dùng MySQL bên ngoài Docker, tự tạo database và user đúng với các biến `DB_*` trong `.env`.
4. Để chuyển dữ liệu hiện có, giữ `data/import/legacy-snapshot.json`, đặt `DB_IMPORT_SNAPSHOT` trỏ tới file này và `DB_SEED_DEMO=false`. Database đích phải rỗng. Snapshot không được commit hoặc đưa vào Docker image.
5. Chạy `npm run start` để khởi động Backend local. Dùng `npm run dev` khi cần tự khởi động lại sau mỗi lần sửa mã. Với database legacy mới, đặt `DB_INITIALIZE_ON_START=true` để Backend tạo schema và nhập snapshot một lần trước khi mở HTTP, hoặc chạy trước `npm run db:setup`. Với database core8 đã chuyển đổi, đặt `DB_MODEL=core8`. Tài liệu API tại `http://127.0.0.1:3000/docs`.

Lệnh `npm run start:prod` chạy bản JavaScript trong `dist` sau `npm run build`.

Trong `AUTH_MODE=development`, header `x-user-id` bắt buộc và chọn tài khoản kiểm thử. Chế độ này bị chặn khi `NODE_ENV=production`. Khi tích hợp HRM thật, dùng `AUTH_MODE=jwt`, cấu hình secret, issuer, audience và ánh xạ claim `sub` sang `Account.ExternalSubject`. Adapter hiện tại xác minh JWT bằng secret/key cấu hình trực tiếp; nếu HRM dùng OIDC/JWKS (ví dụ Microsoft Entra ID), cần thay lớp xác minh token bằng public-key/JWKS adapter tương ứng trước khi production.

Chỉ khi muốn demo mới, đặt `DB_IMPORT_SNAPSHOT=` và `DB_SEED_DEMO=true` ở môi trường development. Migration `110_mysql_core_seed.mysql.sql` tạo module chung, 9 phân hệ nghiệp vụ và hai danh tính kiểm thử; không chạy demo seed sau khi nhập snapshot:

- `demo-admin`: toàn bộ phân hệ và chức năng quản trị.
- `demo-employee`: module chung, hồ sơ nhân viên, chấm công, nghỉ phép và dịch vụ nhân viên.

`GET /api/v1/auth/development-accounts` chỉ tồn tại khi `AUTH_MODE=development`, phục vụ màn chọn tài khoản local. `GET /me` trả về cả `modules`, `menuItems` và `capabilities` đã lọc. `GET /bootstrap` tiếp tục kiểm tra cùng phạm vi ở Backend và không gửi workflow ngoài quyền xuống trình duyệt.

Không dùng tài khoản MySQL `root` cho API ở staging/production. Hãy tạo user riêng chỉ có quyền trên database ứng dụng và lưu mật khẩu trong hệ thống quản lý secret.

## API chính

Tất cả API nghiệp vụ có prefix `/api/v1`.

| Method | Path | Mục đích |
|---|---|---|
| GET | `/health`, `/ready` | Kiểm tra process và MySQL |
| GET | `/me` | Account, nhóm, quyền và menu sau khi lọc |
| GET | `/me/modules` | Danh sách module hữu hiệu của user hiện tại |
| GET/POST/PATCH | `/modules` | Tra cứu và quản trị phân hệ |
| GET/POST/PATCH | `/sops` | Tra cứu, tạo hoặc sửa header/mapping của SOP |
| GET | `/sops/:sopId?versionId=...` | Đọc bản published hoặc version được phép xem |
| POST | `/sops/:sopId/drafts` | Sao chép version gần nhất thành draft mới |
| PUT | `/sop-versions/:versionId` | Thay nội dung/graph draft, kiểm tra `rowVersion` |
| POST | `/sop-versions/:versionId/submit` | Gửi duyệt |
| POST | `/sop-versions/:versionId/reject` | Trả về chỉnh sửa, kèm lý do |
| POST | `/sop-versions/:versionId/publish` | Xuất bản và archive bản cũ trong transaction |
| GET/POST | `/sop-imports` | Liệt kê hoặc upload DOCX/PDF để tạo bản xem trước SOP |
| GET/PUT | `/sop-imports/:importId` | Đọc hoặc hiệu chỉnh kết quả số hóa |
| POST | `/sop-imports/:importId/accept` | Chấp nhận kết quả và tạo SOP draft |
| GET | `/sop-imports/:importId/source` | Tải lại file nguồn bất biến |
| GET/POST/PUT | `/accounts`, `/groups`, `/permissions` | Quản trị account, nhóm và scoped grants |
| GET/POST | `/documents`, `/terms`, `/guidance` | Tài liệu liên kết, thuật ngữ và hướng dẫn |
| GET | `/search?q=...` | Tìm kiếm SOP/tài liệu/hướng dẫn/thuật ngữ có lọc quyền |
| GET | `/admin/users` | Danh sách user cho màn hình cấp module |
| GET/PUT | `/admin/users/:id/module-access` | Đọc hoặc thay quyền module cấp trực tiếp |

Chi tiết request/response và validation nằm trong OpenAPI `/docs`; `requests.http` có các request kiểm tra nhanh.

## Mô hình quyền

Quyền xem nghiệp vụ được cấp trực tiếp bằng `AccountModuleAccess`. Module có `IsCommon=1` luôn được xem. `GrantSource` phân biệt quyền `manual`, `hrm` và `system`, vì vậy sau này HRM có thể đồng bộ mà không xóa quyền bổ sung của admin.

Nhóm/scoped grant vẫn có thể cấp quyền xem và quyền quản trị/biên tập. Khi nhập snapshot, giữ nguyên quyền cũ; quyền hiệu lực là hợp của nhóm và cấp trực tiếp. Xóa cấp trực tiếp không thu hồi quyền vẫn có từ nhóm. Các phạm vi:

- `system/*`: áp dụng toàn hệ thống.
- `module/<moduleId>`: kế thừa xuống SOP thuộc phân hệ.
- `sop/<sopId>`: chỉ áp dụng một SOP.

Các quyền seed ban đầu: `sop.read`, `sop.create`, `sop.edit`, `sop.review`, `sop.publish`, `module.manage`, `permission.manage`.

## Dữ liệu và version

- `Sop` giữ ID/code/title ổn định; `SopVersion` giữ nội dung thay đổi theo thời gian.
- `SopStep.StableKey` giữ định danh logic của một bước giữa các version; `SopStepId` là ID vật lý riêng cho từng version.
- `SopTransition` biểu diễn nhánh, quay lại, song song, hợp nhất và quy trình con; đây là dữ liệu sơ đồ, không phải workflow engine.
- `SopVersion.RowVersion` là số nguyên tăng dần để ngăn cập nhật mù khi hai người cùng sửa draft.
- Bảng `RagChunk` dành cho pipeline lập chỉ mục sau này; nguồn dẫn phải giữ `SopId`, `SopVersionId` và `SopStepId`.
- File thực nên đặt ở object storage/DMS; MySQL chỉ giữ URL, checksum, metadata và liên kết nghiệp vụ.

## Kết nối Frontend

Frontend chỉ gọi HTTP API, không chứa database hoặc driver database trong trình duyệt:

- `GET /api/v1/bootstrap` là API tương thích tạm thời cho FE hiện tại; nguồn nghiệp vụ mới phải dùng các API module/SOP/search.
- `GET/PUT /api/v1/policy-acknowledgements/:policyId` đọc và ghi xác nhận chính sách trong MySQL.
- `npm run db:setup` chạy schema rồi nhập snapshot, hoặc seed demo nếu bật rõ ràng. `db:migrate` chỉ chạy schema.
- Khi chạy local, Vite proxy `/api` tới `http://127.0.0.1:3000`; khi deploy đặt `VITE_API_BASE_URL` thành URL backend.

## Kiểm chứng

```powershell
npm run build
npm run lint
npm test
```

Đã smoke-test snapshot, khởi tạo lại, API đọc và seed demo trên MySQL 8.0.46 riêng. `scripts/mysql-smoke.mjs` cho phép chạy lại trên schema thử nghiệm mới. Kết nối database đích qua `.env` vẫn cần sửa lỗi `ER_ACCESS_DENIED_ERROR`; chưa chuyển dữ liệu vào đích đó. Unit test/smoke test này chưa kiểm chứng toàn bộ workflow dưới tải đồng thời.
