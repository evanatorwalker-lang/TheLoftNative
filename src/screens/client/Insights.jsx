import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useEntries } from '../../hooks/useEntries';
import { getRelativeDateString } from '../../utils/dateHelpers';
import { formatActivity } from '../../utils/labelHelpers';
import { colors, spacing, radius, font } from '../../theme';
import { MoodFace } from '../../components/MoodFace';

function MetricBar({ label, value, max = 10, color = colors.primary }) {
  return (
    <View style={barStyles.container}>
      <View style={barStyles.header}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={barStyles.value}>{value}/{max}</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${(value / max) * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, color: colors.textSecondary },
  value: { fontSize: 13, fontFamily: font.semibold, color: colors.text },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  fill: { height: 6, borderRadius: 3 },
});

export default function InsightsScreen() {
  const { currentUser } = useApp();
  const { entries = [], loading } = useEntries(currentUser?.uid);
  const router = useRouter();

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Insights</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="sparkles-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Your story starts here</Text>
            <Text style={styles.emptyDesc}>
              Do your first check-in and your mood trends, focus scores, and history will all show up right here.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(client)/checkin-daily')}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.white} />
              <Text style={styles.emptyBtnText}>Start your first check-in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Summary stats — mood-only entries carry mood/focus */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{entries.length}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {(() => {
                    const moodEntries = entries.filter(e => e.mood != null);
                    return moodEntries.length
                      ? (moodEntries.reduce((s, e) => s + e.mood, 0) / moodEntries.length).toFixed(1)
                      : '—';
                  })()}
                </Text>
                <Text style={styles.statLabel}>Avg Mood</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {(() => {
                    const focusEntries = entries.filter(e => e.focus != null);
                    return focusEntries.length
                      ? (focusEntries.reduce((s, e) => s + e.focus, 0) / focusEntries.length).toFixed(1)
                      : '—';
                  })()}
                </Text>
                <Text style={styles.statLabel}>Avg Focus</Text>
              </View>
            </View>

            {/* Entry history */}
            <Text style={styles.sectionTitle}>History</Text>
            {entries.map(entry => {
              const isFiveFactors = entry.type === 'fiveFactors';
              const tags = isFiveFactors
                ? [...(entry.movementActivities || []), ...(entry.outsideActivities || [])]
                : entry.activities;
              return (
                <View key={entry.id} style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <View>
                      <Text style={styles.entryDate}>
                        {isFiveFactors ? '5 Things · ' : 'Mood · '}{getRelativeDateString(entry.date)}
                      </Text>
                      {entry.checkinTime && (
                        <Text style={styles.entryTime}>{entry.checkinTime}</Text>
                      )}
                    </View>
                    {isFiveFactors
                      ? <Ionicons name="checkmark-done-circle" size={32} color={colors.primary} />
                      : <MoodFace mood={entry.mood ?? 5} size={32} color={colors.text} />}
                  </View>

                  {isFiveFactors ? (
                    <View style={styles.tagsRow}>
                      <View style={styles.tag}><Text style={styles.tagText}>Moved: {entry.movedYesterday ? 'Yes' : 'No'}</Text></View>
                      <View style={styles.tag}><Text style={styles.tagText}>Outside: {entry.wentOutside ? 'Yes' : 'No'}</Text></View>
                      <View style={styles.tag}><Text style={styles.tagText}>Social: {entry.socialized ? 'Yes' : 'No'}</Text></View>
                      <View style={styles.tag}><Text style={styles.tagText}>Sleep: {entry.sleepHours}h</Text></View>
                      <View style={styles.tag}><Text style={styles.tagText}>Ate well: {entry.ateWell ? 'Yes' : 'No'}</Text></View>
                    </View>
                  ) : (
                    <>
                      <MetricBar label="Mood" value={entry.mood} color={colors.primary} />
                      <MetricBar label="Stress" value={entry.stress} color={colors.warning} />
                      <MetricBar label="Focus" value={entry.focus} color={colors.success} />
                    </>
                  )}

                  {tags?.length > 0 && (
                    <View style={styles.tagsRow}>
                      {tags.map(a => (
                        <View key={a} style={[styles.tag, styles.tagActivity]}>
                          <Text style={styles.tagText}>{formatActivity(a)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {entry.meals ? (
                    <>
                      <Text style={styles.mealsLabel}>MEALS</Text>
                      <Text style={styles.journal}>{entry.meals}</Text>
                    </>
                  ) : null}

                  {entry.journal ? (
                    <Text style={styles.journal}>{entry.journal}</Text>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: {
    fontSize: 28,
    fontFamily: font.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontFamily: font.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 15,
    fontFamily: font.semibold,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  entryDate: {
    fontSize: 15,
    fontFamily: font.semibold,
    color: colors.text,
  },
  entryTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tag: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagActivity: {
    backgroundColor: '#F0FDF4',
  },
  tagText: {
    fontSize: 12,
    color: colors.primary,
  },
  journal: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  mealsLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
});
