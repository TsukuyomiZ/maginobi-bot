const Guild = require('../models/Guild');

/**
 * Guild Controller
 * Handles all business logic related to Discord guilds (servers)
 */
const guildController = {
  /**
   * Find or create a guild record
   * @param {string} guildId
   * @param {string} guildName
   */
  async findOrCreate(guildId, guildName) {
    try {
      let guild = await Guild.findOne({ guildId });

      if (!guild) {
        guild = await Guild.create({ guildId, guildName });
        console.log(`[GuildController] Registered new guild: ${guildName} (${guildId})`);
      }

      return guild;
    } catch (error) {
      console.error('[GuildController] findOrCreate error:', error);
      throw error;
    }
  },

  /**
   * Get guild settings by guildId
   * @param {string} guildId
   */
  async getGuild(guildId) {
    try {
      return await Guild.findOne({ guildId });
    } catch (error) {
      console.error('[GuildController] getGuild error:', error);
      throw error;
    }
  },

  /**
   * Update guild settings
   * @param {string} guildId
   * @param {object} data - fields to update
   */
  async updateSettings(guildId, data) {
    try {
      return await Guild.findOneAndUpdate(
        { guildId },
        { $set: data },
        { new: true, upsert: false }
      );
    } catch (error) {
      console.error('[GuildController] updateSettings error:', error);
      throw error;
    }
  },

  /**
   * Set the log channel for a guild
   * @param {string} guildId
   * @param {string} channelId
   */
  async setLogChannel(guildId, channelId) {
    return this.updateSettings(guildId, { logChannelId: channelId });
  },

  /**
   * Set the welcome channel for a guild
   * @param {string} guildId
   * @param {string} channelId
   */
  async setWelcomeChannel(guildId, channelId) {
    return this.updateSettings(guildId, { welcomeChannelId: channelId });
  },
};

module.exports = guildController;
