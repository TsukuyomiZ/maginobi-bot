const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const userController = require('../../controllers/userController');

// 要比對的屬性欄位（依 User model 定義）
const COMPARE_FIELDS = [
  { name: '攻擊力',     field: 'character_atk' },
  { name: '防禦力',     field: 'character_def' },
  { name: '爆擊',       field: 'character_crit' },
  { name: '平衡',       field: 'character_balance' },
  { name: '追加傷害',   field: 'character_adDamage' },
  { name: '防禦貫穿',   field: 'character_ap' },
  { name: '破壞力',     field: 'character_dp' },
  { name: '爆擊抵抗',   field: 'character_crit_def' },
];

/**
 * /character_compare command
 * 以發起者（DC 使用者）的角色為基準，
 * 透過 dropdown 選擇另一位使用者的角色，逐項比對數值。
 * 結果為 ephemeral，只有發起者本人看得到。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('character_compare')
    .setDescription('以你的角色為基準，比對其他使用者的角色數值（結果僅你可見）'),

  async execute(interaction) {
    // ── Step 1：取得發起者的當前主角作為比對基準 ──────────────
    const me = await userController.getActiveCharacter(interaction.user.id);

    if (!me) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 找不到你的角色資料，請先使用 `/register` 註冊。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Step 2：取得其他人的所有角色 ──────────────────────────
    const others = await userController.getAllCharacters(interaction.user.id);

    if (!others.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 目前沒有其他已註冊的角色可以比對。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Step 3：顯示角色 dropdown（其他人的所有角色）──────────
    const userMenu = new StringSelectMenuBuilder()
      .setCustomId('compare_user_select')
      .setPlaceholder('👤 請選擇要比對的角色')
      .addOptions(
        others.map((c) => ({
          label: c.userName.slice(0, 100),
          description: `Discord：${c.discordUsername}`.slice(0, 100),
          value: c._id.toString(),
        }))
      );

    const userRow = new ActionRowBuilder().addComponents(userMenu);

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🆚 角色數值比較')
          .setDescription(
            `基準角色：**${me.userName}**\n請選擇要比對的對象 👇`
          ),
      ],
      components: [userRow],
      flags: MessageFlags.Ephemeral,
    });

    // ── Step 4：等待使用者選擇 ────────────────────────────────
    const selectInteraction = await reply
      .awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && i.customId === 'compare_user_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!selectInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/character_compare`。'),
        ],
        components: [],
      });
    }

    // ── Step 5：取得對方角色資料 ──────────────────────────────
    const other = await userController.getCharacterById(selectInteraction.values[0]);

    if (!other) {
      return selectInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 找不到對方的角色資料，可能已被刪除。'),
        ],
        components: [],
      });
    }

    // ── Step 6：逐項比對 ──────────────────────────────────────
    const resultEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🆚 角色數值比較結果')
      .setDescription(`**${me.userName}**（你） vs **${other.userName}**`)
      .setFooter({ text: `對方 Discord：${other.discordUsername}` })
      .setTimestamp();

    const hasMissing = COMPARE_FIELDS.some(
      (f) => me[f.field] == null || other[f.field] == null
    );

    for (const f of COMPARE_FIELDS) {
      const myVal = me[f.field];
      const otherVal = other[f.field];

      // 任一方未填，顯示為「—」並標註
      if (myVal == null || otherVal == null) {
        resultEmbed.addFields({
          name: `➖ ${f.name}`,
          value: [
            `你：**${myVal ?? '—'}**`,
            `對方：**${otherVal ?? '—'}**`,
            `（資料不完整）`,
          ].join('\n'),
          inline: true,
        });
        continue;
      }

      const diff = myVal - otherVal;
      let icon;
      let diffText;
      if (diff > 0) {
        icon = '🔼';
        diffText = `領先 **+${diff}**`;
      } else if (diff < 0) {
        icon = '🔽';
        diffText = `落後 **${diff}**`;
      } else {
        icon = '➡️';
        diffText = `**持平**`;
      }

      resultEmbed.addFields({
        name: `${icon} ${f.name}`,
        value: [
          `你：**${myVal}**`,
          `對方：**${otherVal}**`,
          diffText,
        ].join('\n'),
        inline: true,
      });
    }

    if (hasMissing) {
      resultEmbed.addFields({
        name: '⚠️ 提醒',
        value: '部分屬性其中一方未填寫（顯示為 —），比對結果僅供參考。可使用 `/register` 補齊資料。',
      });
    }

    // ── Step 7：更新訊息顯示結果（維持 ephemeral，僅本人可見）──
    await selectInteraction.update({
      embeds: [resultEmbed],
      components: [],
    });
  },
};
