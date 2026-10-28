import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import { joinGroup } from '../api/groups.api';
import { inviteCodeFromUrl } from '../invites/inviteLinks';
import { radius, spacing, useStyles, useTheme } from '../theme';

// Entry point of the group flow: create a brand new group, or join an
// existing one with an invite code / link / username.
const GroupActionScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const [invite, setInvite] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  // Accepts a raw code ("A1B2C3D4") or a full invite link (".../join/A1B2C3D4").
  const extractCode = (value) =>
    inviteCodeFromUrl(value) ?? value.trim().replace(/^.*[/@]/, '').toUpperCase();

  const handleJoin = async () => {
    const code = extractCode(invite);
    if (!code) {
      setError('Enter an invite code, link or username');
      return;
    }
    setError('');
    setJoining(true);
    try {
      await joinGroup(code);
      navigation.popToTop();
      navigation.navigate('MainTabs', { screen: 'Groups' });
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <AuthLayout
      title="Groups"
      subtitle="Create or join a group to split expenses"
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
    >
      <TouchableOpacity
        style={styles.createCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CreateGroup')}
      >
        <View style={styles.plusCircle}>
          <Ionicons name="add" size={26} color={theme.text} />
        </View>
        <Text style={styles.createText}>Create New group</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Text style={styles.sectionTitle}>Join A Group</Text>

      <TextField
        value={invite}
        onChangeText={(text) => {
          setInvite(text);
          if (error) setError('');
        }}
        placeholder="@group-handle, Link or Username"
        autoCapitalize="none"
        autoCorrect={false}
        error={error || undefined}
        style={styles.inviteField}
      />

      <Text style={styles.helper}>
        Enter a group handle like @goa-trip, paste an invite link, or search a friend&apos;s username
        to see the groups they&apos;re in.
      </Text>

      <View style={styles.spacer} />

      <GradientButton
        title="Join Group"
        onPress={handleJoin}
        loading={joining}
        style={styles.joinButton}
      />
    </AuthLayout>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  createCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: radius.lg + 4,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.overlayFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  createText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: { color: theme.textMuted, fontSize: 13 },
  sectionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  inviteField: { marginBottom: spacing.sm },
  helper: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
  spacer: { flex: 1, minHeight: spacing.xl },
  joinButton: { marginBottom: spacing.md },
});

export default GroupActionScreen;
