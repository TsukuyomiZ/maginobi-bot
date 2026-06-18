const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getSampleImage } = require('../../utils/sampleImage');

/**
 * /help command
 * 說明機器人的整體操作流程與各指令用途（僅本人可見）。
 * 流程：先用 /register 或 /register_image 註冊角色 → 再使用查看 / 比較 / 工具類功能。
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('查看機器人功能與操作教學'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 瑪英小精靈 使用說明')
      .setDescription(
        '操作邏輯很簡單：**先註冊角色，再使用其他功能**。\n' +
        '一個 Discord 帳號可註冊多隻角色，系統會以你的「**當前主角**」作為各功能的預設對象。'
      )
      .addFields(
        {
          name: '1️⃣ 註冊角色（第一步，必做）',
          value:
            '• `/register_image` — 上傳角色屬性截圖，**自動辨識**數值後確認註冊（最快）\n' +
            '• `/register` — 手動輸入各項屬性註冊或更新\n' +
            '＊兩種方式擇一即可；用相同角色名稱再註冊一次即為更新。\n' +
            '＊不確定要截哪種畫面？參考下方示意圖，或執行 `/register_image`（不附截圖）看教學。',
        },
        {
          name: '2️⃣ 查看與管理角色',
          value:
            '• `/info` — 查看角色數據（留空角色名稱＝看當前主角）\n' +
            '• `/character list` — 列出你已註冊的所有角色\n' +
            '• `/character switch` — 切換當前主角\n' +
            '• `/character delete` — 刪除一隻角色\n' +
            '＊如果你只註冊一隻角色，這邊的主角切換設定可以先無視。',
        },
        {
          name: '3️⃣ 比較功能',
          value:
            '• `/character_compare` — 以你的角色為基準，和其他使用者的角色比數值\n' +
            '• `/battle_compare` — 比較你的角色屬性是否達到關卡 / Boss 需求',
        },
        {
          name: '🛠️ 實用工具（不需註冊也能用）',
          value:
            '• `/piece_price_calculate` — 粉末計算機：比較「直接買粉」與「買材料拆解」哪個划算\n' +
            '• `/weekly_noti_subscribe` — 訂閱每週更新提醒（自訂星期與時間，台灣時間）',
        }
      )
      .setFooter({ text: '💡 還沒註冊的話，先從 /register_image 上傳截圖開始最快！' });

    // 有示意圖檔案才附上（放在 src/assets/register_sample.png）
    const sample = getSampleImage();
    const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
    if (sample) {
      embed.setImage(sample.url);
      payload.files = [sample.attachment];
    }

    await interaction.reply(payload);
  },
};
