const mongoose = require('mongoose');

/**
 * User Schema
 * Stores Discord user data and Mabinogi character stats
 */
const userSchema = new mongoose.Schema(
  {
    // ── Discord 資訊 ──────────────────────────────────────
    discordId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    discordUsername: {
      type: String,
      required: true,
    },

    // ── 角色基本資訊 ──────────────────────────────────────
    userName: {
      type: String,
      required: true,         // 角色名稱（必填）
    },

    // ── 必填戰鬥屬性 ──────────────────────────────────────
    character_atk: {
      type: Number,
      required: true,         // 攻擊力 / 魔法攻擊力
    },
    character_def: {
      type: Number,
      required: true,         // 防禦力
    },
    character_crit: {
      type: Number,
      required: true,         // 爆擊
    },
    character_balance: {
      type: Number,
      required: true,         // 平衡
    },

    // ── 選填戰鬥屬性 ──────────────────────────────────────
    character_adDamage: {
      type: Number,
      default: null,          // 追加攻擊力
    },
    character_ap: {
      type: Number,
      default: null,          // 防禦力貫穿
    },
    character_dp: {
      type: Number,
      default: null,          // 破壞力
    },
    character_crit_def: {
      type: Number,
      default: null,          // 爆擊抗性
    },
  },
  {
    timestamps: true,         // 自動加入 createdAt / updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
