import React from 'react';
import { View, Text, Image, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';

/**
 * Full-screen photo with a close button, the sender and caption, a download
 * button and — when `onDelete` is given — a delete button. Used by the gallery
 * and by photos sent in the chat. `image` is { uri, title, caption } or null.
 */
const ImageViewer = ({ image, onClose, onSave, saving = false, onDelete }) => (
  <Modal
    visible={Boolean(image)}
    transparent
    animationType="fade"
    statusBarTranslucent
    onRequestClose={onClose}
  >
    {image && (
      <View style={styles.viewer}>
        <Image source={{ uri: image.uri }} style={styles.image} resizeMode="contain" />

        <View style={styles.bar}>
          <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onClose}>
            <Ionicons name="close" size={20} color={dark.text} />
          </TouchableOpacity>
          <View style={styles.title}>
            <Text style={styles.name} numberOfLines={1}>
              {image.title}
            </Text>
            {image.caption ? (
              <Text style={styles.caption} numberOfLines={2}>
                {image.caption}
              </Text>
            ) : null}
          </View>
          {onSave && (
            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.8}
              disabled={saving}
              onPress={onSave}
            >
              {saving ? (
                <ActivityIndicator size="small" color={dark.text} />
              ) : (
                <Ionicons name="download-outline" size={19} color={dark.text} />
              )}
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onDelete}>
              <Ionicons name="trash-outline" size={18} color="#F87171" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )}
  </Modal>
);

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  name: { color: dark.text, fontSize: 15, fontWeight: '700' },
  caption: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
});

export default ImageViewer;
