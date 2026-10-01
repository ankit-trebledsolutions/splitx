import React, { useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StatTile from '../../components/StatTile';
import { dark, radius, spacing } from '../../theme';
import { formatDateTime, formatTime, isToday } from '../../utils/format';
import { nextRingAt } from '../../utils/reminderAlarms';

const TODAY = '#F5B342';

// On for me: not switched off for everybody, and not by me for myself.
const isOn = (reminder) => reminder.enabled && !reminder.muted;

/**
 * A list of reminders: a group's Reminders tab, and the "Reminders" screen
 * that shows every one of mine (there with `showGroup`, since they come from
 * different groups).
 *
 *   onToggle   the switch: on or off for me
 *   onOpen     a tap on a reminder (edit it)
 */
const RemindersTab = ({
  reminders,
  loading,
  onToggle,
  onOpen,
  showGroup = false,
  emptyText = 'No reminders yet — save a task and Splix will offer to set one.',
  refreshing,
  onRefresh,
}) => {
  const { sections, stats } = useMemo(() => {
    const now = Date.now();
    // A weekly reminder is listed at its next turn, not at the date it began.
    const rows = reminders
      .map((reminder) => ({ ...reminder, ringsAt: nextRingAt(reminder, now) }))
      .sort((a, b) => (a.ringsAt ?? Infinity) - (b.ringsAt ?? Infinity));

    const off = rows.filter((r) => !isOn(r) && r.ringsAt);
    const past = rows
      .filter((r) => !r.ringsAt)
      .sort((a, b) => new Date(b.remindAt) - new Date(a.remindAt));
    const waiting = rows.filter((r) => isOn(r) && r.ringsAt);
    const today = waiting.filter((r) => isToday(r.ringsAt));
    const upcoming = waiting.filter((r) => !isToday(r.ringsAt));

    const built = [];
    if (today.length) built.push({ title: 'Today', accent: TODAY, data: today });
    if (upcoming.length) built.push({ title: 'Upcoming', accent: dark.accentBlue, data: upcoming });
    if (off.length) built.push({ title: 'Turned off', accent: dark.textMuted, data: off });
    if (past.length) built.push({ title: 'Past', accent: dark.textMuted, data: past });

    return {
      sections: built,
      stats: { active: waiting.length, today: today.length, off: off.length },
    };
  }, [reminders]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderReminder = ({ item }) => {
    const done = !item.ringsAt;
    const on = isOn(item);
    const at = item.ringsAt ?? item.remindAt;
    // On, but silent on this phone: someone else's reminder in a group I muted.
    const silenced = on && !done && item.rings === false;

    return (
      <TouchableOpacity
        style={[styles.card, (!on || done) && styles.cardOff]}
        activeOpacity={0.8}
        disabled={!onOpen}
        onPress={() => onOpen?.(item)}
      >
        <View style={styles.icon}>
          <Ionicons name={item.icon || 'alarm-outline'} size={18} color={dark.text} />
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={11} color={dark.accentGreen} />
            <Text style={styles.metaText}>
              {isToday(at) ? `Today · ${formatTime(at)}` : formatDateTime(at)}
            </Text>
            {item.repeatWeekly ? (
              <View style={styles.chip}>
                <Ionicons name="repeat-outline" size={9} color={dark.textMuted} />
                <Text style={styles.chipText}>Weekly</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.chip}>
              <Ionicons
                name={item.scope === 'me' ? 'person-outline' : 'people-outline'}
                size={9}
                color={dark.textMuted}
              />
              <Text style={styles.chipText} numberOfLines={1}>
                {showGroup
                  ? item.groupName ?? 'Personal'
                  : item.scope === 'me'
                    ? 'Just Me'
                    : 'Group'}
              </Text>
            </View>
            {silenced ? (
              <View style={styles.chip}>
                <Ionicons name="notifications-off-outline" size={9} color={TODAY} />
                <Text style={[styles.chipText, styles.chipWarn]}>Group muted</Text>
              </View>
            ) : null}
          </View>
        </View>

        {done ? (
          <Ionicons name="checkmark-done-outline" size={18} color={dark.textMuted} />
        ) : (
          <Switch
            value={on}
            onValueChange={() => onToggle?.(item)}
            trackColor={{ false: 'rgba(255,255,255,0.14)', true: dark.accentGreen }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="rgba(255,255,255,0.14)"
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item._id}
      renderItem={renderReminder}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={dark.accentGreen}
          />
        ) : undefined
      }
      ListHeaderComponent={
        <View style={styles.statRow}>
          <StatTile value={stats.active} label="Active" color={dark.accentBlue} />
          <StatTile value={stats.today} label="Today" color={TODAY} />
          <StatTile value={stats.off} label="Off" color={dark.textMuted} />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: section.accent }]} />
          <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{section.data.length}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
    />
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
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
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { color: dark.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  sectionCount: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sectionCountText: { color: dark.textMuted, fontSize: 9, fontWeight: '700' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardOff: { opacity: 0.55 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  body: { flex: 1, marginRight: spacing.sm },
  title: { color: dark.text, fontSize: 14, fontWeight: '600' },
  subtitle: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  metaText: { color: dark.accentGreen, fontSize: 10, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 170,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: { color: dark.textMuted, fontSize: 9, fontWeight: '600' },
  chipWarn: { color: TODAY },
});

export default RemindersTab;
