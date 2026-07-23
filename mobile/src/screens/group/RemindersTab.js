import React, { useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  Switch,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StatTile from '../../components/StatTile';
import { dark, radius, spacing } from '../../theme';
import { formatDateTime, formatTime, isToday } from '../../utils/format';

const RemindersTab = ({ reminders, loading, onToggle }) => {
  const { sections, stats } = useMemo(() => {
    const on = reminders.filter((r) => r.enabled);
    const off = reminders.filter((r) => !r.enabled);
    const today = on.filter((r) => isToday(r.remindAt));
    const upcoming = on.filter((r) => !isToday(r.remindAt));

    const built = [];
    if (today.length) built.push({ title: 'Today', accent: '#F5B342', data: today });
    if (upcoming.length) built.push({ title: 'Upcoming', accent: dark.accentBlue, data: upcoming });
    if (off.length) built.push({ title: 'Turned off', accent: dark.textMuted, data: off });

    return {
      sections: built,
      stats: { active: on.length, today: today.length, off: off.length },
    };
  }, [reminders]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderReminder = ({ item }) => (
    <View style={[styles.card, !item.enabled && styles.cardOff]}>
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
            {isToday(item.remindAt) ? `Today · ${formatTime(item.remindAt)}` : formatDateTime(item.remindAt)}
          </Text>
          <View style={styles.scopeChip}>
            <Ionicons
              name={item.scope === 'me' ? 'person-outline' : 'people-outline'}
              size={9}
              color={dark.textMuted}
            />
            <Text style={styles.scopeText}>{item.scope === 'me' ? 'Just Me' : 'Group'}</Text>
          </View>
        </View>
      </View>

      <Switch
        value={item.enabled}
        onValueChange={() => onToggle?.(item)}
        trackColor={{ false: 'rgba(255,255,255,0.14)', true: dark.accentGreen }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="rgba(255,255,255,0.14)"
      />
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item._id}
      renderItem={renderReminder}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.statRow}>
          <StatTile value={stats.active} label="Active" color={dark.accentBlue} />
          <StatTile value={stats.today} label="Today" color="#F5B342" />
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
      ListEmptyComponent={
        <Text style={styles.empty}>
          No reminders yet — save a task and Splix will offer to set one.
        </Text>
      }
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
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  scopeText: { color: dark.textMuted, fontSize: 9, fontWeight: '600' },
});

export default RemindersTab;
