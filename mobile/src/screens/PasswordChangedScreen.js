import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import GradientButton from '../components/GradientButton';
import SuccessBadge from '../components/SuccessBadge';
import AuthFooter from '../components/AuthFooter';
import { dark, spacing } from '../theme';

const PasswordChangedScreen = ({ navigation }) => (
  <AuthLayout
    title="Password Changed!"
    subtitle="Your password has been successfully updated. You can now log in with your new password."
  >
    <View style={styles.badgeWrap}>
      <SuccessBadge size={168} />
    </View>

    <View style={styles.spacer} />
    <GradientButton
      title="Back to Login"
      onPress={() => navigation.popToTop()}
    />
    <AuthFooter
      text="Need help?"
      linkText="Contact Support"
      linkColor={dark.accentGreen}
      onPress={() => Alert.alert('Support', 'Contact us at support@splix.app')}
    />
  </AuthLayout>
);

const styles = StyleSheet.create({
  badgeWrap: { alignItems: 'center', marginTop: spacing.xl * 2 },
  spacer: { flex: 1, minHeight: spacing.xl },
});

export default PasswordChangedScreen;
