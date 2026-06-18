const { EmbedBuilder } = require('discord.js');
const battleController = require('../controllers/battleController');
const { compareCharacterToBattle, buildProgressField } = require('./battleCompare');

// 公開展示卡用的欄位定義
const REQUIRED_LABELS = [
  ['character_atk', '攻擊力'],
  ['character_def', '防禦力'],
  ['character_crit', '暴擊'],
  ['character_balance', '平衡'],
];
const OPTIONAL_LABELS = [
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
        name: '⚔️ 必填屬性',
        value: REQUIRED_LABELS.map(([f, l]) => `**${l}：** ${character[f]}`).join('\n'),
        inline: true,
      },
      {
        name: '✨ 選填屬性',
        value:
          OPTIONAL_LABELS.filter(([f]) => character[f] != null)
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

module.exports = { buildLatestProgressFields, buildShowcaseEmbed };
