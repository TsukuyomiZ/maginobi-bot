/**
 * 副本推薦邏輯
 * 依角色屬性，從所有已收錄副本中找出「最適合打」的關卡：
 *   屬性達標可進入（攻擊力等 req 門檻皆通過）＋ 滿爆（暴擊）＋ 滿平（平衡）。
 * 同時供 /recommend 指令、以及註冊/更新成功後的推薦區塊使用。
 */

const battleController = require('../controllers/battleController');
const { compareCharacterToBattle } = require('./battleCompare');

/**
 * 一個副本對某角色而言是否「最適合打」：
 * 可進入（所有 req 門檻通過）＋ 暴擊滿爆 ＋ 平衡滿平。
 */
function isIdeal(result) {
  return result.canEnter && !!result.crit?.passed && !!result.balance?.passed;
}

// 將多行壓在 Discord embed field value 上限（1024 字）內，超出則整行截掉並標註
function clampLines(lines, max = 1024) {
  const out = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > max - 20) {
      out.push('…（其餘略過）');
      break;
    }
    out.push(line);
    len += line.length + 1;
  }
  return out.join('\n');
}

/**
 * 計算「距離滿平滿爆還差多少」：
 *   - req 門檻不足 / 未填的欄位
 *   - 可進入時，未滿爆 / 未滿平還差的點數
 * @returns {{shortfalls: Array<{name, short}>, total: number}}
 *   total 為可量化的總差距點數；只要有「未填」欄位無法量化，total 設為 Infinity
 *   （排序時自動排到最後，並提示玩家補資料）。short 為 null 代表該欄位未填。
 */
function computeGap(result) {
  const shortfalls = [];
  let total = 0;
  let hasUnknown = false;

  // req 門檻不足
  for (const c of result.comparedFields) {
    if (!c.passed) {
      const short = Math.abs(c.diff);
      shortfalls.push({ name: c.field.name, short });
      total += short;
    }
  }
  // req 欄位未填（無法量化差距）
  for (const f of result.missingFields) {
    shortfalls.push({ name: f.name, short: null });
    hasUnknown = true;
  }
  // 可進入時才有暴擊 / 平衡的差距
  if (result.canEnter) {
    if (result.crit && !result.crit.passed) {
      shortfalls.push({ name: '滿爆', short: result.crit.remaining });
      total += result.crit.remaining;
    }
    if (result.balance && !result.balance.passed) {
      shortfalls.push({ name: '滿平', short: result.balance.remaining });
      total += result.balance.remaining;
    }
  }

  return { shortfalls, total: hasUnknown ? Infinity : total };
}

/**
 * 評估角色在「所有副本」的狀態，分出：
 *   - ideal：可進入且滿平滿爆（依等級高到低排序）
 *   - enterable：可進入但暴擊/平衡尚未拉滿（依等級高到低排序）
 *   - nextTarget：所有「還不能滿平滿爆」的副本中，距離最小（最接近達成）的一個，
 *                 附上 computeGap 的差距明細；全部達成則為 null。
 * @param {object} character 角色屬性
 */
async function getRecommendation(character) {
  const battles = await battleController.getAllBattles();
  const evaluated = battles.map((battle) => ({
    battle,
    result: compareCharacterToBattle(character, battle),
  }));

  const byLevelDesc = (a, b) => b.battle.level - a.battle.level;
  const ideal = evaluated.filter((e) => isIdeal(e.result)).sort(byLevelDesc);
  const enterable = evaluated
    .filter((e) => e.result.canEnter && !isIdeal(e.result))
    .sort(byLevelDesc);

  // 下個推薦目標：所有尚未滿平滿爆的副本中，可量化差距最小者；
  // 都無法量化（皆有未填欄位）時才退而選未量化的第一個。
  const nonIdeal = evaluated
    .filter((e) => !isIdeal(e.result))
    .map((e) => ({ ...e, gap: computeGap(e.result) }))
    .sort((a, b) => a.gap.total - b.gap.total);
  const nextTarget = nonIdeal[0] || null;

  return { ideal, enterable, nextTarget };
}

// 可進入但未滿平滿爆時，標註還差什麼
function enterableLine(battle, result) {
  const notes = [];
  if (result.crit && !result.crit.passed) notes.push(`滿爆差 ${result.crit.remaining}`);
  if (result.balance && !result.balance.passed) notes.push(`滿平差 ${result.balance.remaining}`);
  const suffix = notes.length ? `（${notes.join('、')}）` : '';
  return `• **${battle.battle_name}**（Lv.${battle.level}）${battle.isSTD ? ' 🌀' : ''}${suffix}`;
}

// 「下個推薦目標」欄位：列出最接近達成的副本，以及還差多少
function nextTargetField(entry) {
  const { battle, gap } = entry;
  const parts = gap.shortfalls.map((s) =>
    s.short == null ? `${s.name}（未填，請補資料）` : `${s.name} 差 **${s.short}**`
  );
  const detail = parts.length ? `還差：${parts.join('、')}` : '即將達成，再衝一點就好！';
  return {
    name: '🎯 下個推薦目標（差距最小）',
    value: `**${battle.battle_name}**（Lv.${battle.level}）${battle.isSTD ? ' 🌀' : ''}\n${detail}`,
  };
}

/**
 * 將推薦結果整理成可直接塞進 EmbedBuilder 的 fields 陣列。
 * @param {{ideal: Array, enterable: Array, nextTarget: object|null}} rec getRecommendation 的回傳
 * @returns {Array<{name, value, inline?}>}
 */
function buildRecommendFields({ ideal, enterable, nextTarget }) {
  const fields = [];

  if (ideal.length) {
    // 最推薦：一般 / STD 各取可滿平滿爆的「最高等級」副本
    const topNormal = ideal.find((e) => e.battle.isSTD !== true);
    const topStd = ideal.find((e) => e.battle.isSTD === true);
    const tops = [];
    if (topNormal) tops.push(`🆕 一般：**${topNormal.battle.battle_name}**（Lv.${topNormal.battle.level}）`);
    if (topStd) tops.push(`🌀 STD：**${topStd.battle.battle_name}**（Lv.${topStd.battle.level}）`);
    fields.push({ name: '🏆 最推薦（可滿平滿爆的最高關卡）', value: tops.join('\n') });

    // 完整的「滿平滿爆」清單
    const lines = ideal.map((e) => `• **${e.battle.battle_name}**（Lv.${e.battle.level}）${e.battle.isSTD ? ' 🌀' : ''}`);
    fields.push({ name: '✅ 可完美通關清單（滿平滿爆）', value: clampLines(lines) });
  } else if (enterable.length) {
    // 沒有任何可滿平滿爆的副本 → 改列「可進入但還差一點」的，並標註差多少
    const lines = enterable.map((e) => enterableLine(e.battle, e.result));
    fields.push({
      name: 'ℹ️ 目前還沒有可「滿平滿爆」的副本',
      value: '以下是你已經可以進入、但暴擊／平衡尚未拉滿的副本：\n' + clampLines(lines),
    });
  } else if (!nextTarget) {
    // 完全沒有可比對的副本資料
    fields.push({
      name: 'ℹ️ 暫無推薦',
      value: '目前沒有可比對的副本資料，等之後新增副本再回來看看吧！',
    });
  } else {
    fields.push({
      name: 'ℹ️ 還無法穩定進入任何副本',
      value: '先看看下方「下個推薦目標」，把差距補起來吧！',
    });
  }

  // 只要還有尚未滿平滿爆的副本，就附上「下個推薦目標」當作努力方向
  if (nextTarget) fields.push(nextTargetField(nextTarget));

  return fields;
}

/**
 * 一步到位：取得角色的推薦副本 embed fields。
 * 查無資料或發生錯誤都會被略過（回傳空陣列），不阻斷呼叫端主流程。
 * @param {object} character 角色屬性
 * @returns {Promise<Array<{name, value, inline?}>>}
 */
async function buildRecommendFieldsFor(character) {
  try {
    const rec = await getRecommendation(character);
    return buildRecommendFields(rec);
  } catch (error) {
    console.error('[recommend] 取得推薦副本失敗（已略過）：', error);
    return [];
  }
}

module.exports = {
  isIdeal,
  getRecommendation,
  buildRecommendFields,
  buildRecommendFieldsFor,
};
