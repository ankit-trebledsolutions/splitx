const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Task = require('../models/Task');
const Photo = require('../models/Photo');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const DirectMessage = require('../models/DirectMessage');
const Notification = require('../models/Notification');
const SupportMessage = require('../models/SupportMessage');
const Reminder = require('../models/Reminder');
const Attraction = require('../models/Attraction');
const Stay = require('../models/Stay');
const ItineraryDay = require('../models/ItineraryDay');
const ItineraryJob = require('../models/ItineraryJob');
const storage = require('../storage');
const ApiError = require('../utils/ApiError');
const groupDeletion = require('./groupDeletion.service');

/**
 * Deleting a person, properly.
 *
 * Fourteen models hold references to a user document. Removing the user row on
 * its own leaves expenses with a payer who does not exist and groups listing a
 * member who is gone — which breaks the app for the OTHER people in those
 * groups, not just for the person being removed.
 *
 * So this does two things. It refuses outright when deletion would rewrite
 * somebody else's money, and it cleans up everything it safely can otherwise.
 * Suspending (isActive: false) remains the reversible option that never has to
 * refuse.
 */

/**
 * Outstanding money is the line — not involvement.
 *
 * An expense that is fully settled has already moved whatever money it was
 * going to move, so removing it changes nobody's balance. Only an UNSETTLED
 * share does, and only when it is between this person and somebody else:
 *
 *   - their own share is unsettled and somebody else paid  -> they owe
 *   - somebody else's share is unsettled and they paid     -> they are owed
 *
 * A person's unsettled share of an expense they paid for themselves is not a
 * debt to anyone, so it is ignored. Who pressed "settle" is irrelevant: the
 * payer may settle another member's share, and a share settled that way counts
 * exactly the same as one they settled themselves.
 */
const owesOrIsOwed = (expense, userId) => {
  const id = String(userId);
  const paidByUser = String(expense.paidBy) === id;
  return expense.splits.some((split) => {
    if (split.settled) return false;
    const splitIsUser = String(split.user) === id;
    // Their unsettled share of someone else's expense, or someone else's
    // unsettled share of theirs.
    return (splitIsUser && !paidByUser) || (!splitIsUser && paidByUser);
  });
};

const financialBlockers = async (userId, groupIds) => {
  if (groupIds.length === 0) return new Map();
  const involved = await Expense.find({
    group: { $in: groupIds },
    $or: [{ paidBy: userId }, { 'splits.user': userId }],
  })
    .select('group paidBy splits')
    .lean();

  const counts = new Map();
  involved.filter((e) => owesOrIsOwed(e, userId)).forEach((e) => {
    const key = String(e.group);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

/**
 * What would happen, without doing it. The admin panel can show this before
 * asking for confirmation, and deleteUser calls it again so the two can never
 * disagree.
 */
const planDeletion = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const groups = await Group.find({ members: userId }).select('name members').lean();
  const soleMember = groups.filter((g) => g.members.length <= 1);
  const shared = groups.filter((g) => g.members.length > 1);

  const counts = await financialBlockers(userId, shared.map((g) => g._id));
  const blocked = shared
    .filter((g) => counts.get(String(g._id)))
    .map((g) => ({ id: g._id, name: g.name, expenses: counts.get(String(g._id)) }));

  return {
    user,
    groupsToDelete: soleMember.map((g) => ({ id: g._id, name: g.name })),
    groupsToLeave: shared
      .filter((g) => !counts.get(String(g._id)))
      .map((g) => ({ id: g._id, name: g.name })),
    blocked,
    canDelete: blocked.length === 0,
  };
};

const deleteUser = async (userId) => {
  const plan = await planDeletion(userId);

  if (!plan.canDelete) {
    const names = plan.blocked.map((g) => `"${g.name}"`).join(', ');
    throw new ApiError(
      409,
      `This account has expenses in ${names}, shared with other people. ` +
        'Deleting it would change what those members owe each other. ' +
        'Settle or remove those expenses first, or suspend the account instead.',
      { code: 'USER_HAS_SHARED_EXPENSES', data: { blocked: plan.blocked } }
    );
  }

  // Groups nobody else is in go through the existing group cascade, which also
  // clears their stored files — those would otherwise sit in storage forever.
  for (const group of plan.groupsToDelete) {
    await groupDeletion.deleteGroup(group.id, userId);
  }

  // Shared groups keep existing; the person simply stops being in them.
  await Group.updateMany(
    { members: userId },
    { $pull: { members: userId, mutedBy: userId } }
  );
  // A group whose admin just left would have nobody able to manage it, so the
  // creator takes over — and where the creator IS the one leaving, the first
  // remaining member does.
  const orphaned = await Group.find({ admin: userId }).select('members createdBy');
  for (const group of orphaned) {
    const heir = String(group.createdBy) === String(userId) ? group.members[0] : group.createdBy;
    group.admin = heir || null;
    await group.save({ validateBeforeSave: false });
  }

  // Settled expenses in groups that still exist. Reaching here means nothing is
  // outstanding, so none of this moves anybody's balance.
  //
  // Two cases, because `paidBy`, `createdBy` and `splits[].user` are all
  // required fields — none can simply be blanked:
  //
  //   they paid       -> the expense is theirs; it goes entirely
  //   they took part  -> their settled share is removed and the total reduced
  //                      by it, which keeps the "splits must sum to amount"
  //                      rule true. The expense stays for the other members.
  await Expense.deleteMany({ paidBy: userId });

  const shares = await Expense.find({ 'splits.user': userId });
  for (const expense of shares) {
    const mine = expense.splits.find((s) => String(s.user) === String(userId));
    expense.splits = expense.splits.filter((s) => String(s.user) !== String(userId));
    if (expense.splits.length === 0) {
      await expense.deleteOne();
      continue;
    }
    expense.amount = Number((expense.amount - (mine?.amount || 0)).toFixed(2));
    await expense.save({ validateBeforeSave: false });
  }

  // An expense they wrote down but somebody else paid for: the payer inherits
  // it, since `createdBy` cannot be empty and the payer is the person with the
  // strongest claim to it.
  const authored = await Expense.find({ createdBy: userId }).select('paidBy');
  for (const expense of authored) {
    await Expense.updateOne({ _id: expense._id }, { $set: { createdBy: expense.paidBy } });
  }

  // Everything else they own outright in groups that outlive them. Each of
  // these models points at the user with a required field, so the row cannot
  // survive without them.
  await Promise.all([
    Task.deleteMany({ createdBy: userId }),
    Reminder.deleteMany({ createdBy: userId }),
    Attraction.deleteMany({ addedBy: userId }),
    Stay.deleteMany({ bookedBy: userId }),
    ItineraryDay.deleteMany({ createdBy: userId }),
    ItineraryJob.deleteMany({ requestedBy: userId }),
  ]);

  // Photos carry stored files, so they go through storage rather than a plain
  // delete — otherwise the images stay in storage after the account is gone.
  const photos = await Photo.find({ uploadedBy: userId }).select('+storageKey storageProvider');
  for (const photo of photos) {
    if (photo.storageKey) {
      await storage.remove(photo.storageKey, photo.storageProvider).catch(() => {});
    }
  }
  await Photo.deleteMany({ uploadedBy: userId });

  // Direct conversations exist only between their participants, so they go with
  // the person, along with the messages inside them.
  const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
  const conversationIds = conversations.map((c) => c._id);
  if (conversationIds.length) {
    await DirectMessage.deleteMany({ conversation: { $in: conversationIds } });
    await Conversation.deleteMany({ _id: { $in: conversationIds } });
  }

  // Traces in groups that still exist: detached rather than deleted, so the
  // remaining members' history does not develop holes.
  await Promise.all([
    Task.updateMany({ assignees: userId }, { $pull: { assignees: userId } }),
    Task.updateMany({ completedBy: userId }, { $set: { completedBy: null } }),
    Photo.updateMany({ taggedMembers: userId }, { $pull: { taggedMembers: userId } }),
    Message.updateMany({ readBy: userId }, { $pull: { readBy: userId } }),
    Message.updateMany({ sender: userId }, { $set: { sender: null } }),
    Message.updateMany({ assignees: userId }, { $pull: { assignees: userId } }),
    // Rows that only concerned this person.
    Notification.deleteMany({ user: userId }),
    SupportMessage.deleteMany({ user: userId }),
  ]);

  await User.deleteOne({ _id: userId });
  return plan;
};

module.exports = { planDeletion, deleteUser, owesOrIsOwed };
