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

// 必填 / 選填欄位（label 用於顯示與 modal）
const REQUIRED_FIELDS = [
  { field: 'character_atk', label: '攻擊力' },
  { field: 'character_def', label: '防禦力' },
  { field: 'character_crit', label: '爆擊' },
  { field: 'character_balance', label: '平衡' },
];
const OPTIONAL_FIELDS = [
  { field: 'character_adDamage', label: '追加傷害' },
  { field: 'character_ap', label: '防禦貫穿' },
  { field: 'character_dp', label: '破壞力' },
  { field: 'character_crit_def', label: '爆擊抗性' },
];

// 將字串解析為整數（留空 / 非數字 → null）
function parseStat(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[^\d-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function isMissingRequired(draft) {
  return REQUIRED_FIELDS.some((f) => draft[f.field] == null);
}

// 渲染辨識結果 embed
function buildResultEmbed(draft, userName) {
  const renderLine = ({ field, label }) => {
    const v = draft[field];
    return v == null
      ? `⚠️ **${label}**：（未辨識，請手動填寫）`
      : `• **${label}**：${v}`;
  };

  const missing = isMissingRequired(draft);

  return new EmbedBuilder()
    .setColor(missing ? 0xFEE75C : 0x5865F2)
    .setTitle('🔍 截圖辨識結果')
    .setDescription(
      `角色名稱：**${userName}**\n` +
      `以下為自動辨識的數值，**請務必檢查是否正確**，有錯誤點下方按鈕修改。`
    )
    .addFields(
      { name: '⚔️ 必填屬性', value: REQUIRED_FIELDS.map(renderLine).join('\n') },
      { name: '✨ 選填屬性', value: OPTIONAL_FIELDS.map(renderLine).join('\n') }
    )
    .setFooter({
      text: missing
        ? '⚠️ 必填屬性尚未齊全，請先「修改必填」補齊才能註冊'
        : '確認無誤後請按「✅ 確認註冊」',
    });
}

// 依目前 draft 狀態建立按鈕列（必填未齊全時禁用「確認」）
function buildButtons(draft) {
  const missing = isMissingRequired(draft);
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reg_edit_req').setLabel('✏️ 修改必填').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('reg_edit_opt').setLabel('✏️ 修改選填').setStyle(ButtonStyle.Secondary)
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

// 建立修改用的 modal
function buildEditModal(customId, fields, draft, required) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('修改屬性數值');
  for (const { field, label } of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
      .setPlaceholder('輸入數字' + (required ? '' : '（留空表示無此屬性）'));
    if (draft[field] != null) input.setValue(String(draft[field]));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

/**
 * /register_image command
 * 上傳角色屬性截圖 → 本地 OCR 辨識 → 使用者校正 → 確認後寫入。
 * 全程 ephemeral，僅本人可見。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('register_image')
    .setDescription('上傳角色屬性截圖，自動辨識後確認註冊（僅你可見）')
    .addStringOption((opt) =>
      opt.setName('角色名稱').setDescription('你的瑪英角色名稱').setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt.setName('截圖').setDescription('角色屬性畫面的截圖').setRequired(true)
    ),

  async execute(interaction) {
    const userName = interaction.options.getString('角色名稱');
    const attachment = interaction.options.getAttachment('截圖');

    // 驗證是否為圖片
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      return interaction.reply({
        content: '❌ 請上傳「圖片」檔案（png / jpg 等）。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // OCR 需要幾秒，先 defer（ephemeral）
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── 執行 OCR ──────────────────────────────────────────────
    let draft;
    try {
      const { stats } = await recognizeStats(attachment.url);
      draft = { ...stats };
    } catch (error) {
      console.error('[register_image] OCR 失敗：', error);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 圖片辨識失敗，請改用 `/register` 手動輸入，或換一張更清晰的截圖。'),
        ],
      });
    }

    const reply = await interaction.editReply({
      embeds: [buildResultEmbed(draft, userName)],
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
              .setDescription('⏰ 操作逾時，請重新使用 `/register_image`。'),
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
        if (isMissingRequired(draft)) {
          // 理論上按鈕已禁用，保險起見再擋一次
          await btn.reply({
            content: '⚠️ 必填屬性尚未齊全，請先「修改必填」補齊。',
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
          console.error('[register_image] 寫入失敗：', error);
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

        const successEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(regResult.isNew ? '✅ 角色註冊成功！' : '✅ 角色資料已更新！')
          .setDescription(`角色名稱：**${userName}**`)
          .addFields(
            {
              name: '⚔️ 必填屬性',
              value: REQUIRED_FIELDS.map((f) => `**${f.label}：** ${draft[f.field]}`).join('\n'),
              inline: true,
            },
            {
              name: '✨ 選填屬性',
              value:
                OPTIONAL_FIELDS.filter((f) => draft[f.field] != null)
                  .map((f) => `**${f.label}：** ${draft[f.field]}`)
                  .join('\n') || '（未填寫）',
              inline: true,
            }
          )
          .setFooter({ text: `Discord：${interaction.user.username}｜已設為當前主角` })
          .setTimestamp();

        await btn.update({ embeds: [successEmbed], components: [] });
        return;
      }

      // ── 開啟修改 modal ─────────────────────────────────────
      const isReq = btn.customId === 'reg_edit_req';
      const fields = isReq ? REQUIRED_FIELDS : OPTIONAL_FIELDS;
      const modalId = isReq ? 'reg_modal_req' : 'reg_modal_opt';

      await btn.showModal(buildEditModal(modalId, fields, draft, isReq));

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
        embeds: [buildResultEmbed(draft, userName)],
        components: buildButtons(draft),
      });
    }
  },
};
