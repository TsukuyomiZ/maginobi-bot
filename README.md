# 🎮 DC Mabinogi Bot

> 一個基於 Node.js + Discord.js v14 + MongoDB Atlas 的瑪奇幻想曲 Discord 機器人

---

## 📁 專案結構

```
dc-mabinogi-bot/
├── .env                        # 環境變數（不可上傳 Git）
├── .gitignore
├── package.json
└── src/
    ├── index.js                # 🚀 主程式入口
    ├── config/
    │   └── database.js         # MongoDB Atlas 連線設定
    ├── models/                 # 📦 Mongoose 資料模型
    │   ├── User.js
    │   ├── Character.js
    │   ├── Guild.js
    │   ├── BattleInfo.js
    │   └── WeekUpdateNotification.js
    ├── controllers/            # 🧠 業務邏輯層
    │   ├── userController.js
    │   ├── guildController.js
    │   ├── battleController.js
    │   └── notificationController.js
    ├── commands/               # ⚡ Slash 指令
    │   └── mabinogi/
    │       ├── register.js              # 手動註冊角色屬性
    │       ├── register_image.js        # 上傳截圖自動辨識註冊
    │       ├── info.js                  # 查看角色數據
    │       ├── character.js             # 角色管理（list/switch/delete）
    │       ├── character_compare.js     # 跨使用者角色比較
    │       ├── battle_compare.js        # 角色 vs 關卡需求比較
    │       ├── piece_price_calculate.js # 粉末價格計算機
    │       └── weekly_noti_subscribe.js # 每週更新提醒訂閱
    ├── events/                 # 📡 Discord 事件處理
    │   ├── ready.js
    │   └── interactionCreate.js
    ├── loaders/                # 🔄 動態載入器
    │   ├── commandLoader.js
    │   └── eventLoader.js
    ├── services/
    │   └── statOcr.js          # 截圖屬性 OCR 辨識
    ├── schedulers/
    │   └── weeklyNotiScheduler.js  # 每週更新提醒排程
    ├── data/
    │   └── pieceYields.js      # 粉末產出資料
    └── scripts/
        ├── deployCommands.js   # 部署 Slash 指令到 Discord
        └── clearCommands.js    # 清除 Slash 指令
```

---

## ⚙️ 環境設定

編輯 `.env` 填入你的 Discord Bot 資訊：

```env
DISCORD_TOKEN=           # Bot Token（從 Discord Developer Portal 取得）
DISCORD_CLIENT_ID=       # Application ID
DISCORD_GUILD_ID=        # 測試用伺服器 ID（開發期間用）
MONGODB_URI=             # MongoDB Atlas 連線字串（已填入）
```

---

## 🚀 啟動方式

```bash
# 安裝依賴
npm install

# 部署 Slash 指令到 Discord
npm run deploy-commands

# 開發模式（nodemon 自動重啟）
npm run dev

# 正式啟動
npm start
```

---

## ➕ 新增指令

在 `src/commands/<分類>/` 下建立新的 `.js` 檔案，格式如下：

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('指令名稱')
    .setDescription('指令描述'),

  async execute(interaction) {
    await interaction.reply('Hello!');
  },
};
```

指令會被 `commandLoader.js` **自動載入**，無需手動註冊！

---

## 🗄️ 資料庫架構

| Collection | 說明 |
|-----------|------|
| `users` | Discord 帳號層級資料 + 當前主角指標（activeCharacterId） |
| `characters` | 瑪奇角色屬性（一個帳號可多隻角色） |
| `guilds` | Discord 伺服器設定 |
| `battleinfos` | 關卡 / Boss 屬性需求資料 |
| `weekupdatenotifications` | 每週更新提醒訂閱 |
