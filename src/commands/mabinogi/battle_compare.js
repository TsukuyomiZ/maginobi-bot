const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const userController = require('../../controllers/userController');
const battleController = require('../../controllers/battleController');

// 滿爆條件：character_crit - boss_crit >= 50
const CRIT_THRESHOLD = 50;
// 滿平條件：character_balance - boss_balance >= 100
const BALANCE_THRESHOLD = 100;

/**
 * /battle_compare command
 * Step 1 → 選等級 dropdown
 * Step 2 → 選關卡 dropdown（依等級從 battle_info 動態撈取）
 * Step 3 → 顯示爆擊 / 平衡比較結果
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle_compare')
    .setDescription('比較你的角色屬性與關卡需求'),

  async execute(interaction) {
    // ── Step 1：顯示等級 dropdown ────────────────────────────
    const levelMenu = new StringSelectMenuBuilder()
      .setCustomId('level_select')
      .setPlaceholder('🔢 請選擇關卡等級')
      .addOptions([
        { label: 'Lv. 120', value: '120' },
        { label: 'Lv. 125', value: '125' },
      ]);

    const levelRow = new ActionRowBuilder().addComponents(levelMenu);

    const reply = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⚔️ 關卡屬性比較')
          .setDescription('請先選擇關卡等級 👇'),
      ],
      components: [levelRow],
      flags: MessageFlags.Ephemeral,
    });

    // ── Step 2：等待使用者選等級 ─────────────────────────────
    const levelInteraction = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'level_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!levelInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/battle_compare`。'),
        ],
        components: [],
      });
    }

    const selectedLevel = parseInt(levelInteraction.values[0]);

    // 從 battle_info 撈取該等級的所有關卡
    const battles = await battleController.getBattlesByLevel(selectedLevel);

    if (!battles.length) {
      return levelInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription(`❌ 找不到 Lv.${selectedLevel} 的關卡資料，請先新增關卡。`),
        ],
        components: [],
      });
    }

    // ── Step 3：顯示關卡 dropdown ─────────────────────────────
    const battleMenu = new StringSelectMenuBuilder()
      .setCustomId('battle_select')
      .setPlaceholder('⚔️ 請選擇關卡')
      .addOptions(
        battles.map((b) => ({
          label: b.battle_name,
          value: b._id.toString(), // 用 _id 反查完整資料
        }))
      );

    const battleRow = new ActionRowBuilder().addComponents(battleMenu);

    await levelInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`⚔️ 關卡屬性比較 — Lv.${selectedLevel}`)
          .setDescription('請選擇要比較的關卡 👇'),
      ],
      components: [battleRow],
    });

    // ── Step 4：等待使用者選關卡 ─────────────────────────────
    const battleInteraction = await reply
      .awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'battle_select',
        time: 60_000,
      })
      .catch(() => null);

    if (!battleInteraction) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('⏰ 操作逾時，請重新使用 `/battle_compare`。'),
        ],
        components: [],
      });
    }

    // ── Step 5：撈取關卡完整資料 + 使用者角色資料 ─────────────
    const [battle, user] = await Promise.all([
      battleController.getBattleById(battleInteraction.values[0]),
      userController.getUser(interaction.user.id),
    ]);

    if (!user) {
      return battleInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ 找不到你的角色資料，請先使用 `/register` 註冊。'),
        ],
        components: [],
      });
    }

    // ── Step 6：先用 req 欄位檢查能否進入關卡 ──────────────────
    const isSTD = battle.isSTD === true;

    // 如果為 STD 關卡，調整使用者的比對數值
    const compareUser = {
      userName: user.userName,
      character_atk: isSTD ? user.character_atk - 709 : user.character_atk,
      character_def: isSTD ? user.character_def - 300 : user.character_def,
      character_crit: isSTD ? user.character_crit - 1 : user.character_crit,
      character_balance: user.character_balance,
      character_adDamage: user.character_adDamage,
      character_ap: user.character_ap,
      character_dp: (isSTD && user.character_dp !== null) ? user.character_dp - 500 : user.character_dp,
      character_crit_def: user.character_crit_def,
    };

    const reqFields = [
      { key: 'atk', name: '攻擊力', userField: 'character_atk', reqField: 'req_atk' },
      { key: 'def', name: '防禦力', userField: 'character_def', reqField: 'req_def' },
      { key: 'crit', name: '爆擊', userField: 'character_crit', reqField: 'req_character_crit' },
      { key: 'balance', name: '平衡', userField: 'character_balance', reqField: 'req_balance' },
      { key: 'adDamage', name: '追加攻擊力', userField: 'character_adDamage', reqField: 'req_adDamage' },
      { key: 'ap', name: '防禦貫穿', userField: 'character_ap', reqField: 'req_ap' },
      { key: 'dp', name: '破壞力', userField: 'character_dp', reqField: 'req_dp' },
    ];

    const missingFields = [];
    const comparedFields = [];
    let hasFailed = false;

    for (const field of reqFields) {
      const reqVal = battle[field.reqField];
      // 只有當關卡有設定該項需求且大於 0 時才需要比對
      if (reqVal !== null && reqVal !== undefined && reqVal > 0) {
        const userVal = compareUser[field.userField];
        if (userVal === null || userVal === undefined) {
          missingFields.push(field);
        } else {
          const passed = userVal >= reqVal;
          if (!passed) {
            hasFailed = true;
          }
          comparedFields.push({
            field,
            userVal,
            reqVal,
            passed,
            diff: userVal - reqVal
          });
        }
      }
    }

    // 任一屬性低於關卡需求 → 無法進入
    if (hasFailed) {
      const blockedEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`🚫 ${battle.battle_name}（Lv.${selectedLevel}）`)
        .setFooter({ text: `角色：${user.userName}` })
        .setTimestamp();

      let desc = '';
      if (isSTD) {
        desc += `💡 **此關卡為 STD 模式（比對屬性已扣除：攻擊力 -709、防禦力 -300、爆擊 -1、破壞力 -500）**\n\n`;
      }
      if (missingFields.length > 0) {
        const missingNames = missingFields.map(f => f.name).join('、');
        desc += `⚠️ **資料不完全 比對結果不一定準確 請更新完整腳色資訊**\n` +
                `（缺少的關卡要求欄位：${missingNames}，請使用 \`/register\` 補齊）\n\n`;
      }
      desc += `**您的能力值無法進入此關卡**`;
      blockedEmbed.setDescription(desc);

      comparedFields.forEach(item => {
        blockedEmbed.addFields({
          name: `${item.passed ? '✅' : '❌'} ${item.field.name}`,
          value: [
            `我的屬性：**${item.userVal}**`,
            `進入門檻：**${item.reqVal}**`,
            item.passed
              ? `✅ 符合`
              : `❌ 不足 **${Math.abs(item.diff)}** 點`,
          ].join('\n'),
          inline: true,
        });
      });

      await battleInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription('✅ 比較完成，結果已公開顯示於下方 👇'),
        ],
        components: [],
      });
      return interaction.followUp({ embeds: [blockedEmbed] });
    }

    // ── Step 7：計算有效爆擊率 & 平衡傷害 ───────────────────────
    const critDiff    = compareUser.character_crit    - battle.boss_crit_def;
    const balanceDiff = compareUser.character_balance - battle.boss_balance_def;

    const critPassed    = critDiff    >= CRIT_THRESHOLD;
    const balancePassed = balanceDiff >= BALANCE_THRESHOLD;

    // 有效爆擊率：上限 50%，下限 3%
    const effectiveCritPct = Math.min(50, Math.max(3, critDiff));

    // 有效平衡值：上限 100
    const effectiveBalance = Math.min(100, balanceDiff);
    // 傷害範圍：effectiveBalance% ~ 100%，平均 = (100 + effectiveBalance) / 2
    const avgDamagePct = ((100 + effectiveBalance) / 2).toFixed(1);

    // ── 爆擊欄位文字 ─────────────────────────────────────────────
    const critLines = [
      `我的爆擊：**${compareUser.character_crit}**${isSTD ? ' *(已扣除 STD 懲罰 1 點)*' : ''}`,
      `Boss 爆擊抵抗：**${battle.boss_crit_def}**`,
      `差距：**${critDiff >= 0 ? '+' : ''}${critDiff}**`,
      critPassed
        ? `✅ 恭喜，關卡已滿爆！`
        : `⚠️ 爆擊還差 **${CRIT_THRESHOLD - critDiff}** 點才滿爆`,
      ``,
      `🎲 有效爆擊率：**${effectiveCritPct}%**`,
      critPassed
        ? `（爆擊觸發上限，固定 50%）`
        : `（滿爆需 50%，目前少 ${50 - effectiveCritPct}%）`,
    ].join('\n');

    // ── 平衡欄位文字 ─────────────────────────────────────────────
    const balanceLines = [
      `我的平衡：**${compareUser.character_balance}**`,
      `Boss 平衡抵抗：**${battle.boss_balance_def}**`,
      `差距：**${balanceDiff >= 0 ? '+' : ''}${balanceDiff}**`,
      balancePassed
        ? `✅ 恭喜，關卡已滿平！`
        : `⚠️ 平衡還差 **${BALANCE_THRESHOLD - balanceDiff}** 點才滿平`,
      ``,
      balancePassed
        ? `📊 傷害固定為應有值的 **100%**`
        : `📊 傷害範圍：**${effectiveBalance}% ~ 100%**`,
      `📈 平均傷害：**${avgDamagePct}%**`,
    ].join('\n');

    // ── Step 8：若玩家有填爆擊抗性，檢查是否會被 Boss 爆打 ────────
    let critDefWarning = null;
    if (compareUser.character_crit_def != null) {
      const critDefGap = battle.boss_crit - compareUser.character_crit_def;
      if (critDefGap >= 50) {
        critDefWarning = [
          `我的爆擊抗性：**${compareUser.character_crit_def}**`,
          `Boss 爆擊：**${battle.boss_crit}**`,
          `差距：**-${critDefGap}**`,
          `🔴 Boss 爆擊遠超你的抗性，**可能會打得很辛苦！**`,
        ].join('\n');
      }
    }

    // 顏色優先級：有警告 → 橘色 / 全滿 → 綠色 / 未滿 → 黃色
    const embedColor = critDefWarning
      ? 0xE67E22
      : critPassed && balancePassed
        ? 0x57F287
        : 0xFEE75C;

    const resultEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`⚔️ ${battle.battle_name}（Lv.${selectedLevel}）比較結果`);

    let resultDesc = '';
    if (isSTD) {
      resultDesc += `💡 **此關卡為 時空扭曲 模式（比對屬性已扣除：攻擊力 -709、防禦力 -300、爆擊 -1、破壞力 -500）**\n\n`;
    }
    if (missingFields.length > 0) {
      const missingNames = missingFields.map(f => f.name).join('、');
      resultDesc += `⚠️ **資料不完全 比對結果不一定準確 請更新完整腳色資訊**\n` +
                    `（缺少的關卡要求欄位：${missingNames}，請使用 \`/register\` 補齊）\n\n`;
    }
    if (resultDesc) {
      resultEmbed.setDescription(resultDesc.trim());
    }

    resultEmbed.addFields(
      {
        name: '🎯 爆擊',
        value: critLines,
        inline: true,
      },
      {
        name: '⚖️ 平衡',
        value: balanceLines,
        inline: true,
      }
    );

    // 有爆擊抗性警告才加入此欄位
    if (critDefWarning) {
      resultEmbed.addFields({
        name: '🚨 爆擊抗性警告',
        value: critDefWarning,
      });
    }

    resultEmbed
      .setFooter({ text: `角色：${user.userName}` })
      .setTimestamp();

    await battleInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription('✅ 比較完成，結果已公開顯示於下方 👇'),
      ],
      components: [],
    });
    await interaction.followUp({ embeds: [resultEmbed] });
  },
};
