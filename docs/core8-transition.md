# Chuyển sang 8 bảng lõi

Đây là chế độ mới `DB_MODEL=core8`. Code chuyển đổi không tự chạy trên database thật và không xóa bảng cũ. `.env` thật không được sửa; điền kết nối trong bản sao của `.env.example`.

## Bảng và field

| Bảng được dùng ở core8 | Nội dung |
| --- | --- |
| Account | User, thông tin tổ chức, ExternalSubject cho SSO, SystemRole ADMIN/USER; ReadAllModules chỉ để bảo toàn quyền đọc toàn hệ thống vốn có |
| HrModule | Phân hệ, mô tả, IsCommon, thứ tự hiển thị |
| AccountModuleAccess | User–phân hệ, nguồn manual/hrm/system, thời hạn quyền |
| KnowledgeDocument | Mã, tên, loại procedure/policy/guide/glossary/form, trạng thái, phiên bản hiện tại |
| KnowledgeDocumentModule | Tài liệu–phân hệ, vẫn là quan hệ nhiều–nhiều có khóa ngoại |
| KnowledgeDocumentVersion | Phiên bản, ContentJson, ContentHash, thời gian hiệu lực, người tạo |
| AuditLog | Lịch sử thao tác; xác nhận đã đọc gắn documentId + version + accountId |
| SchemaMigration | Dấu đã chuyển đổi/kiểm chứng và fingerprint nguồn |

`ContentJson` chứa nội dung, steps/checklist, artifacts, transitions, attachments và relatedDocuments. SopRelation chuyển thành danh sách ID trong JSON; các ID phải tồn tại khi ghi mới, và BE lọc tài liệu liên quan theo quyền khi đọc chi tiết. Không chuyển user–phân hệ hay tài liệu–phân hệ thành chuỗi ID/JSON.

GuidanceArticle/GlossaryTerm trở thành các loại tài liệu. Menu ở `src/config/core-menu.ts`. Các dataset sơ đồ/từ điển/dịch đang được FE sử dụng được giữ riêng dưới dạng tài liệu tham chiếu nội bộ (`Visibility=internal`, `DocumentType=reference`) kèm phiên bản; không xuất hiện trong catalog/search người dùng. SOP và policy được tách thành từng tài liệu, không giữ nguyên cả kho trong một field bootstrap.

RagChunk là dữ liệu dẫn xuất: chưa có RAG trong chế độ core8; nếu dùng lại cần tái tạo chỉ mục. Các bảng nhóm/quyền cũ và cấu hình gốc vẫn nằm trong backup và database nguồn để đối chiếu. Không có thao tác xóa tự động.

## Database đang có dữ liệu

1. Chạy `npm run db:core8:plan`. Đây là bước chỉ đọc; xem `blockers`, `permissionChanges`, số tài liệu và `fingerprint`.
2. Xử lý hết blockers. Quyền chỉ trên một SOP không tự đổi thành quyền trên cả phân hệ. Bài hướng dẫn/thuật ngữ chưa có phân hệ cần được gán rõ. CONTENT_EDITOR hoặc quyền quản trị cục bộ không tương đương Admin/User sẽ được liệt kê để chấp thuận riêng.
3. Dừng tất cả BE và tiến trình ghi DB trong cửa sổ bảo trì. Sao lưu MySQL đầy đủ bằng công cụ DBA, đồng thời chọn đường dẫn JSON backup nằm ngoài source control; file này chứa thông tin user và nghiệp vụ, phải hạn chế ACL truy cập.
4. Chạy lệnh dưới đây, thay fingerprint và đường dẫn bằng giá trị thật. Chỉ thêm cờ chấp thuận quyền sau khi đã đọc báo cáo.

```powershell
npm run db:core8:apply -- --fingerprint=FINGERPRINT --backup=D:/SOP-backups/core8-before.json --maintenance-window --accept-permission-simplification
npm run db:core8:verify -- --fingerprint=FINGERPRINT --backup=D:/SOP-backups/core8-before.json
```

Thư mục backup phải tồn tại. Công cụ không ghi đè backup có sẵn. Hash nguồn được đối chiếu trước khi chuyển, JSON backup được kiểm chứng trước khi ghi dữ liệu. Ghi dữ liệu và kiểm chứng nằm trong transaction. DDL MySQL auto-commit: nếu lỗi có thể còn cột/bảng mới rỗng, không có cam kết rollback DDL. Không chạy đồng thời với writer.

5. Khi verify thành công, đặt `DB_MODEL=core8`, `DB_INITIALIZE_ON_START=false`, `DB_SEED_DEMO=false`, bỏ `DB_IMPORT_SNAPSHOT` rồi restart BE. KNOWLEDGE_READ_SOURCE không có tác dụng ở core8. Backend chặn khởi động nhầm chế độ legacy trên DB đã có marker core8.
6. Kiểm tra từng user, module, tìm kiếm, đọc SOP và cấp quyền. Các bảng cũ vẫn hiện trong công cụ MySQL: đó là dữ liệu giữ lại, không phải dependency runtime. Xóa vật lý cần bước riêng được phê duyệt, không nằm trong công cụ này.

Nếu verify lỗi sau khi ứng dụng đã có ghi mới, không chạy apply lại để ép dữ liệu cũ lên: đối chiếu thay đổi mới trước. Verify là kiểm chứng bản chuyển ban đầu, không phải health check lâu dài. Việc quay về legacy sau cutover cần phục hồi bản backup đầy đủ và đối chiếu dữ liệu phát sinh, không chỉ đổi biến môi trường.

## Database mới, trống

Điền DB_NAME trỏ đến database trống đã được tạo, rồi chạy:

```powershell
npm run db:core8:setup -- --admin-id=ADMIN_ID --admin-username=ADMIN_USERNAME "--admin-name=Tên quản trị viên" --admin-subject=HRM_SUBJECT
```

Lệnh tạo đúng 8 bảng và admin chỉ định, không nạp dữ liệu demo. Sau đó dùng DB_MODEL=core8. Các trang sơ đồ FE hiện tại cần dataset tham chiếu; setup trống không có các dataset đó. Muốn giữ nguyên giao diện/dữ liệu đang có, dùng luồng chuyển đổi database hiện có ở trên. Cần AUTH_MODE=jwt và cấu hình HRM đúng khi triển khai thật; development không phải SSO production.

### Nạp bộ dữ liệu development vào core8 trống

Sau `db:core8:setup`, có thể nạp snapshot mẫu bằng lệnh tường minh:

```powershell
npm run db:core8:seed-demo -- --maintenance-window --actor=ADMIN_ID --snapshot=data/import/legacy-snapshot.json
```

Lệnh chỉ chạy khi danh mục core8 còn trống, không xóa hoặc ghi đè dữ liệu, chạy trong transaction và có receipt để lần chạy sau không nhân đôi dữ liệu. Bộ snapshot hiện tại thêm 11 tài khoản mẫu, 9 phân hệ và 303 tài liệu gồm cả dữ liệu tham chiếu nội bộ. Tài khoản admin đã tạo bằng `setup` được giữ nguyên. Trong `AUTH_MODE=development`, các tài khoản dùng `DEVELOPMENT_DEMO_PASSWORD`; không dùng cơ chế này ở production.

## API core8

Các API đọc đang dùng được giữ: `/me`, `/me/modules`, `/modules`, `/ui/datasets/:key`, `/ui/workflows`, `/ui/workflows/:id`, `/knowledge-documents`, `/knowledge-documents/:id`, `/knowledge-search`. Danh sách có phân trang và không trả nội dung đầy đủ; chi tiết lấy riêng. BE kiểm quyền trước khi đếm và trả dữ liệu. API trả `{data, pagination}` cho danh sách và `{data}` cho chi tiết tài liệu.

Admin tạo tài liệu qua `POST /knowledge-documents` với `{code,title,type,summary,moduleIds,content}`. Tạo phiên bản qua `POST /knowledge-documents/:id/versions` với `{expectedVersion,content}`; phiên bản cũ giữ nguyên, xung đột cập nhật trả 409. GET cùng đường dẫn xem danh sách phiên bản, GET thêm `/:version` đọc phiên bản (chỉ Admin). Endpoint ghi phát hành ngay, chưa hỗ trợ quy trình duyệt hoặc đặt lịch phát hành trong tương lai. Chưa thêm UI biên soạn mới.

Quyền user: `GET/PUT /admin/users/:id/module-access`, body PUT `{moduleIds:[...]}`. Admin đổi trạng thái hoặc vai trò tài khoản bằng `PATCH /admin/users/:id`. `GrantSource=hrm` được giữ khi Admin thay quyền manual. ReadAllModules là quyền toàn cục cũ; bỏ checkbox module không thu hồi cờ này. Admin cũng xem toàn bộ module. Backend không cho khóa hoặc hạ quyền admin hoạt động cuối cùng. Xác nhận đã đọc dùng GET/PUT `/policy-acknowledgements/:policyId`, body `{acknowledged:true|false}`, lưu AuditLog theo phiên bản. Không được xóa/retention AuditLog tùy tiện vì có cả trạng thái xác nhận đã đọc.

Core8 không đăng ký `/bootstrap`, `/groups`, `/sops` hoặc các API ghi legacy phụ thuộc bảng cũ. Source legacy giữ lại để chuyển đổi, không còn được dùng trong chế độ core8. FE hiện tại tiếp tục dùng API runtime theo từng phần.

## Kiểm thử tích hợp

`scripts/verify-core8.mysql.mjs` chỉ chấp nhận MySQL tạm bind localhost, cổng khác 3306, datadir tên `isop-core8-test-<hex>`. Script nhập snapshot vào DB tạm, chuyển đổi, kiểm chứng hash/quyền, sao chép đúng 8 bảng vào DB tạm thứ hai và chạy API trên đó. Không xóa bảng nguồn và không đọc kết nối `.env` thật. Dùng `ISOP_TEST_MYSQL_PORT` rồi `node --import tsx scripts/verify-core8.mysql.mjs`.

Đã kiểm chứng ngày 05/09/2026 trên MySQL 8.0.46: 289 tài liệu nghiệp vụ, 14 tài liệu tham chiếu, 303 phiên bản; 57 lượt kiểm tra API trên DB chỉ có 8 bảng, bao gồm cấp/thu hồi quyền và phiên bản bất biến. Đã thử cả nguồn legacy chưa chuẩn hóa và nguồn đã chạy migration tài liệu trước đó. Unit/regression: BE 50 test, FE 17 test; typecheck hai phía đạt. FE lint còn 5 cảnh báo có sẵn, không phát sinh lỗi lint mới.
