require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { REST, Routes } = require('discord.js');

/**
 * Clear Commands Script
 * 清除已註冊的 slash 指令，用來解決「指令重複顯示」的問題。
 *
 * 用法：
 *   node src/scripts/clearCommands.js global   → 清除全域指令
 *   node src/scripts/clearCommands.js guild     → 清除指定伺服器(DISCORD_GUILD_ID)指令
 *
 * 注意：全域指令的清除一樣最多需 1 小時才會在所有伺服器消失；
 *       伺服器指令清除則為即時。
 */
async function clearCommands() {
  const scope = process.argv[2];

  if (scope !== 'global' && scope !== 'guild') {
    console.error('❌ 請指定範圍：node src/scripts/clearCommands.js [global|guild]');
    process.exit(1);
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    if (scope === 'guild') {
      const guildId = process.env.DISCORD_GUILD_ID;
      if (!guildId) {
        console.error('❌ 未設定 DISCORD_GUILD_ID，無法清除伺服器指令。');
        process.exit(1);
      }
      console.log(`[Clear] 🔄 清除伺服器 ${guildId} 的所有指令...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
        { body: [] }
      );
      console.log(`[Clear] ✅ 已清除伺服器 ${guildId} 的指令！(即時生效)`);
    } else {
      console.log('[Clear] 🔄 清除所有全域指令...');
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: [] }
      );
      console.log('[Clear] ✅ 已清除全域指令！(最多需 1 小時才會完全消失)');
    }
  } catch (error) {
    console.error('[Clear] ❌ 清除失敗：', error);
  }
}

clearCommands();
