import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import MemberAvatars from '../../components/MemberAvatars';
import StatTile from '../../components/StatTile';
import { dark, radius, spacing } from '../../theme';
import { usd, formatDate } from '../../utils/format';

const CATEGORY_LABEL = {
  general: 'General',
  food: 'Food',
  stay: 'Stay',
  travel: 'Travel',
  fun: 'Fun',
  shopping: 'Shopping',
  transport: 'Travel',
  housing: 'Stay',
  entertainment: 'Fun',
  utilities: 'Bills',
  other: 'Other',
};

const CATEGORY_ICON = {
  food: 'restaurant-outline',
  stay: 'bed-outline',
  travel: 'train-outline',
  transport: 'train-outline',
  housing: 'bed-outline',
  fun: 'beer-outline',
  entertainment: 'beer-outline',
  shopping: 'cart-outline',
  utilities: 'flash-outline',
  general: 'receipt-outline',
  other: 'receipt-outline',
};

const ExpensesTab = ({ expenses, loading, currentUserId, onOpenExpense }) => {
  const totals = useMemo(() => {
    let spent = 0;
    let youOwe = 0;
    let owedYou = 0;

    for (const expense of expenses) {
      spent += expense.amount;
      const payerId = expense.paidBy?._id ?? expense.paidBy;
      const iPaid = payerId === currentUserId;

      for (const split of expense.splits ?? []) {
        if (split.settled) continue;
        const splitUserId = split.user?._id ?? split.user;
        if (iPaid && splitUserId !== currentUserId) owedYou += split.amount;
        if (!iPaid && splitUserId === currentUserId) youOwe += split.amount;
      }
    }

    return { spent, youOwe, owedYou };
  }, [expenses, currentUserId]);

  const renderExpense = ({ item }) => {
    const payer = item.paidBy;
    const iPaid = (payer?._id ?? payer) === currentUserId;
    const mySplit = item.splits?.find((s) => (s.user?._id ?? s.user) === currentUserId);
    const perHead = item.splits?.length ? item.amount / item.splits.length : 0;
    const isEqual = item.splits?.every((s) => Math.abs(s.amount - perHead) < 0.01);
    // "Settled" here means nothing is outstanding for me on this expense.
    const settled = iPaid
      ? (item.splits ?? []).every((s) => s.settled || (s.user?._id ?? s.user) === currentUserId)
      : !mySplit || mySplit.settled;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => onOpenExpense?.(item)}
      >
        <View style={styles.cardTop}>
          <View style={styles.categoryIcon}>
            <Ionicons
              name={CATEGORY_ICON[item.category] ?? 'receipt-outline'}
              size={17}
              color={dark.text}
            />
          </View>

          <View style={styles.cardHead}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.description}
              </Text>
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>
                  {CATEGORY_LABEL[item.category] ?? 'General'}
                </Text>
              </View>
            </View>
            <Text style={styles.date}>{formatDate(item.date)}</Text>
          </View>

          <View style={styles.amountColumn}>
            <Text style={styles.amount}>{usd(item.amount)}</Text>
            {settled ? (
              <Text style={styles.settled}>✓ Settled</Text>
            ) : (
              <Text style={styles.owed}>
                {iPaid ? 'You are owed' : `Your share ${usd(mySplit?.amount ?? 0)}`}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.payerBlock}>
            <Avatar name={payer?.name} size={22} solid />
            <View style={styles.payerText}>
              <Text style={styles.payerLabel}>PAID BY</Text>
              <Text style={styles.payerName}>{iPaid ? 'You' : payer?.name}</Text>
            </View>
          </View>

          <View style={styles.splitBlock}>
            <Text style={styles.payerLabel}>SPLIT BETWEEN</Text>
            <MemberAvatars users={(item.splits ?? []).map((s) => s.user)} size={20} max={5} />
            <Text style={styles.splitNote}>
              {item.splits?.length ?? 0} people
              {isEqual ? ` · ${usd(perHead)} each` : ' · custom'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  return (
    <FlatList
      data={expenses}
      keyExtractor={(item) => item._id}
      renderItem={renderExpense}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <View style={styles.statRow}>
            <StatTile value={usd(totals.spent)} label="Total Spent" />
            <StatTile value={usd(totals.youOwe)} label="You Owe" color="#F5883C" />
            <StatTile value={usd(totals.owedYou)} label="Owed You" color={dark.accentGreen} />
          </View>
          <Text style={styles.sectionLabel}>All Expenses</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No expenses yet — tap + to add the first one.</Text>
      }
    />
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sectionLabel: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },

  card: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  cardHead: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: dark.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  categoryChip: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryText: { color: dark.textMuted, fontSize: 9, fontWeight: '700' },
  date: { color: dark.textMuted, fontSize: 11, marginTop: 3 },
  amountColumn: { alignItems: 'flex-end' },
  amount: { color: dark.text, fontSize: 16, fontWeight: '800' },
  settled: { color: dark.accentGreen, fontSize: 10, marginTop: 3 },
  owed: { color: '#F87171', fontSize: 10, marginTop: 3 },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    gap: spacing.md,
  },
  payerBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payerText: {},
  payerLabel: { color: dark.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  payerName: { color: dark.text, fontSize: 12, fontWeight: '600' },
  splitBlock: { flex: 1, alignItems: 'flex-start', gap: 3 },
  splitNote: { color: dark.textMuted, fontSize: 10 },
});

export default ExpensesTab;
