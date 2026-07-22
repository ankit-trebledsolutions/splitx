import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGroups, joinGroup } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import TextField from '../components/TextField';
import EmptyState from '../components/EmptyState';
import { colors, radius, spacing } from '../theme';
import { initials } from '../utils/format';

const GroupsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await fetchGroups());
    } catch (err) {
      Alert.alert('Could not load groups', err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    try {
      const group = await joinGroup(inviteCode.trim());
      setInviteCode('');
      await load();
      navigation.navigate('GroupDetail', { groupId: group._id, name: group.name });
    } catch (err) {
      Alert.alert('Could not join group', err.message);
    } finally {
      setJoining(false);
    }
  };

  const renderGroup = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item._id, name: item.name })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(item.name)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardSubtitle}>
          {item.members.length} member{item.members.length === 1 ? '' : 's'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item._id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.greeting}>Hi {user?.name?.split(' ')[0]} 👋</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.profileLink}>Profile</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No groups yet"
            subtitle="Create a group or join one with an invite code."
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button title="Create a group" onPress={() => navigation.navigate('CreateGroup')} />
            <View style={styles.joinRow}>
              <TextField
                variant="light"
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Invite code"
                autoCapitalize="characters"
                style={styles.joinInput}
              />
              <Button
                title="Join"
                variant="outline"
                onPress={handleJoin}
                loading={joining}
                style={styles.joinButton}
              />
            </View>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  profileLink: { color: colors.primary, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  footer: { marginTop: spacing.lg },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  joinInput: { flex: 1, marginBottom: 0 },
  joinButton: { paddingHorizontal: spacing.lg },
});

export default GroupsScreen;
