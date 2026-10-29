import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInviteLinks } from '../invites/InviteLinkProvider';
import { radius, spacing, useStyles, useTheme } from '../theme';

// On the sign-in and sign-up screens: the person got here from a group invite
// link, and the group is waiting on the other side of the form. Nothing is
// shown otherwise.
const InviteNotice = ({ action = 'Sign in' }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { pendingCode } = useInviteLinks();
  if (!pendingCode) return null;
  return (
    <View style={styles.notice}>
      <View style={styles.icon}>
        <Ionicons name="people" size={16} color={theme.accentGreen} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>You’ve been invited to a group</Text>
        <Text style={styles.text}>{action} and you’ll be taken straight to it.</Text>
      </View>
    </View>
  );
};

const makeStyles = (theme) =>
  StyleSheet.create({
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      backgroundColor: 'rgba(0,196,208,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(0,196,208,0.35)',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      marginBottom: spacing.lg,
    },
    icon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,196,208,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    title: { color: theme.text, fontSize: 14, fontWeight: '700' },
    text: { color: theme.textMuted, fontSize: 12.5, marginTop: 2 },
  });

export default InviteNotice;
