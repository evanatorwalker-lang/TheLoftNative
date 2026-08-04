import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signUp } from '../../src/services/auth.service';
import DateTimePicker from '@react-native-community/datetimepicker';
import { requestPermissions, scheduleDailyReminder, scheduleStreakRisk } from '../../src/services/notification.service';
import { colors, spacing, radius, font } from '../../src/theme';

const STEPS = ['Details', 'Role', 'Connect', 'Notifications'];

const timeStringToDate = (str) => {
  const [hour, minute] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const dateToTimeString = (date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,20}$/;

export default function SignupScreen() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(null);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const lastStep = role === 'client' ? 3 : 2;
  const goNext = () => setStep(s => Math.min(s + 1, lastStep));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const validateStep0 = () => {
    if (!username.trim()) return 'Please choose a username.';
    if (!USERNAME_REGEX.test(username.trim())) {
      return 'Username must be 3-20 characters (letters, numbers, underscores, periods, hyphens).';
    }
    if (password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const handleNext = () => {
    if (step === 0) {
      const err = validateStep0();
      if (err) { Alert.alert('Error', err); return; }
    }
    if (step === 1 && !role) {
      Alert.alert('Error', 'Please select your role.');
      return;
    }
    goNext();
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const user = await signUp(username.trim(), password, role, reminderTime);

      // Set up notifications for clients
      if (role === 'client') {
        const granted = await requestPermissions();
        if (granted) {
          await scheduleDailyReminder(reminderTime);
          await scheduleStreakRisk();
        }
      }

      if (user.role === 'therapist') {
        router.replace('/(therapist)');
      } else {
        router.replace('/(client)');
      }
    } catch (error) {
      Alert.alert('Sign Up Failed', error.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>The Loft</Text>
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        {/* Step dots */}
        <View style={styles.dots}>
          {STEPS.slice(0, lastStep + 1).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i <= step && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.card}>
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>Your Details</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="coolusername22"
                  placeholderTextColor={colors.textSecondary}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldHint}>
                  For your privacy, we recommend not using your real name.
                </Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>I am a...</Text>
              <TouchableOpacity
                style={[styles.roleCard, role === 'client' && styles.roleCardSelected]}
                onPress={() => setRole('client')}
              >
                <Text style={styles.roleEmoji}>🧠</Text>
                <View style={styles.roleText}>
                  <Text style={[styles.roleTitle, role === 'client' && styles.roleSelected]}>Client</Text>
                  <Text style={styles.roleDesc}>Track my mental wellness daily</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleCard, role === 'therapist' && styles.roleCardSelected]}
                onPress={() => setRole('therapist')}
              >
                <Text style={styles.roleEmoji}>🩺</Text>
                <View style={styles.roleText}>
                  <Text style={[styles.roleTitle, role === 'therapist' && styles.roleSelected]}>Therapist</Text>
                  <Text style={styles.roleDesc}>Monitor and support my clients</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Daily reminder</Text>
              <Text style={styles.stepDesc}>Pick a time and we'll nudge you to check in every day.</Text>
              <DateTimePicker
                value={timeStringToDate(reminderTime)}
                mode="time"
                display="spinner"
                onChange={(_, date) => { if (date) setReminderTime(dateToTimeString(date)); }}
                style={{ width: '100%' }}
              />
              <Text style={notifStyles.hint}>You can change this anytime in Settings.</Text>
            </View>
          )}

          {step === 2 && (
            <View>
              {role === 'client' ? (
                <>
                  <Text style={styles.stepTitle}>You're all set!</Text>
                  <Text style={styles.stepDesc}>
                    You'll start in Solo Mode — your check-ins stay private to you.
                  </Text>
                  <View style={styles.roleCard}>
                    <Text style={styles.roleEmoji}>🩺</Text>
                    <View style={styles.roleText}>
                      <Text style={styles.roleTitle}>Have a therapist?</Text>
                      <Text style={styles.roleDesc}>
                        Connect anytime later from Settings → Therapist Connection using their pairing code.
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.stepTitle}>You're all set!</Text>
                  <Text style={styles.stepDesc}>
                    A pairing code will be generated for you. Share it with your clients so they can connect to your account.
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Navigation buttons */}
          <View style={styles.navRow}>
            {step > 0 && (
              <TouchableOpacity style={styles.backButton} onPress={goBack}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            {step < lastStep ? (
              <TouchableOpacity
                style={[styles.button, step === 0 && styles.buttonFull]}
                onPress={handleNext}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleFinish}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logo: {
    fontSize: 36,
    fontWeight: String(font.bold),
    color: colors.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: String(font.semibold),
    color: colors.text,
    marginBottom: spacing.md,
  },
  stepDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: String(font.medium),
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  roleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  roleEmoji: {
    fontSize: 32,
  },
  roleText: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: String(font.semibold),
    color: colors.text,
  },
  roleSelected: {
    color: colors.primary,
  },
  roleDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: String(font.medium),
  },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: String(font.semibold),
  },
  link: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  linkText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: String(font.semibold),
  },
});

const notifStyles = StyleSheet.create({
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
