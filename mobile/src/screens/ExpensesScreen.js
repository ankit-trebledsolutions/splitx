import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen, { TOP_ONLY } from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { fetchGroups, fetchExpensePage } from '../api/groups.api';
import { dark, radius, spacing } from '../theme';
import { usd, formatDate } from '../utils/format';

// The latest few of each group. Its header shows the group's whole total and
// opens the group's Expenses tab, which has the rest.
const PER_GROUP = 20;

// Bottom-tab Expenses: every expense across all your groups. Tapping a group
// header opens that group's Expenses tab; tapping a row opens the expense.
const ExpensesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const currentUserId = user?._id;
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const groups = await fetchGroups();
          const perGroup = await Promise.all(
            groups.map(async (group) => ({
              group,
              page: await fetchExpensePage(group._id, { limit: PER_GROUP }).catch(() => null),
            }))
          );
          if (!active) return;
          setSections(
            perGroup
              .filter(({ page }) => page?.expenses.length)
              .map(({ group, page }) => ({
                group,
                title: group.name,
                data: page.expenses,
                hasMore: page.hasMore,
                // A server from before paging sends the whole list and no totals.
                total: page.totals?.spent ?? page.expenses.reduce((sum, e) => sum + e.amount, 0),
              }))
          );
        } catch {
          // Keep whatever was last shown; pull-down isn't implemented yet.
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <DarkScreen edges={TOP_ONLY}>
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const renderExpense = ({ item }) => {
    const mine = item.splits?.find((s) => (s.user?._id ?? s.user) === currentUserId);
    const paidByMe = (item.paidBy?._id ?? item.paidBy) === currentUserId;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item._id })}
      >
        <View style={styles.rowIcon}>
          <Ionicons name="receipt-outline" size={17} color={dark.text} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.rowMeta}>
            Paid by {paidByMe ? 'you' : item.paidBy?.name ?? 'someone'} ·{' '}
            {formatDate(item.date ?? item.createdAt)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowAmount}>{usd(item.amount)}</Text>
          {mine && !paidByMe ? (
            <Text style={mine.settled ? styles.settled : styles.share}>
              {mine.settled ? '✓ Settled' : `Your: ${usd(mine.amount)}`}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const openGroupExpenses = (group) =>
    navigation.navigate('GroupChat', { groupId: group._id, initialTab: 'expenses' });

  return (
    <DarkScreen edges={TOP_ONLY}>
      <Text style={styles.title}>Expenses</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        renderItem={renderExpense}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderSectionFooter={({ section }) =>
          section.hasMore ? (
            <TouchableOpacity
              style={styles.seeAll}
              activeOpacity={0.8}
              onPress={() => openGroupExpenses(section.group)}
            >
              <Text style={styles.seeAllText}>See all in {section.title}</Text>
              <Ionicons name="chevron-forward" size={13} color={dark.accentGreen} />
            </TouchableOpacity>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            style={styles.sectionHeader}
            activeOpacity={0.8}
            onPress={() => openGroupExpenses(section.group)}
          >
            <Avatar name={section.group.name} size={26} />
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {section.title}
            </Text>
            <Text style={styles.sectionTotal}>{usd(section.total)}</Text>
            <Ionicons name="chevron-forward" size={14} color={dark.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No expenses yet — open a group and add the first one.
          </Text>
        }
      />
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: dark.text,
    fontSize: 24,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '700' },
  sectionTotal: { color: dark.accentGreen, fontSize: 13, fontWeight: '800' },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  seeAllText: { color: dark.accentGreen, fontSize: 12, fontWeight: '700' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowBody: { flex: 1, marginRight: spacing.sm },
  rowTitle: { color: dark.text, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowAmount: { color: dark.text, fontSize: 15, fontWeight: '700' },
  settled: { color: dark.accentGreen, fontSize: 11, marginTop: 2 },
  share: { color: '#F87171', fontSize: 11, marginTop: 2 },
});

export default ExpensesScreen;
