import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import AppAlert from '../components/AppAlert';
import GradientButton from '../components/GradientButton';
import { useAuth } from '../context/AuthContext';
import { fetchInviteCode } from '../api/auth.api';
import {
  appInviteMessage,
  appInviteTweet,
  groupInviteLink,
  groupInviteTweet,
  inviteMessage,
} from '../config/invite';
import { CONTACTS_STATUS, loadPhoneContacts } from '../utils/contacts';
import {
  inviteViaWhatsApp,
  inviteViaSms,
  inviteViaEmail,
  inviteViaTwitter,
  inviteViaShareSheet,
} from '../utils/invite';
import { copyText } from '../utils/clipboard';
import { dark, radius, spacing } from '../theme';

const HERO_LEFT = require('../assets/invite-hero-1.jpg');
const HERO_RIGHT = require('../assets/invite-hero-2.jpg');

// Who has already been sent an invite, so "Sent" survives leaving the screen.
const SENT_KEY = 'splix.invitedContacts';
// An address book can hold thousands of people; render a screenful and let
// search reach the rest.
const MAX_VISIBLE_CONTACTS = 40;

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', tint: '#22C55E' },
  { key: 'sms', label: 'SMS', icon: 'chatbox-outline', tint: '#2DD4BF' },
  { key: 'email', label: 'Email', icon: 'mail-outline', tint: '#8B5CF6' },
  { key: 'twitter', label: 'Twitter', icon: 'share-social-outline', tint: '#F97362' },
];

/**
 * One invite screen, two uses:
 *   - from Home: invite people to Splix itself, with the person's own code
 *   - from a group (route param `group`): invite people into that group, with
 *     its join link. `isNew` marks step 2 of Create Group, which adds a button
 *     to carry on into the new group.
 * Either way: copy it, share it through an app, or pick someone from contacts.
 */
const InviteFriendsScreen = ({ route, navigation }) => {
  const { group, isNew = false } = route.params ?? {};
  const { user } = useAuth();
  const inviterName = user?.name?.split(' ')[0];
  // What the code card shows and copies: the group's join link, or the personal code.
  const [code, setCode] = useState(group ? groupInviteLink(group.inviteCode) : null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactsStatus, setContactsStatus] = useState(null); // null while loading
  const [sent, setSent] = useState(() => new Set());

  // "Sent" is remembered per group: inviting Alex to one trip says nothing about another.
  const sentKey = group ? `${SENT_KEY}.${group._id}` : SENT_KEY;

  useEffect(() => {
    let active = true;
    if (!group) {
      fetchInviteCode()
        .then((value) => active && setCode(value))
        .catch((err) => active && AppAlert.alert('Could not load your invite code', err.message));
    }
    AsyncStorage.getItem(sentKey)
      .then((raw) => active && raw && setSent(new Set(JSON.parse(raw))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [group, sentKey]);

  const loadContacts = useCallback(async (ask) => {
    setContactsStatus(null);
    try {
      const result = await loadPhoneContacts({ ask, withEmails: true });
      setContacts(result.contacts);
      setContactsStatus(result.status);
    } catch (err) {
      setContactsStatus(CONTACTS_STATUS.DENIED);
      AppAlert.alert('Could not load contacts', err.message);
    }
  }, []);

  // On open, only load if access was granted before; the system prompt should
  // follow a tap on "Sync Contacts", not ambush the person.
  useEffect(() => {
    loadContacts(false);
  }, [loadContacts]);

  const syncContacts = () => {
    if (contactsStatus === CONTACTS_STATUS.BLOCKED) Linking.openSettings();
    else loadContacts(true);
  };

  const handleCopy = async () => {
    if (!code) return;
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // The pre-written invite: into this group, or to Splix in general.
  const messageFor = (firstName) =>
    group ? inviteMessage({ group, inviterName, firstName }) : appInviteMessage({ code, firstName });
  const emailSubject = group ? `Join "${group.name}" on Splix` : 'Join me on Splix';

  // No particular person: the chosen app asks who to send it to.
  const shareVia = async (channel) => {
    if (!code) return;
    const message = messageFor();
    try {
      if (channel === 'whatsapp') await inviteViaWhatsApp(message);
      else if (channel === 'sms') await inviteViaSms(message);
      else if (channel === 'email') await inviteViaEmail(emailSubject, message);
      else await inviteViaTwitter(group ? groupInviteTweet({ group }) : appInviteTweet({ code }));
    } catch {
      // Nothing on this phone handles that channel: the share sheet always works.
      inviteViaShareSheet(message);
    }
  };

  // WhatsApp when they have a number, email otherwise. The person still presses
  // send themselves; "Sent" records that the invite was handed to that app.
  const inviteContact = async (contact) => {
    if (!code) return;
    const message = messageFor(contact.name.split(' ')[0]);
    try {
      if (contact.whatsapp) await inviteViaWhatsApp(message, contact.whatsapp);
      else await inviteViaEmail(emailSubject, message, contact.email);
    } catch {
      AppAlert.alert('Could not open the app', 'Try one of the share options above instead.');
      return;
    }
    setSent((prev) => {
      const next = new Set(prev).add(contact.id);
      AsyncStorage.setItem(sentKey, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.includes(q)) ||
        (digits && c.whatsapp && c.whatsapp.includes(digits))
    );
  }, [query, contacts]);
  const visible = matches.slice(0, MAX_VISIBLE_CONTACTS);

  const needsAccess = contactsStatus !== null && contactsStatus !== CONTACTS_STATUS.OK;

  // After Create Group: drop the create/invite screens and land on the Groups
  // tab, which opens the new group. Otherwise this is just "back".
  const finish = () => {
    if (!isNew) {
      navigation.goBack();
      return;
    }
    navigation.popToTop();
    navigation.navigate('MainTabs', {
      screen: 'Groups',
      params: { newGroupId: group._id, offerItinerary: group.groupType === 'trip' },
    });
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={finish} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Two friends joined by a plus, with a trip and an expense orbiting them. */}
        <View style={styles.hero}>
          <View style={styles.heroPhotos}>
            <Image source={HERO_LEFT} style={[styles.heroPhoto, styles.heroPhotoLeft]} />
            <Image source={HERO_RIGHT} style={[styles.heroPhoto, styles.heroPhotoRight]} />
            <View style={styles.heroPlus}>
              <Ionicons name="add" size={15} color="#04121C" />
            </View>
            <View style={[styles.heroBadge, styles.heroBadgeTrip]}>
              <Ionicons name="airplane" size={11} color="#8B9BFF" />
            </View>
            <View style={[styles.heroBadge, styles.heroBadgeMoney]}>
              <Ionicons name="cash-outline" size={11} color="#F5A25B" />
            </View>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {group ? `Invite to ${group.name}` : 'Split Trips & Expenses'}
        </Text>
        <Text style={styles.subtitle}>
          {group
            ? 'Share the group link to bring your crew in and start tracking instant split tallies.'
            : 'Share your custom referral link to invite your crew and start tracking instant split tallies.'}
        </Text>

        <View style={styles.codeCard}>
          <View style={styles.codeBody}>
            <Text style={styles.codeLabel}>{group ? 'GROUP INVITE LINK' : 'YOUR PERSONAL CODE'}</Text>
            {code ? (
              <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
                {code}
              </Text>
            ) : (
              <ActivityIndicator color={dark.accentGreen} style={styles.codeLoading} />
            )}
          </View>
          <TouchableOpacity style={styles.copyButton} activeOpacity={0.8} onPress={handleCopy} disabled={!code}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={dark.text} />
            <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>QUICK SHARE VIA</Text>
        <View style={styles.channelRow}>
          {CHANNELS.map((channel) => (
            <TouchableOpacity
              key={channel.key}
              style={styles.channel}
              activeOpacity={0.8}
              onPress={() => shareVia(channel.key)}
            >
              <View
                style={[
                  styles.channelCircle,
                  { backgroundColor: `${channel.tint}1A`, borderColor: `${channel.tint}40` },
                ]}
              >
                <Ionicons name={channel.icon} size={20} color={channel.tint} />
              </View>
              <Text style={styles.channelLabel}>{channel.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionLabel, styles.sectionLabelInline]}>INVITE FROM CONTACTS</Text>
          <TouchableOpacity onPress={syncContacts} activeOpacity={0.7} hitSlop={styles.hitSlop}>
            <Text style={styles.sync}>Sync Contacts</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={15} color={dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, phone or email..."
            placeholderTextColor={dark.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.listCard}>
          {contactsStatus === null && <ActivityIndicator color={dark.accentGreen} style={styles.listState} />}

          {needsAccess && (
            <View style={styles.listState}>
              <Ionicons name="people-outline" size={22} color={dark.accentGreen} />
              <Text style={styles.stateTitle}>
                {contactsStatus === CONTACTS_STATUS.UNAVAILABLE ? 'Update needed' : 'Find your friends'}
              </Text>
              <Text style={styles.stateBody}>
                {contactsStatus === CONTACTS_STATUS.UNAVAILABLE
                  ? 'Install the latest build of Splix to invite people from your contacts.'
                  : contactsStatus === CONTACTS_STATUS.BLOCKED
                    ? 'Contacts access is turned off for Splix. Turn it on in Settings to pick friends here.'
                    : 'Tap Sync Contacts to pick friends from your phone. Your contacts stay on your device.'}
              </Text>
              {contactsStatus !== CONTACTS_STATUS.UNAVAILABLE && (
                <TouchableOpacity style={styles.stateButton} activeOpacity={0.85} onPress={syncContacts}>
                  <Text style={styles.stateButtonText}>
                    {contactsStatus === CONTACTS_STATUS.BLOCKED ? 'Open Settings' : 'Sync Contacts'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {contactsStatus === CONTACTS_STATUS.OK &&
            visible.map((contact, index) => {
              const isSent = sent.has(contact.id);
              return (
                <View key={contact.id} style={[styles.contactRow, index > 0 && styles.contactRowBorder]}>
                  {contact.photo ? (
                    <Image source={{ uri: contact.photo }} style={styles.contactPhoto} />
                  ) : (
                    <Avatar name={contact.name} size={40} solid />
                  )}
                  <View style={styles.contactBody}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {contact.name}
                    </Text>
                    <Text style={styles.contactMeta} numberOfLines={1}>
                      {contact.phone ?? contact.email}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.inviteChip, isSent && styles.sentChip]}
                    activeOpacity={0.8}
                    onPress={() => inviteContact(contact)}
                  >
                    {isSent && <Ionicons name="checkmark" size={12} color="#22C55E" />}
                    <Text style={[styles.inviteChipText, isSent && styles.sentChipText]}>
                      {isSent ? 'Sent' : 'Invite'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

          {contactsStatus === CONTACTS_STATUS.OK && visible.length === 0 && (
            <Text style={[styles.stateBody, styles.listState]}>
              {query ? `No contacts match “${query}”.` : 'No contacts with a phone number or email on this phone.'}
            </Text>
          )}
        </View>

        {matches.length > visible.length && (
          <Text style={styles.more}>
            Showing {visible.length} of {matches.length}. Search to find someone.
          </Text>
        )}

        {isNew && <GradientButton title="Continue to Group" onPress={finish} style={styles.continue} />}
      </ScrollView>
    </DarkScreen>
  );
};

const PHOTO = 68;

const styles = StyleSheet.create({
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
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
  headerSpacer: { width: 36 },
  headerTitle: { color: dark.text, fontSize: 17, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  // ---- hero
  hero: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.md + 4 },
  heroPhotos: { width: PHOTO * 2 - 18, height: PHOTO + 8, justifyContent: 'center' },
  heroPhoto: {
    position: 'absolute',
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    borderWidth: 3,
    borderColor: dark.background,
    backgroundColor: dark.card,
  },
  heroPhotoLeft: { left: 0 },
  heroPhotoRight: { right: 0 },
  heroPlus: {
    position: 'absolute',
    alignSelf: 'center',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: dark.accentGreen,
    borderWidth: 3,
    borderColor: dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#161A20',
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeTrip: { top: -4, left: -8 },
  heroBadgeMoney: { bottom: -2, right: -8 },

  title: { color: dark.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: dark.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: spacing.sm,
  },

  // ---- code
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 2,
    paddingVertical: spacing.md - 2,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  codeBody: { flex: 1, marginRight: spacing.sm },
  codeLabel: { color: dark.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  code: { color: dark.accentGreen, fontSize: 20, fontWeight: '800', letterSpacing: 0.6, marginTop: 3 },
  codeLoading: { alignSelf: 'flex-start', marginTop: 6 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 2,
  },
  copyText: { color: dark.text, fontSize: 13, fontWeight: '700' },

  // ---- sections
  sectionLabel: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 4,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 4,
  },
  sectionLabelInline: { marginTop: 0, marginBottom: 0 },
  sync: { color: dark.accentGreen, fontSize: 12.5, fontWeight: '700' },

  channelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  channel: { alignItems: 'center', flex: 1 },
  channelCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelLabel: { color: dark.textMuted, fontSize: 11.5, fontWeight: '600', marginTop: 7 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    height: 44,
  },
  searchInput: { flex: 1, color: dark.text, fontSize: 14, padding: 0 },

  // ---- contacts
  listCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 2,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm + 4,
  },
  listState: { alignItems: 'center', paddingVertical: spacing.lg },
  stateTitle: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  stateBody: { color: dark.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4 },
  stateButton: {
    backgroundColor: dark.button,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  stateButtonText: { color: '#04121C', fontSize: 13, fontWeight: '800' },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 4 },
  contactRowBorder: { borderTopWidth: 1, borderTopColor: dark.border },
  contactPhoto: { width: 40, height: 40, borderRadius: 20, backgroundColor: dark.card2 },
  contactBody: { flex: 1, marginLeft: spacing.sm + 4, marginRight: spacing.sm },
  contactName: { color: dark.text, fontSize: 15, fontWeight: '700' },
  contactMeta: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,196,208,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.40)',
    borderRadius: radius.sm + 1,
    paddingHorizontal: spacing.md - 3,
    paddingVertical: 6,
  },
  inviteChipText: { color: dark.accentGreen, fontSize: 12.5, fontWeight: '800' },
  sentChip: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.40)' },
  sentChipText: { color: '#22C55E' },
  continue: { marginTop: spacing.lg },
  more: { color: dark.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm + 4 },
});

export default InviteFriendsScreen;
