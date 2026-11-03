import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let phrasesCache = null;

export function loadPhrases() {
  if (phrasesCache) return phrasesCache;

  const dataPath = path.join(__dirname, '../data/phrases.json');
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    phrasesCache = JSON.parse(raw);
    console.log(`✅ [Phrases] Đã tải thành công ${phrasesCache.length} cụm từ tiếng Việt vào bộ nhớ.`);
    return phrasesCache;
  } catch (err) {
    console.error('❌ [Phrases] Không thể tải phrases.json:', err.message);
    return [];
  }
}

/**
 * Chọn ngẫu nhiên N câu hỏi cho trận đấu theo độ khó chỉ định
 */
export function pickRandomQuestions(difficulty, count) {
  const all = loadPhrases();
  const pool = all.filter(p => p.difficulty === difficulty);
  const selectedPool = pool.length >= count ? pool : all;

  // Xáo trộn ngẫu nhiên (Fisher-Yates)
  const shuffled = [...selectedPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count).map((item, index) => {
    // Tách cấu trúc từ để gửi cho client mà KHÔNG lộ đáp án
    const words = item.phrase.trim().split(/\s+/);
    const wordLengths = words.map(w => Array.from(w).length);

    return {
      questionIndex: index + 1,
      totalQuestions: count,
      id: item.id,
      // Bí mật: Chỉ lưu trên server!
      secretPhrase: item.phrase.trim(),
      definition: item.definition,
      category: item.category,
      difficulty: item.difficulty,
      // Công khai: Client chỉ biết số tiếng và độ dài từng tiếng!
      wordLengths,
      wordCount: words.length,
      totalChars: wordLengths.reduce((a, b) => a + b, 0),
    };
  });
}

