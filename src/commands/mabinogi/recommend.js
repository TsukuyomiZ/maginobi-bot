const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const userController = require('../../controllers/userController');
const { buildRecommendFieldsFor } = require('../../utils/recommend');

/**
 * /recommend command
 * 依角色屬性，找出最適合打的副本：屬性達標可進入 ＋ 滿爆（暴擊）＋ 滿平（平衡）。
 * 留空角色名稱則用當前主角。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('recommend')
    .setDescription('依你的角色屬性，找出最適合打（可滿平滿爆）的副本')
    .addStringOption((option) =>
      option
        .setName('角色名稱')
        .setDescription('（選填）要推薦的角色，留空則用當前主角')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  // 自動完成：列出「當前使用者自己的角色」供下拉選擇
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const chars = await userController.listCharacters(interaction.user.id);
    const choices = chars
      .filter((c) => c.userName.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((c) => ({ name: c.userName, value: c.userName }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    // 預設不公開，僅本人可見（之後可由「公開分享」按鈕自行貼出）
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // 有指定角色名稱 → 用該隻；否則用當前主角
      const targetName = interaction.options.getString('角色名稱');
      const user = targetName
        ? await userController.getCharacterByName(interaction.user.id, targetName)
        : await userController.getActiveCharacter(interaction.user.id);

      if (!user) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ 找不到角色資料')
          .setDescription(
            targetName
              ? `找不到名為 **${targetName}** 的角色。可用 \`/character list\` 查看你已註冊的角色。`
              : '你還沒有註冊角色！\n請使用 `/register` 填角色名稱並附上屬性截圖來建立角色。\n不確定怎麼操作？輸入 `/help` 查看完整教學。'
          )
          .setTimestamp();
        return await interaction.editReply({ embeds: [notFoundEmbed] });
      }

      const fields = await buildRecommendFieldsFor(user);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTitle(`🎯 ${user.userName} 最適合打的副本`)
        .setDescription(
          '篩選條件：**屬性達標可進入** ＋ **滿爆（暴擊）** ＋ **滿平（平衡）**。\n' +
          '優先推薦你能完美發揮的最高等級副本。'
        )
        .setFooter({ text: `角色：${user.userName}｜輸入 /battle_compare 看單一關卡細節` })
        .setTimestamp();

      if (fields.length) embed.addFields(...fields);

      // 私人結果保留 ephemeral，附「公開分享」按鈕讓玩家自行決定是否貼出
      const shareRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rec_share')
          .setLabel('📢 公開分享進度')
          .setStyle(ButtonStyle.Primary)
      );
      const reply = await interaction.editReply({ embeds: [embed], components: [shareRow] });

      // 等待玩家是否按下公開分享（逾時則靜默移除按鈕）
      const shareBtn = await reply
        .awaitMessageComponent({
          filter: (i) => i.user.id === interaction.user.id && i.customId === 'rec_share',
          time: 120_000,
        })
        .catch(() => null);

      if (shareBtn) {
        // 收掉按鈕並公開貼出推薦結果
        await shareBtn.update({ embeds: [embed], components: [] });
        await interaction.followUp({ embeds: [embed] });
      } else {
        await interaction.editReply({ components: [] }).catch(() => {});
      }
    } catch (error) {
      console.error('[Command:recommend] Error:', error);
      await interaction.editReply('❌ 推薦失敗，請稍後再試。');
    }
  },
};
