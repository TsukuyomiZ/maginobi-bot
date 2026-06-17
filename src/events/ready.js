const { Events, ActivityType } = require('discord.js');
const guildController = require('../controllers/guildController');
const startWeeklyNotiScheduler = require('../schedulers/weeklyNotiScheduler');

/**
 * ready Event
 * Fires once when the bot successfully connects to Discord
 */
module.exports = {
  name: Events.ClientReady,
  once: true, // Only fires once
  async execute(client) {
    console.log(`[Bot] ✅ Logged in as ${client.user.tag}`);
    console.log(`[Bot] 📊 Serving ${client.guilds.cache.size} guild(s)`);

    // Set bot activity status
    client.user.setActivity('瑪奇幻想曲', { type: ActivityType.Playing });

    // Register all connected guilds to the database
    client.guilds.cache.forEach(async (guild) => {
      try {
        await guildController.findOrCreate(guild.id, guild.name);
      } catch (error) {
        console.error(`[Event:ready] Failed to register guild ${guild.name}:`, error);
      }
    });

    // 啟動每週更新提醒排程器
    startWeeklyNotiScheduler(client);
  },
};
