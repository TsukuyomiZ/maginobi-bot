const { Events, MessageFlags } = require('discord.js');

/**
 * interactionCreate Event
 * Handles all slash command interactions
 */
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Only handle chat input commands (slash commands)
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`[Event:interactionCreate] Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Event:interactionCreate] Error executing /${interaction.commandName}:`, error);

      const errorMessage = {
        content: '❌ 執行指令時發生錯誤，請稍後再試！',
        flags: MessageFlags.Ephemeral,
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (followUpError) {
        // Interaction 可能已過期（例如 Bot 重啟），靜默忽略
        console.warn(`[Event:interactionCreate] Could not send error response:`, followUpError.message);
      }
    }
  },
};
