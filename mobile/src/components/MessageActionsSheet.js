import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useStyles, useTheme } from '../theme';


/**
 * What long-pressing a chat message opens: a sheet of actions for it.
 * `actions` is [{ key, icon, label, onPress, destructive }]; the sheet closes
 * itself before running the chosen one.
 */
const MessageActionsSheet = ({ visible, preview, actions = [], onClose }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps on the sheet itself so they don't close it. */}
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          {preview ? (
            <Text style={styles.preview} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.item}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                // Let this modal finish closing first: an action may open
                // another one (the delete confirmation).
                setTimeout(action.onPress, 200);
              }}
            >
              <Ionicons
                name={action.icon}
                size={19}
                color={action.destructive ? theme.danger : theme.text}
              />
              <Text style={[styles.label, action.destructive && styles.labelDanger]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.card2,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.overlayStrong,
    marginBottom: spacing.sm,
  },
  preview: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md - 2,
  },
  label: { color: theme.text, fontSize: 15, fontWeight: '600' },
  labelDanger: { color: theme.danger },
});

export default MessageActionsSheet;
