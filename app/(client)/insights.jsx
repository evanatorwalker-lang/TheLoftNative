import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useEntries } from '../../src/hooks/useEntries';
import { getRelativeDateString } from '../../src/utils/dateHelpers';
import { formatActivity } from '../../src/utils/labelHelpers';
import { colors, spacing, radius, font } from '../../src/theme';
import { MoodFace } from '../../src/components/MoodFace';

const NAV_ITEMS = [
  { label: 'Home', icon: 'home-outline', route: '/(client)/' },
  { label: 'Insights', icon: 'bar-chart-outline', route: '/(client)/insights' },
  { label: 'Settings', icon: 'settings-outline', route: '/(client)/settings' },
];

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
  const [menuOpen, setMenuOpen] = useState(false);

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
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyDesc}>Complete your first check-in to see insights here.</Text>
          </View>
        ) : (
          <>
            {/* Summary stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{entries.length}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {(entries.reduce((s, e) => s + (e.mood || 0), 0) / entries.length).toFixed(1)}
                </Text>
                <Text style={styles.statLabel}>Avg Mood</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {(entries.reduce((s, e) => s + (e.focus || 0), 0) / entries.length).toFixed(1)}
                </Text>
                <Text style={styles.statLabel}>Avg Focus</Text>
              </View>
            </View>

            {/* Entry history */}
            <Text style={styles.sectionTitle}>History</Text>
            {entries.map(entry => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <View>
                    <Text style={styles.entryDate}>
                      {getRelativeDateString(entry.date)}
                    </Text>
                    {entry.checkinTime && (
                      <Text style={styles.entryTime}>{entry.checkinTime}</Text>
                    )}
                  </View>
                  <MoodFace mood={entry.mood ?? 5} size={32} color={colors.text} />
                </View>

                <MetricBar label="Mood" value={entry.mood} color={colors.primary} />
                <MetricBar label="Stress" value={entry.stress} color={colors.warning} />
                <MetricBar label="Focus" value={entry.focus} color={colors.success} />

                {entry.emotions?.length > 0 && (
                  <View style={styles.tagsRow}>
                    {entry.emotions.map(e => (
                      <View key={e} style={styles.tag}>
                        <Text style={styles.tagText}>{e}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {entry.activities?.length > 0 && (
                  <View style={styles.tagsRow}>
                    {entry.activities.map(a => (
                      <View key={a} style={[styles.tag, styles.tagActivity]}>
                        <Text style={styles.tagText}>{formatActivity(a)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {entry.journal ? (
                  <Text style={styles.journal}>{entry.journal}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuDropdown}>
            {NAV_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.menuItem,
                  item.label === 'Insights' && styles.menuItemActive,
                  i < NAV_ITEMS.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => { setMenuOpen(false); router.replace(item.route); }}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.label === 'Insights' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.menuItemLabel, item.label === 'Insights' && styles.menuItemLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  menuBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  menuOverlay: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    top: 90,
    right: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  menuItemActive: { backgroundColor: colors.primaryLight },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuItemLabel: { fontSize: 16, color: colors.textSecondary, fontFamily: font.medium },
  menuItemLabelActive: { color: colors.primary, fontFamily: font.semibold },
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
  },
  emptyTitle: { fontSize: 18, fontFamily: font.semibold, color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
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
});
