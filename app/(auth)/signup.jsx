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
import { linkClientToTherapist, validatePairingCode } from '../../src/services/pairing.service';
import { colors, spacing, radius, font } from '../../src/theme';

const STEPS = ['Details', 'Role', 'Connect'];

export default function SignupScreen() {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(null);
  const [pairingCode, setPairingCode] = useState('');
  const [connectionChoice, setConnectionChoice] = useState(null); // 'solo' | 'therapist'
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const goNext = () => setStep(s => Math.min(s + 1, 2));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const validateStep0 = () => {
    if (!displayName.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email.';
    if (!email.trim().includes('@')) return 'Please enter a valid email address.';
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
    // Validate the pairing code against Firestore before creating the account
    if (role === 'client' && connectionChoice === 'therapist' && pairingCode.trim()) {
      setLoading(true);
      const codeValid = await validatePairingCode(pairingCode.trim());
      if (!codeValid) {
        setLoading(false);
        Alert.alert('Invalid Code', 'That pairing code doesn\'t match any therapist. Please check with your therapist and try again.');
        return;
      }
    }

    setLoading(true);
    try {
      const user = await signUp(email.trim(), password, displayName.trim(), role);

      if (role === 'client' && connectionChoice === 'therapist' && pairingCode.trim()) {
        await linkClientToTherapist(user.uid, pairingCode.trim(), {
          displayName: user.displayName,
          email: user.email,
        });
      }

      router.replace(role === 'therapist' ? '/(therapist)' : '/(client)');
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
          {STEPS.map((_, i) => (
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
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Jane Smith"
                  placeholderTextColor={colors.textSecondary}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
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

          {step === 2 && (
            <View>
              {role === 'client' ? (
                <>
                  <Text style={styles.stepTitle}>How will you use The Loft?</Text>
                  <TouchableOpacity
                    style={[styles.roleCard, connectionChoice === 'solo' && styles.roleCardSelected]}
                    onPress={() => { setConnectionChoice('solo'); setPairingCode(''); }}
                  >
                    <Text style={styles.roleEmoji}>🙋</Text>
                    <View style={styles.roleText}>
                      <Text style={[styles.roleTitle, connectionChoice === 'solo' && styles.roleSelected]}>Solo Mode</Text>
                      <Text style={styles.roleDesc}>Track my wellness independently</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleCard, connectionChoice === 'therapist' && styles.roleCardSelected]}
                    onPress={() => setConnectionChoice('therapist')}
                  >
                    <Text style={styles.roleEmoji}>🩺</Text>
                    <View style={styles.roleText}>
                      <Text style={[styles.roleTitle, connectionChoice === 'therapist' && styles.roleSelected]}>Connect to Therapist</Text>
                      <Text style={styles.roleDesc}>Share progress with my therapist</Text>
                    </View>
                  </TouchableOpacity>
                  {connectionChoice === 'therapist' && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Therapist Pairing Code</Text>
                      <TextInput
                        style={[styles.input, styles.codeInput]}
                        placeholder="A4K9P2"
                        placeholderTextColor={colors.textSecondary}
                        value={pairingCode}
                        onChangeText={text => setPairingCode(text.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={6}
                        autoCorrect={false}
                      />
                    </View>
                  )}
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
            {step < 2 ? (
              <TouchableOpacity
                style={[styles.button, step === 0 && styles.buttonFull]}
                onPress={handleNext}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, (loading || (role === 'client' && !connectionChoice)) && styles.buttonDisabled]}
                onPress={handleFinish}
                disabled={loading || (role === 'client' && !connectionChoice)}
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
  codeInput: {
    letterSpacing: 4,
    fontSize: 20,
    textAlign: 'center',
    fontWeight: String(font.bold),
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
