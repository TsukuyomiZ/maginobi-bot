const mongoose = require('mongoose');

/**
 * BattleInfo Schema
 * Maps to the 'battle_Info' collection in MongoDB Atlas
 */
const battleInfoSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      required: true,
      index: true,          // 關卡等級（120 / 125 ...）
    },
    battle_name: {
      type: String,
      required: true,       // 關卡名稱
    },

    // ── Boss 本身屬性 ─────────────────────────────────────────
    boss_crit: {
      type: Number,
      default: null,        // Boss 暴擊
    },
    boss_crit_def: {
      type: Number,
      default: null,        // Boss 暴擊抵抗
    },
    boss_balance_def: {
      type: Number,
      default: null,        // Boss 平衡抵抗
    },

    // ── 通關建議需求屬性（用於角色比對）─────────────────────────
    req_atk: {
      type: Number,
      default: null,        // 建議攻擊力
    },
    req_def: {
      type: Number,
      default: null,        // 建議防禦力
    },
    req_character_crit: {
      type: Number,
      default: null,        // 建議爆擊值
    },
    req_balance: {
      type: Number,
      default: null,        // 建議平衡值
    },
    req_adDamage: {
      type: Number,
      default: null,        // 建議追加傷害
    },
    req_ap: {
      type: Number,
      default: null,        // 建議防禦力貫穿
    },
    req_dp: {
      type: Number,
      default: null,        // 建議破壞力
    },
    isSTD: {
      type: Boolean,
      default: false,       // 是否為 STD 關卡
    },
  },
  {
    timestamps: true,
    collection: 'battle_Info', // 對應 MongoDB Atlas 的 collection 名稱（注意大寫 I）
  }
);

module.exports = mongoose.model('BattleInfo', battleInfoSchema);
