import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { createEntry, getTodayEntries } from '../../src/services/entry.service';
import { getClientSuicidalFlag } from '../../src/services/therapist.service';
import { colors, spacing, radius, font } from '../../src/theme';

const ACTIVITIES = [
  { id: 'exercise',    label: 'Exercise',    image: require('../../assets/activities/exercise.png') },
  { id: 'socializing', label: 'Socializing', image: require('../../assets/activities/socializing.png') },
  { id: 'meditation',  label: 'Meditation',  image: require('../../assets/activities/meditation.png') },
  { id: 'reading',     label: 'Reading',     image: require('../../assets/activities/reading.png') },
  { id: 'nature',      label: 'Nature',      image: require('../../assets/activities/nature.png') },
  { id: 'creative',    label: 'Creative',    image: require('../../assets/activities/creative.png') },
  { id: 'cooking',     label: 'Cooking',     image: require('../../assets/activities/cooking.png') },
  { id: 'music',       label: 'Music',       image: require('../../assets/activities/music.png') },
  { id: 'gaming',      label: 'Gaming',      image: require('../../assets/activities/gaming.png') },
  { id: 'work',        label: 'Work',        image: require('../../assets/activities/work.png') },
  { id: 'selfCare',    label: 'Self-care',   image: require('../../assets/activities/selfCare.png') },
  { id: 'family',      label: 'Family',      image: require('../../assets/activities/family.png') },
  { id: 'sports',      label: 'Sports',      image: require('../../assets/activities/sports.png') },
  { id: 'tvMovies',    label: 'TV / Movies', image: require('../../assets/activities/tvMovies.png') },
  { id: 'therapy',     label: 'Therapy',     image: require('../../assets/activities/therapy.png') },
  { id: 'volunteering',label: 'Volunteering',image: require('../../assets/activities/volunteering.png') },
  { id: 'pets',        label: 'Pets',        image: require('../../assets/activities/pets.png') },
  { id: 'studying',    label: 'Studying',    image: require('../../assets/activities/studying.png') },
  { id: 'school',      label: 'School',      image: require('../../assets/activities/school.png') },
  { id: 'walk',        label: 'Walk',        image: require('../../assets/activities/walk.png') },
  { id: 'shopping',    label: 'Shopping',    image: require('../../assets/activities/shopping.png') },
  { id: 'journaling',  label: 'Journaling',  image: require('../../assets/activities/journaling.png') },
  { id: 'cleaning',    label: 'Cleaning',    image: require('../../assets/activities/cleaning.png') },
  { id: 'travel',      label: 'Travel',      image: require('../../assets/activities/travel.png') },
  { id: 'swimming',    label: 'Swimming',    image: require('../../assets/activities/swimming.png') },
  { id: 'spirituality',label: 'Spirituality',image: require('../../assets/activities/spirituality.png') },
  { id: 'other',       label: 'Other',       image: require('../../assets/activities/other.png') },
];

// colorLow → colorHigh: red→green when high is good, green→red when high is bad
const RED   = '#fca5a5';
const GREEN = '#86efac';

const BASE_SLIDER_STEPS = [
  { key: 'mood',       min: 1,  max: 10, leftLabel: 'Worst Day',    rightLabel: 'Best Day',      subtitle: 'Overall mood',          colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'stress',     min: 1,  max: 10, leftLabel: 'Calm',         rightLabel: 'Anxious',        subtitle: 'Stress level',          colorLow: GREEN, colorHigh: RED   }, // high = bad
  { key: 'worry',      min: 1,  max: 10, leftLabel: 'Clear Headed', rightLabel: 'Overthinking',  subtitle: 'Anxiety & worry',       colorLow: GREEN, colorHigh: RED   }, // high = bad
  { key: 'emotions',   min: 1,  max: 10, leftLabel: 'Super Steady', rightLabel: 'Rollercoaster', subtitle: 'Emotional stability',   colorLow: GREEN, colorHigh: RED   }, // high = bad
  { key: 'focus',      min: 1,  max: 10, leftLabel: 'Zoned Out',    rightLabel: 'Locked In',     subtitle: 'Concentration & focus', colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'motivation', min: 1,  max: 10, leftLabel: 'No Gas',       rightLabel: 'Full Tank',     subtitle: 'Drive & energy',        colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'sleepHours', min: 0,  max: 12, leftLabel: 'No Sleep',     rightLabel: '12+ hrs', unit: ' hrs', subtitle: 'Hours slept last night', colorLow: RED, colorHigh: GREEN }, // high = good
];

// Inserted at index 3 (after mood, stress, worry) when therapist flags client as suicidal risk
const SUICIDAL_IDEATION_STEP = {
  key: 'suicidalIdeation', min: 1, max: 10,
  leftLabel: 'No Thoughts', rightLabel: 'Intense Thoughts',
  subtitle: 'Suicidal ideation',
  colorLow: GREEN, colorHigh: RED, // high = bad
};

// ─────────────────────────────────────────────────────────────
// Liquid fill slider — drag vertically to change value,
// swipe horizontally to navigate between steps.
// Fill grows from 50% screen height (min) → 100% (max),
// overflowing up into the header at high values.
// ─────────────────────────────────────────────────────────────
function LiquidSliderStep({ config, value, onChange, onHorizontalMove, onHorizontalEnd }) {
  const { height: screenHeight } = useWindowDimensions();

  // Single 0→1 progress drives both fill height and color
  const toProgress = (v) => (v - config.min) / (config.max - config.min);
  const progress = useSharedValue(toProgress(value));

  // Asymmetric wave radii on the top edge of the fill
  const waveLeft  = useSharedValue(12);
  const waveRight = useSharedValue(30);

  // Sync when value prop changes
  useEffect(() => {
    progress.value = withTiming(toProgress(value), { duration: 100 });
  }, [value]);

  // Looping wave animation
  useEffect(() => {
    waveLeft.value = withRepeat(
      withSequence(withTiming(30, { duration: 1800 }), withTiming(12, { duration: 1800 })),
      -1, false
    );
    waveRight.value = withRepeat(
      withSequence(withTiming(12, { duration: 1800 }), withTiming(30, { duration: 1800 })),
      -1, false
    );
  }, []);

  // min → ~3% of screen height (barely visible), max → 100% (full screen)
  const fillStyle = useAnimatedStyle(() => ({
    height: screenHeight * (0.03 + progress.value * 0.97),
    backgroundColor: interpolateColor(progress.value, [0, 1], [config.colorLow, config.colorHigh]),
    borderTopLeftRadius:  waveLeft.value,
    borderTopRightRadius: waveRight.value,
  }));

  // Gesture state tracked with refs (gesture runs on JS thread)
  const gestureStartValue = useRef(value);
  const gestureMode       = useRef('idle'); // 'idle' | 'vertical' | 'horizontal'
  const lastEmittedValue  = useRef(value);

  // Drag travel mapped over half the screen height = full value range
  const dragRange = screenHeight * 0.5;

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      gestureStartValue.current = value;
      gestureMode.current = 'idle';
      lastEmittedValue.current = value;
    })
    .onUpdate((e) => {
      if (gestureMode.current === 'idle') {
        const ax = Math.abs(e.translationX);
        const ay = Math.abs(e.translationY);
        if (ax > ay && ax > 12) gestureMode.current = 'horizontal';
        else if (ay > 12)       gestureMode.current = 'vertical';
      }

      if (gestureMode.current === 'vertical') {
        const range  = config.max - config.min;
        const delta  = -(e.translationY / dragRange) * range;
        const newVal = Math.round(
          Math.max(config.min, Math.min(config.max, gestureStartValue.current + delta))
        );
        progress.value = withTiming(toProgress(newVal), { duration: 50 });
        if (newVal !== lastEmittedValue.current) {
          lastEmittedValue.current = newVal;
          onChange(newVal);
        }
      } else if (gestureMode.current === 'horizontal') {
        // Live feedback: update strip position as finger moves
        onHorizontalMove?.(e.translationX);
      }
    })
    .onEnd((e) => {
      if (gestureMode.current === 'horizontal') {
        onHorizontalEnd?.(e.translationX);
      }
    });

  const displayValue = config.unit ? `${value}${config.unit}` : `${value}`;

  return (
    <GestureDetector gesture={panGesture}>
      <View style={{ flex: 1, overflow: 'visible' }}>
        {/* Animated fill — rises from the bottom */}
        <Animated.View style={[
          { position: 'absolute', bottom: 0, left: 0, right: 0 },
          fillStyle,
        ]} />

        {/* Content overlaid on fill */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>

          {/* Big number — truly centered, unaffected by label heights */}
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={liquidStyles.bigNumber}>{displayValue}</Text>
          </View>

          {/* High label — pinned to top */}
          <View style={liquidStyles.topLabelWrap}>
            <Text style={liquidStyles.extremeLabel}>{config.rightLabel}</Text>
            <Ionicons name="arrow-up-outline" size={18} color={colors.textSecondary} />
            {config.subtitle && (
              <Text style={liquidStyles.subtitleLabel}>{config.subtitle}</Text>
            )}
          </View>

          {/* Low label — pinned to bottom */}
          <View style={liquidStyles.bottomLabelWrap}>
            <Ionicons name="arrow-down-outline" size={18} color={colors.textSecondary} />
            <Text style={liquidStyles.extremeLabel}>{config.leftLabel}</Text>
          </View>

        </View>
      </View>
    </GestureDetector>
  );
}

const liquidStyles = StyleSheet.create({
  topLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: 4,
  },
  bottomLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.xxl,
    gap: 4,
  },
  extremeLabel: {
    fontSize: 18,
    fontFamily: font.semibold,
    color: colors.text,
  },
  subtitleLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    opacity: 0.6,
    letterSpacing: 0.4,
    marginTop: 6,
  },
  bigNumber: {
    fontSize: 112,
    fontFamily: font.bold,
    color: colors.text,
  },
  navHint: {
    alignItems: 'center',
  },
  navHintText: {
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    opacity: 0.7,
  },
});

// ─────────────────────────────────────────────────────────────
// Main check-in screen
// ─────────────────────────────────────────────────────────────
export default function CheckInScreen() {
  const { currentUser } = useApp();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isSuicidalFlagged, setIsSuicidalFlagged] = useState(false);
  const [isSubsequent, setIsSubsequent] = useState(false);

  // Fetch therapist-set suicidal risk flag on mount
  useEffect(() => {
    console.log('[CheckIn] therapistId:', currentUser?.therapistId, '| uid:', currentUser?.uid);
    if (!currentUser?.therapistId) return;
    getClientSuicidalFlag(currentUser.therapistId, currentUser.uid)
      .then((flag) => {
        console.log('[CheckIn] suicidalFlag fetched:', flag);
        setIsSuicidalFlagged(flag);
      })
      .catch((err) => {
        console.error('[CheckIn] Failed to fetch suicidal flag:', err);
        // Default to false — check-in proceeds without the extra step
      });
  }, [currentUser?.therapistId, currentUser?.uid]);

  // Check if this is a subsequent check-in today (already checked in earlier)
  useEffect(() => {
    if (!currentUser?.uid) return;
    getTodayEntries(currentUser.uid)
      .then(entries => { if (entries.length > 0) setIsSubsequent(true); })
      .catch(() => {});
  }, [currentUser?.uid]);

  // Build active slider steps — insert SI step at index 3 (after worry) when flagged
  // For subsequent check-ins, skip the sleep step (already captured earlier today)
  const sliderSteps = isSuicidalFlagged
    ? [...BASE_SLIDER_STEPS.slice(0, 3), SUICIDAL_IDEATION_STEP, ...BASE_SLIDER_STEPS.slice(3)]
    : BASE_SLIDER_STEPS;
  const activeSteps = isSubsequent
    ? sliderSteps.filter(s => s.key !== 'sleepHours')
    : sliderSteps;

  const ACTIVITIES_STEP = activeSteps.length;
  const REFLECT_STEP    = activeSteps.length + 1;
  const TOTAL_STEPS     = activeSteps.length + 2;

  const [values, setValues] = useState({
    mood: 5, stress: 5, worry: 5, suicidalIdeation: 5, emotions: 5,
    focus: 5, motivation: 5, sleepHours: 7,
  });
  const [activities, setActivities] = useState([]);
  const [wordOfDay, setWordOfDay]   = useState('');
  const [journal, setJournal]       = useState('');

  const setVal = (key) => (v) => setValues(prev => ({ ...prev, [key]: v }));
  const toggleActivity = (id) =>
    setActivities(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await createEntry(
        { ...values, activities, wordOfDay, journal },
        currentUser?.uid,
        currentUser?.therapistId || null
      );
      Alert.alert('Done!', 'Check-in saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const insets = useSafeAreaInsets();

  // ── Horizontal swipe animation ─────────────────────────────
  // totalOffset accumulates: -step*screenWidth when at rest.
  // Each slide lives at left: slideIndex*screenWidth (absolute).
  // We NEVER reset totalOffset — this eliminates the one-frame
  // glitch that occurred when resetting a 3-panel strip offset.
  const totalOffset = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: totalOffset.value }],
  }));

  // Use functional setStep wrappers so closures never go stale
  const goNext = () => setStep(s => s + 1);
  const goPrev = () => setStep(s => s - 1);

  const handleHorizontalMove = (dx) => {
    const base = -step * screenWidth;
    const canGoNext = step < TOTAL_STEPS - 1;
    const canGoBack = step > 0;
    if (dx < 0 && !canGoNext) {
      totalOffset.value = base + dx * 0.12; // rubber-band at boundary
      return;
    }
    if (dx > 0 && !canGoBack) {
      totalOffset.value = base + dx * 0.12; // rubber-band at boundary
      return;
    }
    totalOffset.value = base + dx;
  };

  const handleHorizontalEnd = (dx) => {
    const THRESHOLD = screenWidth * 0.32;
    const canGoNext = step < TOTAL_STEPS - 1;
    const canGoBack = step > 0;

    if (dx < -THRESHOLD && canGoNext) {
      // Snap to next: totalOffset stays at target — no reset, no glitch
      totalOffset.value = withTiming(-(step + 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goNext)();
      });
    } else if (dx > THRESHOLD && canGoBack) {
      totalOffset.value = withTiming(-(step - 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goPrev)();
      });
    } else {
      // Not far enough — snap back to current
      totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    }
  };

  // ── Activities gesture (wraps a ScrollView) ───────────────
  // failOffsetY lets vertical scroll work; onFinalize resets if cancelled
  const activitiesGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      handleHorizontalMove(e.translationX);
    })
    .onEnd((e) => {
      handleHorizontalEnd(e.translationX);
    })
    .onFinalize((_e, success) => {
      if (!success) totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    });

  // ── Reflect gesture (back-swipe only; no advance past last step) ──
  const reflectGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      handleHorizontalMove(e.translationX);
    })
    .onEnd((e) => {
      handleHorizontalEnd(e.translationX);
    })
    .onFinalize((_e, success) => {
      if (!success) totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    });

  // ── Render a single slide by index ────────────────────────
  const renderSlideContent = (slideIndex) => {
    if (slideIndex < 0 || slideIndex >= TOTAL_STEPS) {
      return <View key={`empty-${slideIndex}`} style={{ flex: 1 }} />;
    }

    if (slideIndex < activeSteps.length) {
      const config = activeSteps[slideIndex];
      return (
        <LiquidSliderStep
          key={`liquid-${slideIndex}`}
          config={config}
          value={values[config.key]}
          onChange={setVal(config.key)}
          onHorizontalMove={handleHorizontalMove}
          onHorizontalEnd={handleHorizontalEnd}
        />
      );
    }

    if (slideIndex === ACTIVITIES_STEP) {
      return (
        <GestureDetector key="activities" gesture={activitiesGesture}>
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.stepTitle}>{isSubsequent ? 'Any new activities?' : 'What did you do today?'}</Text>
              <View style={styles.activityGrid}>
                {ACTIVITIES.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.activityBtn,
                      activities.includes(a.id) && styles.activityBtnActive,
                    ]}
                    onPress={() => toggleActivity(a.id)}
                  >
                    <Image
                      source={a.image}
                      style={{ width: 32, height: 32 }}
                      resizeMode="contain"
                    />
                    <Text style={[
                      styles.activityLabel,
                      activities.includes(a.id) && styles.activityLabelActive,
                    ]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </GestureDetector>
      );
    }

    if (slideIndex === REFLECT_STEP) {
      return (
        <GestureDetector key="reflect" gesture={reflectGesture}>
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.stepTitle}>Reflect</Text>
              <View style={styles.field}>
                <Text style={styles.subLabel}>{isSubsequent ? 'New Word of the Day' : 'Word of the Day'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="One word to describe your day"
                  placeholderTextColor={colors.textSecondary}
                  value={wordOfDay}
                  onChangeText={setWordOfDay}
                  maxLength={30}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.subLabel}>Journal</Text>
                <TextInput
                  style={[styles.input, styles.journalInput]}
                  placeholder="How are you feeling? What's on your mind?"
                  placeholderTextColor={colors.textSecondary}
                  value={journal}
                  onChangeText={setJournal}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
            {/* Floating save button — no swipe-left to advance, must tap */}
            <View style={[styles.saveWrap, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity
                style={[styles.saveBtn, loading && styles.nextBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.saveBtnText}>Save Check-in</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </GestureDetector>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — zIndex keeps it above the fill overflow at max value */}
      <View style={[styles.header, { zIndex: 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Daily Check-in</Text>
        <Text style={styles.stepLabel}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { zIndex: 10 }]}>
        <View
          style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]}
        />
      </View>

      {/* ── Slides — absolutely positioned within a translated container ── */}
      {/* Each slide sits at left: slideIndex*screenWidth; totalOffset scrolls them. */}
      {/* No strip reset needed → no glitch on step change. */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1 }, containerStyle]}>
          {[step - 1, step, step + 1].map(slideIndex => {
            if (slideIndex < 0 || slideIndex >= TOTAL_STEPS) return null;
            return (
              <View
                key={slideIndex}
                style={{
                  position: 'absolute',
                  top: 0, bottom: 0,
                  width: screenWidth,
                  left: slideIndex * screenWidth,
                }}
              >
                {renderSlideContent(slideIndex)}
              </View>
            );
          })}
        </Animated.View>
      </View>
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
    paddingVertical: spacing.md,
  },
  cancel:    { fontSize: 16, color: colors.textSecondary },
  title:     { fontSize: 17, fontFamily: font.semibold, color: colors.text },
  stepLabel: { fontSize: 14, color: colors.textSecondary },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  // Activities & Reflect
  scroll:    { padding: spacing.lg, paddingBottom: 120 },
  stepTitle: { fontSize: 24, fontFamily: font.bold, color: colors.text, marginBottom: spacing.lg },
  subLabel:  { fontSize: 15, fontFamily: font.medium, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  activityBtn: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    gap: 4,
  },
  activityBtnActive:  { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  activityLabel:      { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  activityLabelActive:{ color: colors.primary, fontFamily: font.medium },
  field:      { marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  journalInput: { minHeight: 150, paddingTop: spacing.md },

  // Reflect — floating save button
  saveWrap: {
    position: 'absolute',
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText:     { color: colors.white, fontSize: 16, fontFamily: font.semibold },
  nextBtnDisabled: { opacity: 0.7 },
});
