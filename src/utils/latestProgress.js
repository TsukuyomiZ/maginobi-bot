const { EmbedBuilder } = require('discord.js');
const battleController = require('../controllers/battleController');
const { compareCharacterToBattle, buildProgressField } = require('./battleCompare');

// 公開展示卡用的欄位定義（基本 / 進階兩組）
const BASIC_LABELS = [
  ['character_atk', '攻擊力'],
  ['character_def', '防禦力'],
  ['character_crit', '暴擊'],
  ['character_balance', '平衡'],
];
const ADVANCED_LABELS = [
  ['character_adDamage', '追加傷害'],
  ['character_ap', '防禦貫穿'],
  ['character_dp', '破壞力'],
  ['character_crit_def', '暴擊抵抗'],
];

/**
 * 取得「最新一般副本」與「最新 STD 副本」對某角色的比對進度，
 * 整理成可直接塞進 EmbedBuilder 的 fields 陣列。
 * 註冊/更新成功後呼叫，附在回覆下方。
 *
 * 任何一邊查無資料或發生錯誤都會被略過，絕不阻斷註冊主流程。
 * @param {object} character 角色屬性
 * @returns {Promise<Array<{name,value,inline}>>}
 */
async function buildLatestProgressFields(character) {
  const fields = [];

  try {
    const [normal, std] = await Promise.all([
      battleController.getLatestBattle(false),
      battleController.getLatestBattle(true),
    ]);

    if (normal) {
      fields.push(buildProgressField(normal, compareCharacterToBattle(character, normal), '🆕 最新副本'));
    }
    if (std) {
      fields.push(buildProgressField(std, compareCharacterToBattle(character, std), '🆕 最新 STD 副本'));
    }
  } catch (error) {
    console.error('[latestProgress] 取得最新副本進度失敗（已略過）：', error);
    return [];
  }

  return fields;
}

// 將單一副本比對結果壓成一行（用於全副本總覽）
function summarizeBattleLine(battle, result) {
  if (result.canEnter) {
    const notes = [];
    if (result.crit && !result.crit.passed) notes.push('暴擊未滿');
    if (result.balance && !result.balance.passed) notes.push('平衡未滿');
    const suffix = notes.length ? `（${notes.join('、')}）` : '';
    return `✅ **${battle.battle_name}**（Lv.${battle.level}）可進入${suffix}`;
  }
  const shortfalls = result.comparedFields
    .filter((c) => !c.passed)
    .map((c) => `${c.field.name} 差${Math.abs(c.diff)}`);
  const missing = result.missingFields.map((f) => `${f.name}未填`);
  const parts = [...shortfalls, ...missing];
  return `🚫 **${battle.battle_name}**（Lv.${battle.level}）${parts.join('、') || '屬性不足'}`;
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
 * 對「所有副本」做一次通關檢查，整理成 embed fields（一般 / STD 各一欄）。
 * 註冊/更新成功後呼叫，讓玩家一次看到自己在每個副本的可進入狀態。
 * 查無資料或發生錯誤都會被略過，不阻斷主流程。
 * @param {object} character 角色屬性
 * @returns {Promise<Array<{name,value,inline}>>}
 */
async function buildAllBattlesProgressFields(character) {
  try {
    const battles = await battleController.getAllBattles();
    if (!battles.length) return [];

    const fields = [];
    const addGroup = (list, name) => {
      if (!list.length) return;
      const lines = list.map((b) => summarizeBattleLine(b, compareCharacterToBattle(character, b)));
      fields.push({ name, value: clampLines(lines) });
    };

    addGroup(battles.filter((b) => b.isSTD !== true), '🗺️ 一般副本');
    addGroup(battles.filter((b) => b.isSTD === true), '🌀 STD 副本');

    return fields;
  } catch (error) {
    console.error('[latestProgress] 取得全副本進度失敗（已略過）：', error);
    return [];
  }
}

/**
 * 建立「公開分享」用的展示卡 embed：角色屬性 + 最新副本進度。
 * progressFields 由呼叫端先用 buildLatestProgressFields 取得後傳入，避免重複查詢。
 * @param {object}   opts
 * @param {object}   opts.user           Discord user（取頭像 / 名稱）
 * @param {object}   opts.character      角色屬性
 * @param {boolean}  opts.isNew          是否為新註冊（false = 更新）
 * @param {Array}    opts.progressFields buildLatestProgressFields 的回傳
 */
function buildShowcaseEmbed({ user, character, isNew, progressFields }) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`📢 ${character.userName} ${isNew ? '新角色登場！' : '屬性更新！'}`)
    .addFields(
      {
        name: '⚔️ 基本屬性',
        value: BASIC_LABELS.map(([f, l]) => `**${l}：** ${character[f]}`).join('\n'),
        inline: true,
      },
      {
        name: '✨ 進階屬性',
        value:
          ADVANCED_LABELS.filter(([f]) => character[f] != null)
            .map(([f, l]) => `**${l}：** ${character[f]}`)
            .join('\n') || '（未填寫）',
        inline: true,
      }
    );

  if (progressFields && progressFields.length) {
    embed.addFields(
      { name: '​', value: '**📊 距離當期最新內容的進度**' },
      ...progressFields
    );
  }

  return embed
    .setFooter({ text: `由 ${user.username} 分享進度` })
    .setTimestamp();
}

module.exports = { buildLatestProgressFields, buildAllBattlesProgressFields, buildShowcaseEmbed };
