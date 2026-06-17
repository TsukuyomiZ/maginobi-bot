const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { POWDERS, SERIES } = require('../../data/pieceYields');

// 將 "1,050,000" / " 15000 " 之類的字串轉成數字，失敗回傳 null
function parsePrice(raw) {
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const fmt = (n) => n.toLocaleString('en-US');

/**
 * /piece_price_calculate
 * Step 1 → 選粉末（紅 / 綠 / 白）
 * Step 2 → 選拆解材料系列（埃柳 / 兀恩雅 / 歐爾納）
 * Step 3 → Modal 填粉末單價（必填，預設 10000）＋材料單價（選填）
 * Step 4 → 計算損益平衡材料價，並給出划算與否的結論
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('piece_price_calculate')
    .setDescription('粉末計算機：比較「直接買粉」與「買材料拆解」哪個划算'),

  async execute(interaction) {
    // ── Step 1：選粉末 ───────────────────────────────────────────
    const powderMenu = new StringSelectMenuBuilder()
      .setCustomId('powder_select')
      .setPlaceholder('🧪 請選擇粉末種類')
      .addOptions(
        Object.entries(POWDERS).map(([key, p]) => ({
          label: `${p.label}（${p.nick}）`,
          value: key,
          emoji: p.emoji,
        }))
      );

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🧮 粉末計算機')
          .setDescription('請先選擇要計算的粉末種類 👇'),
      ],
      components: [new ActionRowBuilder().addComponents(powderMenu)],
      flags: MessageFlags.Ephemeral,
    });

    const powderInteraction = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'powder_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!powderInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/piece_price_calculate`。'),
        ],
        components: [],
      });
    }

    const powderKey = powderInteraction.values[0];
    const powder = POWDERS[powderKey];

    // ── Step 2：選材料系列 ───────────────────────────────────────
    const seriesMenu = new StringSelectMenuBuilder()
      .setCustomId('series_select')
      .setPlaceholder('🪨 請選擇拆解材料系列')
      .addOptions(
        Object.entries(SERIES).map(([key, s]) => ({
          label: `${key}系列（Lv.${s.level}）`,
          description: `拆解每顆產出 ${s.yields[powderKey]} 個${powder.nick}`,
          value: key,
        }))
      );

    await powderInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🧮 粉末計算機 — ${powder.label}（${powder.nick}）`)
          .setDescription('請選擇要拆解的材料系列 👇'),
      ],
      components: [new ActionRowBuilder().addComponents(seriesMenu)],
    });

    const seriesInteraction = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'series_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!seriesInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/piece_price_calculate`。'),
        ],
        components: [],
      });
    }

    const seriesKey = seriesInteraction.values[0];
    const yieldPerMat = SERIES[seriesKey].yields[powderKey];

    // ── Step 3：彈出 Modal 填價格 ────────────────────────────────
    const modal = new ModalBuilder()
      .setCustomId('price_modal')
      .setTitle(`${seriesKey}系列 ${powder.nick} 試算`);

    const powderPriceInput = new TextInputBuilder()
      .setCustomId('powder_price')
      .setLabel(`${powder.nick}單價（每個碎片，必填）`)
      .setStyle(TextInputStyle.Short)
      .setValue('10000')
      .setRequired(true);

    const materialPriceInput = new TextInputBuilder()
      .setCustomId('material_price')
      .setLabel('材料單價（每顆，選填，留空只算平衡點）')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例如 1050000')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(powderPriceInput),
      new ActionRowBuilder().addComponents(materialPriceInput)
    );

    await seriesInteraction.showModal(modal);

    const modalSubmit = await seriesInteraction
      .awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'price_modal',
        time: 120_000,
      })
      .catch(() => null);

    if (!modalSubmit) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/piece_price_calculate`。'),
        ],
        components: [],
      });
    }

    // ── Step 4：解析輸入並計算 ───────────────────────────────────
    const powderPrice = parsePrice(modalSubmit.fields.getTextInputValue('powder_price'));
    const materialRaw = modalSubmit.fields.getTextInputValue('material_price').trim();
    const materialPrice = materialRaw ? parsePrice(materialRaw) : null;

    if (powderPrice === null || (materialRaw && materialPrice === null)) {
      return modalSubmit.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 價格格式錯誤，請輸入大於 0 的數字（可含逗號）。請重新使用 `/piece_price_calculate`。'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 損益平衡材料價：材料低於此價，買材料拆解才划算
    const breakeven = powderPrice * yieldPerMat;

    const resultEmbed = new EmbedBuilder()
      .setColor(powder.color)
      .setTitle(`🧮 ${seriesKey}系列 → ${powder.label}（${powder.nick}）`)
      .addFields(
        { name: '🪨 拆解產出', value: `每顆材料 → **${yieldPerMat}** 個${powder.nick}`, inline: true },
        { name: `${powder.emoji} ${powder.nick}單價`, value: `**${fmt(powderPrice)}** 元`, inline: true },
        {
          name: '⚖️ 損益平衡材料價',
          value:
            `**${fmt(breakeven)}** 元 / 顆\n` +
            `（= ${fmt(powderPrice)} × ${yieldPerMat}）\n` +
            `🔻 材料 **低於** 此價 → 買材料拆解較划算\n` +
            `🔺 材料 **高於** 此價 → 直接買${powder.nick}較划算`,
        },
      );

    // 有填材料價 → 直接給結論
    if (materialPrice !== null) {
      const costPerPiece = materialPrice / yieldPerMat;
      const cheaper = materialPrice < breakeven;
      const diffPerPiece = Math.abs(powderPrice - costPerPiece);

      resultEmbed.addFields({
        name: cheaper ? '✅ 結論：買材料拆解較划算' : '✅ 結論：直接買粉較划算',
        value: [
          `材料單價：**${fmt(materialPrice)}** 元 / 顆`,
          `拆解後每個${powder.nick}成本：**${fmt(Math.round(costPerPiece))}** 元`,
          cheaper
            ? `→ 比直接買${powder.nick}（${fmt(powderPrice)}）每個省 **${fmt(Math.round(diffPerPiece))}** 元`
            : `→ 比直接買${powder.nick}（${fmt(powderPrice)}）每個貴 **${fmt(Math.round(diffPerPiece))}** 元`,
        ].join('\n'),
      });
    }

    resultEmbed
      .setFooter({ text: `查詢者：${interaction.user.username}｜價格為當下輸入值，僅供參考` })
      .setTimestamp();

    // 先把原本的 ephemeral 操作訊息收尾，再公開送出結果讓大家都看得到
    await modalSubmit.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription('✅ 計算完成，結果已公開顯示於下方 👇'),
      ],
      components: [],
    });
    await interaction.followUp({ embeds: [resultEmbed] });
  },
};
