const WeekUpdateNotification = require('../models/WeekUpdateNotification');

/**
 * Notification Controller
 * 處理每週更新提醒訂閱的商業邏輯。
 */
const notificationController = {
  /**
   * 訂閱或更新提醒（第一次建立、第二次以後更新）
   * @param {string} discordId
   * @param {string} discordUsername
   * @param {object} data - { dayOfWeek, hour, guildId }
   */
  async subscribe(discordId, discordUsername, data) {
    try {
      return await WeekUpdateNotification.findOneAndUpdate(
        { discordId },
        {
          $set: {
            discordId,
            discordUsername,
            ...data,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error) {
      console.error('[NotificationController] subscribe error:', error);
      throw error;
    }
  },

  /**
   * 取得使用者目前的訂閱
   * @param {string} discordId
   */
  async getSubscription(discordId) {
    try {
      return await WeekUpdateNotification.findOne({ discordId });
    } catch (error) {
      console.error('[NotificationController] getSubscription error:', error);
      throw error;
    }
  },

  /**
   * 取得指定星期幾 + 整點的所有訂閱（排程器用）
   * @param {number} dayOfWeek - 0~6
   * @param {number} hour - 0~23
   */
  async getSubscriptionsByTime(dayOfWeek, hour) {
    try {
      return await WeekUpdateNotification.find({ dayOfWeek, hour });
    } catch (error) {
      console.error('[NotificationController] getSubscriptionsByTime error:', error);
      throw error;
    }
  },
};

module.exports = notificationController;
