const mongoose = require('mongoose');

const splitSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0.01 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    splits: {
      type: [splitSchema],
      validate: {
        validator(splits) {
          if (!splits.length) return false;
          const total = splits.reduce((sum, s) => sum + s.amount, 0);
          return Math.abs(total - this.amount) < 0.01;
        },
        message: 'Split amounts must add up to the expense amount',
      },
    },
    category: {
      type: String,
      enum: ['general', 'food', 'transport', 'housing', 'entertainment', 'utilities', 'other'],
      default: 'general',
    },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
