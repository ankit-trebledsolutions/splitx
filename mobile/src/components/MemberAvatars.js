import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { useStyles } from '../theme';

// Overlapping row of member avatars, with a "+N" chip once the list is capped.
const MemberAvatars = ({ users = [], size = 22, max = 5, style }) => {
  const styles = useStyles(makeStyles);
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;

  return (
    <View style={[styles.row, style]}>
      {shown.map((user, index) => (
        <Avatar
          key={user?._id ?? index}
          name={user?.name}
          size={size}
          solid
          style={[styles.avatar, index > 0 && { marginLeft: -size * 0.32 }]}
        />
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.more,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.32 },
          ]}
        >
          <Text style={[styles.moreText, { fontSize: size * 0.34 }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { borderWidth: 1.5, borderColor: theme.card },
  more: {
    backgroundColor: theme.overlayStrong,
    borderWidth: 1.5,
    borderColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: theme.text, fontWeight: '700' },
});

export default MemberAvatars;
