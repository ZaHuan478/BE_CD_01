# Chạy HRM SOP với MySQL và SQL Server

Backend giữ MySQL làm nguồn và phương án quay lui. Biến `DB_PROVIDER` chọn database đang phục vụ API; nó không tự sao chép dữ liệu.

Database SQL Server mới được tạo với collation `Latin1_General_100_CI_AI_SC`: hỗ trợ Unicode, tìm kiếm không phân biệt hoa/thường và dấu, đồng thời giữ cách phân giải tên bảng ổn định. Công cụ chuyển đổi khôi phục tên bảng Core8 theo PascalCase mà source code sử dụng.

## 1. Chuẩn bị SQL Server

1. Bật giao thức TCP/IP cho instance SQL Server.
2. Chọn cổng tĩnh, khuyến nghị `1433`, rồi khởi động lại dịch vụ SQL Server.
3. Tạo SQL Login có quyền kết nối. Lệnh chuyển dữ liệu cần quyền tạo database nếu `SQLSERVER_CREATE_DATABASE=true`, hoặc quyền tạo bảng, index, khóa ngoại và đọc/ghi trên database đã có.
4. Không dùng database thật của công ty cho lần thử đầu. Dùng database riêng như `hrm_sop_sqlserver`.

## 2. Cấu hình hai database

```env
DB_PROVIDER=mysql
DB_MODEL=core8

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=hrm_sop
MYSQL_USER=hrm_sop_app
MYSQL_PASSWORD=...
MYSQL_POOL_MAX=10

SQLSERVER_HOST=127.0.0.1
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=hrm_sop_sqlserver
SQLSERVER_USER=hrm_sop_app
SQLSERVER_PASSWORD=...
SQLSERVER_POOL_MAX=10
SQLSERVER_ENCRYPT=false
SQLSERVER_TRUST_SERVER_CERTIFICATE=true
SQLSERVER_REQUEST_TIMEOUT_MS=30000
SQLSERVER_TRANSFER_REQUEST_TIMEOUT_MS=120000
SQLSERVER_CREATE_DATABASE=false
```

Các biến `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` cũ vẫn được dùng làm fallback cho MySQL. Nên chuyển dần sang nhóm biến `MYSQL_*` để file cấu hình dễ đọc.

## 3. Chuyển schema và dữ liệu

```powershell
cd "D:\LTA_HRUX\CD-01. AddUser\BackEnd"
npm run db:transfer:mysql-to-sqlserver
```

Lệnh này:

- đọc schema thực tế của MySQL thay vì dựa vào seed;
- tạo những bảng SQL Server chưa có;
- đổi kiểu MySQL sang `NVARCHAR`, `BIT`, `DATETIME2`, `IDENTITY` và các kiểu SQL Server tương ứng;
- giữ nguyên UUID và mã định danh;
- upsert dữ liệu theo primary key hoặc unique key, nên có thể chạy lại;
- tạo index và foreign key sau khi chép dữ liệu;
- so sánh số dòng nguồn và đích;
- không xóa dữ liệu dư ở SQL Server;
- không upload lại PDF/DOCX. URL Cloudinary và storage key được giữ nguyên như metadata.

Nếu database đích chưa tồn tại, tạo trước hoặc đặt `SQLSERVER_CREATE_DATABASE=true` cho đúng lần chạy tạo database.

## 4. Chạy UAT trên SQL Server

Sau khi lệnh chuyển dữ liệu báo `Transfer verified`, đổi:

```env
DB_PROVIDER=sqlserver
DB_INITIALIZE_ON_START=false
PORT=3001
```

Khởi động Backend:

```powershell
npm run start
```

Kiểm tra lần lượt `/health`, `/ready`, đăng nhập, phân quyền, tài liệu, chuyển hóa, canvas, phê duyệt/công bố, thư viện SOP, RAG và trang quản trị.

Frontend không cần đổi cấu trúc. Khi chạy UAT song song, chỉ trỏ proxy/API sang Backend SQL Server ở cổng `3001`.

## 5. Chuyển chính thức và quay lui

Khi UAT đạt, đặt `DB_PROVIDER=sqlserver` ở Backend chính và dùng cổng hiện tại. Nếu có lỗi cần quay lui, đặt lại:

```env
DB_PROVIDER=mysql
```

Không bật ghi đồng thời vào MySQL và SQL Server trong giai đoạn đầu. Sau khi chuyển chính thức, cần có một khoảng dừng ghi ngắn và chạy lại lệnh chuyển lần cuối để tránh thiếu những thay đổi phát sinh trong lúc UAT.

## 6. Tạo backup SQL Server

Trên máy Windows đang chạy SQL Server, tạo và kiểm tra một bản full backup bằng:

```powershell
npm run db:backup:sqlserver
```

Mặc định file `.bak` được lưu tại `Backups/SQLServer` trong Backend. Muốn chọn thư mục khác:

```powershell
npm run db:backup:sqlserver -- --OutputDirectory "D:\DatabaseBackups\HRM-SOP"
```

Lệnh dùng `COPY_ONLY`, `CHECKSUM` và chạy `RESTORE VERIFYONLY`; vì vậy không làm thay đổi chuỗi backup định kỳ đang có và chỉ báo thành công sau khi SQL Server xác nhận file hợp lệ.
