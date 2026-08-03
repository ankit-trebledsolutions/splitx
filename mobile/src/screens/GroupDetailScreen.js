import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import { fetchGroup } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import { dark, radius, spacing } from '../theme';
import { presenceFor } from '../utils/presence';

// "Group Info" screen, opened by tapping the group name in the chat header.
const GroupDetailScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id;

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const data = await fetchGroup(groupId);
          if (active) setGroup(data);
        } catch (err) {
          Alert.alert('Could not load group', err.message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId])
  );

  if (loading || !group) {
    return (
      <DarkScreen>
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const adminId = group.createdBy?._id ?? group.createdBy;
  const memberCount = group.members?.length ?? 0;
  const tripLabel = group.totalDays
    ? `${group.totalDays}-day trip`
    : group.groupType
      ? `${group.groupType[0].toUpperCase()}${group.groupType.slice(1)} group`
      : '';

  const openMember = (member) => {
    // The profile page is only for other members, not yourself.
    if (member._id === currentUserId) return;
    navigation.navigate('MemberProfile', {
      member,
      groupId,
      isAdmin: member._id === adminId,
    });
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <Ionicons name="ellipsis-vertical" size={15} color={dark.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar name={group.name} size={92} />
          <Text style={styles.groupName}>{group.name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaMuted}>
              {memberCount} Member{memberCount === 1 ? '' : 's'}
            </Text>
            {!!tripLabel && (
              <>
                <View style={styles.metaDot} />
                <Text style={styles.metaAccent}>{tripLabel}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>GROUP MEMBERS</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('GroupInvite', { group })}
          >
            <Text style={styles.addFriend}>+ Add Friend</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.contribButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Contributions', { groupId })}
          >
            <Text style={styles.contribButtonText}>View contributions</Text>
          </TouchableOpacity>

          {group.members.map((member, index) => {
            const presence = presenceFor(member._id, member._id === currentUserId);
            const isAdmin = member._id === adminId;
            return (
              <TouchableOpacity
                key={member._id}
                style={[styles.memberRow, index > 0 && styles.memberRowBorder]}
                activeOpacity={member._id === currentUserId ? 1 : 0.7}
                onPress={() => openMember(member)}
              >
                <View>
                  <Avatar name={member.name} size={40} solid />
                  <View
                    style={[
                      styles.presenceDot,
                      { backgroundColor: presence.online ? '#22C55E' : dark.textMuted },
                    ]}
                  />
                </View>
                <View style={styles.memberBody}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member._id === currentUserId ? `${member.name} (You)` : member.name}
                  </Text>
                  <Text style={styles.memberMeta}>{presence.label}</Text>
                </View>
                {isAdmin ? (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                ) : (
                  <Text style={styles.memberRole}>Member</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, styles.prefsLabel]}>PREFERENCES</Text>

        <View style={styles.card}>
          <View style={styles.prefRow}>
            <View style={styles.prefIcon}>
              <Ionicons name="notifications-off-outline" size={16} color={dark.textMuted} />
            </View>
            <Text style={styles.prefText}>Mute notifications</Text>
            <Switch
              value={muted}
              onValueChange={setMuted}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.prefRow, styles.prefRowBorder]}>
            <View style={styles.prefIcon}>
              <Ionicons name="card-outline" size={16} color={dark.textMuted} />
            </View>
            <Text style={styles.prefText}>Shared expenses</Text>
            <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
          </View>

          <TouchableOpacity style={[styles.prefRow, styles.prefRowBorder]} activeOpacity={0.7}>
            <View style={[styles.prefIcon, styles.leaveIcon]}>
              <Ionicons name="log-out-outline" size={16} color="#F97362" />
            </View>
            <Text style={[styles.prefText, styles.leaveText]}>Leave group</Text>
            <Ionicons name="chevron-forward" size={16} color="#F97362" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  groupName: { color: dark.text, fontSize: 24, fontWeight: '800', marginTop: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  metaMuted: { color: dark.textMuted, fontSize: 13 },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: dark.textMuted },
  metaAccent: { color: dark.accentGreen, fontSize: 13, fontWeight: '600' },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  addFriend: { color: dark.accentGreen, fontSize: 13, fontWeight: '700' },

  card: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    padding: spacing.md,
  },
  contribButton: {
    backgroundColor: dark.button,
    borderRadius: 22,
    paddingVertical: spacing.sm + 5,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  contribButtonText: { color: '#04121C', fontSize: 14, fontWeight: '800' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  memberRowBorder: { borderTopWidth: 1, borderTopColor: dark.border },
  presenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: dark.card,
  },
  memberBody: { flex: 1, marginLeft: spacing.sm + 4 },
  memberName: { color: dark.text, fontSize: 14, fontWeight: '700' },
  memberMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  adminBadge: {
    backgroundColor: 'rgba(0,196,208,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: 12,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 3,
  },
  adminBadgeText: { color: dark.accentGreen, fontSize: 11, fontWeight: '700' },
  memberRole: { color: dark.textMuted, fontSize: 12 },

  prefsLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  prefRowBorder: { borderTopWidth: 1, borderTopColor: dark.border },
  prefIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveIcon: { backgroundColor: 'rgba(249,115,98,0.12)' },
  prefText: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600', marginLeft: spacing.sm + 4 },
  leaveText: { color: '#F97362' },
});

export default GroupDetailScreen;
