import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import { useAuth } from '../context/AuthContext';
import { sendSupportMessage } from '../api/support.api';
import { dark, radius, spacing } from '../theme';
import AppAlert from '../components/AppAlert';

// The address Splix's own emails name as the one to write to.
const SUPPORT_EMAIL = 'support@splix.app';

// Filled teal glyphs, matching the Profile settings icons. The first two are
// screens in the app; the last opens the phone's mail app.
const CHANNELS = [
  {
    key: 'report',
    icon: 'bug',
    title: 'Report a Problem',
    subtitle: 'Bugs, ideas and account trouble, with screenshots',
    screen: 'ReportProblem',
  },
  {
    key: 'reports',
    icon: 'chatbubbles',
    title: 'My Reports',
    subtitle: 'Replies, and where each report stands',
    screen: 'MyReports',
  },
  {
    key: 'email',
    icon: 'mail',
    title: 'Email us',
    subtitle: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
  },
];

/**
 * Contact Us: a plain message to the team. It lands in the same place as a
 * report, so the reply comes back in the app under My Reports. The account is
 * the sender; there is nothing to type in about who you are.
 *
 * Route params (optional): { subject }, to start the message ("More credits" from the wallet).
 */
const ContactUsScreen = ({ navigation, route }) => {
  const { user } = useAuth();
  const [subject, setSubject] = useState(route.params?.subject ?? '');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const open = async (channel) => {
    if (channel.screen) {
      navigation.navigate(channel.screen);
      return;
    }
    try {
      await Linking.openURL(channel.href);
    } catch {
      AppAlert.alert('No mail app', `Write to ${SUPPORT_EMAIL} from any email account.`);
    }
  };

  const submit = async () => {
    const nextErrors = {};
    if (subject.trim().length < 2) nextErrors.subject = 'Add a short subject';
    if (message.trim().length < 5) nextErrors.message = 'Tell us a little more';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSending(true);
    try {
      await sendSupportMessage({ subject: subject.trim(), message: message.trim() });
      setSubject('');
      setMessage('');
      AppAlert.alert('Message sent', "Thanks for reaching out. We'll reply here in the app.", [
        { text: 'See my reports', onPress: () => navigation.replace('MyReports') },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (err) {
      AppAlert.alert('Could not send', err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <DarkScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={navigation.goBack} activeOpacity={0.7} hitSlop={styles.hitSlop}>
            <Ionicons name="arrow-back" size={22} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Us</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Get in Touch</Text>
          <View style={styles.channelCard}>
            {CHANNELS.map((channel, index) => (
              <TouchableOpacity
                key={channel.key}
                style={[styles.channelRow, index > 0 && styles.channelDivider]}
                activeOpacity={0.7}
                onPress={() => open(channel)}
              >
                <View style={styles.channelIcon}>
                  <Ionicons name={channel.icon} size={17} color={dark.accentGreen} />
                </View>
                <View style={styles.channelBody}>
                  <Text style={styles.channelTitle}>{channel.title}</Text>
                  <Text style={styles.channelSubtitle}>{channel.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={dark.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Send us a message</Text>

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextField
            value={subject}
            onChangeText={(text) => {
              setSubject(text);
              clearError('subject');
            }}
            placeholder="How can we help you?"
            maxLength={150}
            error={errors.subject}
          />

          <Text style={styles.fieldLabel}>Message</Text>
          <TextField
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              clearError('message');
            }}
            placeholder="Describe your question or feedback in detail..."
            maxLength={2000}
            error={errors.message}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            inputStyle={styles.messageInput}
          />

          <Text style={styles.note}>
            {user?.email
              ? `Sent as ${user.email}. Replies come back here in the app, under My Reports.`
              : 'Replies come back here in the app, under My Reports.'}
          </Text>

          <GradientButton
            title="Send Message  ✈"
            onPress={submit}
            loading={sending}
            style={styles.sendButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { color: dark.text, fontSize: 20, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  sectionLabel: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  channelCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  channelDivider: { borderTopWidth: 1, borderTopColor: dark.border },
  channelIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(0,196,208,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  channelBody: { flex: 1 },
  channelTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  channelSubtitle: { color: dark.textMuted, fontSize: 11, marginTop: 2 },

  fieldLabel: { color: dark.textMuted, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  messageInput: { minHeight: 110, paddingTop: spacing.md - 2 },
  note: { color: dark.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },
  sendButton: { marginTop: spacing.xs },
});

export default ContactUsScreen;
