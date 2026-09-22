import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import DateField from '../components/DateField';
import {
  fetchItinerary,
  updateItineraryDay,
  deleteItineraryDay,
  removeItineraryActivity,
} from '../api/itinerary.api';
import { useAuth } from '../context/AuthContext';
import { dark, radius, spacing } from '../theme';
import AppAlert from '../components/AppAlert';
import { isValidTimeText, normalizeTimeText } from '../utils/time';

const dateLabel = (date) =>
  date ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Set date';

// People arrive populated ({ _id, name }) or as a bare id; '' when missing.
const idOf = (ref) => String(ref?._id ?? ref ?? '');

// Rows always carry `time` as a string, so its input stays controlled.
const toRows = (activities = []) => activities.map((a) => ({ ...a, time: a.time ?? '' }));

// The "location · note" line under a row; empty when the activity has neither.
const previewOf = ({ location, note }) =>
  [location, note]
    .map((text) => (text ?? '').trim())
    .filter(Boolean)
    .join(' · ');

// Full-screen editor for one itinerary day, per the edit-itinerary mockup.
// Time and title are edited in the rows; a row's edit button opens the full
// activity form for the rest (end time, location, note, moving to another day).
const EditItineraryDayScreen = ({ route, navigation }) => {
  const { day, groupName, adminId } = route.params;
  const { user } = useAuth();

  const [title, setTitle] = useState(day.title);
  const [date, setDate] = useState(day.date ? new Date(day.date) : null);
  const [activities, setActivities] = useState(toRows(day.activities));
  const [saving, setSaving] = useState(false);
  const firstFocus = useRef(true);
  // Set once anything Save would write (the day name, the date, a row's time
  // or title) has changed since the server last confirmed it.
  const dirty = useRef(false);

  // The server lets the member who added a day, or the group admin, delete it.
  // AI-planned days all belong to whoever asked for the plan, so the admin rule
  // is what lets anyone else clear one. Nobody else is shown the button.
  const me = idOf(user);
  const canDeleteDay = Boolean(me) && [day.createdBy, adminId].some((ref) => idOf(ref) === me);

  // For when this screen's copy of the day can no longer be saved: say why,
  // then go back to the group, which reloads the itinerary. OK is the only way
  // out of the alert, so the screen never stays open on a day that is gone.
  const leaveWith = (alertTitle, message) =>
    AppAlert.alert(alertTitle, message, [{ text: 'OK', onPress: navigation.goBack }], {
      cancelable: false,
    });

  const leaveChanged = () =>
    leaveWith('Could not save day', 'This itinerary just changed. Reopen the day and try again.');

  // A 404 means the day (or the activity) no longer exists: someone deleted
  // it, or an AI replan swapped the itinerary out. A 409 AI_GENERATING means AI
  // is rewriting the itinerary right now. Returns false for any other error, so
  // the caller shows its own alert and the screen stays open.
  const leaveIfStale = (err) => {
    if (err.status === 404) {
      leaveChanged();
      return true;
    }
    if (err.code === 'AI_GENERATING') {
      leaveWith('AI is planning this itinerary', 'Try again in a moment.');
      return true;
    }
    return false;
  };

  // Returning from Add / Edit Activity: pull the fresh activity list from the
  // server. Whatever was typed here was saved before leaving (see
  // openActivity), so replacing the rows loses nothing.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return undefined;
      }
      let active = true;
      (async () => {
        let days;
        try {
          days = await fetchItinerary(day.group?._id ?? day.group);
        } catch {
          // Keep the local list if the refresh fails.
          return;
        }
        if (!active) return;
        const fresh = days.find((d) => d._id === day._id);
        if (fresh) setActivities(toRows(fresh.activities));
        else leaveChanged();
      })();
      // Left again before the answer came: don't alert (or pop) over another screen.
      return () => {
        active = false;
      };
    }, [day])
  );

  const editTitle = (text) => {
    dirty.current = true;
    setTitle(text);
  };

  const editDate = (next) => {
    dirty.current = true;
    setDate(next);
  };

  // Noon keeps the calendar day stable when the ISO string crosses time zones
  // (DateField's rule). Days saved before this carry whatever time of day it
  // was, so the pin is applied on every step rather than assumed.
  const shiftDate = (days) => {
    const from = date ?? new Date();
    editDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12));
  };

  const setActivity = (index, patch) => {
    dirty.current = true;
    setActivities((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  // Deletes immediately on the server (no Save needed), with rollback on failure.
  const removeActivity = async (index) => {
    const activity = activities[index];
    const before = activities;
    setActivities((prev) => prev.filter((_, i) => i !== index));
    if (!activity._id) return;
    try {
      await removeItineraryActivity(day._id, activity._id);
    } catch (err) {
      setActivities(before);
      if (!leaveIfStale(err)) AppAlert.alert('Could not delete activity', err.message);
    }
  };

  // The delete can't be undone by leaving without Save, so ask first.
  const confirmRemoveActivity = (index) => {
    const name = (activities[index].title ?? '').trim() || 'This activity';
    AppAlert.alert('Delete activity?', `${name} will be removed from Day ${day.dayNumber}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeActivity(index) },
    ]);
  };

  // Writes the day name, the date and every row in one PATCH. Resolves to the
  // saved day, or to null when nothing was saved (the reason has been shown).
  // Save and the auto-save before leaving for an activity both come through
  // here, so the same checks guard both.
  const persist = async () => {
    if (title.trim().length < 1) {
      AppAlert.alert('Day name required', 'Give this day a name before saving.');
      return null;
    }
    // A cleared title used to drop the activity without a word. Now it has to
    // be named, or deleted on purpose.
    if (activities.some((a) => (a.title ?? '').trim().length < 1)) {
      AppAlert.alert('Activity name required', 'Give every activity a name before saving.');
      return null;
    }
    if (activities.some((a) => !isValidTimeText(a.time))) {
      AppAlert.alert('Check the time', 'Use a time like 9:30 AM, or leave it empty.');
      return null;
    }

    setSaving(true);
    try {
      const saved = await updateItineraryDay(day._id, {
        title: title.trim(),
        date: date ? date.toISOString() : null,
        // Each row goes back with its _id, so the server keeps the same
        // activity instead of minting a new one and other phones' copies stay
        // valid. endTime/location/note/icon ride along from the original rows;
        // only time/title are edited on this screen.
        activities: activities.map((a) => ({
          _id: a._id,
          time: normalizeTimeText(a.time),
          title: a.title.trim(),
          ...(a.endTime ? { endTime: a.endTime } : {}),
          ...(a.location ? { location: a.location } : {}),
          ...(a.note ? { note: a.note } : {}),
          ...(a.icon ? { icon: a.icon } : {}),
        })),
      });
      dirty.current = false;
      setActivities(toRows(saved.activities));
      return saved;
    } catch (err) {
      if (!leaveIfStale(err)) AppAlert.alert('Could not save day', err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (await persist()) navigation.goBack();
  };

  // Opens the activity form: for the given row, or empty for a new activity.
  // That form saves on its own, and coming back reloads the rows from the
  // server, so anything typed here is saved first or that reload would wipe
  // it. If the save fails, stay put.
  const openActivity = async (activityId) => {
    if (saving) return;
    let rows = activities;
    if (dirty.current) {
      const saved = await persist();
      if (!saved) return;
      rows = saved.activities;
    }
    const activity = activityId ? rows.find((a) => a._id === activityId) : undefined;
    // The save gives a row a new id when the server no longer had it (someone
    // deleted it meanwhile). The saved rows are on screen now; the next tap
    // will find the right one.
    if (activityId && !activity) return;
    navigation.navigate('AddActivity', {
      day: { ...day, title, date: date ? date.toISOString() : day.date },
      ...(activity ? { activity } : {}),
    });
  };

  return (
    <DarkScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={navigation.goBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Day Details</Text>
          <TouchableOpacity
            style={styles.saveChip}
            activeOpacity={0.85}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveChipText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contextRow}>
            <View style={styles.dayChip}>
              <Text style={styles.dayChipText}>DAY {day.dayNumber}</Text>
            </View>
            <Text style={styles.contextText} numberOfLines={1}>
              {groupName ? `${groupName} Itinerary` : 'Trip Itinerary'}
            </Text>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>DAY NAME</Text>
              <View style={styles.fieldBox}>
                <TextInput
                  style={styles.fieldInput}
                  value={title}
                  onChangeText={editTitle}
                  placeholder="e.g. Arrival Day"
                  placeholderTextColor={dark.textMuted}
                />
                <Ionicons name="pencil" size={13} color={dark.accentBlue} />
              </View>
            </View>

            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>DATE</Text>
              <View style={styles.fieldBox}>
                <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={styles.hitSlop}>
                  <Ionicons name="chevron-back" size={14} color={dark.textMuted} />
                </TouchableOpacity>
                {/* The chevrons step a day at a time; tapping the date itself
                    opens the month calendar for a far jump. */}
                <DateField
                  style={styles.dateTrigger}
                  value={date}
                  onChange={editDate}
                  renderTrigger={({ open }) => (
                    <TouchableOpacity
                      style={styles.dateTap}
                      activeOpacity={0.7}
                      onPress={() => {
                        Keyboard.dismiss();
                        open();
                      }}
                    >
                      <Text style={styles.dateText}>{dateLabel(date)}</Text>
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity onPress={() => shiftDate(1)} hitSlop={styles.hitSlop}>
                  <Ionicons name="chevron-forward" size={14} color={dark.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.scheduleHeader}>
            <Text style={styles.fieldLabel}>ACTIVITIES SCHEDULE</Text>
            <Text style={styles.reorderHint}>Edit time & title</Text>
          </View>

          {activities.map((activity, index) => {
            const preview = previewOf(activity);
            return (
              /* eslint-disable-next-line react/no-array-index-key */
              <View key={index}>
                <View style={styles.activityRow}>
                  <TouchableOpacity
                    style={[styles.rowButton, styles.editButton]}
                    activeOpacity={0.8}
                    onPress={() => openActivity(activity._id)}
                  >
                    <Ionicons name="create-outline" size={15} color={dark.accentBlue} />
                  </TouchableOpacity>

                  <View
                    style={[styles.timeBox, isValidTimeText(activity.time) ? null : styles.boxError]}
                  >
                    <TextInput
                      style={styles.timeInput}
                      value={activity.time}
                      onChangeText={(text) => setActivity(index, { time: text })}
                      placeholder="10:30 AM"
                      placeholderTextColor={dark.textMuted}
                    />
                  </View>

                  <View style={styles.titleBox}>
                    <TextInput
                      style={styles.titleInput}
                      value={activity.title}
                      onChangeText={(text) => setActivity(index, { title: text })}
                      placeholder="What's happening?"
                      placeholderTextColor={dark.textMuted}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.rowButton, styles.deleteButton]}
                    activeOpacity={0.8}
                    onPress={() => confirmRemoveActivity(index)}
                  >
                    <Ionicons name="trash-outline" size={14} color="#F87171" />
                  </TouchableOpacity>
                </View>

                {preview ? (
                  <TouchableOpacity
                    style={styles.activityPreview}
                    activeOpacity={0.7}
                    onPress={() => openActivity(activity._id)}
                  >
                    <Text style={styles.activityPreviewText} numberOfLines={1}>
                      {preview}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.addActivity}
            activeOpacity={0.8}
            onPress={() => openActivity()}
          >
            <Ionicons name="add" size={16} color={dark.accentGreen} />
            <Text style={styles.addActivityText}>Add New Activity</Text>
          </TouchableOpacity>

          {canDeleteDay ? (
            <TouchableOpacity
              style={styles.deleteDay}
              activeOpacity={0.8}
              onPress={() =>
                AppAlert.alert('Delete day', `Delete Day ${day.dayNumber} · ${title}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteItineraryDay(day._id);
                        navigation.goBack();
                      } catch (err) {
                        if (!leaveIfStale(err)) AppAlert.alert('Could not delete day', err.message);
                      }
                    },
                  },
                ])
              }
            >
              <Ionicons name="trash-outline" size={15} color="#F87171" />
              <Text style={styles.deleteDayText}>Delete this day</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: dark.text,
    fontSize: 18,
    fontWeight: '800',
    marginLeft: spacing.md,
  },
  saveChip: {
    backgroundColor: dark.accentGreen,
    borderRadius: 16,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  saveChipText: { color: '#04121C', fontSize: 13, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dayChip: {
    backgroundColor: 'rgba(0,196,208,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.4)',
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  dayChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  contextText: { color: dark.textMuted, fontSize: 12, flex: 1 },

  fieldRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  fieldColumn: { flex: 1 },
  fieldLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    minHeight: 44,
  },
  fieldInput: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600', paddingVertical: 8 },
  // The date is also the calendar's trigger. It fills the box between the
  // chevrons, so the whole middle is tappable, and keeps the text centred
  // exactly where it was.
  dateTrigger: { flex: 1, alignSelf: 'stretch' },
  dateTap: { flex: 1, justifyContent: 'center' },
  dateText: { color: dark.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },

  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  reorderHint: { color: dark.accentBlue, fontSize: 11, fontWeight: '600' },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  timeBox: {
    width: 92,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  // Time text the server could not read (see utils/time).
  boxError: { borderColor: '#F87171' },
  timeInput: {
    color: dark.accentGreen,
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 10,
    textAlign: 'center',
  },
  titleBox: {
    flex: 1,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
  },
  titleInput: { color: dark.text, fontSize: 13, fontWeight: '600', paddingVertical: 10 },
  // The two round buttons that bracket a row: edit on the left, in the colours
  // of the boxes beside it, and delete on the right.
  rowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: { backgroundColor: dark.card, borderColor: dark.border },
  deleteButton: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.35)',
  },
  // Tucked under the time and title boxes, clear of the round buttons. The
  // padding is tap area; the margins keep the gap to the next row at 8.
  activityPreview: {
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
    marginHorizontal: 34 + spacing.sm,
    paddingVertical: spacing.xs,
  },
  activityPreviewText: { color: dark.textMuted, fontSize: 11 },

  addActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,196,208,0.45)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  addActivityText: { color: dark.accentGreen, fontSize: 13, fontWeight: '700' },

  deleteDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  deleteDayText: { color: '#F87171', fontSize: 13, fontWeight: '700' },
});

export default EditItineraryDayScreen;
