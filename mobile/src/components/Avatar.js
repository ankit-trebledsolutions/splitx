import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dark } from '../theme';
import { initials } from '../utils/format';

// Per-member palette so each person keeps a stable colour across the chat,
// split rows and assignee pickers.
const PALETTE = ['#7C6BF5', '#F97362', '#F5B342', '#3FA9F5', '#17E695', '#EC6BB4', '#4A7DF7'];

export const avatarColor = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return PALETTE[hash % PALETTE.length];
};

/**
 * Gradient initials avatar by default (brand look, used for the user's own
 * avatar and group tiles). Pass `solid` for the per-member coloured version.
 * The design uses photos; until image upload exists, initials stand in.
 */
const Avatar = ({ name, size = 44, solid = false, style, textStyle }) => {
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  const label = <Text style={[styles.text, { fontSize: size * 0.36 }, solid && styles.textSolid, textStyle]}>{initials(name)}</Text>;

  if (solid) {
    return (
      <View style={[dimensions, styles.center, { backgroundColor: avatarColor(name) }, style]}>
        {label}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={dark.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[dimensions, styles.center, style]}
    >
      {label}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#04121C', fontWeight: '800' },
  textSolid: { color: '#0B1116' },
});

export default Avatar;
