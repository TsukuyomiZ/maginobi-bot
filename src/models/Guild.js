const mongoose = require('mongoose');

/**
 * Guild (Server) Schema
 * Stores Discord server settings and configuration
 */
const guildSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    guildName: {
      type: String,
      required: true,
    },
    prefix: {
      type: String,
      default: '!',
    },
    logChannelId: {
      type: String,
      default: null,
    },
    welcomeChannelId: {
      type: String,
      default: null,
    },
    settings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Guild', guildSchema);
