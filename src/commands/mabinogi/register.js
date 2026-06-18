const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const userController = require('../../controllers/userController');
const { buildLatestProgressFields, buildShowcaseEmbed } = require('../../utils/latestProgress');

/**
 * /register command - Register or update Mabinogi character stats
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('註冊或更新你的瑪奇角色資訊')

    // ── 必填參數 ────────────────────────────────────────────
    .addStringOption((option) =>
      option
        .setName('角色名稱')
        .setDescription('你的瑪奇角色名稱')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('攻擊力')
        .setDescription('攻擊力 / 魔法攻擊力')
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('防禦力')
        .setDescription('防禦力')
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('暴擊')
        .setDescription('暴擊')
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('平衡')
        .setDescription('平衡')
        .setRequired(true)
        .setMinValue(0)
    )

    // ── 選填參數 ────────────────────────────────────────────
    .addIntegerOption((option) =>
      option
        .setName('追加傷害')
        .setDescription('（選填）追加傷害')
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('防禦貫穿')
        .setDescription('（選填）防禦力貫穿')
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('破壞力')
        .setDescription('（選填）破壞力')
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName('暴擊抵抗')
        .setDescription('（選填）暴擊抵抗')
        .setRequired(false)
        .setMinValue(0)
    )
    .addBooleanOption((option) =>
      option
        .setName('公開')
        .setDescription('（選填）是否公開分享這次的屬性與最新副本進度給其他人看，預設不公開')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // ── 讀取必填參數 ──────────────────────────────────────
      const characterData = {
        userName:           interaction.options.getString('角色名稱'),
        character_atk:      interaction.options.getInteger('攻擊力'),
        character_def:      interaction.options.getInteger('防禦力'),
        character_crit:     interaction.options.getInteger('暴擊'),
        character_balance:  interaction.options.getInteger('平衡'),

        // ── 讀取選填參數（未填為 null）──────────────────────
        character_adDamage: interaction.options.getInteger('追加傷害') ?? null,
        character_ap:       interaction.options.getInteger('防禦貫穿')   ?? null,
        character_dp:       interaction.options.getInteger('破壞力')     ?? null,
        character_crit_def: interaction.options.getInteger('暴擊抵抗')   ?? null,
      };

      // ── 寫入資料庫（同名更新 / 新名新增，並設為當前主角）──────
      let result;
      try {
        result = await userController.addOrUpdateCharacter(
          interaction.user.id,
          interaction.user.username,
          characterData
        );
      } catch (error) {
        if (error.message === 'MAX_CHARACTERS_REACHED') {
          return await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setDescription(
                  `❌ 角色數量已達上限（${userController.MAX_CHARACTERS} 隻）。\n` +
                  `請先用 \`/character delete\` 刪除一隻，或直接用相同角色名稱來「更新」既有角色。`
                ),
            ],
          });
        }
        throw error;
      }

      // ── 建立回覆 Embed ────────────────────────────────────
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(result.isNew ? '✅ 角色註冊成功！' : '✅ 角色資料已更新！')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📋 基本資訊',
            value: `**角色名稱：** ${characterData.userName}`,
          },
          {
            name: '⚔️ 必填屬性',
            value: [
              `**攻擊力：** ${characterData.character_atk}`,
              `**防禦力：** ${characterData.character_def}`,
              `**暴擊：** ${characterData.character_crit}`,
              `**平衡：** ${characterData.character_balance}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '✨ 選填屬性',
            value: [
              characterData.character_adDamage !== null ? `**追加傷害：** ${characterData.character_adDamage}` : null,
              characterData.character_ap       !== null ? `**防禦貫穿：** ${characterData.character_ap}`         : null,
              characterData.character_dp       !== null ? `**破壞力：** ${characterData.character_dp}`           : null,
              characterData.character_crit_def !== null ? `**暴擊抵抗：** ${characterData.character_crit_def}`   : null,
            ]
              .filter(Boolean)
              .join('\n') || '（未填寫）',
            inline: true,
          }
        )
        .setFooter({ text: `Discord：${interaction.user.username}｜已設為當前主角` })
        .setTimestamp();

      // ── 附上「最新副本 / 最新 STD 副本」進度（查無資料則自動略過）──
      const progressFields = await buildLatestProgressFields(characterData);
      if (progressFields.length) {
        embed.addFields(
          { name: '​', value: '**📊 距離當期最新內容的進度**' },
          ...progressFields
        );
      }

      await interaction.editReply({ embeds: [embed] });

      // ── 玩家選擇公開 → 額外公開貼出展示卡讓大家看得到 ──────────
      if (interaction.options.getBoolean('公開')) {
        await interaction.followUp({
          embeds: [
            buildShowcaseEmbed({
              user: interaction.user,
              character: characterData,
              isNew: result.isNew,
              progressFields,
            }),
          ],
        });
      }
    } catch (error) {
      console.error('[Command:register] Error:', error);
      await interaction.editReply('❌ 註冊失敗，請稍後再試。');
    }
  },
};
