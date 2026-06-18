const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

/**
 * Stat OCR Service
 * 使用 tesseract.js（本地、免費）辨識瑪奇角色屬性截圖，
 * 解析出各屬性數值。辨識結果僅供參考，最終需使用者確認。
 */

// worker 重用：第一次建立會下載語言模型，之後快取
let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    // 繁體中文 + 英數，用於辨識屬性標籤與數字
    workerPromise = createWorker(['chi_tra', 'eng']);
  }
  return workerPromise;
}

/**
 * 要抓取的欄位與對應關鍵字。
 * 順序很重要：較長/較特定的關鍵字要排在前面，避免被子字串先吃掉
 * （例如「追加傷害」必須比「攻擊力」「傷害」先比對；「爆擊抗性」「爆擊傷害」
 *  必須比「爆擊」先比對）。
 */
const FIELD_PATTERNS = [
  { field: 'character_adDamage', keywords: ['追加傷害', '追加伤害', '追加攻擊力', '追加攻擊', '追加'] },
  { field: 'character_crit_def', keywords: ['爆擊抗性', '暴擊抗性', '爆擊抵抗', '暴擊抵抗'] },
  { field: 'character_atk',      keywords: ['攻擊力', '攻擊', '魔法攻擊'] },
  { field: 'character_def',      keywords: ['防禦力', '防禦', '防御力', '防御'] },
  { field: 'character_ap',       keywords: ['防禦貫穿', '防御貫穿', '貫穿'] },
  { field: 'character_crit',     keywords: ['爆擊', '暴擊'] },
  { field: 'character_balance',  keywords: ['平衡'] },
  { field: 'character_dp',       keywords: ['破壞力', '破坏力', '破壞', '破坏'] },
];

// 排除字：含這些字的行不拿來當對應欄位（避免「爆擊傷害量」被當成爆擊）
const EXCLUDE_TERMS = ['傷害量', '伤害量', '傷害', '伤害'];

/**
 * 影像前處理：瑪奇屬性畫面是「深色背景＋淺色文字」，tesseract 對這種
 * 對比與小字體辨識力差。這裡放大、灰階、拉對比後反白成「淺底深字」，
 * 再輕微銳化，可大幅提升辨識率。
 *
 * 為求穩健採 best-effort：任何步驟失敗就回傳原始 buffer，不影響流程。
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function preprocessImage(buffer) {
  try {
    const img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();

    // 小圖放大有助於小字辨識；已很大的圖則維持原尺寸
    const targetWidth = meta.width && meta.width < 1200 ? meta.width * 2 : meta.width;

    return await img
      .resize({ width: targetWidth, kernel: 'lanczos3' }) // 放大、平滑
      .grayscale()                                        // 去除顏色干擾
      .normalize()                                        // 拉伸對比（黑更黑、白更白）
      .negate({ alpha: false })                           // 反白：淺底深字（tesseract 偏好）
      .sharpen()                                          // 銳化筆畫邊緣
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('[statOcr] 影像前處理失敗，改用原圖辨識：', err.message);
    return buffer;
  }
}

/**
 * 從一段文字中取出最後一個整數（移除千分位逗號）。
 * @param {string} text
 * @returns {number|null}
 */
function extractNumber(text) {
  const cleaned = text.replace(/[,\s]/g, '');
  const matches = cleaned.match(/\d+/g);
  if (!matches || !matches.length) return null;
  // 取該行最後一段數字（標籤通常在前、數值在後）
  const value = parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * 辨識圖片並解析屬性。
 * @param {string} imageUrl - Discord 附件 URL
 * @returns {Promise<{ stats: object, rawText: string }>}
 *   stats: { character_atk, character_def, ... }（抓不到為 null）
 */
async function recognizeStats(imageUrl) {
  // 下載圖片（Node 18+ 內建 fetch）
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`下載圖片失敗：HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  // 前處理以提升辨識率（失敗會自動退回原圖）
  const processed = await preprocessImage(buffer);

  const worker = await getWorker();
  const { data } = await worker.recognize(processed);
  const rawText = data.text || '';

  const stats = {
    character_atk: null,
    character_def: null,
    character_crit: null,
    character_balance: null,
    character_adDamage: null,
    character_ap: null,
    character_dp: null,
    character_crit_def: null,
  };

  // 逐行解析；每個欄位只取第一個成功比對到的行
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // 含排除字的行先跳過判斷（但「爆擊抗性」「爆擊傷害」分別由各自關鍵字處理）
    const isExcluded = EXCLUDE_TERMS.some((t) => line.includes(t));

    for (const { field, keywords } of FIELD_PATTERNS) {
      if (stats[field] !== null) continue; // 已抓到就不覆蓋

      // 爆擊欄位特別處理：若該行是「爆擊傷害」之類則略過，留給其他欄位
      if (field === 'character_crit' && isExcluded) continue;

      const matched = keywords.some((kw) => line.includes(kw));
      if (matched) {
        const value = extractNumber(line);
        if (value !== null) {
          stats[field] = value;
        }
        break; // 一行只對應一個欄位
      }
    }
  }

  return { stats, rawText };
}

module.exports = { recognizeStats };
