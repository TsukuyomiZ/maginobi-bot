require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const connectDB = require('./config/database');
const loadCommands = require('./loaders/commandLoader');
const loadEvents = require('./loaders/eventLoader');

// ========================
// Keep-alive HTTP server
// ========================
// Discord bots 不會主動監聽 port，但 Render 的 Web Service 要求程式必須
// 綁定 process.env.PORT，否則會出現 "No open ports detected"。
// 這個極簡 server 用來通過偵測，同時可作為健康檢查端點。
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
  })
  .listen(PORT, () => {
    console.log(`[HTTP] Health check server listening on port ${PORT}`);
  });

// ========================
// Initialize Discord Client
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // ⚠️ 以下為 Privileged Intents，需在 Developer Portal 開啟後才能啟用：
    // GatewayIntentBits.MessageContent,  // 需開啟 Message Content Intent
    // GatewayIntentBits.GuildMembers,    // 需開啟 Server Members Intent
  ],
});

// Attach commands collection to client
client.commands = new Collection();

// ========================
// Bootstrap Application
// ========================
async function bootstrap() {
  try {
    // Connect to MongoDB Atlas
    await connectDB();

    // Load slash commands
    loadCommands(client);

    // Load event handlers
    loadEvents(client);

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('[Bootstrap] Failed to start bot:', error);
    process.exit(1);
  }
}

bootstrap();
