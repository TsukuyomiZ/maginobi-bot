const mongoose = require('mongoose');

/**
 * WeekUpdateNotification Schema
 * Maps to the 'WeekUpdate_notication' collection in MongoDB Atlas.
 * 紀錄使用者訂閱的每週更新提醒（星期幾 + 整點，台灣時間 UTC+8）。
 */
const weekUpdateNotificationSchema = new mongoose.Schema(
  {
    discordId: {
      type: String,
      required: true,
      unique: true,       // 每位使用者一筆，第二次訂閱即更新
      index: true,
    },
    discordUsername: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      default: null,      // 訂閱當下所在的伺服器（備查用）
    },

    // ── 提醒時間（台灣時間 UTC+8）──────────────────────────────
    dayOfWeek: {
      type: Number,
      required: true,     // 0=週日, 1=週一, ... 6=週六（對應 Date.getDay()）
      min: 0,
      max: 6,
    },
    hour: {
      type: Number,
      required: true,     // 0~23 整點
      min: 0,
      max: 23,
    },
  },
  {
    timestamps: true,
    collection: 'WeekUpdate_notication', // 對應 MongoDB Atlas 的 collection 名稱（依需求拼字）
  }
);

module.exports = mongoose.model('WeekUpdateNotification', weekUpdateNotificationSchema);
