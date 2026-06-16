import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useMemo } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useClients } from '../../src/hooks/useClients';
import { getRelativeDateString } from '../../src/utils/dateHelpers';
import { getLabelColor } from '../../src/utils/labelHelpers';
import { spacing, font } from '../../src/theme';
import Sparkline from '../../src/components/Sparkline';

const BLUE = '#5B8DEF';
const BLUE_LIGHT = '#EEF3FD';
const PAGE_BG = '#F4F5F7';
const DARK = '#111827';
const GRAY = '#6B7280';
const BORDER = '#E5E7EB';
const DANGER = '#c62828';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 4,
  elevation: 2,
};

// ─── Attention logic ──────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function isMoodDeclining(recentEntries) {
  const moods = (recentEntries || []).slice(0, 3).map(e => e.mood).filter(Boolean);
  return moods.length === 3 && moods[0] < moods[1] && moods[1] < moods[2];
}

function needsAttention(client) {
  return (
    !client.latestEntry ||
    daysSince(client.latestEntry.date) >= 3 ||
    (client.labels?.length > 0) ||
    isMoodDeclining(client.recentEntries)
  );
}

function sparklineColor(recentEntries) {
  const latest = recentEntries?.[0]?.mood;
  if (latest == null) return GRAY;
  if (latest >= 7) return '#2a7a3b';
  if (latest <= 4) return DANGER;
  return GRAY;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Client card ─────────────────────────────────────────────────────────────

function ClientCard({ client, onPress, attention }) {
  const moodValues = (client.recentEntries || [])
    .map(e => e.mood)
    .filter(Boolean)
    .reverse();

  return (
    <TouchableOpacity
      style={[styles.clientCard, CARD_SHADOW, attention && styles.clientCardAttention]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.clientRow}>
        {/* Initials avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(client.displayName)}</Text>
        </View>

        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{client.displayName}</Text>
          <Text style={styles.clientEmail}>{client.email}</Text>
          {client.latestEntry ? (
            <Text style={styles.lastSeen}>
              Last check-in: {getRelativeDateString(client.latestEntry.date)}
            </Text>
          ) : (
            <Text style={[styles.lastSeen, { color: DANGER }]}>Never checked in</Text>
          )}
        </View>

        {/* Chevron */}
        <View style={styles.chevronWrap}>
          <View style={[styles.chevronBar, { transform: [{ rotate: '45deg' }, { translateY: 2.5 }] }]} />
          <View style={[styles.chevronBar, { transform: [{ rotate: '-45deg' }, { translateY: -2.5 }] }]} />
        </View>
      </View>

      {moodValues.length >= 2 && (
        <View style={{ marginTop: 10, paddingHorizontal: 2 }}>
          <Sparkline
            values={moodValues}
            height={26}
            color={sparklineColor(client.recentEntries)}
          />
        </View>
      )}

      {client.labels?.length > 0 && (
        <View style={styles.labels}>
          {client.labels.map(l => (
            <View key={l} style={[styles.label, labelStyle(getLabelColor(l))]}>
              <Text style={[styles.labelText, labelTextStyle(getLabelColor(l))]}>
                {l.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TherapistHome() {
  const { currentUser } = useApp();
  const { clients, loading, error } = useClients(currentUser?.uid);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    ),
    [clients, search]
  );

  const attentionClients = useMemo(
    () => filtered.filter(needsAttention),
    [filtered]
  );

  const navigate = (id) => router.push(`/(therapist)/client/${id}`);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Client Database</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {clients.length} client{clients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.hamburgerBtn}
          onPress={() => setMenuOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      </View>

      <View style={styles.headerDivider} />

      {/* Hamburger menu overlay */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        >
          <View style={[styles.menuDrawer, CARD_SHADOW]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); router.push('/(therapist)/settings'); }}
            >
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.searchInput, searchFocused && styles.searchInputFocused]}
          placeholder="Search clients..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Failed to load</Text>
          <Text style={styles.emptyDesc}>Check your connection and try again.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {search ? 'No results' : 'No clients yet'}
          </Text>
          <Text style={styles.emptyDesc}>
            {search
              ? 'Try a different search term.'
              : 'Go to Settings to find your pairing code and share it with clients.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Needs Attention section */}
          {attentionClients.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Needs Attention</Text>
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{attentionClients.length}</Text>
                </View>
              </View>
              {attentionClients.map(client => (
                <ClientCard
                  key={`attn-${client.id}`}
                  client={client}
                  onPress={() => navigate(client.id)}
                  attention
                />
              ))}
              <View style={styles.sectionSpacer} />
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Clients</Text>
              </View>
            </>
          )}

          {filtered.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onPress={() => navigate(client.id)}
              attention={false}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function labelStyle(colorKey) {
  const map = {
    critical: { backgroundColor: '#FDECEA', borderColor: '#c62828' },
    high:     { backgroundColor: '#FFF3E0', borderColor: '#f57c00' },
    medium:   { backgroundColor: '#FFFDE7', borderColor: '#f57f17' },
    normal:   { backgroundColor: '#F3F4F6', borderColor: BORDER },
  };
  return map[colorKey] || map.normal;
}

function labelTextStyle(colorKey) {
  const map = {
    critical: { color: '#c62828' },
    high:     { color: '#e65100' },
    medium:   { color: '#7c5700' },
    normal:   { color: GRAY },
  };
  return map[colorKey] || map.normal;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: String(font.bold),
    color: DARK,
  },
  countBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 4,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: String(font.semibold),
    color: BLUE,
    letterSpacing: 0.2,
  },
  headerDivider: {
    height: 3,
    backgroundColor: BLUE,
  },
  hamburgerBtn: {
    paddingVertical: 4,
    justifyContent: 'center',
    gap: 5,
    marginTop: 4,
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    backgroundColor: DARK,
    borderRadius: 1,
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuDrawer: {
    backgroundColor: '#fff',
    marginTop: 80,
    marginRight: spacing.lg,
    minWidth: 180,
    borderRadius: 12,
    paddingVertical: spacing.sm,
  },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: String(font.semibold),
    color: DARK,
  },

  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  searchInput: {
    backgroundColor: PAGE_BG,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: DARK,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  searchInputFocused: {
    borderColor: BLUE,
    backgroundColor: '#fff',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: String(font.semibold),
    color: DARK,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: GRAY,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },

  scroll: { paddingTop: spacing.sm, paddingBottom: 80 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: GRAY,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    backgroundColor: DANGER,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: '#fff',
  },
  sectionSpacer: {
    height: 8,
  },

  clientCard: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    borderRadius: 12,
    padding: spacing.md,
  },
  clientCardAttention: {
    backgroundColor: '#FEF2F2',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BLUE_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: String(font.bold),
    color: BLUE,
  },
  clientInfo: { flex: 1 },
  clientName: {
    fontSize: 15,
    fontWeight: String(font.semibold),
    color: DARK,
  },
  clientEmail: { fontSize: 12, color: GRAY, marginTop: 1 },
  lastSeen: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  chevronWrap: {
    width: 8,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  chevronBar: {
    width: 7,
    height: 1.5,
    backgroundColor: '#C8CDD5',
    borderRadius: 1,
    position: 'absolute',
  },

  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  label: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  labelText: { fontSize: 10, fontWeight: String(font.bold), letterSpacing: 0.3 },
});
