import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import { dark, radius, spacing } from '../theme';

const FAQS = [
  {
    id: 'reset-password',
    question: 'How do I reset my password?',
    answer:
      "Go to the login screen and tap 'Forgot Password'. Enter your registered email address, and we will send you an OTP to set up a new password instantly.",
  },
  {
    id: 'update-profile',
    question: 'How do I update my profile?',
    answer:
      "Open the Profile tab and tap 'Edit' in the top right corner. You can update your name, username, bio and contact details from there.",
  },
  {
    id: 'contact-support',
    question: 'How do I contact support?',
    answer:
      "You can get in touch with our live support team directly by clicking 'Contact Us' under the Support section or sending an email to support@splix.app.",
  },
  {
    id: 'payment-methods',
    question: 'What payment methods are accepted?',
    answer:
      'Splix tracks who owes whom — settling up happens outside the app for now. Record a payment as settled from the expense detail screen once it has been paid.',
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer:
      'Reach out via Contact Us and request account deletion. Make sure your group balances are settled first — groups with outstanding balances block deletion.',
  },
  {
    id: 'data-secure',
    question: 'Is my data secure?',
    answer:
      'Yes. Your data is stored securely, transferred over encrypted connections, and never sold to third parties. See the Privacy Policy for full details.',
  },
];

const FaqScreen = ({ navigation }) => {
  // The first item starts expanded, matching the design.
  const [openIds, setOpenIds] = useState(new Set([FAQS[0].id]));

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={styles.backButtonGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          How can we help you? Find answers to frequently asked questions about Splix.
        </Text>

        {FAQS.map((faq) => {
          const open = openIds.has(faq.id);
          return (
            <TouchableOpacity
              key={faq.id}
              style={[styles.item, open && styles.itemOpen]}
              activeOpacity={0.85}
              onPress={() => toggle(faq.id)}
            >
              <View style={styles.questionRow}>
                <Text style={[styles.question, open && styles.questionOpen]}>
                  {faq.question}
                </Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={open ? dark.accentGreen : dark.textMuted}
                />
              </View>
              {open && <Text style={styles.answer}>{faq.answer}</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </DarkScreen>
  );
};

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
  backButtonGhost: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 20,
    fontWeight: '800',
  },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  intro: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },

  item: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  itemOpen: {
    backgroundColor: 'rgba(0,196,208,0.06)',
    borderColor: 'rgba(0,196,208,0.30)',
  },
  questionRow: { flexDirection: 'row', alignItems: 'center' },
  question: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600', marginRight: spacing.sm },
  questionOpen: { color: dark.accentGreen },
  answer: { color: dark.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
});

export default FaqScreen;
