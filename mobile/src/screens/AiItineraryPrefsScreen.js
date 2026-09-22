import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import StepperField from '../components/StepperField';
import ChoiceChips from '../components/ChoiceChips';
import TimeStepper from '../components/TimeStepper';
import AppAlert from '../components/AppAlert';
import useKeyboardLift from '../hooks/useKeyboardLift';
import useKeyboardVisible from '../hooks/useKeyboardVisible';
import { fetchGroup } from '../api/groups.api';
import { fetchStays } from '../api/stays.api';
import { fetchAttractions } from '../api/attractions.api';
import { fetchItineraryGeneration, generateItinerary } from '../api/itinerary.api';
import {
  TRAVELLERS,
  INTERESTS,
  PACE,
  BUDGET,
  TRANSPORT,
  FOOD,
  DAY_START,
  ACCESSIBILITY,
  MAX_AI_DAYS,
  MAX_AI_GROUP_SIZE,
  DEFAULT_ARRIVAL_MINUTES,
  DEFAULT_DEPARTURE_MINUTES,
  DEFAULT_PREFS,
  AI_ALERTS,
  replaceConfirmMessage,
} from '../constants/aiItineraryOptions';
import { labelToMinutes, minutesToLabel } from '../utils/time';
import { formatDate } from '../utils/format';
import { dark, radius, spacing } from '../theme';

// iOS keeps KeyboardAvoidingView; Android lifts the screen itself (see useKeyboardLift).
const IS_IOS = Platform.OS === 'ios';
const Root = IS_IOS ? KeyboardAvoidingView : View;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// The member's answers from their last run laid over the defaults, so a retry
// never starts from scratch. A value the lists no longer offer falls back to
// its default. Times are held as minutes since midnight, null when not given.
const seedChoices = (last) => {
  const known = (options, value, fallback) =>
    options.some((option) => option.value === value) ? value : fallback;
  const interests = (last?.interests ?? []).filter((value) =>
    INTERESTS.some((option) => option.value === value)
  );
  return {
    travellers: known(TRAVELLERS, last?.travellers, DEFAULT_PREFS.travellers),
    interests: interests.length ? interests : DEFAULT_PREFS.interests,
    pace: known(PACE, last?.pace, DEFAULT_PREFS.pace),
    budget: known(BUDGET, last?.budget, DEFAULT_PREFS.budget),
    transport: known(TRANSPORT, last?.transport, DEFAULT_PREFS.transport),
    arrival: labelToMinutes(last?.arrivalTime),
    departure: labelToMinutes(last?.departureTime),
    food: known(FOOD, last?.food, DEFAULT_PREFS.food),
    dayStart: known(DAY_START, last?.dayStart, DEFAULT_PREFS.dayStart),
    accessibility: known(ACCESSIBILITY, last?.accessibility, DEFAULT_PREFS.accessibility),
    notes: last?.notes ?? DEFAULT_PREFS.notes,
  };
};

/**
 * "Plan with AI": what the AI should know before it drafts the itinerary.
 * One screen in two steps. Step 1 holds everything the plan needs; step 2
 * ("More options") is optional fine-tuning.
 *
 * The trip's own facts (destination, start date, days) come from the group and
 * are read-only here. A row turns into an input only where the group has
 * nothing, or for the destination when the server says the saved one could not
 * be used. Only those typed values are sent; the server holds the rule for
 * which one wins.
 *
 * Route params: { groupId, groupName, replace = false, from: 'groups' | 'group' }
 */
const AiItineraryPrefsScreen = ({ route, navigation }) => {
  const { groupId, groupName, from } = route.params;
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { lift, onLayout } = useKeyboardLift();
  const scrollRef = useRef(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // True once the user has agreed to replace the existing days, here or on the group screen.
  const [replace, setReplace] = useState(route.params.replace === true);

  // { group, stayCount, placeCount, destinationEditable }
  const [trip, setTrip] = useState(null);
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [days, setDays] = useState(3);
  const [groupSize, setGroupSize] = useState(1);
  const [choices, setChoices] = useState(() => seedChoices(null));
  const [errors, setErrors] = useState({});

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setChoice = (key) => (value) => setChoices((prev) => ({ ...prev, [key]: value }));

  // Where the user belongs once a job is running. From My Groups that is the
  // group itself, opened on its Itinerary tab and handed the job so the
  // "working" state shows at once. From inside the group it is simply back.
  const leaveToGroup = (job) => {
    if (from === 'groups') {
      navigation.replace('GroupChat', {
        groupId,
        name: groupName,
        initialTab: 'itinerary',
        ...(job ? { aiJob: job } : {}),
      });
    } else {
      navigation.goBack();
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [group, stays, attractions, generation] = await Promise.all([
          fetchGroup(groupId),
          fetchStays(groupId),
          fetchAttractions(groupId),
          // A 404 on this route alone means a backend from before the feature.
          // A missing group still fails the load through fetchGroup.
          fetchItineraryGeneration(groupId).catch((err) =>
            err.status === 404 ? { configured: null } : Promise.reject(err)
          ),
        ]);
        if (!active) return;

        if (generation.configured !== true) {
          AppAlert.alert(...AI_ALERTS.notConfigured);
          navigation.goBack();
          return;
        }
        if (generation.job?.status === 'running') {
          AppAlert.alert(...AI_ALERTS.running);
          leaveToGroup(generation.job);
          return;
        }

        const last = generation.lastPrefs;
        const memberCount = group.members?.length ?? 1;
        setTrip({
          group,
          // Cancelled stays are left out of the plan, so they are left out of the count.
          stayCount: stays.filter((stay) => stay.status !== 'cancelled').length,
          placeCount: attractions.length,
          destinationEditable: generation.destinationEditable === true,
        });
        setDestination(last?.destination ?? group.location ?? '');
        setStartDate(last?.startDate ? new Date(last.startDate) : null);
        setDays(clamp(last?.days ?? 3, 1, MAX_AI_DAYS));
        setGroupSize(memberCount === 1 ? clamp(last?.groupSize ?? 1, 1, MAX_AI_GROUP_SIZE) : memberCount);
        setChoices(seedChoices(last));
        setLoading(false);
      } catch (err) {
        // Offline, timed out, removed from the group, or the group is gone.
        // Leaving is the only way on, so the spinner can never be endless.
        if (!active) return;
        AppAlert.alert('Could not load trip details', err.message);
        navigation.goBack();
      }
    })();
    return () => {
      active = false;
    };
    // Loads once for the group it was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Android's back button steps back to step 1 before it leaves the screen.
  useEffect(() => {
    if (step !== 2) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  // Each step opens at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const group = trip?.group;
  const memberCount = group?.members?.length ?? 1;
  const hasSavedLocation = (group?.location ?? '').trim().length >= 2;
  const destinationEditable = trip?.destinationEditable === true;
  const startDateMissing = !group?.startDate;
  const daysMissing = !group?.totalDays;
  const groupSizeEditable = memberCount === 1;

  const goBackOneStep = () => (step === 2 ? setStep(1) : navigation.goBack());

  const buildBody = (withReplace) => ({
    // Trip facts go out only where this screen showed an input for them.
    ...(destinationEditable ? { destination: destination.trim() } : {}),
    ...(startDateMissing ? { startDate: startDate ? startDate.toISOString() : null } : {}),
    ...(daysMissing ? { days } : {}),
    groupSize,
    travellers: choices.travellers,
    interests: choices.interests,
    pace: choices.pace,
    budget: choices.budget,
    transport: choices.transport,
    arrivalTime: choices.arrival === null ? null : minutesToLabel(choices.arrival),
    departureTime: choices.departure === null ? null : minutesToLabel(choices.departure),
    food: choices.food,
    notes: choices.notes.trim(),
    dayStart: choices.dayStart,
    accessibility: choices.accessibility,
    replace: withReplace,
  });

  const showStartError = (err) => {
    if (err.code === 'ITINERARY_EXISTS') {
      AppAlert.alert('Replace itinerary?', replaceConfirmMessage(err.details?.dayCount), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            setReplace(true);
            start(true);
          },
        },
      ]);
      return;
    }
    if (err.code === 'AI_ALREADY_RUNNING') {
      AppAlert.alert(...AI_ALERTS.running);
      leaveToGroup(err.details?.job);
      return;
    }
    if (err.code === 'AI_TRIP_DETAILS_REQUIRED') {
      const missing = err.details?.missing ?? [];
      const next = {};
      if (missing.includes('destination') && destinationEditable) {
        next.destination = 'Add a destination';
      }
      if (missing.includes('days') && daysMissing) next.days = 'Add the number of days';
      if (Object.keys(next).length) {
        setErrors(next);
        setStep(1);
        return;
      }
    }
    if (err.code === 'AI_REPLACE_FORBIDDEN') {
      AppAlert.alert(...AI_ALERTS.replaceForbidden);
      return;
    }
    if (err.code === 'AI_NOT_CONFIGURED') {
      AppAlert.alert(...AI_ALERTS.notConfigured);
      return;
    }
    if (err.code === 'AI_LIMIT') {
      AppAlert.alert('Daily AI limit reached', err.message);
      return;
    }
    AppAlert.alert('Could not start AI planner', err.message);
  };

  const start = async (withReplace) => {
    if (destinationEditable && destination.trim().length < 2) {
      setErrors({ destination: 'Add a destination' });
      setStep(1);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const job = await generateItinerary(groupId, buildBody(withReplace));
      // The button keeps spinning while the screen hands over to the group.
      if (mounted.current) leaveToGroup(job);
    } catch (err) {
      if (!mounted.current) return;
      setSubmitting(false);
      showStartError(err);
    }
  };

  const readOnlyRow = (icon, text) => (
    <View style={[styles.fieldBox, styles.row]}>
      <Ionicons name={icon} size={15} color={dark.textMuted} />
      <Text style={styles.rowText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );

  const stepOne = () => (
    <>
      <Text style={styles.label}>TRIP DETAILS</Text>

      {destinationEditable ? (
        <>
          <TextField
            label="Destination"
            value={destination}
            onChangeText={(text) => {
              setDestination(text);
              if (errors.destination) setErrors((prev) => ({ ...prev, destination: undefined }));
            }}
            placeholder="e.g. Bali, Indonesia"
            maxLength={120}
            error={errors.destination}
            style={styles.row}
          />
          {/* The group has a destination and the row is still open: the last
              run could not use it. */}
          {hasSavedLocation ? (
            <Text style={styles.helper}>
              AI could not use the saved destination. Correct it here.
            </Text>
          ) : null}
        </>
      ) : (
        readOnlyRow('location-outline', (group.location ?? '').trim())
      )}

      {startDateMissing ? (
        <DateField
          value={startDate}
          onChange={setStartDate}
          style={styles.row}
          // Drawn as the same box as the rows around it, not as DateField's own field.
          renderTrigger={({ open, value }) => (
            <TouchableOpacity style={styles.fieldBox} activeOpacity={0.8} onPress={open}>
              <Ionicons name="calendar-outline" size={15} color={dark.accentGreen} />
              <Text style={[styles.rowText, !value && styles.rowPlaceholder]} numberOfLines={1}>
                {value ? formatDate(value) : 'Add a start date (optional)'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={dark.textMuted} />
            </TouchableOpacity>
          )}
        />
      ) : (
        readOnlyRow('calendar-outline', formatDate(group.startDate))
      )}

      {daysMissing ? (
        <>
          <StepperField
            label="Number of days"
            value={days}
            onChange={(value) => {
              setDays(value);
              if (errors.days) setErrors((prev) => ({ ...prev, days: undefined }));
            }}
            min={1}
            max={MAX_AI_DAYS}
            style={styles.row}
          />
          {errors.days ? <Text style={styles.errorText}>{errors.days}</Text> : null}
        </>
      ) : (
        <>
          {readOnlyRow('time-outline', countLabel(group.totalDays, 'day'))}
          {group.totalDays > MAX_AI_DAYS ? (
            <Text style={styles.helper}>AI plans the first {MAX_AI_DAYS} days.</Text>
          ) : null}
        </>
      )}

      {/* A group of one is usually a trip whose members haven't joined yet, so
          the organiser can say how many are really going. */}
      {groupSizeEditable ? (
        <StepperField
          label="Group size"
          value={groupSize}
          onChange={setGroupSize}
          min={1}
          max={MAX_AI_GROUP_SIZE}
          style={styles.row}
        />
      ) : (
        readOnlyRow('people-outline', `${memberCount} people`)
      )}

      {readOnlyRow(
        'bed-outline',
        trip.stayCount || trip.placeCount
          ? `${countLabel(trip.stayCount, 'stay')} · ${countLabel(trip.placeCount, 'place')}`
          : 'None yet. AI will pick central areas.'
      )}

      <Text style={styles.label}>WHO'S TRAVELLING</Text>
      <ChoiceChips options={TRAVELLERS} value={choices.travellers} onChange={setChoice('travellers')} />

      <Text style={styles.label}>INTERESTS</Text>
      <ChoiceChips
        options={INTERESTS}
        value={choices.interests}
        onChange={setChoice('interests')}
        multi
      />

      <Text style={styles.label}>PACE</Text>
      <ChoiceChips options={PACE} value={choices.pace} onChange={setChoice('pace')} equal />

      <Text style={styles.label}>BUDGET</Text>
      <ChoiceChips options={BUDGET} value={choices.budget} onChange={setChoice('budget')} equal />

      <Text style={styles.label}>GETTING AROUND</Text>
      <ChoiceChips options={TRANSPORT} value={choices.transport} onChange={setChoice('transport')} />
    </>
  );

  const timeRow = (key, addLabel, setLabel, defaultMinutes) =>
    choices[key] === null ? (
      <TouchableOpacity
        style={[styles.addTime, styles.row]}
        activeOpacity={0.8}
        onPress={() => setChoice(key)(defaultMinutes)}
      >
        <Ionicons name="add" size={16} color={dark.accentGreen} />
        <Text style={styles.addTimeText}>{addLabel}</Text>
      </TouchableOpacity>
    ) : (
      <TimeStepper
        label={setLabel}
        value={choices[key]}
        onChange={setChoice(key)}
        onClear={() => setChoice(key)(null)}
        style={styles.row}
      />
    );

  const stepTwo = () => (
    <>
      <Text style={styles.label}>ARRIVAL & DEPARTURE</Text>
      {timeRow('arrival', 'Add arrival time', 'Arrival', DEFAULT_ARRIVAL_MINUTES)}
      {timeRow('departure', 'Add departure time', 'Departure', DEFAULT_DEPARTURE_MINUTES)}

      <Text style={styles.label}>FOOD PREFERENCE</Text>
      <ChoiceChips options={FOOD} value={choices.food} onChange={setChoice('food')} clearable />

      <Text style={styles.label}>DAY START</Text>
      <ChoiceChips options={DAY_START} value={choices.dayStart} onChange={setChoice('dayStart')} />

      <Text style={styles.label}>ACCESSIBILITY</Text>
      <ChoiceChips
        options={ACCESSIBILITY}
        value={choices.accessibility}
        onChange={setChoice('accessibility')}
      />

      <Text style={styles.label}>MUST-DO OR AVOID</Text>
      <TextField
        value={choices.notes}
        onChangeText={setChoice('notes')}
        placeholder="e.g. Sunset at the fort is a must. Skip museums."
        maxLength={300}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        inputStyle={styles.notesInput}
        style={styles.notes}
      />
    </>
  );

  return (
    <DarkScreen>
      <Root
        style={[styles.flex, !IS_IOS && { paddingBottom: lift }]}
        {...(IS_IOS ? { behavior: 'padding' } : { onLayout })}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={goBackOneStep} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {step === 1 ? 'Plan with AI' : 'More options'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={dark.accentGreen} />
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // The notes box is the last thing on step 2: once the keyboard has
              // taken its share of the screen, bring the box back into view.
              onLayout={() => {
                if (keyboardVisible && step === 2) scrollRef.current?.scrollToEnd({ animated: true });
              }}
            >
              {step === 1 ? stepOne() : stepTwo()}
            </ScrollView>

            {/* Clear the gesture bar when resting at the bottom; sit tight on the keyboard otherwise. */}
            <View
              style={[
                styles.footer,
                { paddingBottom: keyboardVisible ? spacing.sm + 2 : Math.max(insets.bottom, spacing.lg) },
              ]}
            >
              <GradientButton
                title="Create itinerary"
                onPress={() => start(replace)}
                loading={submitting}
              />
              {step === 1 ? (
                <TouchableOpacity
                  style={styles.moreLink}
                  activeOpacity={0.7}
                  onPress={() => setStep(2)}
                  disabled={submitting}
                >
                  <Text style={styles.moreLinkText}>More options</Text>
                  <Ionicons name="chevron-forward" size={14} color={dark.accentGreen} />
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </Root>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Edit Day's header: circular back button, left-aligned title.
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

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },

  label: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  // Add Activity's field box.
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
  row: { marginBottom: spacing.sm },
  rowText: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600' },
  rowPlaceholder: { color: dark.textMuted, fontWeight: '400' },
  helper: {
    color: dark.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: spacing.sm,
  },
  errorText: { color: '#F87171', fontSize: 11, marginTop: -2, marginBottom: spacing.sm },

  addTime: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,196,208,0.45)',
    borderRadius: radius.md,
    minHeight: 48,
  },
  addTimeText: { color: dark.accentGreen, fontSize: 13, fontWeight: '700' },

  notes: { marginBottom: 0 },
  notesInput: { minHeight: 96, paddingTop: spacing.md - 2 },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.md - 2,
  },
  moreLinkText: { color: dark.accentGreen, fontSize: 14, fontWeight: '700' },
});

export default AiItineraryPrefsScreen;
