const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const userController = require('../../controllers/userController');
const { recognizeStats } = require('../../services/statOcr');
const { buildLatestProgressFields, buildShowcaseEmbed } = require('../../utils/latestProgress');

// 所有屬性皆為必填。分成兩組純粹是為了符合 Discord modal「最多 5 個輸入框」的限制，
// 兩個修改按鈕各對應一組（基本 / 進階），與「必填 / 選填」無關。
const GROUP_BASIC = [
  { field: 'character_atk', label: '攻擊力' },
  { field: 'character_def', label: '防禦力' },
  { field: 'character_crit', label: '暴擊' },
  { field: 'character_balance', label: '平衡' },
];
const GROUP_ADVANCED = [
  { field: 'character_adDamage', label: '追加傷害' },
  { field: 'character_ap', label: '防禦貫穿' },
  { field: 'character_dp', label: '破壞力' },
  { field: 'character_crit_def', label: '暴擊抵抗' },
];
const ALL_FIELDS = [...GROUP_BASIC, ...GROUP_ADVANCED];

// 將字串解析為整數（留空 / 非數字 → null）
function parseStat(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[^\d-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// 是否還有屬性未填（全部屬性皆為必填）
function isMissing(draft) {
  return ALL_FIELDS.some((f) => draft[f.field] == null);
}

// 渲染辨識 / 待填結果 embed（manual = OCR 辨識失敗，改由使用者手動填寫）
function buildResultEmbed(draft, userName, manual = false) {
  const renderLine = ({ field, label }) => {
    const v = draft[field];
    if (v != null) return `• **${label}**：${v}`;
    return manual
      ? `▫️ **${label}**：（待填寫）`
      : `⚠️ **${label}**：（未辨識，請手動填寫）`;
  };

  const missing = isMissing(draft);

  return new EmbedBuilder()
    .setColor(missing ? 0xFEE75C : 0x5865F2)
    .setTitle(manual ? '⚠️ 圖片辨識失敗，請手動填寫' : '🔍 截圖辨識結果')
    .setDescription(
      manual
        ? `角色名稱：**${userName}**\n` +
          `自動辨識失敗（圖片可能不夠清晰）。請點下方按鈕**手動填寫**屬性，全部補齊後即可註冊。`
        : `角色名稱：**${userName}**\n` +
          `以下為自動辨識的數值，**請務必檢查是否正確**，有錯誤點下方按鈕修改。`
    )
    .addFields(
      { name: '⚔️ 基本屬性', value: GROUP_BASIC.map(renderLine).join('\n') },
      { name: '✨ 進階屬性', value: GROUP_ADVANCED.map(renderLine).join('\n') }
    )
    .setFooter({
      text: missing
        ? '⚠️ 還有屬性未填，請用「修改基本 / 修改進階」補齊才能註冊'
        : '確認無誤後請按「✅ 確認註冊」',
    });
}

// 依目前 draft 狀態建立按鈕列（屬性未填齊時禁用「確認」）
function buildButtons(draft) {
  const missing = isMissing(draft);
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reg_edit_basic').setLabel('✏️ 修改基本屬性').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('reg_edit_adv').setLabel('✏️ 修改進階屬性').setStyle(ButtonStyle.Secondary)
  );
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reg_confirm')
      .setLabel('✅ 確認註冊')
      .setStyle(ButtonStyle.Success)
      .setDisabled(missing),
    new ButtonBuilder().setCustomId('reg_cancel').setLabel('❌ 取消').setStyle(ButtonStyle.Danger)
  );
  return [editRow, actionRow];
}

// 建立修改用的 modal（所有屬性皆為必填）
function buildEditModal(customId, fields, draft) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('修改屬性數值');
  for (const { field, label } of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('輸入數字（沒有此屬性請填 0）');
    if (draft[field] != null) input.setValue(String(draft[field]));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

/**
 * /register command
 * 註冊或更新瑪奇角色屬性：附上角色屬性截圖 → 本地 OCR 自動辨識 → 使用者校正 → 確認後寫入。
 * 所有屬性皆為必填；可用「修改基本 / 修改進階」按鈕手動校正，全程 ephemeral，僅本人可見。
 * 辨識失敗時會改為空白草稿讓使用者直接手動填寫。
 * 用相同角色名稱再執行一次即為「更新」。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('註冊或更新你的瑪奇角色（可上傳截圖自動辨識，或純手動輸入）')
    .addStringOption((opt) =>
      opt.setName('角色名稱').setDescription('你的瑪奇角色名稱').setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName('截圖')
        .setDescription('角色屬性畫面的截圖，會自動辨識數值（辨識後仍可手動校正）')
        .setRequired(true)
    ),

  async execute(interaction) {
    const userName = interaction.options.getString('角色名稱');
    const attachment = interaction.options.getAttachment('截圖');

    // 附檔不是圖片
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      return interaction.reply({
        content: '❌ 請上傳「圖片」檔案（png / jpg 等）。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // OCR 需要幾秒，先 defer（ephemeral）
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── 執行 OCR；辨識失敗則改用空白草稿，讓使用者直接手動補齊 ──────
    let draft;
    let manual = false;
    try {
      const { stats } = await recognizeStats(attachment.url);
      draft = { ...stats };
    } catch (error) {
      console.error('[register] OCR 失敗：', error);
      manual = true;
      draft = {};
      for (const { field } of ALL_FIELDS) draft[field] = null;
    }

    const reply = await interaction.editReply({
      embeds: [buildResultEmbed(draft, userName, manual)],
      components: buildButtons(draft),
    });

    // ── 互動迴圈：修改 / 確認 / 取消 ───────────────────────────
    const isOwner = (i) => i.user.id === interaction.user.id;

    while (true) {
      const btn = await reply
        .awaitMessageComponent({ filter: isOwner, time: 300_000 })
        .catch(() => null);

      if (!btn) {
        // 逾時：移除按鈕
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setDescription('⏰ 操作逾時，請重新使用 `/register`。'),
          ],
          components: [],
        });
        return;
      }

      // ── 取消 ───────────────────────────────────────────────
      if (btn.customId === 'reg_cancel') {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99AAB5)
              .setDescription('已取消，未寫入任何資料。'),
          ],
          components: [],
        });
        return;
      }

      // ── 確認註冊 ────────────────────────────────────────────
      if (btn.customId === 'reg_confirm') {
        if (isMissing(draft)) {
          // 理論上按鈕已禁用，保險起見再擋一次
          await btn.reply({
            content: '⚠️ 還有屬性未填，請先用「修改基本 / 修改進階」補齊。',
            flags: MessageFlags.Ephemeral,
          });
          continue;
        }

        let regResult;
        try {
          regResult = await userController.addOrUpdateCharacter(interaction.user.id, interaction.user.username, {
            userName,
            character_atk: draft.character_atk,
            character_def: draft.character_def,
            character_crit: draft.character_crit,
            character_balance: draft.character_balance,
            character_adDamage: draft.character_adDamage,
            character_ap: draft.character_ap,
            character_dp: draft.character_dp,
            character_crit_def: draft.character_crit_def,
          });
        } catch (error) {
          if (error.message === 'MAX_CHARACTERS_REACHED') {
            await btn.update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xED4245)
                  .setDescription(
                    `❌ 角色數量已達上限（${userController.MAX_CHARACTERS} 隻）。\n` +
                    `請先用 \`/character delete\` 刪除一隻，或用相同角色名稱來更新既有角色。`
                  ),
              ],
              components: [],
            });
            return;
          }
          console.error('[register] 寫入失敗：', error);
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setDescription('❌ 寫入資料庫失敗，請稍後再試。'),
            ],
            components: [],
          });
          return;
        }

        // 以資料庫實際存下的值作為顯示來源
        const c = regResult.character;
        const savedCharacter = {
          userName: c.userName,
          character_atk: c.character_atk,
          character_def: c.character_def,
          character_crit: c.character_crit,
          character_balance: c.character_balance,
          character_adDamage: c.character_adDamage ?? null,
          character_ap: c.character_ap ?? null,
          character_dp: c.character_dp ?? null,
          character_crit_def: c.character_crit_def ?? null,
        };

        const successEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(regResult.isNew ? '✅ 角色註冊成功！' : '✅ 角色資料已更新！')
          .setDescription(`角色名稱：**${userName}**`)
          .addFields(
            {
              name: '⚔️ 基本屬性',
              value: GROUP_BASIC.map((f) => `**${f.label}：** ${savedCharacter[f.field]}`).join('\n'),
              inline: true,
            },
            {
              name: '✨ 進階屬性',
              value: GROUP_ADVANCED.map((f) => `**${f.label}：** ${savedCharacter[f.field]}`).join('\n'),
              inline: true,
            }
          )
          .setFooter({ text: `Discord：${interaction.user.username}｜已設為當前主角｜輸入 /help 看看還能做什麼` })
          .setTimestamp();

        // ── 附上「最新副本 / 最新 STD 副本」進度（查無資料則自動略過）──
        const progressFields = await buildLatestProgressFields(savedCharacter);
        if (progressFields.length) {
          successEmbed.addFields(
            { name: '​', value: '**📊 距離當期最新內容的進度**' },
            ...progressFields
          );
        }

        // 成功訊息保留私人可見，並提供「公開分享」按鈕讓玩家自行決定是否貼出
        const shareRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('reg_share')
            .setLabel('📢 公開分享進度')
            .setStyle(ButtonStyle.Primary)
        );
        await btn.update({ embeds: [successEmbed], components: [shareRow] });

        // 等待玩家是否按下公開分享（逾時則靜默移除按鈕）
        const shareBtn = await reply
          .awaitMessageComponent({
            filter: (i) => isOwner(i) && i.customId === 'reg_share',
            time: 120_000,
          })
          .catch(() => null);

        if (shareBtn) {
          // 收掉按鈕並公開貼出展示卡
          await shareBtn.update({ embeds: [successEmbed], components: [] });
          await interaction.followUp({
            embeds: [
              buildShowcaseEmbed({
                user: interaction.user,
                character: savedCharacter,
                isNew: regResult.isNew,
                progressFields,
              }),
            ],
          });
        } else {
          await interaction.editReply({ components: [] }).catch(() => {});
        }
        return;
      }

      // ── 開啟修改 modal（基本 / 進階兩組，皆為必填）──────────────
      const isBasic = btn.customId === 'reg_edit_basic';
      const fields = isBasic ? GROUP_BASIC : GROUP_ADVANCED;
      const modalId = isBasic ? 'reg_modal_basic' : 'reg_modal_adv';

      await btn.showModal(buildEditModal(modalId, fields, draft));

      const modalSubmit = await btn
        .awaitModalSubmit({ filter: (i) => isOwner(i) && i.customId === modalId, time: 120_000 })
        .catch(() => null);

      if (!modalSubmit) {
        // 使用者沒送出 modal：原訊息按鈕仍有效，回到迴圈等待下次操作
        continue;
      }

      // 套用 modal 輸入到 draft
      for (const { field } of fields) {
        draft[field] = parseStat(modalSubmit.fields.getTextInputValue(field));
      }

      // 用 modal 互動更新原訊息
      await modalSubmit.update({
        embeds: [buildResultEmbed(draft, userName, manual)],
        components: buildButtons(draft),
      });
    }
  },
};
