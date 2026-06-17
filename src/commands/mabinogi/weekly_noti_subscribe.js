const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const notificationController = require('../../controllers/notificationController');

// 星期標籤（index 對應 Date.getDay()：0=週日）
const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/**
 * /weekly_noti_subscribe command
 * 訂閱每週更新提醒：
 *   Step 1 → 選星期幾 dropdown
 *   Step 2 → 選整點 dropdown
 *   Step 3 → upsert 到 WeekUpdate_notication（第一次建立、第二次更新）
 * 設定時間到達時，由排程器在公告頻道 @ 該使用者。
 * 時間以台灣時間（UTC+8）為準，回覆僅本人可見。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('weekly_noti_subscribe')
    .setDescription('訂閱每週更新提醒，設定提醒的星期與時間（台灣時間，僅你可見）'),

  async execute(interaction) {
    // ── Step 1：顯示星期 dropdown ─────────────────────────────
    const dayMenu = new StringSelectMenuBuilder()
      .setCustomId('noti_day_select')
      .setPlaceholder('📅 請選擇提醒的星期')
      .addOptions(
        DAY_LABELS.map((label, idx) => ({ label, value: idx.toString() }))
      );

    const dayRow = new ActionRowBuilder().addComponents(dayMenu);

    // 顯示目前已有的訂閱（若有）
    const existing = await notificationController.getSubscription(interaction.user.id);
    const existingText = existing
      ? `\n\n目前設定：每${DAY_LABELS[existing.dayOfWeek]} **${String(existing.hour).padStart(2, '0')}:00**（台灣時間）`
      : '';

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔔 每週更新提醒訂閱')
          .setDescription(`請先選擇要提醒的星期 👇${existingText}`),
      ],
      components: [dayRow],
      flags: MessageFlags.Ephemeral,
    });

    // ── Step 2：等待選擇星期 ──────────────────────────────────
    const dayInteraction = await reply
      .awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && i.customId === 'noti_day_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!dayInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/weekly_noti_subscribe`。'),
        ],
        components: [],
      });
    }

    const dayOfWeek = parseInt(dayInteraction.values[0], 10);

    // ── Step 3：顯示整點 dropdown ─────────────────────────────
    const hourMenu = new StringSelectMenuBuilder()
      .setCustomId('noti_hour_select')
      .setPlaceholder('🕐 請選擇提醒的整點時間')
      .addOptions(
        Array.from({ length: 24 }, (_, h) => ({
          label: `${String(h).padStart(2, '0')}:00`,
          value: h.toString(),
        }))
      );

    const hourRow = new ActionRowBuilder().addComponents(hourMenu);

    await dayInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔔 每週更新提醒訂閱')
          .setDescription(`星期：**${DAY_LABELS[dayOfWeek]}**\n請選擇提醒時間（整點，台灣時間）👇`),
      ],
      components: [hourRow],
    });

    // ── Step 4：等待選擇整點 ──────────────────────────────────
    const hourInteraction = await reply
      .awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && i.customId === 'noti_hour_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!hourInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/weekly_noti_subscribe`。'),
        ],
        components: [],
      });
    }

    const hour = parseInt(hourInteraction.values[0], 10);

    // ── Step 5：寫入資料庫（第一次建立、第二次更新）────────────
    await notificationController.subscribe(
      interaction.user.id,
      interaction.user.username,
      {
        dayOfWeek,
        hour,
        guildId: interaction.guildId,
      }
    );

    await hourInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ 提醒訂閱成功！')
          .setDescription(
            `已設定在每**${DAY_LABELS[dayOfWeek]} ${String(hour).padStart(2, '0')}:00**（台灣時間）提醒你。\n` +
            `屆時我會在公告頻道 @ 你，通知本週副本已更新 🔔`
          )
          .setFooter({ text: '再次使用 /weekly_noti_subscribe 可隨時更改時間' })
          .setTimestamp(),
      ],
      components: [],
    });
  },
};
