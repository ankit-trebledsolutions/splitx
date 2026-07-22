import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';

const showDoc = (name) => Alert.alert(name, `${name} will be available soon.`);

// "I agree to the Terms of Service and Privacy Policy" row with a round
// checkbox, shown under the sign-up fields.
const TermsCheckbox = ({ checked, onToggle }) => (
  <View style={styles.row}>
    <TouchableOpacity
      style={[styles.box, checked && styles.boxChecked]}
      onPress={onToggle}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      {checked ? <Ionicons name="checkmark" size={15} color="#04121C" /> : null}
    </TouchableOpacity>
    <Text style={styles.text}>
      I agree to the{' '}
      <Text style={styles.link} onPress={() => showDoc('Terms of Service')}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.link} onPress={() => showDoc('Privacy Policy')}>
        Privacy Policy
      </Text>
    </Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: dark.accentGreen,
    borderColor: dark.accentGreen,
  },
  text: { color: dark.textMuted, fontSize: 14, flex: 1, lineHeight: 20 },
  link: { color: dark.text, fontWeight: '700' },
});

export default TermsCheckbox;
