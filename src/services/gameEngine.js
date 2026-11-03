/**
 * Thuật toán đánh giá câu đoán tiếng Việt trên Server VIETWORD.
 * Đảm bảo Client không thể can thiệp hay gian lận kết quả.
 */

// Bảng ký tự gốc không dấu
const BASE_MAP = {
  a: 'a', à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a',
  ă: 'ă', ằ: 'ă', ắ: 'ă', ẳ: 'ă', ẵ: 'ă', ặ: 'ă',
  â: 'â', ầ: 'â', ấ: 'â', ẩ: 'â', ẫ: 'â', ậ: 'â',
  e: 'e', è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e',
  ê: 'ê', ề: 'ê', ế: 'ê', ể: 'ê', ễ: 'ê', ệ: 'ê',
  i: 'i', ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  o: 'o', ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o',
  ô: 'ô', ồ: 'ô', ố: 'ô', ổ: 'ô', ỗ: 'ô', ộ: 'ô',
  ơ: 'ơ', ờ: 'ơ', ớ: 'ơ', ở: 'ơ', ỡ: 'ơ', ợ: 'ơ',
  u: 'u', ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u',
  ư: 'ư', ừ: 'ư', ứ: 'ư', ử: 'ư', ữ: 'ư', ự: 'ư',
  y: 'y', ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
  d: 'd', đ: 'đ',
};

// Ký tự gốc không dấu và không mũ
const ROOT_MAP = {
  a: 'a', à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  e: 'e', è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  i: 'i', ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  o: 'o', ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o',
  ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  u: 'u', ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  y: 'y', ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
  d: 'd', đ: 'd',
};

function normalizeNFC(str) {
  return str ? str.normalize('NFC') : '';
}

function getBaseChar(char) {
  if (!char) return '';
  const lower = char.toLowerCase().normalize('NFC');
  return ROOT_MAP[lower] || lower;
}

function isSameExactChar(a, b) {
  return normalizeNFC(a).toLowerCase() === normalizeNFC(b).toLowerCase();
}

function isSameBaseDifferentAccent(a, b) {
  if (!a || !b) return false;
  const normA = normalizeNFC(a).toLowerCase();
  const normB = normalizeNFC(b).toLowerCase();
  if (normA === normB) return false;
  return getBaseChar(normA) === getBaseChar(normB);
}

/**
 * Đánh giá kết quả một câu đoán của người chơi so với đáp án bí mật
 */
export function evaluateServerGuess(targetPhrase, guessInput) {
  const normTarget = normalizeNFC(targetPhrase).trim();
  const normGuess = normalizeNFC(guessInput).trim();

  const targetChars = Array.from(normTarget.replace(/\s+/g, ''));
  let guessChars = Array.from(normGuess.replace(/\s+/g, ''));

  const length = targetChars.length;

  // Nếu độ dài không khớp, trả về lỗi
  if (guessChars.length !== length) {
    return {
      isValid: false,
      message: `Độ dài không khớp! Cần đúng ${length} chữ cái.`,
    };
  }

  const statuses = new Array(length).fill(null);
  const targetMatched = new Array(length).fill(false);

  // 1. Xác định XANH LÁ (correct)
  for (let i = 0; i < length; i++) {
    if (isSameExactChar(guessChars[i], targetChars[i])) {
      statuses[i] = 'correct';
      targetMatched[i] = true;
    }
  }

  // 2. Xác định XANH DƯƠNG (partial - cùng gốc khác dấu/mũ ở đúng ô)
  for (let i = 0; i < length; i++) {
    if (statuses[i] === null) {
      if (!targetMatched[i] && isSameBaseDifferentAccent(guessChars[i], targetChars[i])) {
        statuses[i] = 'partial';
        targetMatched[i] = true;
      }
    }
  }

  // 3. Đếm các ký tự còn lại của đáp án để xác định VÀNG (wrongpos)
  const remainingCounts = {};
  for (let i = 0; i < length; i++) {
    if (!targetMatched[i]) {
      const ch = normalizeNFC(targetChars[i]).toLowerCase();
      remainingCounts[ch] = (remainingCounts[ch] || 0) + 1;
    }
  }

  // 4. Xác định VÀNG hoặc TÍM
  for (let i = 0; i < length; i++) {
    if (statuses[i] === null) {
      const ch = normalizeNFC(guessChars[i]).toLowerCase();
      if (remainingCounts[ch] && remainingCounts[ch] > 0) {
        statuses[i] = 'wrongpos';
        remainingCounts[ch]--;
      } else {
        statuses[i] = 'absent';
      }
    }
  }

  // Kiểm tra xem có đoán đúng toàn bộ từ không
  const isCorrect = statuses.every(s => s === 'correct');

  return {
    isValid: true,
    isCorrect,
    statuses,
    guessText: normGuess,
    guessChars: guessChars.map(c => c.toUpperCase()),
  };
}

