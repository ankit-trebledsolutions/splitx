import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

// Dark-styled labeled input; set `secure` to add the eye visibility toggle.
const DarkTextField = ({ label, secure = false, style, ...inputProps }) => {
  const [hidden, setHidden] = useState(true);

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, secure && styles.inputSecure]}
          placeholderTextColor={dark.textMuted}
          secureTextEntry={secure && hidden}
          {...inputProps}
        />
        {secure && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setHidden((v) => !v)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={dark.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: dark.text,
  },
  inputSecure: { paddingRight: 48 },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});

export default DarkTextField;
