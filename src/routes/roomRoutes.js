import express from 'express';
import { checkRoom, getRoom, getClientRoomState } from '../services/roomManager.js';

const router = express.Router();

// Kiểm tra phòng bằng ID 6 số
router.get('/check/:roomId', (req, res) => {
  const { roomId } = req.params;
  const result = checkRoom(roomId);
  return res.json(result);
});

// Lấy thông tin phòng (an toàn)
router.get('/info/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ success: false, message: 'Phòng không tồn tại!' });
  }
  return res.json({ success: true, room: getClientRoomState(room) });
});

export default router;

