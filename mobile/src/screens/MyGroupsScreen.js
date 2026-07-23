import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import AiItineraryModal from '../components/AiItineraryModal';
import { fetchGroups } from '../api/groups.api';
import { initials } from '../utils/format';
import { dark, radius, spacing } from '../theme';

const MyGroupsScreen = ({ navigation, route }) => {
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [itineraryFor, setItineraryFor] = useState(null);

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

  // Offer the AI itinerary once, right after a trip group is created.
  const { newGroupId, offerItinerary } = route.params ?? {};
  useEffect(() => {
    if (!offerItinerary || !newGroupId) return;
    const group = groups.find((g) => g._id === newGroupId);
    if (group) setItineraryFor(group);
  }, [offerItinerary, newGroupId, groups]);

  const dismissItinerary = () => {
    setItineraryFor(null);
    navigation.setParams({ offerItinerary: false });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  const renderGroup = ({ item }) => {
    const memberCount = item.members?.length ?? 0;
    const subtitle =
      item.description ||
      `${memberCount} member${memberCount === 1 ? '' : 's'}${
        item.totalDays ? ` · ${item.totalDays} days` : ''
      }`;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('GroupChat', { groupId: item._id, name: item.name })}
      >
        <LinearGradient
          colors={[dark.accentBlue, dark.accentGreen]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </LinearGradient>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={dark.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <DarkScreen>
      <ScreenHeader
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
        rightIcon="menu"
        onRightPress={() => navigation.navigate('Profile')}
      />

      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => item._id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark.textMuted} />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>My Groups</Text>
            <Text style={styles.subtitle}>
              You have {groups.length} active group{groups.length === 1 ? '' : 's'} this month
            </Text>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Find a trip..."
              style={styles.search}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyBody}>
              Create a group or join one with an invite link to start splitting expenses.
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('GroupAction')}
      >
        <LinearGradient
          colors={[dark.accentBlue, dark.accentGreen]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={28} color="#04121C" />
        </LinearGradient>
      </TouchableOpacity>

      <AiItineraryModal
        visible={!!itineraryFor}
        groupName={itineraryFor?.name}
        onAccept={() => {
          const group = itineraryFor;
          dismissItinerary();
          Alert.alert(
            'Itinerary',
            `AI itinerary planning for "${group?.name}" is coming soon.`
          );
        }}
        onSkip={dismissItinerary}
      />
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { color: dark.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: dark.textMuted, fontSize: 14, marginTop: spacing.xs },
  search: { marginTop: spacing.lg, marginBottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#04121C', fontSize: 15, fontWeight: '800' },
  cardBody: { flex: 1 },
  cardTitle: { color: dark.text, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyTitle: { color: dark.text, fontSize: 17, fontWeight: '700' },
  emptyBody: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MyGroupsScreen;
