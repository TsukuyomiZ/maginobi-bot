require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const connectDB = require('./config/database');
const loadCommands = require('./loaders/commandLoader');
const loadEvents = require('./loaders/eventLoader');

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
