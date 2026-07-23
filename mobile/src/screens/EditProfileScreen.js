import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import { useAuth } from '../context/AuthContext';
import { profileDefaults } from '../data/profile';
import { dark, spacing } from '../theme';

const EditProfileScreen = ({ navigation }) => {
  const { user, updateProfile } = useAuth();
  const profile = { ...profileDefaults, ...(user ?? {}) };

  const [form, setForm] = useState({
    name: profile.name,
    username: profile.username,
    email: profile.email,
    phone: profile.phone,
    bio: profile.bio,
  });
  const [errors, setErrors] = useState({});

  const setField = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const save = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    updateProfile({
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      bio: form.bio.trim(),
    });
    navigation.goBack();
  };

  return (
    <DarkScreen>
      <ScreenHeader title="Edit Profile" onBack={navigation.goBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <Avatar name={form.name} size={96} />
            <TouchableOpacity
              style={styles.cameraBadge}
              activeOpacity={0.8}
              onPress={() =>
                Alert.alert('Profile photo', 'Photo upload is not wired up yet.')
              }
            >
              <Ionicons name="camera" size={14} color="#04121C" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Alert.alert('Profile photo', 'Photo upload is not wired up yet.')}
          >
            <Text style={styles.changePhoto}>Change Profile Photo</Text>
          </TouchableOpacity>

          <TextField
            label="Full Name"
            value={form.name}
            onChangeText={setField('name')}
            placeholder="Jane Doe"
            error={errors.name}
          />
          <TextField
            label="Username"
            value={form.username}
            onChangeText={setField('username')}
            placeholder="janedoe"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Email"
            value={form.email}
            onChangeText={setField('email')}
            placeholder="jane.doe@outlook.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
          <TextField
            label="Phone Number"
            value={form.phone}
            onChangeText={setField('phone')}
            placeholder="+1 (555) 019-2834"
            keyboardType="phone-pad"
          />
          <TextField
            label="Bio"
            value={form.bio}
            onChangeText={setField('bio')}
            placeholder="Tell your friends a little about yourself"
            multiline
            textAlignVertical="top"
            inputStyle={styles.bioInput}
          />

          <GradientButton title="Save Changes" onPress={save} style={styles.button} />
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  avatarWrap: { alignSelf: 'center', marginTop: spacing.md },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: dark.accentGreen,
    borderWidth: 3,
    borderColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: {
    color: dark.accentGreen,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  bioInput: { height: 110, paddingTop: spacing.md },
  button: { marginTop: spacing.md },
});

export default EditProfileScreen;
