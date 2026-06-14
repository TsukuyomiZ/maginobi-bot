const User = require('../models/User');

/**
 * User Controller
 * Handles all business logic related to users
 */
const userController = {
  /**
   * Register or update a user's Mabinogi character
   * @param {string} discordId
   * @param {string} discordUsername
   * @param {object} characterData - character stats from /register command
   */
  async register(discordId, discordUsername, characterData) {
    try {
      const user = await User.findOneAndUpdate(
        { discordId },
        {
          $set: {
            discordId,
            discordUsername,
            ...characterData,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );

      return user;
    } catch (error) {
      console.error('[UserController] register error:', error);
      throw error;
    }
  },

  /**
   * Get user by Discord ID
   * @param {string} discordId
   */
  async getUser(discordId) {
    try {
      return await User.findOne({ discordId });
    } catch (error) {
      console.error('[UserController] getUser error:', error);
      throw error;
    }
  },

  /**
   * Get leaderboard (top users by attack)
   * @param {number} limit
   */
  async getLeaderboard(limit = 10) {
    try {
      return await User.find()
        .sort({ character_atk: -1 })
        .limit(limit)
        .select('discordId discordUsername userName character_atk character_def character_crit character_balance');
    } catch (error) {
      console.error('[UserController] getLeaderboard error:', error);
      throw error;
    }
  },
};

module.exports = userController;
