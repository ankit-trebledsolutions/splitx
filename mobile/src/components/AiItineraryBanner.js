import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AiWorkingCloud from './AiWorkingCloud';
import { radius, spacing, useStyles, useTheme } from '../theme';


const DOTS = [0, 1, 2];
const STEP_MS = 160;
const PULSE_MS = 420;

// The one line shown while a job runs, here and on the Itinerary tab's working view.
export const aiRunningText = (job, isMine) =>
  isMine
    ? 'AI is planning your itinerary'
    : `${job?.requestedBy?.name ?? 'A member'} is planning the itinerary with AI`;

// The TypingDots wave without its chat bubble, sized to sit at the end of a line.
const WorkingDots = () => {
  const styles = useStyles(makeStyles);
  const values = useRef(DOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const pulse = (value) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    const wave = Animated.loop(
      Animated.sequence([Animated.stagger(STEP_MS, values.map(pulse)), Animated.delay(STEP_MS)])
    );
    wave.start();
    return () => wave.stop();
  }, [values]);

  return (
    <View style={styles.dots}>
      {values.map((value, index) => (
        <Animated.View
          key={DOTS[index]}
          style={[
            styles.dot,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

/**
 * Sits under the group header, below the call banner, on every tab: AI
 * planning takes about a minute and nobody should have to wait on one screen
 * for it. A plain row in the layout, never a modal, so the chat stays usable.
 *   banner: 'none' | 'running' | 'done' | 'failed' (from useAiItinerary)
 *   onOpen: show the Itinerary tab       onRetry: open the planner again
 *   onDismiss: close the done / failed notice
 */
const AiItineraryBanner = ({ banner, job, isMine, onOpen, onRetry, onDismiss }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  if (banner === 'running') {
    return (
      <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={onOpen}>
        <AiWorkingCloud size={18} />
        <Text style={styles.text} numberOfLines={1}>
          {aiRunningText(job, isMine)}
        </Text>
        <WorkingDots />
      </TouchableOpacity>
    );
  }

  if (banner === 'done') {
    return (
      <View style={styles.banner}>
        <Ionicons name="cloud-done" size={18} color={theme.accentGreen} />
        <Text style={styles.text} numberOfLines={1}>
          Itinerary ready
        </Text>
        <TouchableOpacity
          style={styles.action}
          activeOpacity={0.85}
          onPress={() => {
            onOpen?.();
            onDismiss?.();
          }}
        >
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (banner === 'failed') {
    return (
      <View style={styles.banner}>
        <Ionicons name="cloud-offline-outline" size={18} color={theme.danger} />
        <Text style={[styles.text, styles.failedText]} numberOfLines={3}>
          {job?.errorMessage || 'Something went wrong while planning. Try again.'}
        </Text>
        <TouchableOpacity style={styles.action} activeOpacity={0.85} onPress={onRetry}>
          <Text style={styles.actionText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.close} onPress={onDismiss} hitSlop={styles.hitSlop}>
          <Ionicons name="close" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  return null;
};

const makeStyles = (theme) => StyleSheet.create({
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  // The call banner's "Join" row.
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card2,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  text: { flex: 1, color: theme.text, fontSize: 13, fontWeight: '600', marginLeft: spacing.sm },
  failedText: { fontSize: 12, lineHeight: 17 },
  action: {
    backgroundColor: theme.accentFill,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.sm,
  },
  actionText: { color: '#04121C', fontSize: 13, fontWeight: '700' },
  close: { marginLeft: spacing.sm },

  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accentFill },
});

export default AiItineraryBanner;
