import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark, radius, spacing } from '../theme';

const EMOJIS = ['📍', '🎨', '🏙️', '⛩️', '🎮', '🐟', '🌸', '🗼', '🍣', '🏯', '🎡', '🌊'];

const NewAttractionSheet = ({ visible, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [rating, setRating] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setCategory('');
    setRating('');
    setDistanceKm('');
    setEmoji(EMOJIS[0]);
    setError('');
    setSaving(false);
  }, [visible]);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Give the attraction a name');
      return;
    }
    const parsedRating = rating ? Number(rating) : null;
    if (parsedRating != null && (Number.isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5)) {
      setError('Rating must be between 0 and 5');
      return;
    }
    const parsedDistance = distanceKm ? Number(distanceKm) : null;
    if (parsedDistance != null && (Number.isNaN(parsedDistance) || parsedDistance < 0)) {
      setError('Distance must be a positive number');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        category: category.trim() || undefined,
        rating: parsedRating ?? undefined,
        distanceKm: parsedDistance ?? undefined,
        emoji,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="New Attraction"
      subtitle="Add a place the group should check out"
      submitLabel="Add Attraction"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Name</Text>
      <TextField
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError('');
        }}
        placeholder="e.g. TeamLab Planets"
        error={error || undefined}
      />

      <Text style={sheetStyles.label}>Category</Text>
      <TextField value={category} onChangeText={setCategory} placeholder="e.g. Art & Immersive" />

      <View style={sheetStyles.row}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Rating (0–5)</Text>
          <TextField
            value={rating}
            onChangeText={setRating}
            placeholder="4.9"
            keyboardType="decimal-pad"
            style={styles.fieldTight}
          />
        </View>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Distance (km)</Text>
          <TextField
            value={distanceKm}
            onChangeText={setDistanceKm}
            placeholder="2.1"
            keyboardType="decimal-pad"
            style={styles.fieldTight}
          />
        </View>
      </View>

      <Text style={sheetStyles.label}>Icon</Text>
      <View style={styles.emojiGrid}>
        {EMOJIS.map((option) => {
          const active = emoji === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.emojiCell, active && styles.emojiCellActive]}
              activeOpacity={0.8}
              onPress={() => setEmoji(option)}
            >
              <Text style={styles.emoji}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  half: { flex: 1 },
  fieldTight: { marginBottom: 0 },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellActive: {
    borderColor: dark.accentGreen,
    backgroundColor: 'rgba(0,196,208,0.10)',
  },
  emoji: { fontSize: 20 },
});

export default NewAttractionSheet;
