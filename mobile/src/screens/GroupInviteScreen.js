import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthLayout from '../components/AuthLayout';
import SearchField from '../components/SearchField';
import GradientButton from '../components/GradientButton';
import staticContacts from '../data/contacts';
import { copyText } from '../utils/clipboard';
import { initials } from '../utils/format';
import { dark, radius, spacing } from '../theme';

const INVITE_CHANNELS = [
  { key: 'whatsapp', icon: 'logo-whatsapp' },
  { key: 'email', icon: 'mail-outline' },
  { key: 'sms', icon: 'chatbubble-outline' },
  { key: 'more', icon: 'ellipsis-horizontal' },
];

// Step 2 of the create flow: the group already exists, this screen invites
// people to it and then drops the user into the groups list.
const GroupInviteScreen = ({ route, navigation }) => {
  const { group } = route.params;
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [invited, setInvited] = useState(() =>
    staticContacts.filter((c) => c.status === 'added').map((c) => c.id)
  );

  const inviteLink = `https://splix.app/join/${group.inviteCode}`;

  const subtitle =
    group.description ||
    (group.totalDays
      ? `Planning our ${group.totalDays}-day trip with expenses, itinerary and bookings.`
      : 'Invite your friends and start splitting expenses.');

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticContacts;
    return staticContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    );
  }, [query]);

  const handleCopy = async () => {
    await copyText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInvite = () => {
    Share.share({ message: `Join "${group.name}" on Splix: ${inviteLink}` });
  };

  const toggleInvite = (contactId) => {
    setInvited((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  // Drop the create/invite screens off the stack, then land on the Groups tab.
  const finish = () => {
    navigation.popToTop();
    navigation.navigate('MainTabs', {
      screen: 'Groups',
      params: { newGroupId: group._id, offerItinerary: group.groupType === 'trip' },
    });
  };

  return (
    <AuthLayout title={group.name} subtitle={subtitle}>
      <Text style={styles.label}>Group Invite Link</Text>
      <View style={styles.linkRow}>
        <Text style={styles.linkText} numberOfLines={1}>
          {inviteLink.replace('https://', '')}
        </Text>
        <TouchableOpacity style={styles.copyChip} onPress={handleCopy} activeOpacity={0.8}>
          <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Invite via</Text>
      <View style={styles.channelRow}>
        {INVITE_CHANNELS.map((channel) => (
          <TouchableOpacity
            key={channel.key}
            style={styles.channel}
            onPress={shareInvite}
            activeOpacity={0.8}
          >
            <Ionicons name={channel.icon} size={20} color={dark.text} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>From Contacts</Text>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search Contact"
        style={styles.search}
      />

      {contacts.map((contact) => {
        const isInvited = invited.includes(contact.id);
        return (
          <View key={contact.id} style={styles.contactRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(contact.name)}</Text>
            </View>
            <View style={styles.contactBody}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactHandle}>{contact.handle}</Text>
            </View>
            <TouchableOpacity
              style={[styles.inviteChip, isInvited && styles.invitedChip]}
              onPress={() => toggleInvite(contact.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.inviteChipText, isInvited && styles.invitedChipText]}>
                {isInvited ? 'Added' : 'Invite'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {contacts.length === 0 && <Text style={styles.noResults}>No contacts match “{query}”.</Text>}

      <GradientButton title="Create Group" onPress={finish} style={styles.button} />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  label: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  linkText: { flex: 1, color: dark.text, fontSize: 15 },
  copyChip: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  copyText: { color: dark.text, fontSize: 13, fontWeight: '600' },
  channelRow: { flexDirection: 'row', gap: spacing.sm },
  channel: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: { marginBottom: spacing.sm },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: dark.text, fontSize: 14, fontWeight: '700' },
  contactBody: { flex: 1 },
  contactName: { color: dark.text, fontSize: 15, fontWeight: '600' },
  contactHandle: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  inviteChip: {
    borderWidth: 1,
    borderColor: dark.accentGreen,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  invitedChip: { borderColor: dark.border, backgroundColor: dark.surface },
  inviteChipText: { color: dark.accentGreen, fontSize: 12, fontWeight: '700' },
  invitedChipText: { color: dark.textMuted },
  noResults: { color: dark.textMuted, fontSize: 13, paddingVertical: spacing.md },
  button: { marginTop: spacing.lg, marginBottom: spacing.md },
});

export default GroupInviteScreen;
