import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import Avatar, { avatarColor } from '../components/Avatar';
import GradientButton from '../components/GradientButton';
import { fetchGroups } from '../api/groups.api';
import { dark, radius, spacing } from '../theme';
import { presenceFor, phoneFor } from '../utils/presence';
import { initials } from '../utils/format';

// Profile page for another group member (never opened for yourself).
const MemberProfileScreen = ({ route, navigation }) => {
  const { member, groupId, isAdmin } = route.params;

  const [commonGroups, setCommonGroups] = useState(null);
  const presence = presenceFor(member._id);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const groups = await fetchGroups();
          if (!active) return;
          setCommonGroups(
            groups.filter(
              (g) =>
                g._id !== groupId &&
                g.members?.some((m) => (m?._id ?? m) === member._id)
            )
          );
        } catch {
          if (active) setCommonGroups([]);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId, member._id])
  );

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <Ionicons name="ellipsis-vertical" size={15} color={dark.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <Avatar name={member.name} size={92} solid />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{member.name}</Text>
            {isAdmin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          <View style={styles.presenceRow}>
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: presence.online ? '#22C55E' : dark.textMuted },
              ]}
            />
            <Text
              style={[
                styles.presenceText,
                { color: presence.online ? '#22C55E' : dark.textMuted },
              ]}
            >
              {presence.label}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CONTACT INFORMATION</Text>
        <View style={styles.card}>
          <View style={styles.contactRow}>
            <View style={styles.contactIcon}>
              <Ionicons name="call-outline" size={16} color={dark.textMuted} />
            </View>
            <View style={styles.contactBody}>
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{member.phone ?? phoneFor(member._id)}</Text>
            </View>
          </View>
          <View style={[styles.contactRow, styles.contactRowBorder]}>
            <View style={styles.contactIcon}>
              <Ionicons name="mail-outline" size={16} color={dark.textMuted} />
            </View>
            <View style={styles.contactBody}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{member.email ?? '—'}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.groupsLabel]}>GROUPS IN COMMON</Text>
        {commonGroups === null ? (
          <View style={styles.card}>
            <ActivityIndicator color={dark.accentGreen} style={styles.groupsLoading} />
          </View>
        ) : commonGroups.length ? (
          <View style={styles.card}>
            {commonGroups.map((g, index) => (
              <TouchableOpacity
                key={g._id}
                style={[styles.groupRow, index > 0 && styles.groupRowBorder]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('GroupChat', { groupId: g._id })}
              >
                <View style={[styles.groupTile, { backgroundColor: avatarColor(g.name) }]}>
                  <Text style={styles.groupTileText}>{initials(g.name)}</Text>
                </View>
                <View style={styles.groupBody}>
                  <Text style={styles.groupName} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.groupMeta}>
                    {g.members?.length ?? 0} Member{(g.members?.length ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.empty}>No other groups in common.</Text>
          </View>
        )}

        <GradientButton title="Send Message" style={styles.sendButton} onPress={() => {}} />

        <TouchableOpacity style={styles.removeButton} activeOpacity={0.8}>
          <Text style={styles.removeButtonText}>Remove from Group</Text>
        </TouchableOpacity>
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: dark.text, fontSize: 17, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  avatarRing: {
    padding: 3,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: dark.accentGreen,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  name: { color: dark.text, fontSize: 24, fontWeight: '800' },
  adminBadge: {
    backgroundColor: 'rgba(0,196,208,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: 12,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 3,
  },
  adminBadgeText: { color: dark.accentGreen, fontSize: 11, fontWeight: '700' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceText: { fontSize: 12, fontWeight: '600' },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: spacing.sm,
  },
  groupsLabel: { marginTop: spacing.lg },

  card: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  contactRowBorder: { borderTopWidth: 1, borderTopColor: dark.border },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBody: { flex: 1, marginLeft: spacing.sm + 4 },
  contactLabel: { color: dark.textMuted, fontSize: 11 },
  contactValue: { color: dark.text, fontSize: 14, fontWeight: '600', marginTop: 2 },

  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  groupRowBorder: { borderTopWidth: 1, borderTopColor: dark.border },
  groupTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTileText: { color: '#0B1116', fontSize: 13, fontWeight: '800' },
  groupBody: { flex: 1, marginLeft: spacing.sm + 4 },
  groupName: { color: dark.text, fontSize: 14, fontWeight: '700' },
  groupMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  groupsLoading: { paddingVertical: spacing.md },
  empty: { color: dark.textMuted, fontSize: 12, paddingVertical: spacing.md },

  sendButton: { marginTop: spacing.lg },
  removeButton: {
    backgroundColor: 'rgba(249,115,98,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,98,0.35)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm + 4,
  },
  removeButtonText: { color: '#F97362', fontSize: 15, fontWeight: '700' },
});

export default MemberProfileScreen;
