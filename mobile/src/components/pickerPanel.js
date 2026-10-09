import { StyleSheet } from 'react-native';
import { dark, radius, spacing } from '../theme';

/**
 * The look shared by the panels that drop down under the date and time chips
 * of the reminder sheet (CalendarPanel, TimeWheel): a raised card with a
 * "Done" link at the bottom right.
 */
export const PANEL_BG = '#121B1F';
// The same colour with no alpha, for a fade to blend into the card.
export const PANEL_BG_CLEAR = 'rgba(18,27,31,0)';

export const panelStyles = StyleSheet.create({
  panel: {
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  done: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  doneText: { color: dark.accentGreen, fontSize: 15, fontWeight: '700' },
});
