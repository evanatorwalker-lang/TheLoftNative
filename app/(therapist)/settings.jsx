import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { logout } from '../../src/services/auth.service';
import { spacing, font } from '../../src/theme';

const BLUE       = '#5B8DEF';
const BLUE_LIGHT = '#EEF3FD';
const PAGE_BG    = '#F4F5F7';
const DARK       = '#111827';
const GRAY       = '#6B7280';
const BORDER     = '#E5E7EB';
const DANGER     = '#c62828';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 4,
  elevation: 2,
};

export default function TherapistSettings() {
  const { currentUser } = useApp();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
            router.replace('/(auth)/login');
          } catch {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Clients</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Account & Client Pairing</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Account card */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={[styles.card, CARD_SHADOW]}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Name</Text>
            <Text style={styles.infoValue}>{currentUser?.displayName || '—'}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoKey}>Email</Text>
            <Text style={styles.infoValue}>{currentUser?.email || '—'}</Text>
          </View>
        </View>

        {/* Pairing code card */}
        {currentUser?.pairingCode && (
          <>
            <Text style={styles.sectionLabel}>Client Pairing Code</Text>
            <View style={[styles.codeCard, CARD_SHADOW]}>
              <Text style={styles.codeText}>{currentUser.pairingCode}</Text>
              <Text style={styles.codeHint}>Share this code with clients to connect them to your account</Text>
            </View>
          </>
        )}

        {/* Sign out */}
        <View style={styles.signOutSection}>
          <TouchableOpacity
            style={[styles.signOutBtn, loggingOut && { opacity: 0.5 }]}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator color={DANGER} />
            ) : (
              <Text style={styles.signOutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },

  headerBar: {
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backBtnText: {
    fontSize: 14,
    fontWeight: String(font.semibold),
    color: BLUE,
  },

  titleRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 22,
    fontWeight: String(font.bold),
    color: DARK,
  },
  subtitle: {
    fontSize: 13,
    color: GRAY,
    marginTop: 2,
  },

  scroll: {
    padding: spacing.lg,
    paddingBottom: 60,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: BLUE,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: spacing.md,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  infoKey: {
    fontSize: 13,
    color: GRAY,
    fontWeight: String(font.medium),
  },
  infoValue: {
    fontSize: 13,
    color: DARK,
    fontWeight: String(font.semibold),
    maxWidth: '60%',
    textAlign: 'right',
  },

  codeCard: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  codeText: {
    fontSize: 34,
    fontWeight: String(font.bold),
    color: BLUE,
    letterSpacing: 8,
    marginBottom: spacing.sm,
  },
  codeHint: {
    fontSize: 12,
    color: GRAY,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 240,
  },

  signOutSection: {
    marginTop: spacing.xl,
  },
  signOutBtn: {
    borderWidth: 1.5,
    borderColor: DANGER,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: String(font.semibold),
    color: DANGER,
    letterSpacing: 0.2,
  },
});
