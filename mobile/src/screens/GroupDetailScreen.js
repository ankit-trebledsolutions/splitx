import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGroup, fetchExpenses, fetchBalances, deleteExpense } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { colors, radius, spacing } from '../theme';
import { formatMoney, formatDate } from '../utils/format';

const GroupDetailScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('expenses');

  const load = useCallback(async () => {
    try {
      const [groupData, expenseData, balanceData] = await Promise.all([
        fetchGroup(groupId),
        fetchExpenses(groupId),
        fetchBalances(groupId),
      ]);
      setGroup(groupData);
      setExpenses(expenseData);
      setBalances(balanceData.balances);
      setSettlements(balanceData.settlements);
    } catch (err) {
      Alert.alert('Could not load group', err.message);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shareInvite = () => {
    if (!group) return;
    Share.share({
      message: `Join "${group.name}" on Splix with invite code: ${group.inviteCode}`,
    });
  };

  const confirmDelete = (expense) => {
    Alert.alert('Delete expense', `Delete "${expense.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expense._id);
            await load();
          } catch (err) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);
  };

  const renderExpense = ({ item }) => (
    <TouchableOpacity style={styles.card} onLongPress={() => confirmDelete(item)} activeOpacity={0.8}>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <Text style={styles.cardSubtitle}>
          {item.paidBy?.name} paid · {formatDate(item.date)}
        </Text>
      </View>
      <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
    </TouchableOpacity>
  );

  const renderBalances = () => (
    <View>
      {balances.map((b) => {
        const isMe = b.user._id === user?._id;
        const owed = b.net >= 0;
        return (
          <View key={b.user._id} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{isMe ? 'You' : b.user.name}</Text>
            </View>
            <Text style={[styles.amount, owed ? styles.positive : styles.negative]}>
              {owed ? 'gets back ' : 'owes '}
              {formatMoney(b.net)}
            </Text>
          </View>
        );
      })}
      {settlements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Suggested settlements</Text>
          {settlements.map((s, idx) => (
            <View key={idx} style={styles.card}>
              <Text style={styles.cardSubtitle}>
                <Text style={styles.cardTitle}>{s.from._id === user?._id ? 'You' : s.from.name}</Text>
                {'  →  '}
                <Text style={styles.cardTitle}>{s.to._id === user?._id ? 'you' : s.to.name}</Text>
                {'   '}
                {formatMoney(s.amount)}
              </Text>
            </View>
          ))}
        </>
      )}
      {balances.length === 0 && (
        <EmptyState title="All settled" subtitle="No balances yet — add an expense first." />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {['expenses', 'balances'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'expenses' ? 'Expenses' : 'Balances'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'expenses' ? (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item._id}
          renderItem={renderExpense}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState title="No expenses yet" subtitle="Add the first expense to get started." />
          }
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={renderBalances()}
        />
      )}

      <View style={styles.footer}>
        <Button
          title="Add expense"
          onPress={() => navigation.navigate('AddExpense', { groupId, members: group?.members ?? [] })}
        />
        <Button
          title={`Share invite code · ${group?.inviteCode ?? ''}`}
          variant="outline"
          onPress={shareInvite}
          style={styles.shareButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    margin: spacing.md,
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md - 3,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.text },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginVertical: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footer: { padding: spacing.md, gap: spacing.sm },
  shareButton: { marginTop: spacing.sm },
});

export default GroupDetailScreen;
