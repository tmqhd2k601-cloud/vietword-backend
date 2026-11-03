import { pickRandomQuestions } from './phraseService.js';
import { evaluateServerGuess } from './gameEngine.js';
import { MatchHistory } from '../models/MatchHistory.js';
import { isDBConnected } from '../config/db.js';

// Danh sách phòng đang hoạt động trong RAM
const activeRooms = new Map();

// Bộ lưu trữ lịch sử in-memory dự phòng khi chưa kết nối MongoDB Atlas
const inMemoryHistory = [];

/**
 * Sinh ID phòng gồm ĐÚNG 6 CHỮ SỐ ngẫu nhiên (từ 100000 đến 999999).
 * Đảm bảo không trùng với bất kỳ phòng nào đang hoạt động.
 */
export function generateUniqueRoomId() {
  let roomId = '';
  let attempts = 0;
  do {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
    if (attempts > 1000) break;
  } while (activeRooms.has(roomId));

  return roomId;
}

/**
 * Tạo một phòng chơi mới
 */
export function createRoom({
  guestId,
  playerName,
  roomName,
  questionCount = 5,
  difficulty = 2,
  timeLimit = 120,
  maxPlayers = 4,
  socketId,
}) {
  const roomId = generateUniqueRoomId();
  const safeRoomName = roomName?.trim() || `Phòng của ${playerName}`;

  const hostPlayer = {
    guestId,
    socketId,
    name: playerName.trim() || 'Người chơi ẩn danh',
    isHost: true,
    isReady: true, // Chủ phòng luôn sẵn sàng
    score: 0,
    wins: 0,
    losses: 0,
    guessesUsedInRound: 0,
    hasWonRound: false,
    hasLostRound: false,
    currentRoundFeedback: [],
    isConnected: true,
    joinedAt: new Date(),
  };

  const room = {
    roomId, // ĐÚNG 6 CHỮ SỐ
    roomName: safeRoomName,
    difficulty: Number(difficulty) || 2,
    questionCount: Number(questionCount) || 5,
    timeLimit: Number(timeLimit) || 120, // Giây
    maxPlayers: Math.min(10, Math.max(2, Number(maxPlayers) || 4)),
    status: 'waiting', // 'waiting' | 'playing' | 'round_finished' | 'game_over'
    hostId: guestId,
    createdAt: new Date(),
    startedAt: null,
    players: new Map([[socketId, hostPlayer]]),
    questions: [],
    currentQuestionIndex: 0,
    roundTimer: null,
    roundTimeRemaining: 0,
    roundWinner: null,
    roundTransitionTimer: null,
  };

  activeRooms.set(roomId, room);
  console.log(`🏠 [Room] Đã tạo phòng mới ID: ${roomId} bởi ${playerName} (${guestId})`);
  return room;
}

/**
 * Kiểm tra xem phòng có hợp lệ để tham gia không
 */
export function checkRoom(roomId) {
  if (!roomId || !/^\d{6}$/.test(roomId)) {
    return { valid: false, message: 'ID phòng phải gồm đúng 6 chữ số!' };
  }

  const room = activeRooms.get(roomId);
  if (!room) {
    return { valid: false, message: `Không tìm thấy phòng số ${roomId}!` };
  }

  if (room.status !== 'waiting') {
    return { valid: false, message: 'Phòng này đã bắt đầu trận đấu hoặc đã kết thúc!' };
  }

  const activeCount = Array.from(room.players.values()).filter(p => p.isConnected).length;
  if (activeCount >= room.maxPlayers) {
    return { valid: false, message: 'Phòng đã đủ số lượng người chơi tối đa!' };
  }

  return {
    valid: true,
    room: {
      roomId: room.roomId,
      roomName: room.roomName,
      difficulty: room.difficulty,
      questionCount: room.questionCount,
      timeLimit: room.timeLimit,
      maxPlayers: room.maxPlayers,
      currentPlayers: activeCount,
    },
  };
}

/**
 * Cho người chơi tham gia phòng bằng ID 6 số
 */
export function joinRoom({ roomId, guestId, playerName, socketId }) {
  const check = checkRoom(roomId);
  if (!check.valid) {
    return { success: false, message: check.message };
  }

  const room = activeRooms.get(roomId);

  // Kiểm tra xem socketId đã có trong phòng chưa
  const existingPlayer = room.players.get(socketId);
  if (existingPlayer) {
    existingPlayer.isConnected = true;
    return { success: true, room };
  }

  const newPlayer = {
    guestId,
    socketId,
    name: playerName.trim() || 'Người chơi ẩn danh',
    isHost: false,
    isReady: false,
    score: 0,
    wins: 0,
    losses: 0,
    guessesUsedInRound: 0,
    hasWonRound: false,
    hasLostRound: false,
    currentRoundFeedback: [],
    isConnected: true,
    joinedAt: new Date(),
  };

  room.players.set(socketId, newPlayer);
  console.log(`👤 [Room] ${playerName} đã vào phòng ${roomId}`);
  return { success: true, room };
}

/**
 * Lấy object trạng thái phòng an toàn để gửi cho Client (KHÔNG LỘ ĐÁP ÁN)
 */
export function getClientRoomState(room) {
  if (!room) return null;

  const playersList = Array.from(room.players.values())
    .filter(p => p.isConnected)
    .map(p => ({
      guestId: p.guestId,
      socketId: p.socketId,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      score: p.score,
      wins: p.wins,
      losses: p.losses,
      guessesCount: p.guessesUsedInRound,
      hasWonRound: p.hasWonRound,
      hasLostRound: p.hasLostRound,
    }));

  const currentQ = room.questions[room.currentQuestionIndex];
  let publicQuestion = null;

  if (currentQ && (room.status === 'playing' || room.status === 'round_finished')) {
    publicQuestion = {
      questionIndex: currentQ.questionIndex,
      totalQuestions: currentQ.totalQuestions,
      wordLengths: currentQ.wordLengths,
      wordCount: currentQ.wordCount,
      totalChars: currentQ.totalChars,
      difficulty: currentQ.difficulty,
      // Chỉ khi kết thúc câu hỏi thì mới tiết lộ đáp án thật!
      revealedAnswer:
        room.status === 'round_finished' || room.status === 'game_over'
          ? currentQ.secretPhrase
          : null,
      definition:
        room.status === 'round_finished' || room.status === 'game_over'
          ? currentQ.definition
          : null,
      category:
        room.status === 'round_finished' || room.status === 'game_over'
          ? currentQ.category
          : null,
    };
  }

  return {
    roomId: room.roomId,
    roomName: room.roomName,
    difficulty: room.difficulty,
    questionCount: room.questionCount,
    timeLimit: room.timeLimit,
    maxPlayers: room.maxPlayers,
    status: room.status,
    hostId: room.hostId,
    players: playersList,
    currentQuestion: publicQuestion,
    roundTimeRemaining: room.roundTimeRemaining,
    roundWinner: room.roundWinner,
  };
}

/**
 * Tìm phòng theo ID
 */
export function getRoom(roomId) {
  return activeRooms.get(roomId);
}

/**
 * Tìm phòng theo socketId của người chơi
 */
export function findRoomBySocketId(socketId) {
  for (const room of activeRooms.values()) {
    if (room.players.has(socketId)) {
      return room;
    }
  }
  return null;
}

/**
 * Xử lý khi người chơi rời phòng hoặc ngắt kết nối
 */
export function handlePlayerLeave(socketId) {
  const room = findRoomBySocketId(socketId);
  if (!room) return null;

  const player = room.players.get(socketId);
  room.players.delete(socketId);

  console.log(`👋 [Room] ${player?.name || 'Ai đó'} đã rời phòng ${room.roomId}`);

  // Nếu không còn ai trong phòng, dọn dẹp và xóa phòng
  const remainingPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
  if (remainingPlayers.length === 0) {
    if (room.roundTimer) clearInterval(room.roundTimer);
    if (room.roundTransitionTimer) clearTimeout(room.roundTransitionTimer);
    activeRooms.delete(room.roomId);
    console.log(`🧹 [Room] Đã xóa phòng trống ${room.roomId}`);
    return { roomClosed: true, roomId: room.roomId };
  }

  // Nếu chủ phòng rời đi, chuyển quyền chủ phòng cho người tiếp theo
  if (player?.isHost) {
    const nextHost = remainingPlayers[0];
    nextHost.isHost = true;
    nextHost.isReady = true;
    room.hostId = nextHost.guestId;
    console.log(`👑 [Room] Chuyển quyền chủ phòng ${room.roomId} cho ${nextHost.name}`);
  }

  return { roomClosed: false, room };
}

/**
 * Bắt đầu trận đấu (Chỉ chủ phòng mới được kích hoạt)
 */
export function startRoomGame(roomId) {
  const room = activeRooms.get(roomId);
  if (!room) return { success: false, message: 'Phòng không tồn tại!' };

  const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
  if (connectedPlayers.length < 2) {
    return { success: false, message: 'Cần ít nhất 2 người chơi để bắt đầu trận đấu Online!' };
  }

  // Chọn bộ câu hỏi bí mật từ kho từ vựng
  room.questions = pickRandomQuestions(room.difficulty, room.questionCount);
  room.currentQuestionIndex = 0;
  room.status = 'playing';
  room.startedAt = new Date();

  // Reset điểm và trạng thái người chơi
  for (const p of room.players.values()) {
    p.score = 0;
    p.wins = 0;
    p.losses = 0;
    p.guessesUsedInRound = 0;
    p.hasWonRound = false;
    p.hasLostRound = false;
    p.currentRoundFeedback = [];
  }

  return { success: true, room };
}

/**
 * Đặt lại trạng thái cho vòng chơi mới
 */
export function prepareNextRound(room) {
  room.status = 'playing';
  room.roundWinner = null;
  room.roundTimeRemaining = room.timeLimit;

  for (const p of room.players.values()) {
    p.guessesUsedInRound = 0;
    p.hasWonRound = false;
    p.hasLostRound = false;
    p.currentRoundFeedback = [];
  }
}

/**
 * Xử lý lượt đoán của người chơi
 */
export function handlePlayerGuess(roomId, socketId, guessText) {
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') {
    return { success: false, message: 'Trận đấu chưa diễn ra hoặc vòng chơi đã kết thúc!' };
  }

  const player = room.players.get(socketId);
  if (!player) {
    return { success: false, message: 'Người chơi không thuộc phòng này!' };
  }

  if (player.hasWonRound || player.hasLostRound) {
    return { success: false, message: 'Bạn đã hoàn thành câu hỏi này!' };
  }

  const currentQ = room.questions[room.currentQuestionIndex];
  if (!currentQ) {
    return { success: false, message: 'Không tìm thấy câu hỏi!' };
  }

  // Đánh giá đoán trên Server
  const evaluation = evaluateServerGuess(currentQ.secretPhrase, guessText);
  if (!evaluation.isValid) {
    return { success: false, message: evaluation.message };
  }

  player.guessesUsedInRound++;
  player.currentRoundFeedback.push({
    guess: evaluation.guessText,
    chars: evaluation.guessChars,
    statuses: evaluation.statuses,
    isCorrect: evaluation.isCorrect,
  });

  let roundEnded = false;

  // Người chơi đoán chính xác -> Thắng câu đó!
  if (evaluation.isCorrect) {
    player.hasWonRound = true;
    player.score += 1;
    player.wins += 1;
    room.roundWinner = {
      guestId: player.guestId,
      name: player.name,
      socketId: player.socketId,
    };
    room.status = 'round_finished';
    roundEnded = true;

    // Các người chơi khác chưa giải được bị tính là thua câu này
    for (const p of room.players.values()) {
      if (p.socketId !== player.socketId) {
        p.losses += 1;
      }
    }
  } else if (player.guessesUsedInRound >= 6) {
    // Hết 6 lượt
    player.hasLostRound = true;

    // Kiểm tra xem tất cả mọi người có đều hết lượt không
    const allFinished = Array.from(room.players.values())
      .filter(p => p.isConnected)
      .every(p => p.hasWonRound || p.hasLostRound);

    if (allFinished) {
      room.status = 'round_finished';
      roundEnded = true;
      for (const p of room.players.values()) {
        if (!p.hasWonRound) p.losses += 1;
      }
    }
  }

  return {
    success: true,
    evaluation,
    guessesUsed: player.guessesUsedInRound,
    roundEnded,
    room,
  };
}

/**
 * Lưu kết quả trận đấu vào MongoDB Atlas (và in-memory dự phòng)
 */
export async function saveMatchResults(room) {
  const matchId = `match_${room.roomId}_${Date.now()}`;
  const endedAt = new Date();

  // Sắp xếp người chơi theo điểm cao nhất xuống thấp nhất
  const sortedPlayers = Array.from(room.players.values())
    .filter(p => p.isConnected)
    .sort((a, b) => b.score - a.score);

  const participantNames = sortedPlayers.map(p => p.name);

  const recordsToSave = [];

  sortedPlayers.forEach((p, idx) => {
    // Thứ hạng (hỗ trợ đồng hạng)
    let rank = idx + 1;
    if (idx > 0 && p.score === sortedPlayers[idx - 1].score) {
      rank = sortedPlayers[idx - 1].finalRank;
    }
    p.finalRank = rank;

    const record = {
      matchId,
      roomId: room.roomId,
      guestId: p.guestId,
      playerName: p.name,
      startedAt: room.startedAt || room.createdAt,
      endedAt,
      difficulty: room.difficulty,
      questionCount: room.questionCount,
      winsCount: p.wins,
      lossesCount: p.losses,
      totalScore: p.score,
      finalRank: rank,
      participants: participantNames,
      createdAt: endedAt,
    };

    recordsToSave.push(record);
    // Lưu vào In-memory dự phòng
    inMemoryHistory.unshift(record);
  });

  // Nếu MongoDB Atlas đang kết nối, lưu vào DB
  if (isDBConnected()) {
    try {
      await MatchHistory.insertMany(recordsToSave);
      console.log(`💾 [MongoDB] Đã lưu thành công kết quả trận đấu ${matchId} cho ${recordsToSave.length} người chơi.`);
    } catch (err) {
      console.error('❌ [MongoDB] Lỗi lưu kết quả trận đấu:', err.message);
    }
  } else {
    console.log(`ℹ️ [In-Memory] Đã lưu kết quả trận đấu ${matchId} vào bộ nhớ tạm (${inMemoryHistory.length} bản ghi).`);
  }

  return { matchId, rankings: sortedPlayers };
}

/**
 * Lấy lịch sử trận đấu của một guestId (từ MongoDB Atlas hoặc In-memory)
 */
export async function getPlayerHistory(guestId, { filter = 'all', difficulty, page = 1, limit = 10 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 10));

  if (isDBConnected()) {
    try {
      const query = { guestId };
      if (filter === 'wins') {
        query.finalRank = 1; // Thắng = Hạng 1
      } else if (filter === 'losses') {
        query.finalRank = { $gt: 1 };
      }
      if (difficulty && difficulty !== 'all') {
        query.difficulty = Number(difficulty);
      }

      const total = await MatchHistory.countDocuments(query);
      const items = await MatchHistory.find(query)
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean();

      return {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        items,
      };
    } catch (err) {
      console.error('❌ [MongoDB] Lỗi lấy lịch sử:', err.message);
    }
  }

  // Fallback In-memory
  let list = inMemoryHistory.filter(h => h.guestId === guestId);
  if (filter === 'wins') list = list.filter(h => h.finalRank === 1);
  if (filter === 'losses') list = list.filter(h => h.finalRank > 1);
  if (difficulty && difficulty !== 'all') list = list.filter(h => h.difficulty === Number(difficulty));

  const total = list.length;
  const start = (p - 1) * l;
  const items = list.slice(start, start + l);

  return {
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l),
    items,
  };
}

/**
 * Khôi phục / liên kết lịch sử từ mã khôi phục (guestId cũ) sang guestId mới
 */
export async function importPlayerHistory(oldGuestId, newGuestId) {
  if (!oldGuestId || !newGuestId || oldGuestId === newGuestId) {
    return { success: false, message: 'Mã khôi phục không hợp lệ!' };
  }

  let count = 0;
  if (isDBConnected()) {
    try {
      const result = await MatchHistory.updateMany({ guestId: oldGuestId }, { $set: { guestId: newGuestId } });
      count = result.modifiedCount;
    } catch (err) {
      console.error('❌ [MongoDB] Lỗi chuyển lịch sử:', err.message);
    }
  }

  // Cập nhật cả in-memory
  inMemoryHistory.forEach(item => {
    if (item.guestId === oldGuestId) {
      item.guestId = newGuestId;
      count++;
    }
  });

  return { success: true, count, message: `Đã khôi phục thành công ${count} trận đấu vào thiết bị của bạn!` };
}

