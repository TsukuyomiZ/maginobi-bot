const notificationController = require('../controllers/notificationController');

// 提醒訊息內容
const NOTI_MESSAGE = '時空扭曲/絕命戰/暗影堡壘/特殊 已更新 請合理安排時間進行攻略';

/**
 * 取得目前的台灣時間（UTC+8），不受伺服器所在時區影響。
 * @returns {Date} 以台灣當地時間表示的 Date 物件
 */
function getTaiwanNow() {
  const now = new Date();
  // 先換成 UTC，再加 8 小時
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 8 * 3_600_000);
}

/**
 * 在每個整點觸發，找出符合「星期幾 + 整點」的訂閱者並 @ 提醒。
 * @param {import('discord.js').Client} client
 */
async function fireHourlyReminders(client) {
  const tw = getTaiwanNow();
  const dayOfWeek = tw.getDay();
  const hour = tw.getHours();

  let subs;
  try {
    subs = await notificationController.getSubscriptionsByTime(dayOfWeek, hour);
  } catch (error) {
    console.error('[WeeklyNotiScheduler] 讀取訂閱失敗：', error);
    return;
  }

  if (!subs.length) return;

  const channelId = process.env.NOTI_CHANNEL_ID;
  if (!channelId) {
    console.warn('[WeeklyNotiScheduler] ⚠️ 未設定 NOTI_CHANNEL_ID，無法發送提醒。');
    return;
  }

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    console.error(`[WeeklyNotiScheduler] 無法取得公告頻道 ${channelId}：`, error);
    return;
  }

  if (!channel || !channel.isTextBased()) {
    console.warn(`[WeeklyNotiScheduler] ⚠️ 頻道 ${channelId} 不存在或非文字頻道。`);
    return;
  }

  for (const sub of subs) {
    try {
      await channel.send({
        content: `<@${sub.discordId}> ${NOTI_MESSAGE}`,
        allowedMentions: { users: [sub.discordId] },
      });
    } catch (error) {
      console.error(`[WeeklyNotiScheduler] 發送給 ${sub.discordUsername} 失敗：`, error);
    }
  }

  console.log(
    `[WeeklyNotiScheduler] ✅ 已發送 ${subs.length} 則提醒（台灣時間 週${dayOfWeek} ${hour}:00）`
  );
}

/**
 * 啟動排程器：每分鐘檢查一次，僅在整點（分鐘為 0）且該整點尚未觸發過時發送。
 * @param {import('discord.js').Client} client
 */
function startWeeklyNotiScheduler(client) {
  let lastFiredKey = null;

  const tick = () => {
    const tw = getTaiwanNow();
    // 只在整點觸發
    if (tw.getMinutes() !== 0) return;

    // 防止同一整點重複觸發（例如 interval 在分鐘 0 內跑了兩次）
    const key = `${tw.getFullYear()}-${tw.getMonth()}-${tw.getDate()}-${tw.getHours()}`;
    if (key === lastFiredKey) return;
    lastFiredKey = key;

    fireHourlyReminders(client);
  };

  // 每分鐘檢查一次
  setInterval(tick, 60_000);
  console.log('[WeeklyNotiScheduler] ✅ 排程器已啟動（每分鐘檢查，整點發送）');
}

module.exports = startWeeklyNotiScheduler;
