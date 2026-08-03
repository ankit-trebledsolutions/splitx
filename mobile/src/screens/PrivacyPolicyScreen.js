import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import { dark, radius, spacing } from '../theme';

const SECTIONS = [
  {
    title: '1. Data Collection',
    body: 'We collect information you provide directly to us, including your name, email address, phone number, profile photo, and financial transaction histories shared within your groups.',
  },
  {
    title: '2. How We Use Your Data',
    body: 'Your data is processed to manage your account, facilitate accurate expense splitting, enable group communication, send transactional notifications, and improve our services.',
  },
  {
    title: '3. Third-Party Sharing',
    body: 'We do not sell your personal data. We only share information with secure service partners, such as database hostings, payment processing gateways, and analytics providers.',
  },
  {
    title: '4. Data Retention',
    body: 'We retain your personal data for as long as your account is active, or as necessary to comply with legal compliance obligations and resolve group settlement disputes.',
  },
  {
    title: '5. Your Rights',
    body: 'You hold the right to access, update, export, or request the complete deletion of your personal details. You can exercise these options directly from your Account Settings.',
  },
  {
    title: '6. Cookies & Tracking',
    body: 'We utilize security cookies, tokens, and local cache databases to authenticate your identity, secure active login sessions, and save your trip expense preferences.',
  },
  {
    title: '7. Contact Information',
    body: 'If you have questions or concerns about this policy or your personal data security, reach out to our privacy officer at privacy@splix.app or contact Support.',
  },
];

const PrivacyPolicyScreen = ({ navigation }) => (
  <DarkScreen>
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={navigation.goBack}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={18} color={dark.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Privacy Policy</Text>
      <View style={styles.versionChip}>
        <Text style={styles.versionText}>v1.4</Text>
      </View>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>
        This Privacy Policy describes how Splix collects, uses, and shares your personal
        information when you use our group expense splitting mobile application.
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  </DarkScreen>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: dark.text,
    fontSize: 20,
    fontWeight: '800',
    marginLeft: spacing.md,
  },
  versionChip: {
    backgroundColor: 'rgba(0,196,208,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  versionText: { color: dark.accentGreen, fontSize: 10, fontWeight: '700' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  intro: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  sectionBody: { color: dark.textMuted, fontSize: 12, lineHeight: 19 },
});

export default PrivacyPolicyScreen;
