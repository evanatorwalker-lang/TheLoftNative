import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useApp } from '../../src/context/AppContext';
import { useEntries } from '../../src/hooks/useEntries';
import { calculateStreak, getTrophyTier, isFiveFactorEntry } from '../../src/utils/streakCalculator';
import { colors, font } from '../../src/theme';
import HomeScreen from '../../src/screens/client/Home';
import InsightsScreen from '../../src/screens/client/Insights';
import TrophyScreen from '../../src/screens/client/Trophy';
import SettingsScreen from '../../src/screens/client/Settings';

const PAGES = [
  { key: 'home', title: 'Home', icon: 'home' },
  { key: 'insights', title: 'Insights', icon: 'bar-chart' },
  { key: 'trophy', title: 'Trophy', icon: 'trophy' },
  { key: 'settings', title: 'Settings', icon: 'settings' },
];

// PagerView drives page transitions (tap-to-navigate only — user-swipe is
// disabled below); screens live as plain components in src/screens/client/
// rather than separate routes since PagerView takes children, not routes.
export default function ClientTabsRoot() {
  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);
  const insets = useSafeAreaInsets();

  // Just for the trophy tab's tier-colored icon — independent of which
  // page is focused, same tradeoff as every screen fetching its own entries.
  const { currentUser } = useApp();
  const { entries = [] } = useEntries(currentUser?.uid);
  const { currentStreak } = calculateStreak(entries.filter(isFiveFactorEntry));
  const trophyTier = getTrophyTier(currentStreak);

  const goToPage = (i) => {
    if (i === page) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pagerRef.current?.setPageWithoutAnimation(i);
    setPage(i);
  };

  return (
    <View style={{ flex: 1 }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        scrollEnabled={false}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        <View key="0" style={{ flex: 1 }}><HomeScreen /></View>
        <View key="1" style={{ flex: 1 }}><InsightsScreen /></View>
        <View key="2" style={{ flex: 1 }}><TrophyScreen /></View>
        <View key="3" style={{ flex: 1 }}><SettingsScreen /></View>
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 6 }]}>
        {PAGES.map((p, i) => {
          const focused = page === i;
          const labelColor = focused ? colors.primary : colors.textSecondary;
          const iconColor = p.key === 'trophy' ? trophyTier.color : labelColor;
          return (
            <TouchableOpacity key={p.key} style={styles.tabItem} onPress={() => goToPage(i)}>
              <Ionicons name={focused ? p.icon : `${p.icon}-outline`} size={22} color={iconColor} />
              <Text style={[styles.tabLabel, { color: labelColor }]}>
                {p.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: font.medium,
  },
});
