import React, { useCallback, useState } from 'react';
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
import AppAlert from '../components/AppAlert';
import { fetchMyReports } from '../api/support.api';
import { categoryLabel, lastReply, statusOf } from '../data/support';
import { timeAgo } from '../utils/format';
import { dark, radius, spacing } from '../theme';

// A report's standing, as a small coloured pill.
export const StatusPill = ({ status, style }) => {
  const look = statusOf(status);
  return (
    <View style={[styles.pill, { backgroundColor: `${look.tint}1F`, borderColor: `${look.tint}55` }, style]}>
      <View style={[styles.pillDot, { backgroundColor: look.tint }]} />
      <Text style={[styles.pillText, { color: look.tint }]}>{look.label}</Text>
    </View>
  );
};

/**
 * Everything the person has sent, newest first, with where each one stands
 * and the last thing the team wrote back. Tapping one opens it.
 */
const MyReportsScreen = ({ navigation }) => {
  const [reports, setReports] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      setReports(await fetchMyReports());
    } catch (err) {
      AppAlert.alert('Could not load your reports', err.message);
      setReports((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Asked again on every visit: a reply may have arrived since.
  useFocusEffect(
    useCallback(() => {
      load({ quiet: true });
    }, [load])
  );

  const renderReport = ({ item }) => {
    const reply = lastReply(item);
    const replies = item.events.filter((event) => event.kind === 'reply').length;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('ReportDetail', { reportId: item._id, report: item })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.category}>{categoryLabel(item.category)}</Text>
          <StatusPill status={item.status} />
        </View>
        <Text style={styles.subject} numberOfLines={2}>
          {item.subject}
        </Text>
        <Text style={styles.snippet} numberOfLines={2}>
          {reply ? `Splix: ${reply.body}` : item.message}
        </Text>
        <View style={styles.cardBottom}>
          <Text style={styles.time}>{timeAgo(item.updatedAt ?? item.createdAt)}</Text>
          <View style={styles.replies}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={dark.textMuted} />
            <Text style={styles.time}>
              {replies === 0 ? 'No reply yet' : `${replies} ${replies === 1 ? 'reply' : 'replies'}`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reports</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('ReportProblem')}
          activeOpacity={0.7}
          accessibilityLabel="New report"
        >
          <Ionicons name="add" size={20} color={dark.text} />
        </TouchableOpacity>
      </View>

      {reports === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item._id}
          renderItem={renderReport}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={load}
              tintColor={dark.accentGreen}
              colors={[dark.accentGreen]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={26} color={dark.accentGreen} />
              </View>
              <Text style={styles.emptyTitle}>No reports yet</Text>
              <Text style={styles.emptyText}>
                Something not working, or an idea? Tell us and we'll get back to you here.
              </Text>
              <GradientButton
                title="Report a problem"
                onPress={() => navigation.navigate('ReportProblem')}
                style={styles.emptyButton}
              />
            </View>
          }
        />
      )}
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 20,
    fontWeight: '800',
  },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, flexGrow: 1 },

  card: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  category: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subject: { color: dark.text, fontSize: 15, fontWeight: '700' },
  snippet: { color: dark.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
  },
  replies: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { color: dark.textMuted, fontSize: 11 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(0,196,208,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { color: dark.text, fontSize: 17, fontWeight: '700' },
  emptyText: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emptyButton: { alignSelf: 'stretch', marginTop: spacing.lg },
});

export default MyReportsScreen;
