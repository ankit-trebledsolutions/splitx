import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark, spacing } from '../theme';

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const defaultCheckIn = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(12, 0, 0, 0);
  return date;
};

const NewStaySheet = ({ visible, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [nights, setNights] = useState(2);
  const [guests, setGuests] = useState(2);
  const [pricePerNight, setPricePerNight] = useState('');
  const [amenities, setAmenities] = useState('');
  const [stars, setStars] = useState(4);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setAddress('');
    setCheckIn(defaultCheckIn());
    setNights(2);
    setGuests(2);
    setPricePerNight('');
    setAmenities('');
    setStars(4);
    setError('');
    setSaving(false);
  }, [visible]);

  const shiftCheckIn = (days) => {
    setCheckIn((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

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
        stars,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="New Stay"
      subtitle="Add where the group is staying"
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

      <View style={sheetStyles.row}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Check-In</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity onPress={() => shiftCheckIn(-1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="calendar-outline" size={14} color={dark.accentGreen} />
              <Text style={sheetStyles.stepText}>{dateLabel(checkIn)}</Text>
            </View>
            <TouchableOpacity onPress={() => shiftCheckIn(1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.half}>
          <Text style={sheetStyles.label}>Nights</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity
              onPress={() => setNights((n) => Math.max(1, n - 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="remove" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <Text style={sheetStyles.stepText}>
              {nights} · out {dateLabel(checkOut)}
            </Text>
            <TouchableOpacity
              onPress={() => setNights((n) => Math.min(60, n + 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="add" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={sheetStyles.row}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Guests</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity
              onPress={() => setGuests((g) => Math.max(1, g - 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="remove" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="people-outline" size={14} color={dark.accentGreen} />
              <Text style={sheetStyles.stepText}>{guests}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setGuests((g) => Math.min(50, g + 1))}
              style={sheetStyles.stepButton}
            >
              <Ionicons name="add" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.half}>
          <Text style={sheetStyles.label}>Price / Night ($)</Text>
          <TextField
            value={pricePerNight}
            onChangeText={setPricePerNight}
            placeholder="95"
            keyboardType="decimal-pad"
            style={styles.fieldTight}
          />
        </View>
      </View>

      <Text style={sheetStyles.label}>Stars</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((value) => (
          <TouchableOpacity key={value} onPress={() => setStars(value)} activeOpacity={0.7}>
            <Ionicons
              name={value <= stars ? 'star' : 'star-outline'}
              size={26}
              color={value <= stars ? '#F5B342' : dark.textMuted}
            />
          </TouchableOpacity>
        ))}
      </View>

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
  fieldTight: { marginBottom: 0 },
  stepperTight: { marginBottom: 0 },
  starRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
});

export default NewStaySheet;
