const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

/**
 * 註冊用示意圖（遊戲角色屬性面板截圖範例）。
 * 放在 src/assets/register_sample.png；檔案不存在時回傳 null，
 * 呼叫端應退化為「只顯示文字說明」，不影響指令運作。
 */
const SAMPLE_PATH = path.join(__dirname, '..', 'assets', 'register_sample.png');
const SAMPLE_NAME = 'register_sample.png';

/**
 * @returns {{ attachment: AttachmentBuilder, url: string } | null}
 *   檔案存在 → 可附加的圖片與其 attachment:// 連結；不存在 → null
 */
function getSampleImage() {
  if (!fs.existsSync(SAMPLE_PATH)) return null;
  return {
    attachment: new AttachmentBuilder(SAMPLE_PATH, { name: SAMPLE_NAME }),
    url: `attachment://${SAMPLE_NAME}`,
  };
}

module.exports = { getSampleImage };
