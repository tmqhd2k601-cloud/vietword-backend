import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('<username>')) {
    console.warn('⚠️ [MongoDB] Chưa cấu hình MONGODB_URI hợp lệ trong biến môi trường!');
    console.warn('ℹ️ [MongoDB] Backend sẽ hoạt động ở chế độ In-Memory Storage tạm thời.');
    return false;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('✅ [MongoDB Atlas] Kết nối cơ sở dữ liệu thành công!');
    return true;
  } catch (error) {
    console.error('❌ [MongoDB Atlas] Lỗi kết nối:', error.message);
    console.warn('ℹ️ [MongoDB] Chuyển sang cơ chế lưu trữ In-Memory dự phòng.');
    isConnected = false;
    return false;
  }
}

export function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

