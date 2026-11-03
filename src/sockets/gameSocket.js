import {
  createRoom,
  checkRoom,
  joinRoom,
  getClientRoomState,
  getRoom,
  findRoomBySocketId,
  handlePlayerLeave,
  startRoomGame,
  prepareNextRound,
  handlePlayerGuess,
  saveMatchResults,
} from '../services/roomManager.js';

export function setupGameSocket(io) {
  io.on('connection', socket => {
    console.log(`🔌 [Socket.IO] Client kết nối: ${socket.id}`);

    // 1. TẠO PHÒNG
    socket.on('create_room', (data, callback) => {
      try {
        const { guestId, playerName, roomName, questionCount, difficulty, timeLimit, maxPlayers } = data;
        const room = createRoom({
          guestId,
          playerName,
          roomName,
          questionCount,
          difficulty,
          timeLimit,
          maxPlayers,
          socketId: socket.id,
        });

        socket.join(room.roomId);

        const safeState = getClientRoomState(room);
        if (typeof callback === 'function') {
          callback({ success: true, room: safeState });
        }

        io.to(room.roomId).emit('room_state', safeState);
      } catch (err) {
        console.error('Lỗi create_room:', err);
        if (typeof callback === 'function') callback({ success: false, message: err.message });
      }
    });

    // 2. KIỂM TRA PHÒNG THEO ID 6 CHỮ SỐ
    socket.on('check_room', ({ roomId }, callback) => {
      const res = checkRoom(roomId);
      if (typeof callback === 'function') callback(res);
    });

    // 3. THAM GIA PHÒNG
    socket.on('join_room', (data, callback) => {
      try {
        const { roomId, guestId, playerName } = data;
        const res = joinRoom({ roomId, guestId, playerName, socketId: socket.id });

        if (!res.success) {
          if (typeof callback === 'function') callback({ success: false, message: res.message });
          return;
        }

        socket.join(roomId);

        const safeState = getClientRoomState(res.room);
        if (typeof callback === 'function') {
          callback({ success: true, room: safeState });
        }

        // Broadcast cho tất cả mọi người trong phòng
        io.to(roomId).emit('room_state', safeState);
        io.to(roomId).emit('chat_announcement', {
          type: 'info',
          message: `${playerName} đã tham gia phòng chơi!`,
        });
      } catch (err) {
        console.error('Lỗi join_room:', err);
        if (typeof callback === 'function') callback({ success: false, message: err.message });
      }
    });

    // 4. BẬT / TẮT TRẠNG THÁI SẴN SÀNG
    socket.on('toggle_ready', ({ roomId, isReady }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.status !== 'waiting') return;

      const player = room.players.get(socket.id);
      if (player && !player.isHost) {
        player.isReady = Boolean(isReady);
        const safeState = getClientRoomState(room);
        io.to(roomId).emit('room_state', safeState);
        if (typeof callback === 'function') callback({ success: true, isReady: player.isReady });
      }
    });

    // 5. BẮT ĐẦU TRẬN ĐẤU (CHỈ CHỦ PHÒNG)
    socket.on('start_game', ({ roomId }, callback) => {
      const room = getRoom(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player || !player.isHost) {
        if (typeof callback === 'function') callback({ success: false, message: 'Chỉ chủ phòng mới được bắt đầu trận đấu!' });
        return;
      }

      const res = startRoomGame(roomId);
      if (!res.success) {
        if (typeof callback === 'function') callback({ success: false, message: res.message });
        return;
      }

      if (typeof callback === 'function') callback({ success: true });

      // Khởi động vòng chơi số 1
      startRound(room, io);
    });

    // 6. NỘP CÂU ĐOÁN
    socket.on('submit_guess', ({ roomId, guessText }, callback) => {
      try {
        const res = handlePlayerGuess(roomId, socket.id, guessText);
        if (!res.success) {
          if (typeof callback === 'function') callback({ success: false, message: res.message });
          return;
        }

        // Trả về feedback riêng cho người vừa đoán (không lộ cho đối thủ)
        if (typeof callback === 'function') {
          callback({
            success: true,
            evaluation: res.evaluation,
            guessesUsed: res.guessesUsed,
          });
        }

        // Broadcast cập nhật trạng thái chung của phòng (tiến độ các người chơi)
        const safeState = getClientRoomState(res.room);
        io.to(roomId).emit('room_state', safeState);

        // Nếu câu hỏi kết thúc (có người đoán đúng hoặc tất cả đều hết lượt)
        if (res.roundEnded) {
          endRound(res.room, io);
        }
      } catch (err) {
        console.error('Lỗi submit_guess:', err);
        if (typeof callback === 'function') callback({ success: false, message: err.message });
      }
    });

    // 7. RỜI PHÒNG
    socket.on('leave_room', () => {
      disconnectOrLeave(socket, io);
    });

    // 8. NGẮT KẾT NỐI
    socket.on('disconnect', () => {
      disconnectOrLeave(socket, io);
    });
  });
}

function disconnectOrLeave(socket, io) {
  const result = handlePlayerLeave(socket.id);
  if (!result) return;

  if (result.roomClosed) {
    io.to(result.roomId).emit('room_closed', { message: 'Phòng đã bị đóng do không còn người chơi.' });
  } else if (result.room) {
    const safeState = getClientRoomState(result.room);
    io.to(result.room.roomId).emit('room_state', safeState);
  }
}

/**
 * Bắt đầu một vòng chơi (câu hỏi)
 */
function startRound(room, io) {
  prepareNextRound(room);

  // Dọn dẹp timer cũ nếu có
  if (room.roundTimer) clearInterval(room.roundTimer);
  if (room.roundTransitionTimer) clearTimeout(room.roundTransitionTimer);

  const safeState = getClientRoomState(room);
  io.to(room.roomId).emit('round_started', safeState);

  // Đếm ngược thời gian nếu có timeLimit
  if (room.timeLimit > 0) {
    room.roundTimeRemaining = room.timeLimit;
    room.roundTimer = setInterval(() => {
      room.roundTimeRemaining--;

      io.to(room.roomId).emit('timer_tick', {
        timeRemaining: room.roundTimeRemaining,
      });

      if (room.roundTimeRemaining <= 0) {
        clearInterval(room.roundTimer);
        // Hết thời gian mà chưa ai giải được -> Kết thúc câu này
        room.status = 'round_finished';
        for (const p of room.players.values()) {
          if (!p.hasWonRound) p.losses += 1;
        }
        endRound(room, io);
      }
    }, 1000);
  }
}

/**
 * Kết thúc một câu hỏi và chuẩn bị chuyển câu tiếp theo hoặc kết thúc trận đấu
 */
function endRound(room, io) {
  if (room.roundTimer) clearInterval(room.roundTimer);

  const currentQ = room.questions[room.currentQuestionIndex];
  const safeState = getClientRoomState(room);

  // Thông báo kết thúc câu hỏi và công bố đáp án
  io.to(room.roomId).emit('round_finished', {
    ...safeState,
    revealedAnswer: currentQ.secretPhrase,
    definition: currentQ.definition,
    category: currentQ.category,
    winner: room.roundWinner,
  });

  // Kiểm tra xem đã hết số câu hỏi chưa
  if (room.currentQuestionIndex + 1 >= room.questions.length) {
    // Trận đấu kết thúc!
    room.roundTransitionTimer = setTimeout(async () => {
      room.status = 'game_over';
      const matchResult = await saveMatchResults(room);

      const finalState = getClientRoomState(room);
      io.to(room.roomId).emit('game_over', {
        ...finalState,
        rankings: matchResult.rankings.map(p => ({
          guestId: p.guestId,
          name: p.name,
          score: p.score,
          wins: p.wins,
          losses: p.losses,
          rank: p.finalRank,
        })),
        matchId: matchResult.matchId,
      });
    }, 5000); // Đợi 5 giây xem đáp án rồi tổng kết trận
  } else {
    // Chuyển sang câu hỏi tiếp theo sau 5 giây
    room.roundTransitionTimer = setTimeout(() => {
      room.currentQuestionIndex++;
      startRound(room, io);
    }, 5000);
  }
}

