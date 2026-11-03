import mongoose from 'mongoose';

const MatchHistorySchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      match: /^\d{6}$/, // Luôn là đúng 6 chữ số
      index: true,
    },
    guestId: {
      type: String,
      required: true,
      index: true, // Chỉ mục để truy vấn lịch sử cực nhanh theo từng người chơi ẩn danh
    },
    playerName: {
      type: String,
      required: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: Date.now,
    },
    difficulty: {
      type: Number,
      min: 1,
      max: 6,
      required: true,
    },
    questionCount: {
      type: Number,
      required: true,
    },
    winsCount: {
      type: Number,
      default: 0,
    },
    lossesCount: {
      type: Number,
      default: 0,
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    finalRank: {
      type: Number,
      required: true,
    },
    participants: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Tạo Compound Index để tối ưu tìm kiếm theo guestId sắp xếp theo thời gian mới nhất
MatchHistorySchema.index({ guestId: 1, createdAt: -1 });

export const MatchHistory =
  mongoose.models.MatchHistory || mongoose.model('MatchHistory', MatchHistorySchema);

