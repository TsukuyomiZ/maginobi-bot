const { readdirSync } = require('fs');
const { join } = require('path');

/**
 * Command Loader
 * Dynamically loads all slash commands from the commands/ directory
 * Supports nested category folders (e.g., commands/general/, commands/mabinogi/)
 * @param {Client} client - Discord.js Client instance
 */
function loadCommands(client) {
  const commandsPath = join(__dirname, '..', 'commands');
  const categoryFolders = readdirSync(commandsPath);

  let loadedCount = 0;

  for (const folder of categoryFolders) {
    const categoryPath = join(commandsPath, folder);
    const commandFiles = readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(join(categoryPath, file));

      if (!command.data || !command.execute) {
        console.warn(`[CommandLoader] Skipping ${file}: missing 'data' or 'execute' export`);
        continue;
      }

      client.commands.set(command.data.name, command);
      loadedCount++;
    }
  }

  console.log(`[CommandLoader] ✅ Loaded ${loadedCount} command(s)`);
}

module.exports = loadCommands;
