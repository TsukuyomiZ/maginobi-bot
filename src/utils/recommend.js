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
 * 評估角色在「所有副本」的狀態，分出：
 *   - ideal：可進入且滿平滿爆（依等級高到低排序）
 *   - enterable：可進入但暴擊/平衡尚未拉滿（依等級高到低排序）
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

  return { ideal, enterable };
}

// 可進入但未滿平滿爆時，標註還差什麼
function enterableLine(battle, result) {
  const notes = [];
  if (result.crit && !result.crit.passed) notes.push(`滿爆差 ${result.crit.remaining}`);
  if (result.balance && !result.balance.passed) notes.push(`滿平差 ${result.balance.remaining}`);
  const suffix = notes.length ? `（${notes.join('、')}）` : '';
  return `• **${battle.battle_name}**（Lv.${battle.level}）${battle.isSTD ? ' 🌀' : ''}${suffix}`;
}

/**
 * 將推薦結果整理成可直接塞進 EmbedBuilder 的 fields 陣列。
 * @param {{ideal: Array, enterable: Array}} rec getRecommendation 的回傳
 * @returns {Array<{name, value, inline?}>}
 */
function buildRecommendFields({ ideal, enterable }) {
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
  } else {
    fields.push({
      name: 'ℹ️ 暫無推薦',
      value: '目前的屬性還無法穩定進入任何已收錄的副本，先衝一波裝備再回來看看吧！',
    });
  }

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
