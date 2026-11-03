import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import roomRoutes from './routes/roomRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import { setupGameSocket } from './sockets/gameSocket.js';
import { loadPhrases } from './services/phraseService.js';

// Nạp biến môi trường
dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || '*';

// Cấu hình Middleware
app.use(
  cors({
    origin: CLIENT_URL === '*' ? true : CLIENT_URL.split(','),
    credentials: true,
  })
);
app.use(express.json());

// Cấu hình Socket.IO với CORS mở rộng (hỗ trợ cả Web browser, Electron, Render)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

// Khởi tạo các Route REST API
app.use('/api/rooms', roomRoutes);
app.use('/api/history', historyRoutes);

// Health check endpoint cho Render
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'VIETWORD Multiplayer Backend',
  });
});

// Trang chào mừng khi truy cập trực tiếp URL backend
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #100D18; color: #fff; min-height: 100vh;">
      <h1 style="color: #9870E8;">VIETWORD Multiplayer Backend</h1>
      <p style="color: #F2B600;">Server đang hoạt động ổn định trên Render!</p>
      <p style="color: #8F85A3;">Sẵn sàng kết nối WebSocket Socket.IO và REST API cho cả Web & Electron.</p>
    </div>
  `);
});

// Cài đặt Socket.IO cho trận đấu
setupGameSocket(io);

// Khởi chạy server
async function startServer() {
  // Tải kho từ vựng tiếng Việt
  loadPhrases();

  // Kết nối MongoDB Atlas (có fallback In-memory)
  await connectDB();

  server.listen(PORT, () => {
    console.log(`🚀 [VIETWORD Backend] Server đang lắng nghe tại cổng ${PORT}`);
    console.log(`🌐 [Render/Local] http://localhost:${PORT}`);
  });
}

startServer();

// Xử lý dừng server an toàn
process.on('SIGTERM', () => {
  console.log('🛑 Nhận tín hiệu SIGTERM, đang đóng server an toàn...');
  server.close(() => {
    console.log('✅ Server đã đóng.');
    process.exit(0);
  });
});

