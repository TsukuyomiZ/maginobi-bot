const User = require('../models/User');
const Character = require('../models/Character');

// 每個 Discord 帳號可擁有的角色上限（常數，未來要調整改這裡即可）
const MAX_CHARACTERS = 3;

/**
 * User Controller
 * 多角色架構：
 *   - Character collection 存每隻角色（以 discordId 關聯擁有者）
 *   - User collection 存帳號層級資料與「當前主角」指標 activeCharacterId
 */
const userController = {
  MAX_CHARACTERS,

  /**
   * 確保 User doc 存在並更新 discordUsername，回傳該 User
   */
  async getOrCreateUser(discordId, discordUsername) {
    return User.findOneAndUpdate(
      { discordId },
      { $set: { discordId, discordUsername } },
      { new: true, upsert: true, runValidators: true }
    );
  },

  /**
   * 新增或更新一隻角色（以角色名稱為鍵：同名→更新、新名→新增）
   * 註冊/更新後會將該角色設為當前主角。
   * @returns {{ character, isNew }}
   * @throws Error('MAX_CHARACTERS_REACHED') 當新增會超過上限時
   */
  async addOrUpdateCharacter(discordId, discordUsername, characterData) {
    try {
      const { userName } = characterData;
      const existing = await Character.findOne({ discordId, userName });

      let character;
      let isNew;

      if (existing) {
        // 同名 → 更新
        character = await Character.findByIdAndUpdate(
          existing._id,
          { $set: { discordUsername, ...characterData } },
          { new: true, runValidators: true }
        );
        isNew = false;
      } else {
        // 新名 → 檢查上限後新增
        const count = await Character.countDocuments({ discordId });
        if (count >= MAX_CHARACTERS) {
          throw new Error('MAX_CHARACTERS_REACHED');
        }
        character = await Character.create({ discordId, discordUsername, ...characterData });
        isNew = true;
      }

      // 確保 User 存在，並把這隻設為當前主角
      await User.findOneAndUpdate(
        { discordId },
        { $set: { discordId, discordUsername, activeCharacterId: character._id } },
        { upsert: true, runValidators: true }
      );

      return { character, isNew };
    } catch (error) {
      console.error('[UserController] addOrUpdateCharacter error:', error);
      throw error;
    }
  },

  /**
   * 取得使用者「當前主角」的角色資料（無角色或無主角時回傳 null）
   */
  async getActiveCharacter(discordId) {
    try {
      const user = await User.findOne({ discordId });
      if (!user || !user.activeCharacterId) return null;
      return Character.findById(user.activeCharacterId);
    } catch (error) {
      console.error('[UserController] getActiveCharacter error:', error);
      throw error;
    }
  },

  /**
   * 列出某使用者的所有角色（依角色名稱排序）
   */
  async listCharacters(discordId) {
    try {
      return Character.find({ discordId }).sort({ userName: 1 });
    } catch (error) {
      console.error('[UserController] listCharacters error:', error);
      throw error;
    }
  },

  /**
   * 依角色名稱取得某使用者的特定角色（用於指令的「角色」選填覆蓋）
   */
  async getCharacterByName(discordId, userName) {
    try {
      return Character.findOne({ discordId, userName });
    } catch (error) {
      console.error('[UserController] getCharacterByName error:', error);
      throw error;
    }
  },

  /**
   * 依 _id 取得任一角色（用於跨使用者比對）
   */
  async getCharacterById(characterId) {
    try {
      return Character.findById(characterId);
    } catch (error) {
      console.error('[UserController] getCharacterById error:', error);
      throw error;
    }
  },

  /**
   * 取得使用者的當前主角 _id（字串，無則 null）——用於在清單標示主角
   */
  async getActiveCharacterId(discordId) {
    const user = await User.findOne({ discordId });
    return user?.activeCharacterId ? user.activeCharacterId.toString() : null;
  },

  /**
   * 設定當前主角（須為該使用者自己的角色）
   * @returns {Character|null} 成功回傳該角色，找不到/不屬於本人回傳 null
   */
  async setActiveCharacter(discordId, characterId) {
    try {
      const character = await Character.findOne({ _id: characterId, discordId });
      if (!character) return null;
      await User.findOneAndUpdate(
        { discordId },
        { $set: { activeCharacterId: character._id } },
        { upsert: true }
      );
      return character;
    } catch (error) {
      console.error('[UserController] setActiveCharacter error:', error);
      throw error;
    }
  },

  /**
   * 刪除某使用者的角色；若刪掉的是當前主角，自動改指向其他剩餘角色（或 null）
   * @returns {Character|null} 被刪除的角色，找不到回傳 null
   */
  async deleteCharacter(discordId, characterId) {
    try {
      const deleted = await Character.findOneAndDelete({ _id: characterId, discordId });
      if (!deleted) return null;

      const user = await User.findOne({ discordId });
      if (user && user.activeCharacterId && user.activeCharacterId.equals(deleted._id)) {
        // 主角被刪：改指向最近更新的其他角色，沒有則 null
        const fallback = await Character.findOne({ discordId }).sort({ updatedAt: -1 });
        user.activeCharacterId = fallback ? fallback._id : null;
        await user.save();
      }
      return deleted;
    } catch (error) {
      console.error('[UserController] deleteCharacter error:', error);
      throw error;
    }
  },

  /**
   * 取得所有角色（排除指定 discordId 的角色），用於 /character_compare 的對象清單
   * @param {string} excludeDiscordId 要排除的擁有者（通常是發起者自己）
   * @param {number} limit Discord 下拉選單上限 25
   */
  async getAllCharacters(excludeDiscordId, limit = 25) {
    try {
      return Character.find({ discordId: { $ne: excludeDiscordId } })
        .sort({ userName: 1 })
        .limit(limit);
    } catch (error) {
      console.error('[UserController] getAllCharacters error:', error);
      throw error;
    }
  },

  /**
   * 排行榜（依攻擊力，跨所有角色）
   */
  async getLeaderboard(limit = 10) {
    try {
      return Character.find()
        .sort({ character_atk: -1 })
        .limit(limit)
        .select('discordId discordUsername userName character_atk character_def character_crit character_balance');
    } catch (error) {
      console.error('[UserController] getLeaderboard error:', error);
      throw error;
    }
  },
};

module.exports = userController;
