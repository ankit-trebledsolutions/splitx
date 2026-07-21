import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AuthLayout from '../components/AuthLayout';
import GradientButton from '../components/GradientButton';
import { dark, spacing } from '../theme';

const PasswordChangedScreen = ({ navigation }) => (
  <AuthLayout
    title="Password Changed!"
    subtitle="Your password has been successfully updated. You can now log in with your new password."
  >
    <View style={styles.badgeWrap}>
      <View style={styles.badgeRing}>
        <LinearGradient
          colors={[dark.accentBlue, dark.accentGreen]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Ionicons name="checkmark" size={56} color="#04121C" />
        </LinearGradient>
      </View>
    </View>

    <View style={styles.spacer} />
    <GradientButton
      title="Back to Login"
      onPress={() => navigation.popToTop()}
    />
    <View style={styles.footer}>
      <Text style={styles.footerText}>Need help? </Text>
      <TouchableOpacity
        onPress={() => Alert.alert('Support', 'Contact us at support@splix.app')}
      >
        <Text style={styles.footerLink}>Support</Text>
      </TouchableOpacity>
    </View>
  </AuthLayout>
);

const styles = StyleSheet.create({
  badgeWrap: { alignItems: 'center', marginTop: spacing.xl * 2 },
  badgeRing: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
    borderColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { flex: 1, minHeight: spacing.xl },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  footerText: { color: dark.textMuted, fontSize: 15 },
  footerLink: { color: dark.link, fontSize: 15, fontWeight: '700' },
});

export default PasswordChangedScreen;
