const { readdirSync } = require('fs');
const { join } = require('path');

/**
 * Event Loader
 * Dynamically loads all event handlers from the events/ directory
 * @param {Client} client - Discord.js Client instance
 */
function loadEvents(client) {
  const eventsPath = join(__dirname, '..', 'events');
  const eventFiles = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

  let loadedCount = 0;

  for (const file of eventFiles) {
    const event = require(join(eventsPath, file));

    if (!event.name || !event.execute) {
      console.warn(`[EventLoader] Skipping ${file}: missing 'name' or 'execute' export`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    loadedCount++;
  }

  console.log(`[EventLoader] ✅ Loaded ${loadedCount} event(s)`);
}

module.exports = loadEvents;
