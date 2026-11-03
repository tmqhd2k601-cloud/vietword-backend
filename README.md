# HƯỚNG DẪN CẤU HÌNH VÀ TRIỂN KHAI VIETWORD BACKEND (RENDER + MONGODB ATLAS)

Tài liệu này hướng dẫn chi tiết từng bước để cấu hình MongoDB Atlas lưu trữ dữ liệu và triển khai máy chủ Backend VIETWORD lên Render hoàn toàn miễn phí.

---

## 1. HƯỚNG DẪN TẠO MONGODB ATLAS (CƠ SỞ DỮ LIỆU ĐÁM MÂY)

### Bước 1: Đăng ký / Đăng nhập MongoDB Atlas
1. Truy cập [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Tạo tài khoản hoặc đăng nhập bằng Google / GitHub.

### Bước 2: Tạo Cluster miễn phí (M0 Free Tier)
1. Chọn **Create a Deployment** -> Chọn gói **M0 (Free)**.
2. Chọn nhà cung cấp (AWS/Google Cloud) và khu vực gần nhất (ví dụ: `Singapore - ap-southeast-1`).
3. Đặt tên Cluster (mặc định: `Cluster0`) -> Nhấn **Create**.

### Bước 3: Tạo Tài khoản Cơ sở dữ liệu (Database User)
1. Vào menu **Database Access** (ở cột bên trái).
2. Nhấn nút **Add New Database User**.
3. Chọn Authentication Method: **Password**.
4. Đặt **Username** (ví dụ: `vietword_admin`) và **Password** (hãy lưu lại mật khẩu này).
5. Database User Privileges: Chọn **Read and write to any database**.
6. Nhấn **Add User**.

### Bước 4: Mở quyền truy cập mạng (Network Access)
1. Vào menu **Network Access** (ở cột bên trái).
2. Nhấn nút **Add IP Address**.
3. Chọn **Allow Access from Anywhere** (địa chỉ IP sẽ là `0.0.0.0/0`) để backend Render có thể kết nối.
4. Nhấn **Confirm**.

### Bước 5: Lấy chuỗi kết nối (Connection String)
1. Vào menu **Database** (ở cột bên trái) -> Nhấn nút **Connect** bên cạnh Cluster của bạn.
2. Chọn mục **Drivers** (Node.js).
3. Sao chép chuỗi kết nối hiển thị trên màn hình. Định dạng chuẩn:
   ```text
   mongodb+srv://vietword_admin:<password>@cluster0.abcde.mongodb.net/vietword?retryWrites=true&w=majority
   ```
4. Thay `<password>` bằng mật khẩu bạn đã tạo ở Bước 3. Đây chính là giá trị của biến môi trường `MONGODB_URI`.

---

## 2. HƯỚNG DẪN TRIỂN KHAI BACKEND LÊN RENDER (RENDER.COM)

### Bước 1: Đăng ký / Đăng nhập Render
1. Truy cập [https://render.com](https://render.com) và đăng nhập bằng GitHub/GitLab/Email.

### Bước 2: Tạo Web Service mới
1. Trên Render Dashboard, nhấn nút **New +** ở góc trên bên phải -> Chọn **Web Service**.
2. Chọn repository chứa dự án của bạn (hoặc tạo repository riêng cho thư mục `backend`).
3. Điền các thông số:
   - **Name**: `vietword-backend`
   - **Region**: `Singapore` (hoặc khu vực gần bạn nhất)
   - **Branch**: `main`
   - **Root Directory**: `backend` (nếu repo chứa cả frontend và backend) hoặc để trống nếu repo chỉ có backend.
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Instance Type**: `Free`

### Bước 3: Cấu hình biến môi trường (Environment Variables)
Trong phần **Environment Variables**, thêm các cặp khóa - giá trị sau:
1. `NODE_ENV` = `production`
2. `CLIENT_URL` = `*`
3. `MONGODB_URI` = Dán chuỗi kết nối MongoDB Atlas bạn đã lấy ở Phần 1 (đã thay mật khẩu thật).

### Bước 4: Triển khai và lấy URL Backend
1. Nhấn nút **Create Web Service**.
2. Render sẽ tự động cài đặt thư viện và khởi chạy server.
3. Khi màn hình hiện `Server đang lắng nghe tại cổng...`, hãy sao chép đường link Web Service của bạn ở phía trên bên trái (ví dụ: `https://vietword-backend.onrender.com`).

---

## 3. CÁCH ĐIỀN ĐỊA CHỈ BACKEND VÀO GAME VIETWORD

1. Mở ứng dụng VIETWORD (Desktop hoặc Web).
2. Tại màn hình chính, nhấn nút **Chơi Online**.
3. Trong popup Online, nhấn vào biểu tượng **Máy chủ (Server)** ở thanh kết nối.
4. Dán link Render của bạn vào ô địa chỉ (ví dụ: `https://vietword-backend.onrender.com`) -> Nhấn **Lưu**.
5. Đèn trạng thái sẽ chuyển sang màu xanh lá: **Đã kết nối máy chủ VIETWORD**.

---

## 4. CHẠY THỬ BACKEND DƯỚI LOCAL (MÁY CÁ NHÂN)

Nếu bạn muốn chạy thử nghiệm trên máy trước khi đưa lên Render:

1. Mở terminal tại thư mục `backend`:
   ```bash
   cd backend
   npm install
   npm start
   ```
2. Server sẽ chạy tại: `http://localhost:5000`.
3. Nếu chưa có MongoDB Atlas, backend sẽ tự động chuyển sang chế độ **In-Memory Storage** để bạn thử nghiệm tạo phòng và thi đấu ngay lập tức mà không bị gián đoạn.

