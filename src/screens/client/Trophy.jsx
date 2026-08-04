import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useEntries } from '../../hooks/useEntries';
import { calculateStreak, getTrophyTier, getMotivation, isFiveFactorEntry } from '../../utils/streakCalculator';
import { colors, spacing, radius, font } from '../../theme';

const TIERS = [
  { color: '#9ca3af', label: 'No Streak', range: '0 days' },
  { color: '#CD7F32', label: 'Bronze',    range: '1 – 6 days' },
  { color: '#C0C0C0', label: 'Silver',    range: '7 – 20 days' },
  { color: '#FFE066', label: 'Gold',      range: '21 – 49 days' },
  { color: '#B2EBF2', label: 'Platinum',  range: '50+ days' },
];

// Work-in-progress home for the tier system — previously a popup off the
// home screen, now its own tab so there's room to grow it later.
export default function TrophyScreen() {
  const { currentUser } = useApp();
  const { entries = [] } = useEntries(currentUser?.uid);
  const fiveFactorEntries = entries.filter(isFiveFactorEntry);
  const { currentStreak, longestStreak, totalCheckIns, lastCheckInDate } = calculateStreak(fiveFactorEntries);
  const trophyTier = getTrophyTier(currentStreak);

  return (
    <LinearGradient colors={['#0d1535', '#162040']} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.pageTitle}>Trophy Case</Text>

            <View style={[styles.accentBar, { backgroundColor: trophyTier.color }]} />

            <View style={[styles.tierBadge, { backgroundColor: trophyTier.color + '22' }]}>
              <Text style={[styles.tierBadgeText, { color: trophyTier.color }]}>
                ✦ {trophyTier.tier} ✦
              </Text>
            </View>

            <View style={[styles.glowCircle, { backgroundColor: trophyTier.color + '22' }]}>
              <Ionicons name={trophyTier.name} size={72} color={trophyTier.color} />
            </View>

            <Text style={[styles.heroNumber, { color: trophyTier.color }]}>{currentStreak}</Text>
            <Text style={styles.heroLabel}>DAY STREAK</Text>
            <Text style={styles.motivation}>{getMotivation(currentStreak)}</Text>

            <View style={styles.divider} />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: trophyTier.color }]}>{longestStreak}</Text>
                <Text style={styles.statLabel}>LONGEST</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: trophyTier.color }]}>{totalCheckIns}</Text>
                <Text style={styles.statLabel}>CHECK-INS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: trophyTier.color }]}>
                  {lastCheckInDate
                    ? new Date(lastCheckInDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>LAST CHECK-IN</Text>
              </View>
            </View>

            <View style={styles.tierListSection}>
              <Text style={styles.tierListTitle}>Tier System</Text>
              <Text style={styles.tierListSubtitle}>Based on your current daily streak</Text>
              {TIERS.map(t => (
                <View key={t.label} style={styles.tierListRow}>
                  <View style={[styles.tierListDot, { backgroundColor: t.color }]} />
                  <Text style={[styles.tierListLabel, { color: t.color }]}>{t.label}</Text>
                  <Text style={styles.tierListRange}>{t.range}</Text>
                </View>
              ))}
              <Text style={styles.tierListNote}>Missing a day resets your streak back to 0.</Text>
            </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pageTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    color: colors.white,
    marginBottom: spacing.lg,
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  tierBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 5,
    marginBottom: spacing.lg,
  },
  tierBadgeText: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.5,
  },
  glowCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroNumber: {
    fontSize: 62,
    fontFamily: font.bold,
    lineHeight: 68,
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2.5,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  motivation: {
    fontSize: 15,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginBottom: spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: font.bold,
  },
  statLabel: {
    fontSize: 8,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  tierListSection: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  tierListTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 2,
  },
  tierListSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  tierListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  tierListDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierListLabel: {
    fontSize: 14,
    fontFamily: font.semibold,
    flex: 1,
  },
  tierListRange: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  tierListNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
