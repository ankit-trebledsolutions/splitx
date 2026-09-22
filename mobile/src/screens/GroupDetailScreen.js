import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import { fetchGroup, leaveGroup, deleteGroup, setGroupMuted } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketProvider';
import { dark, radius, spacing } from '../theme';
import { presenceFrom } from '../utils/presence';
import { useGroupPresence } from '../hooks/useGroupPresence';
import AppAlert from '../components/AppAlert';

// "Group Info" screen, opened by tapping the group name in the chat header.
const GroupDetailScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id;
  const onlineIds = useGroupPresence(groupId);

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [pickingAdmin, setPickingAdmin] = useState(false);
  const [newAdminId, setNewAdminId] = useState(null);
  const [leaving, setLeaving] = useState(false);
  // True while our own leave request is in flight, so its echo isn't mistaken for a removal.
  const leavingRef = useRef(false);
  // The "⋮" menu (admin only) and the delete confirmation it leads to.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Same idea as leavingRef: our own delete also comes back as a socket event.
  const deletingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { socket } = useSocket();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const data = await fetchGroup(groupId);
          if (!active) return;
          setGroup(data);
          setMuted((data.mutedBy ?? []).includes(currentUserId));
        } catch (err) {
          AppAlert.alert('Could not load group', err.message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId, currentUserId])
  );

  // Someone left or was removed while this screen is open: drop them from the
  // list, or leave the screen if it was us (removed by the admin).
  useEffect(() => {
    if (!socket) return undefined;
    const onMemberLeft = async (event) => {
      if (event.groupId !== groupId) return;
      if (event.userId === currentUserId) {
        if (leavingRef.current) return;
        AppAlert.alert('You are no longer in this group');
        navigation.navigate('MainTabs');
        return;
      }
      try {
        setGroup(await fetchGroup(groupId));
      } catch {
        // The next focus reloads it.
      }
    };
    // The admin deleted the group while another member has this screen open.
    const onGroupDeleted = (event) => {
      if (event.groupId !== groupId || deletingRef.current) return;
      AppAlert.alert('Group deleted', `"${event.name}" was deleted by its admin.`);
      navigation.navigate('MainTabs');
    };
    socket.on('group:member-left', onMemberLeft);
    socket.on('group:deleted', onGroupDeleted);
    return () => {
      socket.off('group:member-left', onMemberLeft);
      socket.off('group:deleted', onGroupDeleted);
    };
  }, [socket, groupId, currentUserId, navigation]);

  if (loading || !group) {
    return (
      <DarkScreen>
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const adminId = group.admin ?? group.createdBy?._id ?? group.createdBy;
  const iAmAdmin = adminId === currentUserId;
  const others = group.members.filter((m) => m._id !== currentUserId);
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
      viewerIsAdmin: iAmAdmin,
    });
  };

  // Optimistic: flip the switch now, put it back if the server says no.
  const toggleMuted = async (next) => {
    setMuted(next);
    try {
      await setGroupMuted(groupId, next);
    } catch (err) {
      setMuted(!next);
      AppAlert.alert('Could not update notifications', err.message);
    }
  };

  const doLeave = async (adminSuccessorId) => {
    setLeaving(true);
    leavingRef.current = true;
    try {
      await leaveGroup(groupId, adminSuccessorId);
      setPickingAdmin(false);
      navigation.navigate('MainTabs');
    } catch (err) {
      AppAlert.alert('Could not leave group', err.message);
    } finally {
      setLeaving(false);
      leavingRef.current = false;
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    deletingRef.current = true;
    try {
      await deleteGroup(groupId);
      setConfirmingDelete(false);
      navigation.navigate('MainTabs');
    } catch (err) {
      // Only on failure: after a success the screen is on its way out, and the
      // socket echo of our own delete must keep being ignored until it is gone.
      deletingRef.current = false;
      setDeleting(false);
      setConfirmingDelete(false);
      // Once the sheet has closed: two modals at the same moment fight on iOS.
      setTimeout(() => AppAlert.alert('Could not delete group', err.message), 250);
    }
  };

  const confirmLeave = () => {
    // An admin with several members left behind chooses who takes over.
    if (iAmAdmin && others.length > 1) {
      setNewAdminId(null);
      setPickingAdmin(true);
      return;
    }
    const message =
      iAmAdmin && others.length === 1
        ? `${others[0].name} will become the group admin.`
        : `You will no longer see "${group.name}" or its chat.`;
    AppAlert.alert('Leave group?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => doLeave() },
    ]);
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        {/* Everything in the menu is admin-only, so other members get a spacer
            that keeps the title centred rather than dots that open nothing. */}
        {iAmAdmin ? (
          <TouchableOpacity
            style={styles.headerIcon}
            activeOpacity={0.7}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons name="ellipsis-vertical" size={15} color={dark.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerIconGhost} />
        )}
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
            const presence = presenceFrom(onlineIds.has(member._id), member.lastSeenAt);
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
              onValueChange={toggleMuted}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity
            style={[styles.prefRow, styles.prefRowBorder]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Contributions', { groupId, segment: 'Expenses' })}
          >
            <View style={styles.prefIcon}>
              <Ionicons name="card-outline" size={16} color={dark.textMuted} />
            </View>
            <Text style={styles.prefText}>Shared expenses</Text>
            <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, styles.prefRowBorder]}
            activeOpacity={0.7}
            onPress={confirmLeave}
            disabled={leaving}
          >
            <View style={[styles.prefIcon, styles.leaveIcon]}>
              <Ionicons name="log-out-outline" size={16} color="#F97362" />
            </View>
            <Text style={[styles.prefText, styles.leaveText]}>Leave group</Text>
            <Ionicons name="chevron-forward" size={16} color="#F97362" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + 50 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuOpen(false);
                // Let the menu finish closing: two modals swapping in the same
                // frame can leave iOS showing neither.
                setTimeout(() => setConfirmingDelete(true), 250);
              }}
            >
              <Ionicons name="trash-outline" size={17} color="#F97362" />
              <Text style={styles.menuItemDanger}>Delete group</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmingDelete}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !deleting && setConfirmingDelete(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => !deleting && setConfirmingDelete(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.dangerBadge}>
              <Ionicons name="warning-outline" size={24} color="#F97362" />
            </View>
            <Text style={styles.sheetTitle}>Delete "{group.name}"?</Text>
            <Text style={styles.sheetHint}>
              This deletes the group for all {memberCount} member{memberCount === 1 ? '' : 's'}, not
              just you. Everything in it is removed for good:
            </Text>

            {[
              ['chatbubbles-outline', 'The whole chat, with its photos, files and voice notes'],
              ['cash-outline', 'All expenses and balances, including any that are not settled'],
              ['checkbox-outline', 'Tasks and reminders'],
              ['map-outline', 'The itinerary, stays and attractions'],
              ['images-outline', 'Every photo in the gallery'],
            ].map(([icon, label]) => (
              <View key={icon} style={styles.lossRow}>
                <Ionicons name={icon} size={15} color={dark.textMuted} />
                <Text style={styles.lossText}>{label}</Text>
              </View>
            ))}

            <Text style={styles.dangerNote}>This cannot be undone.</Text>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetCancel]}
                activeOpacity={0.8}
                onPress={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetLeave]}
                activeOpacity={0.8}
                onPress={doDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.sheetLeaveText}>Delete group</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={pickingAdmin}
        transparent
        animationType="fade"
        onRequestClose={() => setPickingAdmin(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => !leaving && setPickingAdmin(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Choose a new admin</Text>
            <Text style={styles.sheetHint}>
              You're the admin of "{group.name}". Pick who takes over before you leave.
            </Text>

            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {others.map((member, index) => {
                const selected = member._id === newAdminId;
                return (
                  <TouchableOpacity
                    key={member._id}
                    style={[styles.memberRow, index > 0 && styles.memberRowBorder]}
                    activeOpacity={0.7}
                    onPress={() => setNewAdminId(member._id)}
                  >
                    <Avatar name={member.name} size={36} solid />
                    <Text style={[styles.memberName, styles.sheetMemberName]} numberOfLines={1}>
                      {member.name}
                    </Text>
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? dark.accentGreen : dark.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetCancel]}
                activeOpacity={0.8}
                onPress={() => setPickingAdmin(false)}
                disabled={leaving}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetLeave, !newAdminId && styles.sheetLeaveDisabled]}
                activeOpacity={0.8}
                onPress={() => doLeave(newAdminId)}
                disabled={!newAdminId || leaving}
              >
                {leaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.sheetLeaveText}>Make admin & leave</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerIconGhost: { width: 36, height: 36 },

  // Drops down from the "⋮" button in the header's top-right corner.
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: {
    position: 'absolute',
    right: spacing.md,
    minWidth: 190,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 6,
  },
  menuItemDanger: { color: '#F97362', fontSize: 14, fontWeight: '700' },

  dangerBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(249,115,98,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  lossRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2, marginTop: spacing.sm },
  lossText: { flex: 1, color: dark.text, fontSize: 13, lineHeight: 18 },
  dangerNote: { color: '#F97362', fontSize: 13, fontWeight: '700', marginTop: spacing.md },

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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0C1418',
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { color: dark.text, fontSize: 17, fontWeight: '800' },
  sheetHint: { color: dark.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.sm },
  sheetList: { maxHeight: 300 },
  sheetMemberName: { flex: 1, marginLeft: spacing.sm + 4 },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  sheetButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancel: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
  sheetCancelText: { color: dark.text, fontSize: 14, fontWeight: '700' },
  sheetLeave: { backgroundColor: '#F97362' },
  sheetLeaveDisabled: { opacity: 0.4 },
  sheetLeaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

export default GroupDetailScreen;
