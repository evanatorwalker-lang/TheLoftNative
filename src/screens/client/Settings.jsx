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
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { reschedule, cancelAllNotifications } from '../../services/notification.service';
import { timeStringToDate, dateToTimeString, formatTime } from '../../utils/timeHelpers';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useApp } from '../../context/AppContext';
import { logout } from '../../services/auth.service';
import { linkClientToTherapist, disconnectFromTherapist } from '../../services/pairing.service';
import { colors, spacing, radius, font } from '../../theme';

export default function SettingsScreen() {
  const { currentUser, updateUser } = useApp();
  const router = useRouter();
  const [pairingCode, setPairingCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(currentUser?.notificationsEnabled !== false);
  const [notifTime, setNotifTime] = useState(currentUser?.notificationTime || '09:00');
  const [therapistMsgNotif, setTherapistMsgNotif] = useState(currentUser?.therapistMessageNotif !== false);

  const saveNotifPrefs = async (enabled, time) => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        notificationsEnabled: enabled,
        notificationTime: time,
      });
      updateUser({ notificationsEnabled: enabled, notificationTime: time });
      if (enabled) {
        await reschedule(time);
      } else {
        await cancelAllNotifications();
      }
    } catch {
      Alert.alert('Error', 'Could not save notification preferences.');
    }
  };

  const handleToggleNotif = async (value) => {
    setNotifEnabled(value);
    await saveNotifPrefs(value, notifTime);
  };

  const handleToggleTherapistMsgNotif = async (value) => {
    setTherapistMsgNotif(value);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { therapistMessageNotif: value });
      updateUser({ therapistMessageNotif: value });
    } catch {
      Alert.alert('Error', 'Could not save preference.');
      setTherapistMsgNotif(!value);
    }
  };

  const handleTimeChange = (_, date) => {
    if (!date) return;
    const newTime = dateToTimeString(date);
    setNotifTime(newTime);
  };

  const handleTimeConfirm = async () => {
    setTimePickerOpen(false);
    if (notifEnabled) await saveNotifPrefs(true, notifTime);
  };


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
        { username: currentUser.username }
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
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Account info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.rowLabel}>Username</Text>
              <Text style={styles.rowValue}>{currentUser?.username}</Text>
            </View>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Daily reminder</Text>
              <Switch
                value={notifEnabled}
                onValueChange={handleToggleNotif}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Therapist messages</Text>
              <Switch
                value={therapistMsgNotif}
                onValueChange={handleToggleTherapistMsgNotif}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
            <TouchableOpacity
              style={[styles.row, !notifEnabled && { opacity: 0.4 }]}
              onPress={() => notifEnabled && setTimePickerOpen(true)}
              disabled={!notifEnabled}
            >
              <Text style={styles.rowLabel}>Reminder time</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.rowValue}>{formatTime(notifTime)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
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
      </KeyboardAvoidingView>

      {/* Time picker modal */}
      <Modal visible={timePickerOpen} transparent animationType="slide" onRequestClose={() => setTimePickerOpen(false)}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setTimePickerOpen(false)} />
          <View style={notifStyles.sheet}>
            <Text style={notifStyles.sheetTitle}>Reminder Time</Text>
            <DateTimePicker
              value={timeStringToDate(notifTime)}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
              style={{ width: '100%' }}
            />
            <TouchableOpacity style={notifStyles.confirmBtn} onPress={handleTimeConfirm}>
              <Text style={notifStyles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
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

const notifStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: String(font.semibold),
    color: colors.text,
    textAlign: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  confirmBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: String(font.semibold),
  },
});
