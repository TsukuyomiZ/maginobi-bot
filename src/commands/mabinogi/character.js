const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const userController = require('../../controllers/userController');

// 角色一行摘要（用於 list 與選單 description）
function statLine(c) {
  return `攻 ${c.character_atk}｜防 ${c.character_def}｜爆 ${c.character_crit}｜平 ${c.character_balance}`;
}

/**
 * /character command — 管理多角色
 *   /character list    列出你的所有角色（標示當前主角）
 *   /character switch  切換當前主角
 *   /character delete  刪除一隻角色
 * 全程 ephemeral，僅本人可見。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('管理你的多個瑪奇角色')
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('列出你已註冊的所有角色'))
    .addSubcommand((sub) =>
      sub.setName('switch').setDescription('切換當前主角'))
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('刪除一隻角色')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const uid = interaction.user.id;

    if (sub === 'list') return this.handleList(interaction, uid);
    if (sub === 'switch') return this.handleSwitch(interaction, uid);
    if (sub === 'delete') return this.handleDelete(interaction, uid);
  },

  // ── /character list ────────────────────────────────────────
  async handleList(interaction, uid) {
    const [chars, activeId] = await Promise.all([
      userController.listCharacters(uid),
      userController.getActiveCharacterId(uid),
    ]);

    if (!chars.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('你還沒有註冊任何角色，請先使用 `/register`。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📒 你的角色（${chars.length} / ${userController.MAX_CHARACTERS}）`)
      .setDescription('⭐ 為當前主角；用 `/character switch` 可切換。')
      .addFields(
        chars.map((c) => ({
          name: `${c._id.toString() === activeId ? '⭐ ' : ''}${c.userName}`,
          value: statLine(c),
        }))
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  // ── /character switch ──────────────────────────────────────
  async handleSwitch(interaction, uid) {
    const [chars, activeId] = await Promise.all([
      userController.listCharacters(uid),
      userController.getActiveCharacterId(uid),
    ]);

    if (!chars.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('你還沒有註冊任何角色，請先使用 `/register`。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (chars.length === 1) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setDescription(`你只有一隻角色 **${chars[0].userName}**，無需切換。`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('char_switch_select')
      .setPlaceholder('🔀 請選擇要設為主角的角色')
      .addOptions(
        chars.map((c) => ({
          label: `${c._id.toString() === activeId ? '⭐ ' : ''}${c.userName}`.slice(0, 100),
          description: statLine(c).slice(0, 100),
          value: c._id.toString(),
        }))
      );

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔀 切換主角')
          .setDescription('請選擇要設為當前主角的角色 👇'),
      ],
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });

    const select = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === uid && i.customId === 'char_switch_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!select) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/character switch`。'),
        ],
        components: [],
      });
    }

    const character = await userController.setActiveCharacter(uid, select.values[0]);

    return select.update({
      embeds: [
        new EmbedBuilder()
          .setColor(character ? 0x57F287 : 0xED4245)
          .setDescription(
            character
              ? `✅ 已將當前主角切換為 **${character.userName}**。`
              : '❌ 切換失敗，找不到該角色。'
          ),
      ],
      components: [],
    });
  },

  // ── /character delete ──────────────────────────────────────
  async handleDelete(interaction, uid) {
    const [chars, activeId] = await Promise.all([
      userController.listCharacters(uid),
      userController.getActiveCharacterId(uid),
    ]);

    if (!chars.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('你還沒有註冊任何角色，沒有可刪除的對象。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('char_delete_select')
      .setPlaceholder('🗑️ 請選擇要刪除的角色')
      .addOptions(
        chars.map((c) => ({
          label: `${c._id.toString() === activeId ? '⭐ ' : ''}${c.userName}`.slice(0, 100),
          description: statLine(c).slice(0, 100),
          value: c._id.toString(),
        }))
      );

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🗑️ 刪除角色')
          .setDescription('請選擇要刪除的角色 👇（下一步會再次確認）'),
      ],
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });

    const select = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === uid && i.customId === 'char_delete_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!select) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/character delete`。'),
        ],
        components: [],
      });
    }

    const targetId = select.values[0];
    const target = chars.find((c) => c._id.toString() === targetId);

    // 二次確認
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('char_delete_confirm').setLabel('✅ 確認刪除').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('char_delete_cancel').setLabel('❌ 取消').setStyle(ButtonStyle.Secondary)
    );

    await select.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle('⚠️ 確認刪除')
          .setDescription(`確定要刪除角色 **${target?.userName ?? '（未知）'}** 嗎？此動作無法復原。`),
      ],
      components: [confirmRow],
    });

    const btn = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === uid && ['char_delete_confirm', 'char_delete_cancel'].includes(i.customId),
        time: 60_000,
      })
      .catch(() => null);

    if (!btn || btn.customId === 'char_delete_cancel') {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setDescription(btn ? '已取消，未刪除任何角色。' : '⏰ 操作逾時，未刪除任何角色。'),
        ],
        components: [],
      });
    }

    const deleted = await userController.deleteCharacter(uid, targetId);
    const newActive = await userController.getActiveCharacter(uid);

    return btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor(deleted ? 0x57F287 : 0xED4245)
          .setDescription(
            deleted
              ? `🗑️ 已刪除角色 **${deleted.userName}**。` +
                (newActive ? `\n當前主角為 **${newActive.userName}**。` : '\n你已沒有任何角色，請用 `/register` 重新註冊。')
              : '❌ 刪除失敗，找不到該角色。'
          ),
      ],
      components: [],
    });
  },
};
