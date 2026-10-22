import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import NetBalanceBg from '../assets/net-balance-bg.svg';
import useWallet from '../hooks/useWallet';
import { getWalletTransactions } from '../api/wallet.api';
import { MORE_CREDITS_SUBJECT, creditsLabel, isPaid, transactionLabel } from '../data/wallet';
import { formatDateTime } from '../utils/format';
import { dark, radius, spacing } from '../theme';

const PAGE_SIZE = 20;
const PLUS = '#17E695';
const MINUS = '#F87171';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "1 Nov". The server renews free credits at the start of the month in UTC,
// so the date is read in UTC too: local time would say "31 Oct" west of it.
const renewDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

const formatNumber = (value) => (Number(value) || 0).toLocaleString();

// "+20" / "-5"
const signed = (amount) => `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatNumber(Math.abs(amount))}`;

// New rows can push older ones onto the next page while the list is open, so
// a page may repeat a row already shown.
const appendRows = (list, rows) => {
  const seen = new Set(list.map((row) => row.id));
  return [...list, ...rows.filter((row) => !seen.has(row.id))];
};

/**
 * Profile > Wallet: the person's credits as one total, the two pots it is made
 * of (this month's free credits, used first, and their own, which never
 * expire), what the paid features cost today, and every change, newest first.
 * Credits cannot be bought yet: getting more means asking the team.
 */
const WalletScreen = ({ navigation }) => {
  // The history a page at a time; null until the first page has come.
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [historyError, setHistoryError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bumped by every fresh first page, so a later page asked for before it
  // is not added to the new list.
  const listVersion = useRef(0);

  const loadFirstPage = useCallback(async () => {
    listVersion.current += 1;
    try {
      const data = await getWalletTransactions({ page: 1, limit: PAGE_SIZE });
      setRows(data.items);
      setPage(data.page);
      setPages(data.pages);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err);
      setRows((prev) => prev ?? []);
    }
  }, []);

  // Every change to the credits is also a new row at the top of the history.
  const { wallet, error, refresh } = useWallet({ onChange: loadFirstPage });

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadFirstPage()]);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !rows || page >= pages) return;
    const version = listVersion.current;
    setLoadingMore(true);
    try {
      const data = await getWalletTransactions({ page: page + 1, limit: PAGE_SIZE });
      if (version !== listVersion.current) return;
      setRows((list) => appendRows(list, data.items));
      setPage(data.page);
      setPages(data.pages);
    } catch {
      // Scrolling to the end again asks again.
    } finally {
      setLoadingMore(false);
    }
  };

  const askForCredits = () => navigation.navigate('ContactUs', { subject: MORE_CREDITS_SUBJECT });

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerButton} onPress={navigation.goBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={18} color={dark.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Wallet</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  // Nothing to show without the wallet itself: still loading, or it failed.
  if (!wallet) {
    // A server from before wallets has no such route.
    const missing = error?.status === 404;
    return (
      <DarkScreen>
        {header}
        {error ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="wallet-outline" size={26} color={dark.accentGreen} />
            </View>
            <Text style={styles.emptyTitle}>
              {missing ? 'Wallet is not ready yet' : 'Could not load your wallet'}
            </Text>
            <Text style={styles.emptyText}>
              {missing ? 'Credits arrive with the next Splix update. Check back soon.' : error.message}
            </Text>
            {missing ? null : (
              <GradientButton
                title="Try again"
                onPress={() => {
                  refresh();
                  loadFirstPage();
                }}
                style={styles.emptyButton}
              />
            )}
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={dark.accentGreen} />
          </View>
        )}
      </DarkScreen>
    );
  }

  const { prices = {} } = wallet;
  const renewsOn = renewDay(wallet.freeRenewsAt);
  const potsNote = [
    wallet.monthlyFree > 0
      ? `Free credits are used first and top up to ${formatNumber(wallet.monthlyFree)}${
          renewsOn ? ` on ${renewsOn}` : ' on the 1st of each month'
        }.`
      : null,
    'Your own credits never expire.',
  ]
    .filter(Boolean)
    .join(' ');

  const priceRows = [
    {
      key: 'ai',
      icon: 'sparkles',
      title: 'AI itinerary',
      detail: isPaid(prices.aiItinerary)
        ? 'A plan that fails is refunded automatically.'
        : 'Let AI plan your trip, day by day.',
      price: isPaid(prices.aiItinerary) ? `${creditsLabel(prices.aiItinerary)} per plan` : 'Free',
    },
    {
      key: 'call',
      icon: 'call',
      title: 'Group calls',
      detail: isPaid(prices.callBlock)
        ? 'Paid by whoever starts the call. Joining is free.'
        : 'Voice and video calls with your group.',
      price: isPaid(prices.callBlock)
        ? `${creditsLabel(prices.callBlock)} per ${prices.callBlockMinutes} min`
        : 'Free',
    },
  ];

  const listHeader = (
    <View>
      <View style={styles.balanceCard}>
        <NetBalanceBg
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.balanceBody}>
          <Text style={styles.balanceLabel}>Your credits</Text>
          <Text style={styles.balanceValue}>{formatNumber(wallet.balance)}</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <Ionicons name="calendar" size={15} color={dark.accentGreen} />
            </View>
            <View>
              <Text style={styles.statLabel}>FREE THIS MONTH</Text>
              <Text style={styles.statValue}>{formatNumber(wallet.free)}</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <Ionicons name="wallet" size={15} color={dark.accentGreen} />
            </View>
            <View>
              <Text style={styles.statLabel}>YOUR OWN</Text>
              <Text style={styles.statValue}>{formatNumber(wallet.paid)}</Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.note}>{potsNote}</Text>

      <Text style={styles.sectionLabel}>Prices</Text>
      <View style={styles.card}>
        {priceRows.map((row, index) => (
          <View key={row.key} style={[styles.cardRow, index > 0 && styles.cardDivider]}>
            <View style={styles.rowIcon}>
              <Ionicons name={row.icon} size={17} color={dark.button} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowDetail}>{row.detail}</Text>
            </View>
            <Text style={[styles.price, row.price === 'Free' && styles.priceFree]}>{row.price}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={[styles.card, styles.cardRow, styles.more]} activeOpacity={0.7} onPress={askForCredits}>
        <View style={styles.rowIcon}>
          <Ionicons name="chatbubbles" size={17} color={dark.button} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>Need more credits?</Text>
          <Text style={styles.rowDetail}>
            Credits can’t be bought in the app yet. Ask the Splix team.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>History</Text>
      {historyError && rows?.length ? (
        <Text style={styles.historyError}>Could not refresh the history. Pull down to try again.</Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }) => {
    const label = transactionLabel(item);
    const meta = [label.detail, formatDateTime(item.createdAt)].filter(Boolean).join(' · ');
    return (
      <View style={styles.txRow}>
        <View style={styles.rowIcon}>
          <Ionicons name={label.icon} size={17} color={dark.button} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {label.title}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.txRight}>
          <Text style={[styles.txAmount, { color: item.amount < 0 ? MINUS : PLUS }]}>
            {signed(item.amount)}
          </Text>
          <Text style={styles.txAfter}>Balance {formatNumber(item.balanceAfter)}</Text>
        </View>
      </View>
    );
  };

  return (
    <DarkScreen>
      {header}
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={page < pages ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={dark.accentGreen}
            colors={[dark.accentGreen]}
          />
        }
        ListFooterComponent={
          loadingMore || rows === null ? (
            <ActivityIndicator color={dark.accentGreen} style={styles.footer} />
          ) : null
        }
        ListEmptyComponent={
          rows === null ? null : (
            <Text style={styles.historyEmpty}>
              {historyError
                ? 'Could not load the history. Pull down to try again.'
                : 'Nothing yet. Credits you get and use will show here.'}
            </Text>
          )
        }
      />
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  // My Reports' header.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 20,
    fontWeight: '800',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(0,196,208,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { color: dark.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emptyButton: { alignSelf: 'stretch', marginTop: spacing.lg },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },

  // Home's Net Balance card.
  balanceCard: { borderRadius: radius.lg + 8, overflow: 'hidden' },
  balanceBody: {
    alignItems: 'center',
    paddingTop: spacing.lg + 4,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  balanceValue: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', marginTop: 4 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0B0E12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 1 },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: spacing.md,
  },
  note: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },

  // Profile's section labels and settings cards.
  sectionLabel: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardDivider: { borderTopWidth: 1, borderTopColor: dark.border },
  more: { marginTop: spacing.sm + 2 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(0,196,208,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: dark.text, fontSize: 14, fontWeight: '600' },
  rowDetail: { color: dark.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  price: { color: dark.text, fontSize: 13, fontWeight: '700', marginLeft: spacing.sm },
  priceFree: { color: PLUS },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  txRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  txAmount: { fontSize: 15, fontWeight: '800' },
  txAfter: { color: dark.textMuted, fontSize: 10, marginTop: 2 },

  historyError: { color: MINUS, fontSize: 12, marginBottom: spacing.sm },
  historyEmpty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footer: { marginVertical: spacing.md },
});

export default WalletScreen;
