const mongoose = require('mongoose');

// A one-to-one chat. `pairKey` is the two user ids, sorted and joined, so the
// same pair can only ever have one conversation no matter who opens it first.
const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    pairKey: { type: String, required: true, unique: true },
    // Denormalised preview of the newest message, for a conversation list.
    lastMessageText: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.statics.pairKeyFor = (a, b) => [String(a), String(b)].sort().join(':');

module.exports = mongoose.model('Conversation', conversationSchema);
