/**
 * 角色屬性 vs 關卡需求 的共用比對邏輯
 * 同時供 /battle_compare 詳細比較、以及註冊/更新後的「最新副本進度」使用。
 */

// 滿爆條件：character_crit - boss_crit_def >= 50
const CRIT_THRESHOLD = 50;
// 滿平條件：character_balance - boss_balance_def >= 100
const BALANCE_THRESHOLD = 100;

// STD（時空扭曲）模式對玩家屬性的懲罰
const STD_PENALTY = { atk: 709, def: 300, crit: 1, dp: 500 };

// req 欄位對應表（玩家欄位 ↔ 關卡需求欄位）
const REQ_FIELDS = [
  { key: 'atk', name: '攻擊力', userField: 'character_atk', reqField: 'req_atk' },
  { key: 'def', name: '防禦力', userField: 'character_def', reqField: 'req_def' },
  { key: 'crit', name: '暴擊', userField: 'character_crit', reqField: 'req_character_crit' },
  { key: 'balance', name: '平衡', userField: 'character_balance', reqField: 'req_balance' },
  { key: 'adDamage', name: '追加傷害', userField: 'character_adDamage', reqField: 'req_adDamage' },
  { key: 'ap', name: '防禦貫穿', userField: 'character_ap', reqField: 'req_ap' },
  { key: 'dp', name: '破壞力', userField: 'character_dp', reqField: 'req_dp' },
];

/**
 * 套用 STD 懲罰後的玩家比對數值
 */
function buildCompareUser(user, isSTD) {
  return {
    userName: user.userName,
    character_atk: isSTD ? user.character_atk - STD_PENALTY.atk : user.character_atk,
    character_def: isSTD ? user.character_def - STD_PENALTY.def : user.character_def,
    character_crit: isSTD ? user.character_crit - STD_PENALTY.crit : user.character_crit,
    character_balance: user.character_balance,
    character_adDamage: user.character_adDamage,
    character_ap: user.character_ap,
    character_dp: (isSTD && user.character_dp != null) ? user.character_dp - STD_PENALTY.dp : user.character_dp,
    character_crit_def: user.character_crit_def,
  };
}

/**
 * 比對單一角色與單一關卡，回傳結構化結果（不負責渲染）。
 * @param {object} user    角色屬性（character_atk... 等欄位）
 * @param {object} battle  BattleInfo doc
 * @returns 結構化比對結果
 */
function compareCharacterToBattle(user, battle) {
  const isSTD = battle.isSTD === true;
  const compareUser = buildCompareUser(user, isSTD);

  // ── 進入門檻檢查（req 欄位）────────────────────────────────
  const missingFields = [];
  const comparedFields = [];
  let canEnter = true;

  for (const field of REQ_FIELDS) {
    const reqVal = battle[field.reqField];
    // 只有當關卡有設定該項需求且大於 0 時才需要比對
    if (reqVal !== null && reqVal !== undefined && reqVal > 0) {
      const userVal = compareUser[field.userField];
      if (userVal === null || userVal === undefined) {
        missingFields.push(field);
      } else {
        const passed = userVal >= reqVal;
        if (!passed) canEnter = false;
        comparedFields.push({ field, userVal, reqVal, passed, diff: userVal - reqVal });
      }
    }
  }

  const result = {
    isSTD,
    canEnter,
    compareUser,
    missingFields,
    comparedFields,
    crit: null,
    balance: null,
    critDefWarning: null,
  };

  // 無法進入就不再計算暴擊/平衡細節
  if (!canEnter) return result;

  // ── 暴擊 ──────────────────────────────────────────────────
  const critDiff = compareUser.character_crit - battle.boss_crit_def;
  const critPassed = critDiff >= CRIT_THRESHOLD;
  const effectiveCritPct = Math.min(50, Math.max(3, critDiff));
  result.crit = {
    mine: compareUser.character_crit,
    bossDef: battle.boss_crit_def,
    diff: critDiff,
    passed: critPassed,
    effectivePct: effectiveCritPct,
    remaining: CRIT_THRESHOLD - critDiff,
  };

  // ── 平衡 ──────────────────────────────────────────────────
  const balanceDiff = compareUser.character_balance - battle.boss_balance_def;
  const balancePassed = balanceDiff >= BALANCE_THRESHOLD;
  const effectiveBalance = Math.min(100, balanceDiff);
  const avgDamagePct = ((100 + effectiveBalance) / 2).toFixed(1);
  result.balance = {
    mine: compareUser.character_balance,
    bossDef: battle.boss_balance_def,
    diff: balanceDiff,
    passed: balancePassed,
    effective: effectiveBalance,
    avgDamagePct,
    remaining: BALANCE_THRESHOLD - balanceDiff,
  };

  // ── 暴擊抵抗警告 ──────────────────────────────────────────
  if (compareUser.character_crit_def != null) {
    const gap = battle.boss_crit - compareUser.character_crit_def;
    if (gap >= 50) {
      result.critDefWarning = {
        mine: compareUser.character_crit_def,
        bossCrit: battle.boss_crit,
        gap,
      };
    }
  }

  return result;
}

/**
 * 將比對結果整理成「最新副本進度」用的精簡 embed field。
 * @param {object} battle  BattleInfo doc
 * @param {object} result  compareCharacterToBattle 的回傳
 * @param {string} title   field 名稱前綴（例如「🆕 最新副本」）
 */
function buildProgressField(battle, result, title) {
  const name = `${title}：${battle.battle_name}（Lv.${battle.level}）`;
  let value;

  if (!result.canEnter) {
    // 列出卡關的項目（不足幾點 + 未填欄位）
    const shortfalls = result.comparedFields
      .filter((c) => !c.passed)
      .map((c) => `${c.field.name} 差 **${Math.abs(c.diff)}**`);
    const missing = result.missingFields.map((f) => `${f.name}（未填）`);
    const parts = [...shortfalls, ...missing];
    value = `🚫 **尚無法進入**\n` + (parts.length ? parts.join('、') : '屬性不足');
  } else {
    const lines = ['✅ **可進入！**'];

    const crit = result.crit;
    lines.push(
      crit.passed
        ? `🎯 暴擊已滿爆（${crit.effectivePct}%）`
        : `🎯 暴擊 ${crit.diff >= 0 ? '+' : ''}${crit.diff}，滿爆還差 **${crit.remaining}**`
    );

    const bal = result.balance;
    lines.push(
      bal.passed
        ? `⚖️ 平衡已滿平`
        : `⚖️ 平衡還差 **${bal.remaining}**（平均傷害 ${bal.avgDamagePct}%）`
    );

    if (result.critDefWarning) {
      lines.push(`🔴 Boss 暴擊遠超你的抗性，可能會打得很辛苦`);
    }

    value = lines.join('\n');
  }

  return { name, value, inline: true };
}

module.exports = {
  CRIT_THRESHOLD,
  BALANCE_THRESHOLD,
  STD_PENALTY,
  REQ_FIELDS,
  compareCharacterToBattle,
  buildProgressField,
};
