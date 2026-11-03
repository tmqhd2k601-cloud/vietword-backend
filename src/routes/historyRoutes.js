import express from 'express';
import { getPlayerHistory, importPlayerHistory } from '../services/roomManager.js';

const router = express.Router();

// Lấy danh sách lịch sử trận đấu theo guestId
router.get('/:guestId', async (req, res) => {
  try {
    const { guestId } = req.params;
    const { filter, difficulty, page, limit } = req.query;

    const data = await getPlayerHistory(guestId, {
      filter,
      difficulty,
      page,
      limit,
    });

    return res.json({ success: true, ...data });
  } catch (err) {
    console.error('Lỗi API get history:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server khi truy xuất lịch sử!' });
  }
});

// Nhập mã khôi phục lịch sử từ thiết bị cũ
router.post('/import', async (req, res) => {
  try {
    const { oldGuestId, currentGuestId } = req.body;
    if (!oldGuestId || !currentGuestId) {
      return res.status(400).json({ success: false, message: 'Thiếu mã khôi phục hoặc ID thiết bị hiện tại!' });
    }

    const result = await importPlayerHistory(oldGuestId.trim(), currentGuestId.trim());
    return res.json(result);
  } catch (err) {
    console.error('Lỗi API import history:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server khi khôi phục lịch sử!' });
  }
});

export default router;

