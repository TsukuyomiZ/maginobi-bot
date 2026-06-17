/**
 * 一次性資料搬遷：單角色 → 多角色架構
 *
 * 舊架構：每筆 User doc 直接攤平存一隻角色的屬性。
 * 新架構：角色移到 Character collection，User 只留 activeCharacterId 指標。
 *
 * 本腳本「冪等」：可重複執行。已搬遷過（User 上已無 character_atk）的會自動跳過。
 *
 * 執行：  node src/scripts/migrateMultiChar.js
 * 試跑：  node src/scripts/migrateMultiChar.js --dry      （只印出將執行的動作，不寫入）
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Character = require('../models/Character');

const DRY_RUN = process.argv.includes('--dry');

// 要從舊 User doc 搬出的角色欄位
const CHARACTER_FIELDS = [
  'userName',
  'character_atk',
  'character_def',
  'character_crit',
  'character_balance',
  'character_adDamage',
  'character_ap',
  'character_dp',
  'character_crit_def',
];

async function run() {
  await connectDB();

  // 用原生 collection 讀取，避免新版 User schema 把舊欄位吃掉
  const usersCol = mongoose.connection.collection('users');
  const oldUsers = await usersCol.find({ character_atk: { $exists: true } }).toArray();

  console.log(`[Migrate] 找到 ${oldUsers.length} 筆待搬遷的舊 User doc${DRY_RUN ? '（DRY RUN，不會寫入）' : ''}`);

  let migrated = 0;
  let skipped = 0;

  for (const u of oldUsers) {
    const discordId = u.discordId;
    const discordUsername = u.discordUsername || u.userName || '未知';
    const userName = u.userName;

    if (!discordId || !userName) {
      console.warn(`[Migrate] ⚠️ 跳過缺少 discordId/userName 的 doc：${u._id}`);
      skipped++;
      continue;
    }

    // 組出角色資料
    const charData = { discordId, discordUsername };
    for (const f of CHARACTER_FIELDS) {
      if (f === 'userName') continue;
      charData[f] = u[f] ?? null;
    }
    charData.userName = userName;

    // 冪等：若該角色已存在就沿用，不重複建立
    let character = await Character.findOne({ discordId, userName });

    if (DRY_RUN) {
      console.log(
        `[Migrate] (dry) ${discordId} / ${userName} → ` +
        (character ? '角色已存在，僅會更新指標與清欄位' : '會建立新 Character 並設為主角')
      );
      migrated++;
      continue;
    }

    if (!character) {
      character = await Character.create(charData);
    }

    // 設 activeCharacterId、清掉 User 上的舊角色欄位
    const unset = {};
    for (const f of CHARACTER_FIELDS) unset[f] = '';

    await usersCol.updateOne(
      { _id: u._id },
      {
        $set: { activeCharacterId: character._id, discordUsername },
        $unset: unset,
      }
    );

    console.log(`[Migrate] ✅ ${discordId} / ${userName} → Character ${character._id}`);
    migrated++;
  }

  console.log(`[Migrate] 完成：搬遷 ${migrated} 筆、跳過 ${skipped} 筆。`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('[Migrate] ❌ 失敗：', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
