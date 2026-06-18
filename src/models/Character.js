const mongoose = require('mongoose');

/**
 * Character Schema
 * 一個 Discord 帳號可擁有多隻角色，每隻角色為獨立一筆 doc。
 * 擁有者以 discordId 關聯；當前主角由 User.activeCharacterId 指向。
 */
const characterSchema = new mongoose.Schema(
  {
    // ── 擁有者 ────────────────────────────────────────────
    discordId: {
      type: String,
      required: true,
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
      required: true,         // 暴擊
    },
    character_balance: {
      type: Number,
      required: true,         // 平衡
    },

    // ── 選填戰鬥屬性 ──────────────────────────────────────
    character_adDamage: {
      type: Number,
      default: null,          // 追加傷害
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
      default: null,          // 暴擊抵抗
    },
  },
  {
    timestamps: true,         // 自動加入 createdAt / updatedAt
  }
);

// 同一擁有者底下角色名稱不可重複（也用於 register 的「同名更新」判斷）
characterSchema.index({ discordId: 1, userName: 1 }, { unique: true });

module.exports = mongoose.model('Character', characterSchema);
