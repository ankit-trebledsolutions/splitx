import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GradientButton from './GradientButton';
import { dark, radius, spacing } from '../theme';

// Shown once, right after a trip group is created.
const AiItineraryModal = ({ visible, groupName, onAccept, onSkip }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
    <Pressable style={styles.backdrop} onPress={onSkip}>
      <Pressable style={styles.card}>
        <LinearGradient
          colors={dark.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Ionicons name="sparkles" size={22} color="#04121C" />
        </LinearGradient>

        <Text style={styles.title}>Would you like AI to plan your itinerary?</Text>
        <Text style={styles.body}>
          Let AI suggest a day-by-day plan
          {groupName ? ` for ${groupName}` : ''} based on your destination, dates, and group size.
        </Text>

        <GradientButton title="Yes, create itinerary" onPress={onAccept} style={styles.primary} />

        <TouchableOpacity style={styles.secondary} onPress={onSkip} activeOpacity={0.8}>
          <Text style={styles.secondaryText}>No, skip for now</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: '#0C1418',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg + 8,
    padding: spacing.lg,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: dark.text, fontSize: 19, fontWeight: '700', lineHeight: 26 },
  body: {
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  primary: { marginBottom: spacing.sm },
  secondary: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryText: { color: dark.text, fontSize: 16, fontWeight: '600' },
});

export default AiItineraryModal;
