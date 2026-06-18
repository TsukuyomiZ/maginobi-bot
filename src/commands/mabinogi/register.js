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
const { getSampleImage } = require('../../utils/sampleImage');
const { buildLatestProgressFields, buildShowcaseEmbed } = require('../../utils/latestProgress');

// 必填 / 選填欄位（label 用於顯示與 modal）
const REQUIRED_FIELDS = [
  { field: 'character_atk', label: '攻擊力' },
  { field: 'character_def', label: '防禦力' },
  { field: 'character_crit', label: '暴擊' },
  { field: 'character_balance', label: '平衡' },
];
const OPTIONAL_FIELDS = [
  { field: 'character_adDamage', label: '追加傷害' },
  { field: 'character_ap', label: '防禦貫穿' },
  { field: 'character_dp', label: '破壞力' },
  { field: 'character_crit_def', label: '暴擊抵抗' },
];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

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

// 渲染辨識 / 待填結果 embed（manual = 純手動輸入，無截圖辨識）
function buildResultEmbed(draft, userName, manual = false) {
  const renderLine = ({ field, label }) => {
    const v = draft[field];
    if (v != null) return `• **${label}**：${v}`;
    return manual
      ? `▫️ **${label}**：（待填寫）`
      : `⚠️ **${label}**：（未辨識，請手動填寫）`;
  };

  const missing = isMissingRequired(draft);

  return new EmbedBuilder()
    .setColor(missing ? 0xFEE75C : 0x5865F2)
    .setTitle(manual ? '📝 手動註冊角色' : '🔍 截圖辨識結果')
    .setDescription(
      manual
        ? `角色名稱：**${userName}**\n` +
          `請點下方按鈕填寫屬性數值，**必填屬性補齊後**即可確認註冊。`
        : `角色名稱：**${userName}**\n` +
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
 * /register command
 * 註冊或更新瑪奇角色屬性，支援兩種方式：
 *   1. 附上角色屬性截圖 → 本地 OCR 自動辨識 → 使用者校正 → 確認後寫入。
 *   2. 不附截圖、僅填角色名稱 → 直接進入手動填寫流程。
 * 兩者皆有「修改必填 / 修改選填」可手動校正，全程 ephemeral，僅本人可見。
 * 用相同角色名稱再執行一次即為「更新」；本次未填的選填屬性會沿用既有值。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('註冊或更新你的瑪奇角色（可上傳截圖自動辨識，或純手動輸入）')
    .addStringOption((opt) =>
      opt.setName('角色名稱').setDescription('你的瑪奇角色名稱').setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName('截圖')
        .setDescription('（選填）角色屬性畫面的截圖，附上可自動辨識；留空則手動輸入')
        .setRequired(false)
    ),

  async execute(interaction) {
    const userName = interaction.options.getString('角色名稱');
    const attachment = interaction.options.getAttachment('截圖');

    // 既沒附截圖也沒填角色名稱 → 顯示「該怎麼用」的教學（含示意圖）
    if (!attachment && !userName) {
      const tutorialEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📷 如何註冊角色')
        .setDescription(
          '**方式 A｜上傳截圖自動辨識（最快）**\n' +
          '1️⃣ 在遊戲中開啟角色的**屬性 / 角色資訊**面板\n' +
          '2️⃣ 截取**整塊屬性數值**的畫面（像下方示意圖那樣，包含攻擊力、防禦力、暴擊、平衡…等）\n' +
          '3️⃣ 再執行一次 `/register`，把截圖放到「**截圖**」欄位，並填上「**角色名稱**」\n\n' +
          '**方式 B｜純手動輸入**\n' +
          '• 執行 `/register` 只填「**角色名稱**」（不附截圖），即可進入手動填寫流程。\n\n' +
          '💡 數字越清晰、裁切越乾淨，辨識越準確；辨識後仍可手動修正再確認。'
        );

      const sample = getSampleImage();
      const payload = { embeds: [tutorialEmbed], flags: MessageFlags.Ephemeral };
      if (sample) {
        tutorialEmbed.setImage(sample.url);
        payload.files = [sample.attachment];
      }
      return interaction.reply(payload);
    }

    // 有截圖但沒填角色名稱
    if (attachment && !userName) {
      return interaction.reply({
        content: '❌ 請填寫「角色名稱」欄位後再送出。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // 有附檔但不是圖片
    if (attachment && (!attachment.contentType || !attachment.contentType.startsWith('image/'))) {
      return interaction.reply({
        content: '❌ 請上傳「圖片」檔案（png / jpg 等），或不附截圖改為手動輸入。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // OCR / 互動流程可能需要幾秒，先 defer（ephemeral）
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const manual = !attachment;

    // ── 建立 draft：有截圖 → OCR；純手動 → 空白草稿 ───────────────
    let draft;
    if (attachment) {
      try {
        const { stats } = await recognizeStats(attachment.url);
        draft = { ...stats };
      } catch (error) {
        console.error('[register] OCR 失敗：', error);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setDescription('❌ 圖片辨識失敗，請改用不附截圖的 `/register` 手動輸入，或換一張更清晰的截圖。'),
          ],
        });
      }
    } else {
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

        // 以資料庫實際存下的值（含這次沒填、沿用既有的選填屬性）作為顯示來源
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
              name: '⚔️ 必填屬性',
              value: REQUIRED_FIELDS.map((f) => `**${f.label}：** ${savedCharacter[f.field]}`).join('\n'),
              inline: true,
            },
            {
              name: '✨ 選填屬性',
              value:
                OPTIONAL_FIELDS.filter((f) => savedCharacter[f.field] != null)
                  .map((f) => `**${f.label}：** ${savedCharacter[f.field]}`)
                  .join('\n') || '（未填寫）',
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
        embeds: [buildResultEmbed(draft, userName, manual)],
        components: buildButtons(draft),
      });
    }
  },
};
