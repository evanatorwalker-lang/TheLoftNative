import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { logout } from '../../src/services/auth.service';
import { spacing, font, colors } from '../../src/theme';

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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← CLIENTS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>SETTINGS</Text>
        <Text style={styles.subtitle}>Account & Client Pairing</Text>
      </View>
      <View style={styles.titleDivider} />

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>NAME</Text>
          <Text style={styles.infoValue}>{currentUser?.displayName || '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>EMAIL</Text>
          <Text style={styles.infoValue}>{currentUser?.email || '—'}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Pairing Code */}
      {currentUser?.pairingCode && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CLIENT PAIRING CODE</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{currentUser.pairingCode}</Text>
            </View>
            <Text style={styles.codeHint}>Share this code with clients to connect</Text>
          </View>
          <View style={styles.divider} />
        </>
      )}

      {/* Sign Out */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.signOutBtn, loggingOut && styles.signOutBtnDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.signOutText}>SIGN OUT</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: colors.text,
    letterSpacing: 1,
  },
  titleRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: String(font.bold),
    color: colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  titleDivider: {
    height: 3,
    backgroundColor: colors.text,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoKey: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: String(font.semibold),
  },
  codeBox: {
    borderWidth: 2,
    borderColor: colors.text,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  codeText: {
    fontSize: 32,
    fontWeight: String(font.bold),
    color: colors.text,
    letterSpacing: 8,
  },
  codeHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  signOutBtn: {
    borderWidth: 2,
    borderColor: colors.text,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutBtnDisabled: {
    opacity: 0.5,
  },
  signOutText: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: colors.text,
    letterSpacing: 1,
  },
});
