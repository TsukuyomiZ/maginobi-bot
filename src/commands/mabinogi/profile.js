const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const userController = require('../../controllers/userController');

/**
 * /profile command - View your Mabinogi character profile
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your Mabinogi character profile'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const user = await userController.findOrCreate(
        interaction.user.id,
        interaction.user.username
      );

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📜 ${interaction.user.username} 的角色資訊`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '🧙 角色名稱',
            value: user.mabinogiCharacter || '尚未設定',
            inline: true,
          },
          {
            name: '🌐 伺服器',
            value: user.server || '尚未設定',
            inline: true,
          },
          {
            name: '⭐ 積分',
            value: `${user.points} 點`,
            inline: true,
          }
        )
        .setFooter({ text: `Discord ID: ${user.discordId}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[Command:profile] Error:', error);
      await interaction.editReply('❌ 發生錯誤，請稍後再試。');
    }
  },
};
