import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import Avatar from './Avatar';
import { dark, radius, spacing } from '../theme';

// Emoji stands in for the image until real upload exists (see Photo model).
const EMOJIS = ['🌅', '🎉', '🌃', '🍜', '⛩️', '🐟', '🌸', '🗼', '🍣', '🎮', '🎆', '⌨️', '🏞️', '🖼️', '🎇'];

// Tile background per emoji, matching the gallery mockup's coloured tiles.
const TILE_COLORS = [
  '#173A33', '#2A1540', '#1B2B4A', '#33230F', '#152A17',
  '#3A1730', '#301717', '#25143C', '#12303A',
];

const colorFor = (emoji) => {
  let hash = 0;
  for (let i = 0; i < emoji.length; i += 1) hash = (hash * 31 + emoji.charCodeAt(i)) % 9973;
  return TILE_COLORS[hash % TILE_COLORS.length];
};

const NewPhotoSheet = ({ visible, members = [], onClose, onSubmit }) => {
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [caption, setCaption] = useState('');
  const [tagged, setTagged] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmoji(EMOJIS[0]);
    setCaption('');
    setTagged([]);
    setSaving(false);
  }, [visible]);

  const toggleTag = (memberId) => {
    setTagged((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        emoji,
        color: colorFor(emoji),
        caption: caption.trim() || undefined,
        taggedMembers: tagged,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="Add Photo"
      subtitle="Camera roll upload is coming — pick a memory tile for now"
      submitLabel="Add to Gallery"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Memory</Text>
      <View style={styles.emojiGrid}>
        {EMOJIS.map((option) => {
          const active = emoji === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.emojiCell,
                { backgroundColor: colorFor(option) },
                active && styles.emojiCellActive,
              ]}
              activeOpacity={0.8}
              onPress={() => setEmoji(option)}
            >
              <Text style={styles.emoji}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={sheetStyles.label}>Caption</Text>
      <TextField value={caption} onChangeText={setCaption} placeholder="What's the moment?" />

      <Text style={sheetStyles.label}>Who's in it?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={sheetStyles.row}>
          {members.map((member) => {
            const active = tagged.includes(member._id);
            return (
              <TouchableOpacity
                key={member._id}
                activeOpacity={0.8}
                onPress={() => toggleTag(member._id)}
                style={styles.member}
              >
                <Avatar
                  name={member.name}
                  size={40}
                  solid
                  style={active ? styles.memberActive : styles.memberIdle}
                />
                {active && <View style={styles.memberMark} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emojiCell: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellActive: { borderColor: dark.accentGreen },
  emoji: { fontSize: 24 },
  member: { position: 'relative' },
  memberIdle: { opacity: 0.45 },
  memberActive: { opacity: 1 },
  memberMark: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.accentGreen,
  },
});

export default NewPhotoSheet;
