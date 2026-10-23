import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { makeSheetStyles } from './FormSheet';
import TextField from './TextField';
import DateChip from './DateChip';
import CalendarPanel from './CalendarPanel';
import { useStyles, useTheme } from '../theme';

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const defaultCheckIn = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(12, 0, 0, 0);
  return date;
};

// `initial` is a suggested place ({ name, address, placeId }): the sheet opens
// with it filled in and sends the provider's id along, so the tab can mark it
// as added. Null for a stay typed from scratch.
const NewStaySheet = ({ visible, initial = null, onClose, onSubmit }) => {
  const theme = useTheme();
  const sheetStyles = useStyles(makeSheetStyles);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [nights, setNights] = useState(2);
  const [guests, setGuests] = useState(2);
  const [pricePerNight, setPricePerNight] = useState('');
  const [amenities, setAmenities] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setAddress(initial?.address ?? '');
    setCheckIn(defaultCheckIn());
    setNights(2);
    setGuests(2);
    setPricePerNight('');
    setAmenities('');
    setCalendarOpen(false);
    setError('');
    setSaving(false);
  }, [visible, initial]);

  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Give the stay a name');
      return;
    }
    const price = Number(pricePerNight);
    if (!pricePerNight || Number.isNaN(price) || price < 0) {
      setError('Enter the price per night');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        address: address.trim() || undefined,
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        guests,
        pricePerNight: price,
        amenities: amenities
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
          .slice(0, 12),
        placeId: initial?.placeId || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="New Stay"
      subtitle={initial ? 'Suggested for this trip. Check the dates and the price.' : 'Add where the group is staying'}
      submitLabel="Add Stay"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Hotel / Stay Name</Text>
      <TextField
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError('');
        }}
        placeholder="e.g. Shinjuku Granbell Hotel"
        error={error || undefined}
      />

      <Text style={sheetStyles.label}>Address</Text>
      <TextField value={address} onChangeText={setAddress} placeholder="e.g. 16-12 Kabukicho, Shinjuku" />

      {/* Rating and review come later, from the stay's card, once the group
          has actually stayed there. */}
      <Text style={sheetStyles.label}>Check-In</Text>
      <DateChip
        value={checkIn}
        onChange={setCheckIn}
        open={calendarOpen}
        onToggle={() => setCalendarOpen((open) => !open)}
        label={(date) => `${dateLabel(date)} · out ${dateLabel(checkOut)}`}
        style={calendarOpen ? styles.stepperTight : null}
      />
      {calendarOpen ? (
        <CalendarPanel
          value={checkIn}
          onChange={setCheckIn}
          onDone={() => setCalendarOpen(false)}
          allowPast
        />
      ) : null}

      <View style={sheetStyles.row}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Nights</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity
              onPress={() => setNights((n) => Math.max(1, n - 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="remove" size={16} color={theme.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="moon-outline" size={14} color={theme.accentGreen} />
              <Text style={sheetStyles.stepText}>{nights}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setNights((n) => Math.min(60, n + 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="add" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.half}>
          <Text style={sheetStyles.label}>Guests</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity
              onPress={() => setGuests((g) => Math.max(1, g - 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="remove" size={16} color={theme.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="people-outline" size={14} color={theme.accentGreen} />
              <Text style={sheetStyles.stepText}>{guests}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setGuests((g) => Math.min(50, g + 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="add" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={sheetStyles.label}>Price / Night ($)</Text>
      <TextField
        value={pricePerNight}
        onChangeText={setPricePerNight}
        placeholder="95"
        keyboardType="decimal-pad"
      />

      <Text style={sheetStyles.label}>Amenities</Text>
      <TextField
        value={amenities}
        onChangeText={setAmenities}
        placeholder="Comma separated, e.g. Bar & Lounge, Gym, City View"
      />
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  half: { flex: 1 },
  stepperTight: { marginBottom: 0 },
});

export default NewStaySheet;
