const BattleInfo = require('../models/BattleInfo');

/**
 * Battle Controller
 * Handles queries against the battle_info collection
 */
const battleController = {
  /**
   * Get all battles for a given level
   * @param {number} level - e.g. 120 or 125
   */
  async getBattlesByLevel(level) {
    try {
      return await BattleInfo.find({ level }).sort({ battle_name: 1 }).select('_id battle_name');
    } catch (error) {
      console.error('[BattleController] getBattlesByLevel error:', error);
      throw error;
    }
  },

  /**
   * 取得所有關卡（依等級 → 一般/STD → 名稱排序），用於註冊後的「全副本通關檢查」。
   */
  async getAllBattles() {
    try {
      return await BattleInfo.find().sort({ level: 1, isSTD: 1, battle_name: 1 });
    } catch (error) {
      console.error('[BattleController] getAllBattles error:', error);
      throw error;
    }
  },

  /**
   * Get full battle info by MongoDB _id
   * @param {string} id - MongoDB ObjectId string
   */
  async getBattleById(id) {
    try {
      return await BattleInfo.findById(id);
    } catch (error) {
      console.error('[BattleController] getBattleById error:', error);
      throw error;
    }
  },

  /**
   * 取得「最新加入」的關卡（依 createdAt 由新到舊取第一筆）。
   * 通常對應當期最新、最硬的內容，用於註冊/更新後的進度提示。
   * @param {boolean} isSTD - true 取最新 STD 關卡，false 取最新一般關卡
   */
  async getLatestBattle(isSTD = false) {
    try {
      // STD：明確 isSTD=true；一般：isSTD!=true（含早期未寫入 isSTD 欄位的舊資料，視為一般）
      const filter = isSTD ? { isSTD: true } : { isSTD: { $ne: true } };
      return await BattleInfo.findOne(filter).sort({ createdAt: -1 });
    } catch (error) {
      console.error('[BattleController] getLatestBattle error:', error);
      throw error;
    }
  },
};

module.exports = battleController;
