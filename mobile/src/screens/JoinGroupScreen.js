import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import GradientButton from '../components/GradientButton';
import AppAlert from '../components/AppAlert';
import { fetchInvitePreview, joinGroup } from '../api/groups.api';
import { useBranding } from '../branding/BrandingProvider';
import { radius, spacing, useStyles, useTheme } from '../theme';

/**
 * Where an invite link lands (https://<api host>/join/<code>; see
 * src/invites): the group, who invited them and who is in it, with one
 * button, Join. Someone already in the group is taken to it instead.
 *
 * Opened by MainTabs with the pending invite's code (route param `code`),
 * whether the link was tapped with the app open, closed, or signed out (in
 * which case it waited for the sign-in).
 */
const GROUP_TYPE = {
  trip: { label: 'Trip', icon: 'airplane-outline' },
  home: { label: 'Home', icon: 'home-outline' },
  couple: { label: 'Couple', icon: 'heart-outline' },
  event: { label: 'Event', icon: 'calendar-outline' },
  other: { label: 'Group', icon: 'people-outline' },
};

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const JoinGroupScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { appName } = useBranding();
  const code = String(route.params?.code ?? '').toUpperCase();
  const [invite, setInvite] = useState(null);
  // null while loading; afterwards an error for this code, or ''.
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInvite(await fetchInvitePreview(code));
      setError('');
    } catch (err) {
      setInvite(null);
      setError(
        err.code === 'INVITE_NOT_FOUND' || err.status === 404
          ? 'This invite link is not valid any more. Ask the person who sent it for a new one.'
          : err.message
      );
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  // Into the group, with the Groups tab underneath so "back" makes sense.
  const openGroup = (group) => {
    navigation.popToTop();
    navigation.navigate('MainTabs', { screen: 'Groups' });
    navigation.navigate('GroupChat', { groupId: group._id, groupType: group.groupType });
  };

  const handleJoin = async () => {
    if (!invite) return;
    if (invite.alreadyMember) {
      openGroup(invite.group);
      return;
    }
    setJoining(true);
    try {
      const group = await joinGroup(code);
      openGroup(group);
    } catch (err) {
      // Joined from another phone meanwhile: the group is theirs either way.
      if (err.status === 409) {
        openGroup(invite.group);
        return;
      }
      AppAlert.alert('Could not join', err.message);
    } finally {
      setJoining(false);
    }
  };

  const close = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

  const group = invite?.group;
  const kind = GROUP_TYPE[group?.groupType] ?? GROUP_TYPE.other;
  const members = group?.members ?? [];
  const more = group ? group.memberCount - members.length : 0;

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={close} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join group</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error === null ? (
          <View style={styles.state}>
            <ActivityIndicator color={theme.accentGreen} />
            <Text style={styles.stateBody}>Finding your invite…</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <View style={styles.stateBadge}>
              <Ionicons name="link-outline" size={28} color={theme.textMuted} />
            </View>
            <Text style={styles.stateTitle}>Invite not found</Text>
            <Text style={styles.stateBody}>{error}</Text>
            <TouchableOpacity style={styles.stateButton} activeOpacity={0.85} onPress={load}>
              <Text style={styles.stateButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.eyebrow}>
              {invite.invitedBy ? `${invite.invitedBy.name} invited you to` : 'You are invited to'}
            </Text>
            <Avatar name={group.name} size={84} textStyle={styles.avatarText} />
            <Text style={styles.name} numberOfLines={2}>
              {group.name}
            </Text>

            <View style={styles.chips}>
              <View style={styles.chip}>
                <Ionicons name={kind.icon} size={13} color={theme.accentGreen} />
                <Text style={styles.chipText}>{kind.label}</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="people-outline" size={13} color={theme.accentGreen} />
                <Text style={styles.chipText}>
                  {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                </Text>
              </View>
              {group.location ? (
                <View style={styles.chip}>
                  <Ionicons name="location-outline" size={13} color={theme.accentGreen} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {group.location}
                  </Text>
                </View>
              ) : null}
            </View>

            {group.description ? <Text style={styles.description}>{group.description}</Text> : null}
            {group.groupType === 'trip' && group.startDate ? (
              <Text style={styles.detail}>
                Starts {longDate(group.startDate)}
                {group.totalDays ? ` · ${group.totalDays} day${group.totalDays === 1 ? '' : 's'}` : ''}
              </Text>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>WHO’S IN</Text>
              {members.map((member, index) => (
                <View key={member._id} style={[styles.memberRow, index > 0 && styles.memberRowBorder]}>
                  {member.avatar ? (
                    <Image source={{ uri: member.avatar }} style={styles.memberPhoto} />
                  ) : (
                    <Avatar name={member.name} size={36} solid />
                  )}
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.name}
                  </Text>
                  {invite.invitedBy && member._id === invite.invitedBy._id ? (
                    <Text style={styles.memberRole}>Admin</Text>
                  ) : null}
                </View>
              ))}
              {more > 0 ? <Text style={styles.more}>and {more} more</Text> : null}
            </View>

            {invite.alreadyMember ? (
              <Text style={styles.note}>You’re already in this group.</Text>
            ) : (
              <Text style={styles.note}>
                Joining shares your name with the group and lets you split expenses with them on{' '}
                {appName}.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {invite ? (
        <View style={styles.footer}>
          <GradientButton
            title={invite.alreadyMember ? 'Open group' : `Join ${group.name}`}
            onPress={handleJoin}
            loading={joining}
          />
          <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.notNow}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </DarkScreen>
  );
};

const makeStyles = (theme) =>
  StyleSheet.create({
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
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSpacer: { width: 36 },
    headerTitle: { color: theme.text, fontSize: 17, fontWeight: '800' },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },

    state: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm },
    stateBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
    stateBody: { color: theme.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    stateButton: {
      backgroundColor: theme.card2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.sm,
    },
    stateButtonText: { color: theme.text, fontSize: 13, fontWeight: '700' },

    eyebrow: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    avatarText: { fontSize: 30 },
    name: {
      color: theme.text,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: spacing.md,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(0,196,208,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(0,196,208,0.35)',
      borderRadius: radius.sm + 2,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 5,
      maxWidth: 220,
    },
    chipText: { color: theme.text, fontSize: 12.5, fontWeight: '700' },
    description: {
      color: theme.textSoft,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    detail: { color: theme.textMuted, fontSize: 13, marginTop: spacing.sm },

    card: {
      alignSelf: 'stretch',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.lg + 2,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      marginTop: spacing.lg,
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.9,
      paddingTop: spacing.md - 2,
      paddingBottom: spacing.xs,
    },
    memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, gap: spacing.sm + 4 },
    memberRowBorder: { borderTopWidth: 1, borderTopColor: theme.border },
    memberPhoto: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.card2 },
    memberName: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' },
    memberRole: { color: theme.accentGreen, fontSize: 12, fontWeight: '800' },
    more: { color: theme.textMuted, fontSize: 12.5, paddingVertical: spacing.sm },

    note: {
      color: theme.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.sm,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm + 4,
      paddingBottom: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    notNow: { alignSelf: 'center', paddingVertical: spacing.sm + 4 },
    notNowText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  });

export default JoinGroupScreen;
