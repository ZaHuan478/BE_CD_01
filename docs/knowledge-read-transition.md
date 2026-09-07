# Chuyển sang đọc dữ liệu theo nhu cầu và bảng tài liệu

## Trạng thái triển khai

1. Đã chốt hợp đồng đọc riêng, không thay ý nghĩa API `/documents` cũ (metadata tệp).
2. Đã triển khai adapter đọc từ AppConfig theo dataset, chỉ mục workflow và chi tiết workflow riêng.
3. FE không gọi `/bootstrap` nữa. Đăng nhập chỉ chờ `/me`; dữ liệu màn hình tải sau, có loading/error/retry và cache theo phiên.
4. Đã có migration cộng thêm, kế hoạch chuyển đổi, áp dụng bằng fingerprint và đối chiếu dữ liệu sau nhập.
5. Đã loại bỏ bootstrap client của FE. `/bootstrap` của BE được đánh dấu deprecated, vẫn giữ cho client cũ. CHƯA xóa bảng cũ.

Không thay `.env`, không chạy migration lên DB người dùng trong lần triển khai này. Kiểm thử MySQL dùng một instance tạm riêng.

## Năm bảng nghiệp vụ cốt lõi

| Khái niệm | Bảng thực tế |
| --- | --- |
| Người dùng | Account (tái sử dụng, không nhân đôi user) |
| Phân hệ | HrModule (tái sử dụng ID và quyền hiện tại) |
| Quyền người dùng–phân hệ | AccountModuleAccess (quyền từ nhóm cũ vẫn được tính) |
| Tài liệu nghiệp vụ | KnowledgeDocument (mới) |
| Tài liệu–phân hệ | KnowledgeDocumentModule (mới) |

Đây là mô hình lõi đích, không có nghĩa DB hiện tại đã chỉ còn 5 bảng. Các bảng grant nhóm, lịch sử, xác nhận, tệp đính kèm và cấu hình chưa được xóa. Không đổi tên Account/HrModule chỉ để làm đẹp tên bảng, tránh làm hỏng SSO và các API quản trị hiện có.

Quy tắc đọc: có quyền `sop.read` của ít nhất một phân hệ được xuất bản mà tài liệu thuộc về. Quyền hệ thống bao phủ các phân hệ được xuất bản. Quyền cho một SOP riêng lẻ không mở rộng thành quyền đọc toàn bộ phân hệ. API v1 SOP hiện có vẫn xử lý các grant SOP riêng; API đọc mới tập trung vào quyền user–module đã thống nhất.

SOP trong từng workflow và quy định là các tài liệu riêng, phân biệt bằng `DocumentType`. Các bước, checklist, quy tắc, nguồn, phiên bản quy định và thông tin có sẵn được giữ nguyên trong `ContentJson`. ID được tạo ổn định từ dataset + workflow + mã SOP; không gộp tài liệu chỉ vì trùng mã. `ContentHash` dùng JSON chuẩn hóa thứ tự key để đối chiếu với JSON do MySQL lưu.

Việc nhập này không tạo lịch sử phiên bản không tồn tại ở nguồn. SopVersion, PolicyAcknowledgement, AuditLog hiện có vẫn giữ nguyên. Chưa chuyển GuidanceArticle/Document/DocumentLink hoặc các dataset sơ đồ thành tài liệu mới; các nguồn này vẫn dùng API cũ và phải được rà soát riêng trước khi dọn bảng.

## API (prefix `/api/v1`)

| Endpoint | Mục đích |
| --- | --- |
| GET /me | User, quyền, menu, phân hệ; không kèm kho nội dung |
| GET /ui/datasets/:key | Một dataset trong allowlist, lọc quyền trên BE |
| GET /ui/workflows | Chỉ mục cho menu, thống kê; không có description/location/timing của bước |
| GET /ui/workflows/:workflowId | Nội dung đầy đủ của workflow được phép xem |
| GET /knowledge-documents?moduleId=pay&page=1&pageSize=20 | Danh sách tài liệu tóm tắt |
| GET /knowledge-documents/:documentId | Nội dung đầy đủ một tài liệu; không tìm thấy hoặc không được phép đều trả 404 |
| GET /knowledge-search?q=...&type=procedure&page=1&pageSize=6 | Tìm kiếm phía BE, có phân trang |

Danh sách/tìm kiếm trả `{ data: [...], pagination: { page, pageSize, total } }`. Chi tiết/dataset trả `{ data: ... }`. `pageSize` từ 1–100, mặc định 20. Quyền được lọc trước tổng số và phân trang. Response dùng `Cache-Control: private, no-store`. FE có cache trong bộ nhớ theo phiên, không lưu kho tài liệu vào localStorage.

`/ui/*` là adapter tương thích cho giao diện sơ đồ hiện tại, vẫn đọc AppConfig. Các dataset nặng chỉ được tải khi màn hình đọc chúng. Chỉ mục workflow vẫn có metadata bước/checklist phục vụ các bảng tổng quan cũ, nên lớn hơn API danh sách tài liệu phân trang; đây chưa phải thiết kế catalog tối giản cuối cùng.

`KNOWLEDGE_READ_SOURCE=legacy` (mặc định): `/knowledge-documents` và `/knowledge-search` đọc adapter từ AppConfig. `normalized`: hai API này đọc KnowledgeDocument/KnowledgeDocumentModule, lọc quyền và phân trang trong MySQL. Các API cũ và `/ui/*` không đổi nguồn khi bật cờ này. Không đồng bộ hai chiều và không âm thầm fallback sang nguồn cũ nếu nguồn mới lỗi.

## Áp dụng vào MySQL của bạn

Luôn sao lưu trước. Điền kết nối trong `.env` theo `.env.example`; không đưa mật khẩu vào Git.

- DB mới: `npm run db:setup` để tạo schema và nhập snapshot nếu đã cấu hình.
- DB đang có dữ liệu: `npm run db:migrate` chỉ cập nhật schema; không ghi đè bằng snapshot.
- Trong thời gian đối chiếu/chuyển nguồn, tạm ngừng chỉnh sửa dữ liệu nghiệp vụ liên quan.

Chạy tại thư mục BackEnd:

```powershell
# 1. Chỉ đọc nguồn đang có trong MySQL; xem counts, unresolved và fingerprint.
npm run db:knowledge:plan

# 2. Chỉ khi unresolved rỗng và đã kiểm tra kế hoạch.
npm run db:knowledge:apply -- --fingerprint=DIEN_FINGERPRINT_TU_KE_HOACH_LIVE

# 3. Đối chiếu nội dung, metadata, ID và toàn bộ liên kết phân hệ.
npm run db:knowledge:verify
```

Sau khi verify thành công, tự đặt `KNOWLEDGE_READ_SOURCE=normalized` trong `.env` rồi khởi động lại BE. Không dùng fingerprint snapshot thay cho kế hoạch live. Để quay lại đọc nguồn cũ, đặt lại `legacy` và khởi động lại; không cần xóa dữ liệu mới.

Nếu chưa có kết nối DB, có thể kiểm tra snapshot ngoại tuyến:

```powershell
npm run db:knowledge:plan -- --snapshot data/import/legacy-snapshot.json
```

Apply không nhận snapshot ngoại tuyến: luôn đọc nguồn live trong transaction. Nếu nguồn đã đổi so với fingerprint, có liên kết không ánh xạ được, dữ liệu đích khác nguồn hoặc đối chiếu thất bại thì dừng/rollback; không overwrite. Chạy lại khi đích đã trùng khớp sẽ kiểm tra rồi bỏ qua. Migration DDL của MySQL tự commit; rollback được bảo đảm cho phần nhập DML, không phải việc tạo bảng.

## Điều kiện trước khi xóa bảng cũ

Không có lệnh DROP trong đợt này. Chỉ dọn sau khi:

1. Đã đổi hết các consumer/API quản trị cần thiết sang nguồn mới và ngừng ghi nguồn cũ.
2. Đã chuyển/đối chiếu quyền từ nhóm mà không làm mất quyền giới hạn theo thời gian hay quyền SOP riêng.
3. Đã xử lý phiên bản, xác nhận đã đọc, tệp và liên kết còn tham chiếu các bảng cũ.
4. Có backup, kiểm tra quyền theo từng user và kế hoạch rollback được duyệt.

## Kiểm thử

`npm run typecheck`, `npm run lint`, `npm test` không cần ghi vào DB người dùng.

`scripts/verify-knowledge.mysql.mjs` là bài kiểm tra opt-in trên MySQL tạm, từ chối instance có datadir ngoài `isop-knowledge-test-*` hoặc cổng 3306. Kiểm tra import, rerun idempotent, fingerprint thay đổi, tính toàn vẹn và đối chiếu API giữa hai nguồn theo các user khác quyền. Instance tạm được tắt sau bài kiểm tra.

Kết quả từ snapshot local: 282 quy trình + 7 quy định = 289 tài liệu, 749 liên kết, 0 ánh xạ thiếu. Đây không phải kết quả kiểm đếm DB live của bạn.
