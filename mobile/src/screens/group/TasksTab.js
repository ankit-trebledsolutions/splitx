import React, { useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MemberAvatars from '../../components/MemberAvatars';
import StatTile from '../../components/StatTile';
import { dark, radius, spacing } from '../../theme';
import { formatDateTime, isToday } from '../../utils/format';

const PRIORITY_COLOR = { high: '#F87171', med: '#F5B342', low: '#17E695' };

const TasksTab = ({ tasks, loading, onToggle, onOpenTask }) => {
  const { sections, stats } = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'open');
    const done = tasks.filter((t) => t.status === 'done');
    const today = open.filter((t) => isToday(t.dueAt));
    const upcoming = open.filter((t) => !isToday(t.dueAt));

    const built = [];
    if (today.length) built.push({ title: 'Today', accent: '#F5B342', data: today });
    if (upcoming.length) built.push({ title: 'Upcoming', accent: dark.accentBlue, data: upcoming });
    if (done.length) built.push({ title: 'Completed', accent: dark.accentGreen, data: done });

    return {
      sections: built,
      stats: { open: open.length, today: today.length, done: done.length },
    };
  }, [tasks]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderTask = ({ item }) => {
    const isDone = item.status === 'done';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => onOpenTask?.(item)}
      >
        <TouchableOpacity
          style={[styles.checkbox, isDone && styles.checkboxDone]}
          onPress={() => onToggle?.(item)}
          hitSlop={styles.hitSlop}
          activeOpacity={0.7}
        >
          {isDone && <Ionicons name="checkmark" size={13} color="#04241A" />}
        </TouchableOpacity>

        <View style={styles.cardBody}>
          <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.meta}>
            {item.dueAt ? `Due ${formatDateTime(item.dueAt)}` : 'No due date'}
          </Text>
          {item.source?.text ? (
            <Text style={styles.source} numberOfLines={1}>
              From chat: “{item.source.text}”
            </Text>
          ) : null}
        </View>

        <View style={styles.cardRight}>
          <View
            style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[item.priority] ?? '#F5B342' }]}
          />
          {item.assignees?.length ? (
            <MemberAvatars users={item.assignees} size={20} max={3} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item._id}
      renderItem={renderTask}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.statRow}>
          <StatTile value={stats.open} label="Open" color={dark.accentBlue} />
          <StatTile value={stats.today} label="Today" color="#F5B342" />
          <StatTile value={stats.done} label="Done" color={dark.accentGreen} />
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
          No tasks yet — mention something like “don&apos;t forget to book tickets” in chat and
          Splix will offer to add it.
        </Text>
      }
    />
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: dark.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxDone: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
  cardBody: { flex: 1 },
  title: { color: dark.text, fontSize: 14, fontWeight: '600' },
  titleDone: { color: dark.textMuted, textDecorationLine: 'line-through' },
  meta: { color: dark.textMuted, fontSize: 11, marginTop: 3 },
  source: { color: dark.textMuted, fontSize: 10, fontStyle: 'italic', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
});

export default TasksTab;
