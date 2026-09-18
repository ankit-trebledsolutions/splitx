import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { dark, spacing } from '../theme';

const DOTS = [0, 1, 2];
const STEP_MS = 160; // delay between one dot lighting up and the next
const PULSE_MS = 420;

/**
 * The "someone is typing" bubble: three dots that light up and lift in a wave.
 *   label: shown above the bubble — the typer's name in group chats, omitted
 *          in a one-to-one chat where it can only be the other person.
 */
const TypingDots = ({ label, labelColor, style }) => {
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
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text style={[styles.label, labelColor && { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <View style={styles.bubble}>
        {values.map((value, index) => (
          <Animated.View
            key={DOTS[index]}
            style={[
              styles.dot,
              {
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [
                  { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  label: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: dark.accentGreen },
});

export default TypingDots;
