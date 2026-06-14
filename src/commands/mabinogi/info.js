const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const userController = require('../../controllers/userController');

/**
 * /info command - View your own Mabinogi character stats
 * Automatically fetches data using the caller's Discord ID
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('查看你的瑪奇角色數據'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // 直接用 Discord ID 撈資料，不需要使用者輸入任何參數
      const user = await userController.getUser(interaction.user.id);

      // 找不到資料
      if (!user) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ 找不到角色資料')
          .setDescription('你還沒有註冊角色！\n請使用 `/register` 來建立你的角色資訊。')
          .setTimestamp();

        return await interaction.editReply({ embeds: [notFoundEmbed] });
      }

      // ── 建立選填屬性區塊（只顯示有填的欄位）──────────────────
      const optionalFields = [
        user.character_adDamage != null ? `**追加攻擊力：** ${user.character_adDamage}` : null,
        user.character_ap       != null ? `**防禦貫穿：** ${user.character_ap}`         : null,
        user.character_dp       != null ? `**破壞力：** ${user.character_dp}`           : null,
        user.character_crit_def != null ? `**爆擊抗性：** ${user.character_crit_def}`   : null,
      ].filter(Boolean);

      // ── 建立回覆 Embed ────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTitle(`📜 ${user.userName} 的角色數據`)
        .addFields(
          {
            name: '⚔️ 攻擊力',
            value: `${user.character_atk}`,
            inline: true,
          },
          {
            name: '🛡️ 防禦力',
            value: `${user.character_def}`,
            inline: true,
          },
          {
            name: '\u200B', // 空白欄位，讓版面對齊
            value: '\u200B',
            inline: true,
          },
          {
            name: '🎯 爆擊',
            value: `${user.character_crit}`,
            inline: true,
          },
          {
            name: '⚖️ 平衡',
            value: `${user.character_balance}`,
            inline: true,
          },
          {
            name: '\u200B',
            value: '\u200B',
            inline: true,
          },
        )

      // 有選填數據才加入額外欄位
      if (optionalFields.length > 0) {
        embed.addFields({
          name: '✨ 進階屬性',
          value: optionalFields.join('\n'),
        });
      }

      embed
        .setFooter({ text: `最後更新` })
        .setTimestamp(user.updatedAt);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[Command:info] Error:', error);
      await interaction.editReply('❌ 查詢失敗，請稍後再試。');
    }
  },
};
