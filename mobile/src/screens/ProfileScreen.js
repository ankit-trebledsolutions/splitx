import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { colors, radius, spacing } from '../theme';
import { initials } from '../utils/format';

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(user?.name)}</Text>
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Button title="Log out" variant="danger" onPress={logout} style={styles.logout} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    padding: spacing.xl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  email: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  logout: { marginTop: spacing.xl, alignSelf: 'stretch' },
});

export default ProfileScreen;
