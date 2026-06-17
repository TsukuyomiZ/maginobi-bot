/**
 * 拆解材料 → 粉末「碎片」產出對照表
 *
 * 產出數量只跟 (系列, 粉末種類) 有關，與材料部位（武器 / 頭部防具 / 胸部防具 …）無關，皆相同。
 * 資料來源：遊戲內拆解產出表（見 /piece_price_calculate 需求附圖）。
 *
 * 🔧 維護方式：價格由使用者當下輸入、不存此處。
 *    只有「新等級材料推出」時才需要更新——在 SERIES 新增一筆即可，改完 push 上線。
 */

// 三種粉末的顯示資訊
const POWDERS = {
  封印: { label: '封印之力：碎片', nick: '紅粉', emoji: '🔴', color: 0xED4245 },
  傳承: { label: '傳承之力：碎片', nick: '綠粉', emoji: '🟢', color: 0x57F287 },
  神秘: { label: '神秘之力：碎片', nick: '白粉', emoji: '⚪', color: 0xE3E5E8 },
};

// 各拆解材料系列，拆解後可獲得的各種粉末數量
const SERIES = {
  埃柳:   { level: 125, yields: { 封印: 70, 傳承: 120, 神秘: 120 } },
  兀恩雅: { level: 120, yields: { 封印: 60, 傳承: 100, 神秘: 100 } },
  歐爾納: { level: 115, yields: { 封印: 50, 傳承: 80,  神秘: 40  } },
};

module.exports = { POWDERS, SERIES };
