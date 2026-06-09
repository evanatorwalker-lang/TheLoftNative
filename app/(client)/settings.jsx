import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const NAV_ITEMS = [
  { label: 'Home',     icon: 'home-outline',     route: '/(client)/' },
  { label: 'Insights', icon: 'bar-chart-outline', route: '/(client)/insights' },
  { label: 'Settings', icon: 'settings-outline',  route: '/(client)/settings' },
];
import { useApp } from '../../src/context/AppContext';
import { logout } from '../../src/services/auth.service';
import { linkClientToTherapist, disconnectFromTherapist } from '../../src/services/pairing.service';
import { colors, spacing, radius, font } from '../../src/theme';

export default function SettingsScreen() {
  const { currentUser, updateUser } = useApp();
  const router = useRouter();
  const [pairingCode, setPairingCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLinkTherapist = async () => {
    const trimmedCode = pairingCode.trim().toUpperCase();
    if (trimmedCode.length !== 6 || !/^[A-Z0-9]{6}$/.test(trimmedCode)) {
      Alert.alert('Error', 'Please enter a valid 6-character pairing code (letters and numbers only).');
      return;
    }
    setLinking(true);
    try {
      const therapistId = await linkClientToTherapist(
        currentUser.uid,
        trimmedCode,
        { displayName: currentUser.displayName, email: currentUser.email }
      );
      updateUser({ therapistId, connectionMode: 'therapist' });
      setPairingCode('');
      Alert.alert('Connected!', 'You are now connected to your therapist.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Invalid pairing code.');
    } finally {
      setLinking(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Switch to Solo Mode',
      'This will disconnect you from your therapist. Your data stays private and you can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectFromTherapist(currentUser.uid, currentUser.therapistId);
              updateUser({ therapistId: undefined, connectionMode: 'solo' });
            } catch {
              Alert.alert('Error', 'Failed to disconnect. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
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
            Alert.alert('Error', 'Failed to sign out.');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Settings</Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Account info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              <Text style={styles.rowValue}>{currentUser?.displayName}</Text>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{currentUser?.email}</Text>
            </View>
          </View>
        </View>

        {/* Therapist connection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Therapist Connection</Text>
          <View style={styles.card}>
            {currentUser?.therapistId ? (
              <>
                <View style={styles.connected}>
                  <Text style={styles.connectedLabel}>Connected to Therapist</Text>
                  <Text style={styles.connectedSub}>Your check-ins are shared with your therapist</Text>
                </View>
                <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                  <Text style={styles.disconnectButtonText}>Switch to Solo Mode</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.soloBadge}>
                  <Text style={styles.soloLabel}>Solo Mode</Text>
                  <Text style={styles.soloBadgeSub}>Your data stays private</Text>
                </View>
                <Text style={styles.cardDesc}>
                  Have a therapist? Enter their pairing code to connect.
                </Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="A4K9P2"
                  placeholderTextColor={colors.textSecondary}
                  value={pairingCode}
                  onChangeText={text => setPairingCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.button, linking && styles.buttonDisabled]}
                  onPress={handleLinkTherapist}
                  disabled={linking}
                >
                  {linking ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>Connect to Therapist</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.dangerButton, loggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <Text style={styles.dangerButtonText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuDropdown}>
            {NAV_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.menuItem,
                  item.label === 'Settings' && styles.menuItemActive,
                  i < NAV_ITEMS.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => { setMenuOpen(false); router.replace(item.route); }}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.label === 'Settings' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.menuItemLabel, item.label === 'Settings' && styles.menuItemLabelActive]}>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: String(font.bold),
    color: colors.text,
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
  menuItemLabel: { fontSize: 16, color: colors.textSecondary, fontWeight: String(font.medium) },
  menuItemLabelActive: { color: colors.primary, fontWeight: String(font.semibold) },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 13,
    fontWeight: String(font.semibold),
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 15, color: colors.textSecondary },
  connected: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.md },
  connectedLabel: { fontSize: 15, color: colors.success, fontWeight: String(font.semibold) },
  connectedSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: String(font.medium),
  },
  soloBadge: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.sm },
  soloLabel: { fontSize: 15, color: colors.primary, fontWeight: String(font.semibold) },
  soloBadgeSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  cardDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.background,
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: String(font.bold),
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: String(font.semibold),
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  dangerButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: String(font.semibold),
  },
});
