import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, useStyles } from '../theme';
import { makePanelStyles } from './pickerPanel';
import MonthScroller from './MonthScroller';

/**
 * A calendar to pick one day from, dropping down under a date chip in a sheet
 * (reminder, task, stay, itinerary day). The months scroll on one under the
 * other. Days already gone cannot be picked unless `allowPast` is set. The
 * time of day is kept; only the day changes.
 *
 *   <CalendarPanel value={date} onChange={(date) => ...} onDone={() => ...} />
 */
const CalendarPanel = ({ value, onChange, onDone, allowPast = false }) => {
  const panelStyles = useStyles(makePanelStyles);
  const today = useMemo(() => new Date(), []);

  const pick = (day) => {
    const next = new Date(value);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onChange(next);
  };

  return (
    <View style={[panelStyles.panel, styles.panel]}>
      <MonthScroller value={value} minDate={allowPast ? undefined : today} onPick={pick} />

      <TouchableOpacity style={panelStyles.done} onPress={onDone} activeOpacity={0.7}>
        <Text style={panelStyles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { paddingTop: spacing.md, paddingHorizontal: spacing.sm },
});

export default CalendarPanel;
