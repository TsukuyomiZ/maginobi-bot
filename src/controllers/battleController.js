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
};

module.exports = battleController;
