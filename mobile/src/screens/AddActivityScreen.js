import React, { useEffect, useState } from 'react';
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
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import SelectField from '../components/SelectField';
import {
  addItineraryActivity,
  fetchItinerary,
  updateItineraryActivity,
} from '../api/itinerary.api';
import { dark, radius, spacing } from '../theme';
import AppAlert from '../components/AppAlert';
import { isValidTimeText, normalizeTimeText } from '../utils/time';

const dayDateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'No date set';

// Full-screen activity form, per the add-new-activity mockup. Edit Day Details
// opens it two ways: "+ Add New Activity" for a new one, and a row's edit
// button, which passes that `activity` in the route params. With an activity
// this is the editor: the fields start from the saved values, the DATE box
// becomes a DAY picker that can move the activity to another day, and it saves
// through the per-activity PATCH.
const AddActivityScreen = ({ route, navigation }) => {
  const { day, activity } = route.params;
  const editing = Boolean(activity);

  const [name, setName] = useState(activity?.title ?? '');
  const [location, setLocation] = useState(activity?.location ?? '');
  // An existing activity keeps exactly the times it has. The "10:30 AM" and
  // "12:00 PM" starters are for new ones only: on an edit they would quietly
  // give an open-ended activity an end time.
  const [startTime, setStartTime] = useState(editing ? activity.time ?? '' : '10:30 AM');
  const [endTime, setEndTime] = useState(editing ? activity.endTime ?? '' : '12:00 PM');
  const [notes, setNotes] = useState(activity?.note ?? '');
  const [days, setDays] = useState([day]);
  const [dayId, setDayId] = useState(day._id);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The DAY picker needs every day of the trip, and the route only carries
  // this one. Until the list arrives (or if it never does) the picker offers
  // just the current day, and everything else on the form still saves.
  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    (async () => {
      try {
        const all = await fetchItinerary(day.group?._id ?? day.group);
        if (active && all.some((d) => d._id === day._id)) setDays(all);
      } catch {
        // Moving to another day is simply not offered this time.
      }
    })();
    return () => {
      active = false;
    };
  }, [editing, day]);

  const chosenDay = days.find((d) => d._id === dayId) ?? day;
  const dayOptions = days.map((d) => ({
    value: d._id,
    label: `Day ${d.dayNumber} · ${d.title}`,
  }));
  const startTimeOk = isValidTimeText(startTime);
  const endTimeOk = isValidTimeText(endTime);

  const submit = async () => {
    // A new activity needs a real name. An existing one only must not end up
    // empty, so a one-letter title saved from Edit Day can still be edited here.
    if (name.trim().length < (editing ? 1 : 2)) {
      setError('Give the activity a name');
      return;
    }
    if (!startTimeOk || !endTimeOk) {
      AppAlert.alert('Check the time', 'Use a time like 9:30 AM, or leave it empty.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        // Every field goes up, because '' is how one is cleared: that is the
        // only way to take an end time, a location or a note off an activity.
        await updateItineraryActivity(day._id, activity._id, {
          title: name.trim(),
          location: location.trim(),
          time: normalizeTimeText(startTime),
          endTime: normalizeTimeText(endTime),
          note: notes.trim(),
          ...(dayId !== day._id ? { targetDayId: dayId } : {}),
        });
      } else {
        await addItineraryActivity(day._id, {
          title: name.trim(),
          location: location.trim() || undefined,
          time: normalizeTimeText(startTime) || undefined,
          endTime: normalizeTimeText(endTime) || undefined,
          note: notes.trim() || undefined,
        });
      }
      navigation.goBack();
    } catch (err) {
      const failed = editing ? 'Could not save activity' : 'Could not add activity';
      if (err.status === 404) {
        // The day or the activity no longer exists (deleted, or swapped out by
        // an AI replan), so nothing on this form can be saved any more: go
        // back once the alert is read. Anything else can be retried from here.
        AppAlert.alert(failed, err.message, [{ text: 'OK', onPress: navigation.goBack }], {
          cancelable: false,
        });
      } else {
        AppAlert.alert(failed, err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // The inside of the DATE box is the same either way. When editing, the box is
  // also the trigger of the day dropdown, and a small chevron says so.
  const dayBox = (
    <>
      <Ionicons name="calendar-outline" size={15} color={dark.textMuted} />
      <Text style={styles.dateText}>{dayDateLabel(chosenDay.date)}</Text>
      <Text style={styles.dayChipText}>DAY {chosenDay.dayNumber}</Text>
    </>
  );

  return (
    <DarkScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={navigation.goBack} activeOpacity={0.7} hitSlop={styles.hitSlop}>
            <Ionicons name="arrow-back" size={22} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editing ? 'Edit Activity' : 'Add Activity'}</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>ACTIVITY NAME</Text>
          <View style={[styles.fieldBox, error ? styles.fieldBoxError : null]}>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError('');
              }}
              placeholder="e.g. Shibuya Sky Observation Deck"
              placeholderTextColor={dark.textMuted}
            />
            <Ionicons name="pencil" size={13} color={dark.accentBlue} />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>LOCATION</Text>
          <View style={styles.fieldBox}>
            <Ionicons name="location-outline" size={15} color={dark.accentGreen} />
            <TextInput
              style={styles.fieldInput}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. 2-24-12 Shibuya, Tokyo, 150-6145"
              placeholderTextColor={dark.textMuted}
            />
          </View>

          <Text style={styles.label}>{editing ? 'DAY' : 'DATE'}</Text>
          {editing ? (
            <SelectField
              label="Day"
              value={dayId}
              options={dayOptions}
              onChange={setDayId}
              renderTrigger={({ open }) => (
                <TouchableOpacity
                  style={styles.fieldBox}
                  activeOpacity={0.8}
                  onPress={() => {
                    Keyboard.dismiss();
                    open();
                  }}
                >
                  {dayBox}
                  <Ionicons name="chevron-down" size={14} color={dark.textMuted} />
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.fieldBox}>{dayBox}</View>
          )}

          <View style={styles.timeRow}>
            <View style={styles.timeColumn}>
              <Text style={styles.label}>START TIME</Text>
              <View style={[styles.fieldBox, startTimeOk ? null : styles.fieldBoxError]}>
                <Ionicons name="time-outline" size={15} color={dark.accentGreen} />
                <TextInput
                  style={[styles.fieldInput, styles.startTimeInput]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="10:30 AM"
                  placeholderTextColor={dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.timeColumn}>
              <Text style={styles.label}>END TIME</Text>
              <View style={[styles.fieldBox, endTimeOk ? null : styles.fieldBoxError]}>
                <Ionicons name="time-outline" size={15} color={dark.textMuted} />
                <TextInput
                  style={styles.fieldInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="12:00 PM"
                  placeholderTextColor={dark.textMuted}
                />
              </View>
            </View>
          </View>

          <Text style={styles.label}>NOTES / DESCRIPTION (OPTIONAL)</Text>
          <View style={[styles.fieldBox, styles.notesBox]}>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Remember to reserve the slot exactly 30 days prior. Tickets sell out in minutes!"
              placeholderTextColor={dark.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <GradientButton
            title={editing ? 'Save changes' : 'Add Activity'}
            onPress={submit}
            loading={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { color: dark.text, fontSize: 20, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  label: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldBoxError: { borderColor: '#F87171' },
  fieldInput: {
    flex: 1,
    color: dark.text,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 12,
  },
  errorText: { color: '#F87171', fontSize: 11, marginTop: spacing.xs },

  dateText: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600' },
  dayChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  timeRow: { flexDirection: 'row', gap: spacing.sm },
  timeColumn: { flex: 1 },
  startTimeInput: { color: dark.accentGreen },

  notesBox: { alignItems: 'flex-start', paddingVertical: spacing.xs },
  notesInput: { minHeight: 92, fontWeight: '400', lineHeight: 20 },

  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});

export default AddActivityScreen;
