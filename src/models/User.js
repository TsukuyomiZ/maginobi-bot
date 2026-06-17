const mongoose = require('mongoose');

/**
 * User Schema
 * 帳號層級資料。角色屬性已抽離至 Character collection；
 * 此處只保留 Discord 資訊與「當前主角」指標。
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

    // ── 當前主角 ──────────────────────────────────────────
    // 指向 Character collection 中的某一筆；尚未註冊任何角色時為 null。
    activeCharacterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Character',
      default: null,
    },
  },
  {
    timestamps: true,         // 自動加入 createdAt / updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
