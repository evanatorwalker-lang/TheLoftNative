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
import { useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useClients } from '../../src/hooks/useClients';
import { getRelativeDateString } from '../../src/utils/dateHelpers';
import { getLabelColor } from '../../src/utils/labelHelpers';
import { spacing, font } from '../../src/theme';

export default function TherapistHome() {
  const { currentUser } = useApp();
  const { clients, loading, error } = useClients(currentUser?.uid);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = clients.filter(c =>
    c.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CLIENT DATABASE</Text>
          <Text style={styles.subtitle}>
            {clients.length} CLIENT{clients.length !== 1 ? 'S' : ''}
          </Text>
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
          <View style={styles.menuDrawer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); router.push('/(therapist)/settings'); }}
            >
              <Text style={styles.menuItemText}>SETTINGS</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH CLIENTS..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>FAILED TO LOAD</Text>
          <Text style={styles.emptyDesc}>Check your connection and try again.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {search ? 'NO RESULTS' : 'NO CLIENTS YET'}
          </Text>
          <Text style={styles.emptyDesc}>
            {search
              ? 'Try a different search term.'
              : 'Go to Settings to find your pairing code and share it with clients.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {filtered.map(client => (
            <TouchableOpacity
              key={client.id}
              style={styles.clientCard}
              onPress={() => router.push(`/(therapist)/client/${client.id}`)}
            >
              <View style={styles.clientRow}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{client.displayName?.toUpperCase()}</Text>
                  <Text style={styles.clientEmail}>{client.email}</Text>
                  {client.latestEntry && (
                    <Text style={styles.lastSeen}>
                      Last check-in: {getRelativeDateString(client.latestEntry.date)}
                    </Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
              {client.labels?.some(l => l === 'Suicidal') && (
                <View style={styles.labels}>
                  {client.labels.filter(l => l === 'Suicidal').map(l => (
                    <View
                      key={l}
                      style={[styles.label, labelStyle(getLabelColor(l))]}
                    >
                      <Text style={[styles.labelText, labelTextStyle(getLabelColor(l))]}>
                        {l.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function labelStyle(colorKey) {
  const map = {
    critical: { backgroundColor: '#d32f2f', borderColor: '#b71c1c' },
    high:     { backgroundColor: '#f57c00', borderColor: '#e65100' },
    medium:   { backgroundColor: '#fbc02d', borderColor: '#f57f17' },
    normal:   { backgroundColor: '#fff',    borderColor: '#333' },
  };
  return map[colorKey] || map.normal;
}

function labelTextStyle(colorKey) {
  return { color: colorKey === 'medium' || colorKey === 'normal' ? '#000' : '#fff' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  headerDivider: {
    height: 3,
    backgroundColor: '#000',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  hamburgerBtn: {
    paddingVertical: 4,
    justifyContent: 'center',
    gap: 5,
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    backgroundColor: '#000',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuDrawer: {
    backgroundColor: '#fff',
    marginTop: 80,
    marginRight: spacing.lg,
    minWidth: 180,
    borderWidth: 2,
    borderColor: '#000',
    paddingVertical: spacing.sm,
  },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 1,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
    borderWidth: 1,
    borderColor: '#333',
    letterSpacing: 0.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: String(font.bold),
    color: '#000',
    textAlign: 'center',
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: { paddingBottom: 80 },
  clientCard: {
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientInfo: { flex: 1 },
  clientName: {
    fontSize: 15,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 0.5,
  },
  clientEmail: { fontSize: 12, color: '#666', marginTop: 2 },
  lastSeen: { fontSize: 11, color: '#999', marginTop: 2 },
  chevron: { fontSize: 18, color: '#ccc', alignSelf: 'center' },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  label: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    borderWidth: 2,
  },
  labelText: { fontSize: 9, fontWeight: String(font.bold), letterSpacing: 0.5 },
});
