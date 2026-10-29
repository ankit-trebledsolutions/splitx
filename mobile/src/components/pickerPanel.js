import { StyleSheet } from 'react-native';
import { radius, spacing } from '../theme';

/**
 * The look shared by the panels that drop down under the date and time chips
 * of the reminder sheet (CalendarPanel, TimeWheel): a raised card with a
 * "Done" link at the bottom right.
 */
// The panel colour is theme.panel; theme.panelClear is the same colour with
// no alpha, for a fade to blend into the card (TimeWheel).
export const makePanelStyles = (theme) => StyleSheet.create({
  panel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  done: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  doneText: { color: theme.accentGreen, fontSize: 15, fontWeight: '700' },
});
