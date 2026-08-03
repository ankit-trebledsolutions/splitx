import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import { useAuth } from '../context/AuthContext';
import { sendSupportMessage } from '../api/support.api';
import { dark, radius, spacing } from '../theme';

// Filled teal glyphs, matching the Profile settings icons.
const CHANNELS = [
  {
    key: 'email',
    icon: 'mail',
    tint: '#00C4D0',
    title: 'Email Support',
    subtitle: 'support@splix.app · Response within 2h',
  },
  {
    key: 'chat',
    icon: 'chatbubble-ellipses',
    tint: '#00C4D0',
    title: 'Live Chat',
    subtitle: 'Average wait time: 2 mins',
  },
  {
    key: 'phone',
    icon: 'call',
    tint: '#00C4D0',
    title: 'Phone Support',
    subtitle: '+1 (555) 019-2834 · 9 AM – 6 PM EST',
  },
];

const ContactUsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const submit = async () => {
    const nextErrors = {};
    if (name.trim().length < 2) nextErrors.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Enter a valid email';
    if (subject.trim().length < 2) nextErrors.subject = 'Add a short subject';
    if (message.trim().length < 5) nextErrors.message = 'Tell us a little more';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSending(true);
    try {
      await sendSupportMessage({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubject('');
      setMessage('');
      Alert.alert('Message sent', "Thanks for reaching out — we'll get back to you shortly.");
    } catch (err) {
      Alert.alert('Could not send', err.message);
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
                onPress={() =>
                  Alert.alert(channel.title, `${channel.subtitle}\n\nComing soon in-app.`)
                }
              >
                <View style={[styles.channelIcon, { backgroundColor: `${channel.tint}1F` }]}>
                  <Ionicons name={channel.icon} size={17} color={channel.tint} />
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

          <Text style={styles.fieldLabel}>Name</Text>
          <TextField
            value={name}
            onChangeText={(text) => {
              setName(text);
              clearError('name');
            }}
            placeholder="Enter your full name"
            error={errors.name}
          />

          <Text style={styles.fieldLabel}>Email Address</Text>
          <TextField
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              clearError('email');
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextField
            value={subject}
            onChangeText={(text) => {
              setSubject(text);
              clearError('subject');
            }}
            placeholder="How can we help you?"
            error={errors.subject}
          />

          <Text style={styles.fieldLabel}>Message</Text>
          <TextField
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              clearError('message');
            }}
            placeholder="Describe your issue or feedback in detail..."
            error={errors.message}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            inputStyle={styles.messageInput}
          />

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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  channelBody: { flex: 1 },
  channelTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  channelSubtitle: { color: dark.textMuted, fontSize: 11, marginTop: 2 },

  fieldLabel: { color: dark.textMuted, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  messageInput: { minHeight: 110, paddingTop: spacing.md - 2 },
  sendButton: { marginTop: spacing.sm },
});

export default ContactUsScreen;
