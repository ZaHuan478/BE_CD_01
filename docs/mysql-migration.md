# Kiểm tra kiến trúc và chuyển dữ liệu MySQL

## Kiến trúc hiện tại

Luồng HTTP: `route → controller → service → repository → MySQL`.

- Route: URL/method/schema và chuyển request cho controller.
- Controller: identity từ request, input và HTTP status/response.
- Service: quyền truy cập, điều phối nghiệp vụ, lọc kết quả.
- Repository: SQL, mapping và transaction; các kiểm tra toàn vẹn cần thực hiện cùng giao dịch vẫn nằm tại đây.
- `app.ts`: lắp ráp dependency/plugin. `server.ts`: khởi tạo database trước khi mở HTTP.
- Khởi tạo/migration là luồng CLI/startup, không đi qua controller.

Các file của access/auth/bootstrap/health/knowledge/me/module/search/sop được gom theo lớp trong `src/routes`, `src/controllers`, `src/services`, `src/repositories`; validation ở `src/schemas`. Đây là layered monolith, không viết lại nghiệp vụ hay UI. Test kiến trúc kiểm tra đủ các lớp và route không gọi query/transaction/authentication trực tiếp, không thay thế review mọi quy tắc nghiệp vụ.

## Bản chụp ngày 05/09/2026

File cục bộ: `data/import/legacy-snapshot.json`, UTF-8, 23 bảng, 268 dòng. Nguồn chỉ được đọc, không xóa hay sửa database nguồn.

| Bảng | Số dòng |
|---|---:|
| Account | 11 |
| UserGroup | 11 |
| AccountGroup | 11 |
| Permission | 15 |
| AccessGrant | 115 |
| MenuItem | 9 |
| HrModule | 9 |
| MenuModule | 72 |
| AppConfig | 15 |
| 14 bảng còn lại | 0 |

AppConfig gồm 14 dataset giao diện và một release. Các bảng chuẩn hóa Sop/SopVersion/SopStep/Document/GuidanceArticle hiện rỗng ở nguồn.

Chuyển DB giữ được nội dung giao diện qua bootstrap, nhưng **không tự biến JSON thành SOP chuẩn hóa**. API SOP/search không tự tìm xuyên các dataset JSON đó; cần hạng mục mapping/kiểm duyệt nghiệp vụ riêng.

Bootstrap nay luôn đọc AppConfig trong MySQL, cache tối đa 5 phút và áp dụng bộ lọc module hiện có, không dùng file mẫu chỉ vì trùng mã release.

Đây là bản chụp tại thời điểm xuất, không phải đồng bộ liên tục. Không chứa file đính kèm bên ngoài DB; URL/metadata được giữ nguyên. Backend không cần driver hay kết nối tới hệ quản trị cũ khi chạy. Công cụ xuất tạm đã được dọn sau khi xuất thành công.

## Nhập vào database đích

1. Tạo **database MySQL rỗng** và tài khoản có quyền tạo schema/index/khóa ngoại, đọc/ghi trên đúng database đó. Đích đề xuất MySQL 8.4; đã smoke-test schema/import trên MySQL 8.0.46 cài tại máy này.
2. Điền đúng DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD trong `.env`. Không lưu mật khẩu thật trong `.env.example`.
3. Giữ file snapshot đúng đường dẫn và thiết lập:

```dotenv
DB_INITIALIZE_ON_START=true
DB_IMPORT_SNAPSHOT=data/import/legacy-snapshot.json
DB_SEED_DEMO=false
```

4. Chạy từ thư mục BackEnd:

```powershell
npm install
npm run dev
```

Luồng startup: kết nối → lấy lock khởi tạo → tạo schema → kiểm tra đích rỗng → nhập trong transaction → đối chiếu số dòng → lưu checksum vào DataImport → mở HTTP.

Có thể nhập trước bằng `npm run db:setup`. `npm run db:migrate` chỉ chạy schema, không nhập snapshot hay tạo demo. Bản build production có `npm run db:setup:prod`.

- Cùng snapshot đã nhập: bỏ qua lần khởi động sau.
- Đích có dữ liệu nhưng chưa có receipt: dừng, không truncate/upsert. Dùng database rỗng mới hoặc lập kế hoạch đối soát.
- Snapshot khác lần đã nhập: dừng, không tự gộp.
- Sai cột/khóa ngoại/dữ liệu hoặc lỗi ghi: rollback dữ liệu của lần nhập, không ghi receipt thành công.
- Không demo seed sau import: giữ nguyên tài khoản, module, quyền và JSON.
- RowVersion chuyển sang bộ đếm mới bắt đầu từ chuỗi số `1`; token khóa lạc quan không giữ nguyên giữa hai engine. Thời gian nguồn được diễn giải theo UTC như ứng dụng nguồn.
- Không tắt foreign key. Tham chiếu vòng/cha-con được gán sau khi các dòng liên quan đã tồn tại.
- DDL MySQL không được hứa hẹn rollback; schema migrations phải chạy lại được sau gián đoạn. Data import là transaction riêng.

Sau khi nhập và kiểm tra thành công, có thể đặt `DB_IMPORT_SNAPSHOT=` và `DB_INITIALIZE_ON_START=false`; giữ snapshot ở nơi backup an toàn. Production nên chạy migration/setup bằng tài khoản triển khai có quyền DDL, API dùng tài khoản ít quyền hơn.

Snapshot chứa thông tin tài khoản/nội bộ: đã loại khỏi Git và Docker build context. Nếu chạy container, mount snapshot read-only và đặt đường dẫn tương ứng; không nhúng dữ liệu thật vào image.

**Trạng thái đích:** cấu hình .env hiện tại trả `ER_ACCESS_DENIED_ERROR`. Chưa nhập vào database đích của bạn. Cần sửa tài khoản/mật khẩu/quyền truy cập. Nhập thành công được xác minh trên instance MySQL thử nghiệm riêng.

## Quyền sau khi nhập

Giữ UserGroup/AccountGroup/AccessGrant để không mất hoặc tự mở rộng quyền cũ. Quyền xem hiệu lực hiện là hợp của quyền nhóm và AccountModuleAccess (kèm module chung nếu có). Bỏ quyền trực tiếp không thu hồi quyền vẫn có từ nhóm.

Bản nguồn chưa có SystemRole, metadata vị trí/đơn vị và bảng cấp module trực tiếp mới. Cột mới nhận default USER/NULL, không đoán vị trí từ tên tài khoản. Quản trị vẫn xét AccessGrant đã nhập, không dựa riêng nhãn SystemRole.

Nếu muốn chỉ quản lý quyền trực tiếp, cần chuyển mô hình quyền có đối soát riêng; không xóa nhóm trong migration dữ liệu.

## Thư mục dist

dist là output TypeScript và bản sao migration/seed cần khi production chạy; không phải database hay snapshot trong data/import.

- `npm run dev` dùng src, không cần dist.
- `npm start`, các lệnh db:*:prod và Docker runtime cần dist, phải build trước.
- Có thể xóa khi không phục vụ bản production đang chạy, tạo lại bằng `npm run build`.
- `npm run clean` chỉ xóa đúng BackEnd/dist; build tự clean trước để không giữ output cũ.
- Không sửa trực tiếp dist, không lưu upload/backup vào đó, không commit.

## Kiểm chứng

```powershell
npm run build
npm run lint
npm test
```

Smoke test: scripts/mysql-smoke.mjs, chỉ chạy khi chỉ định TEST_DB_PORT và tên schema mới bắt đầu bằng isop_test_. Tạo ba schema mới trên MySQL localhost để kiểm tra snapshot, rollback và demo riêng, không drop/ghi đè schema sẵn có. Chỉ chạy trên instance thử nghiệm.

Đã kiểm tra số dòng từng bảng, JSON nguyên văn, khởi tạo lần hai, readiness và API identity/bootstrap/search của 11 tài khoản hoạt động. Demo setup được kiểm tra trên schema riêng. Unit test kiểm tra rollback, từ chối đích không rỗng, cột lạ, số nguyên lớn và tham chiếu cha-con. Chưa phải kiểm chứng toàn bộ workflow SOP dưới tải đồng thời.
