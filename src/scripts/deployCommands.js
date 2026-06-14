require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { REST, Routes } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');

/**
 * Deploy Commands Script
 * Registers all slash commands with Discord's API
 * Run with: npm run deploy-commands
 */
async function deployCommands() {
  const commands = [];
  const commandsPath = join(__dirname, '..', 'commands');
  const categoryFolders = readdirSync(commandsPath);

  // Collect all command data
  for (const folder of categoryFolders) {
    const categoryPath = join(commandsPath, folder);
    const commandFiles = readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(join(categoryPath, file));
      if (command.data) {
        commands.push(command.data.toJSON());
      }
    }
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    console.log(`[Deploy] 🔄 Registering ${commands.length} slash command(s) globally...`);

    // 全域部署：所有加入此 Bot 的伺服器都能使用指令
    // 注意：全域指令最多需要 1 小時才能在所有伺服器生效
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log(`[Deploy] ✅ Successfully registered ${data.length} command(s) globally!`);
  } catch (error) {
    console.error('[Deploy] ❌ Failed to deploy commands:', error);
  }
}

deployCommands();
