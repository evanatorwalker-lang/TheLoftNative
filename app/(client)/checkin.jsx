import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
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
import * as Haptics from 'expo-haptics';
import { useApp } from '../../src/context/AppContext';
import { createEntry } from '../../src/services/entry.service';
import { getClientSuicidalFlag, getClientSelfHarmFlag } from '../../src/services/therapist.service';

import { colors, spacing, radius, font } from '../../src/theme';

// colorLow → colorHigh: red→green when high is good, green→red when high is bad
const RED   = '#fca5a5';
const GREEN = '#86efac';

// 10 is always the "up"/good end (green) and 1 is always "down"/bad (red) for
// every slider. For stress/worry/emotions this means the number's meaning
// flipped from before (stress=10 used to mean "very anxious", now means
// "very calm") — accepted tradeoff, existing saved entries read differently.
const BASE_SLIDER_STEPS = [
  { key: 'mood',       min: 1,  max: 10, leftLabel: 'Worst Day',   rightLabel: 'Best Day',      subtitle: 'Overall mood',          colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'stress',     min: 1,  max: 10, leftLabel: 'Tense',       rightLabel: 'Calm',          subtitle: 'Stress level',          colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'worry',      min: 1,  max: 10, leftLabel: 'Overthinking',rightLabel: 'Clear Headed',  subtitle: 'Anxiety & worry',       colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'emotions',   min: 1,  max: 10, leftLabel: 'Rollercoaster',rightLabel: 'Super Steady', subtitle: 'Emotional stability',   colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'focus',      min: 1,  max: 10, leftLabel: 'Zoned Out',   rightLabel: 'Locked In',     subtitle: 'Concentration & focus', colorLow: RED,   colorHigh: GREEN }, // high = good
  { key: 'motivation', min: 1,  max: 10, leftLabel: 'No Gas',      rightLabel: 'Full Tank',     subtitle: 'Drive & energy',        colorLow: RED,   colorHigh: GREEN }, // high = good
];

// Inserted at index 3 (after mood, stress, worry) when therapist flags client as suicidal risk.
// Same up=good/10=good convention as the other sliders now.
const SUICIDAL_IDEATION_STEP = {
  key: 'suicidalIdeation', min: 1, max: 10,
  leftLabel: 'Intense Thoughts', rightLabel: 'No Thoughts',
  subtitle: 'Suicidal ideation',
  colorLow: RED, colorHigh: GREEN, // high = good
};

// Inserted next to the suicidal ideation step when therapist flags client for self-harm risk.
// Not a slider — a plain yes/no split screen (see SelfHarmStep below).
const SELF_HARM_STEP = { key: 'selfHarm' };

// ─────────────────────────────────────────────────────────────
// Self-harm yes/no step — top half of the screen = No (good/green),
// bottom half = Yes (bad/red), same up-is-good convention as the sliders,
// but a plain tap instead of a drag since it's a binary question.
// ─────────────────────────────────────────────────────────────
function SelfHarmStep({ value, onChange, onHorizontalMove, onHorizontalEnd }) {
  const navGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => onHorizontalMove?.(e.translationX))
    .onEnd((e) => onHorizontalEnd?.(e.translationX));

  const choose = (v) => {
    if (value !== v) {
      Haptics.selectionAsync();
      onChange(v);
    }
  };

  return (
    <GestureDetector gesture={navGesture}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            selfHarmStyles.half,
            { backgroundColor: value === false ? GREEN : '#eafaf0' },
          ]}
          onPress={() => choose(false)}
        >
          <Text style={selfHarmStyles.choiceText}>No</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            selfHarmStyles.half,
            { backgroundColor: value === true ? RED : '#fdeeee' },
          ]}
          onPress={() => choose(true)}
        >
          <Text style={selfHarmStyles.choiceText}>Yes</Text>
        </TouchableOpacity>

        <View style={selfHarmStyles.titleWrap} pointerEvents="none">
          <Text style={selfHarmStyles.title}>Did you self-harm?</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const selfHarmStyles = StyleSheet.create({
  half: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceText: {
    fontSize: 40,
    fontFamily: font.bold,
    color: colors.text,
  },
  titleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});

// ─────────────────────────────────────────────────────────────
// Liquid fill slider — drag vertically to change value,
// swipe horizontally to navigate between steps.
// Fill grows from 50% screen height (min) → 100% (max),
// overflowing up into the header at high values.
// ─────────────────────────────────────────────────────────────
function LiquidSliderStep({ config, value, onChange, onHorizontalMove, onHorizontalEnd, footer }) {
  const { height: screenHeight } = useWindowDimensions();

  // Gesture state tracked with refs (gesture runs on JS thread)
  const gestureStartValue = useRef(value);
  const gestureMode       = useRef('idle'); // 'idle' | 'vertical' | 'horizontal'
  const lastEmittedValue  = useRef(value);

  // Drag travel mapped over the full value range — larger fraction of
  // screen height = more drag needed per step = lower sensitivity.
  const dragRange = screenHeight * 0.44;

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
        if (newVal !== lastEmittedValue.current) {
          lastEmittedValue.current = newVal;
          onChange(newVal);
          Haptics.selectionAsync();
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
        {/* Content — background fill is now a full-screen layer owned by the parent screen */}
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
          <View style={[
            liquidStyles.bottomLabelWrap,
            footer && { paddingBottom: spacing.xxl + 76 },
          ]}>
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
});

// ─────────────────────────────────────────────────────────────
// Main check-in screen — mood sliders only.
// Can be run multiple times a day; sleep, activities, and
// journal live in the separate "5 Things" daily check-in.
// ─────────────────────────────────────────────────────────────
export default function CheckInScreen() {
  const { currentUser } = useApp();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isSuicidalFlagged, setIsSuicidalFlagged] = useState(false);
  const [isSelfHarmFlagged, setIsSelfHarmFlagged] = useState(false);

  // Fetch therapist-set risk flags on mount
  useEffect(() => {
    if (!currentUser?.therapistId) return;
    getClientSuicidalFlag(currentUser.therapistId, currentUser.uid)
      .then(setIsSuicidalFlagged)
      .catch(() => {
        // Default to false — check-in proceeds without the extra step
      });
    getClientSelfHarmFlag(currentUser.therapistId, currentUser.uid)
      .then(setIsSelfHarmFlagged)
      .catch(() => {});
  }, [currentUser?.therapistId, currentUser?.uid]);

  // Build active slider steps — insert flagged risk steps at index 3 (after worry)
  const riskSteps = [
    ...(isSuicidalFlagged ? [SUICIDAL_IDEATION_STEP] : []),
    ...(isSelfHarmFlagged ? [SELF_HARM_STEP] : []),
  ];
  const activeSteps = riskSteps.length
    ? [...BASE_SLIDER_STEPS.slice(0, 3), ...riskSteps, ...BASE_SLIDER_STEPS.slice(3)]
    : BASE_SLIDER_STEPS;

  const TOTAL_STEPS = activeSteps.length;

  const [values, setValues] = useState({
    mood: 5, stress: 5, worry: 5, suicidalIdeation: 5, emotions: 5, focus: 5, motivation: 5,
    selfHarm: null,
  });

  const setVal = (key) => (v) => setValues(prev => ({ ...prev, [key]: v }));

  // ── Full-screen fill ────────────────────────────────────────
  // The whole screen (behind the header) fills with color as the
  // active slider's value rises, maxing out at a complete green
  // takeover at 10. Driven by the active step's committed value
  // rather than raw drag position — same granularity the old
  // per-slide fill used (both quantize to integer steps).
  const activeConfig = activeSteps[step];
  const initialProgress = activeConfig && activeConfig.key !== 'selfHarm'
    ? (values[activeConfig.key] - activeConfig.min) / (activeConfig.max - activeConfig.min)
    : 0;
  const fillProgress = useSharedValue(initialProgress);
  // SelfHarmStep paints its own full-bleed top/bottom colors, so the shared
  // fill needs to get out of the way entirely on that step — otherwise the
  // previous slide's leftover color peeks out from behind the header.
  const fillVisible = useSharedValue(activeConfig?.key === 'selfHarm' ? 0 : 1);
  const waveLeft  = useSharedValue(12);
  const waveRight = useSharedValue(30);

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

  useEffect(() => {
    if (!activeConfig) return;
    if (activeConfig.key === 'selfHarm') {
      // "No" (good/green) mirrors a slider maxed out at 10 — full green
      // takeover including behind the header. "Yes"/unanswered stays hidden
      // so SelfHarmStep's own split-screen colors show through untouched.
      if (values.selfHarm === false) {
        fillProgress.value = withTiming(1, { duration: 260 });
        fillVisible.value = withTiming(1, { duration: 260 });
      } else {
        fillVisible.value = withTiming(0, { duration: 150 });
      }
      return;
    }
    fillVisible.value = withTiming(1, { duration: 150 });
    const p = (values[activeConfig.key] - activeConfig.min) / (activeConfig.max - activeConfig.min);
    fillProgress.value = withTiming(p, { duration: 60 });
  }, [step, activeConfig && values[activeConfig.key]]);

  // min → ~3% of screen height (barely visible), max → 100% (full screen, edge to edge)
  const screenFillStyle = useAnimatedStyle(() => ({
    height: screenHeight * (0.03 + fillProgress.value * 0.97),
    backgroundColor: interpolateColor(fillProgress.value, [0, 1], [RED, GREEN]),
    borderTopLeftRadius:  waveLeft.value,
    borderTopRightRadius: waveRight.value,
    opacity: fillVisible.value,
  }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const entryData = {
        type: 'mood',
        mood: values.mood,
        stress: values.stress,
        worry: values.worry,
        emotions: values.emotions,
        focus: values.focus,
        motivation: values.motivation,
      };
      if (isSuicidalFlagged) entryData.suicidalIdeation = values.suicidalIdeation;
      if (isSelfHarmFlagged) entryData.selfHarm = values.selfHarm;

      await createEntry(entryData, currentUser?.uid, currentUser?.therapistId || null);
      Alert.alert('Done!', 'Check-in saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(
        'Saved Offline',
        "You appear to be offline. Your check-in has been saved and will sync automatically when you're back online.",
        [{ text: 'OK', onPress: () => router.back() }]
      );
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

  // Kick the fill off toward the target slide's value in lockstep with the
  // swipe animation, so the color arrives at the same time the slide does
  // instead of visibly catching up afterward.
  const animateFillTo = (targetStep) => {
    const cfg = activeSteps[targetStep];
    if (!cfg) return;
    if (cfg.key === 'selfHarm') {
      if (values.selfHarm === false) {
        fillProgress.value = withTiming(1, { duration: 260 });
        fillVisible.value = withTiming(1, { duration: 260 });
      } else {
        fillVisible.value = withTiming(0, { duration: 200 });
      }
      return;
    }
    fillVisible.value = withTiming(1, { duration: 200 });
    const p = (values[cfg.key] - cfg.min) / (cfg.max - cfg.min);
    fillProgress.value = withTiming(p, { duration: 260 });
  };

  const handleHorizontalEnd = (dx) => {
    const THRESHOLD = screenWidth * 0.15;
    const canGoNext = step < TOTAL_STEPS - 1;
    const canGoBack = step > 0;

    if (dx < -THRESHOLD && canGoNext) {
      // Snap to next: totalOffset stays at target — no reset, no glitch
      animateFillTo(step + 1);
      totalOffset.value = withTiming(-(step + 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goNext)();
      });
    } else if (dx > THRESHOLD && canGoBack) {
      animateFillTo(step - 1);
      totalOffset.value = withTiming(-(step - 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goPrev)();
      });
    } else {
      // Not far enough — snap back to current
      totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    }
  };

  // ── Render a single slide by index ────────────────────────
  const renderSlideContent = (slideIndex) => {
    if (slideIndex < 0 || slideIndex >= TOTAL_STEPS) {
      return <View key={`empty-${slideIndex}`} style={{ flex: 1 }} />;
    }

    const config = activeSteps[slideIndex];
    const isLast = slideIndex === TOTAL_STEPS - 1;

    return (
      <View style={{ flex: 1 }}>
        {config.key === 'selfHarm' ? (
          <SelfHarmStep
            key={`selfharm-${slideIndex}`}
            value={values.selfHarm}
            onChange={setVal('selfHarm')}
            onHorizontalMove={handleHorizontalMove}
            onHorizontalEnd={handleHorizontalEnd}
          />
        ) : (
          <LiquidSliderStep
            key={`liquid-${slideIndex}`}
            config={config}
            value={values[config.key]}
            onChange={setVal(config.key)}
            onHorizontalMove={handleHorizontalMove}
            onHorizontalEnd={handleHorizontalEnd}
            footer={isLast}
          />
        )}
        {isLast && (
          <View style={[styles.saveWrap, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.saveBtnText}>Save Check-in</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Full-screen fill — sits behind everything, takes over the whole screen at 10 */}
      <Animated.View
        style={[{ position: 'absolute', bottom: 0, left: 0, right: 0 }, screenFillStyle]}
        pointerEvents="none"
      />

      {/* Header — zIndex keeps it above the fill overflow at max value */}
      <View style={[styles.header, { zIndex: 10 }]}>
        <TouchableOpacity onPress={() =>
          Alert.alert(
            'Exit Check-in?',
            'Your progress will not be saved.',
            [
              { text: 'Keep Going', style: 'cancel' },
              { text: 'Exit', style: 'destructive', onPress: () => router.back() },
            ]
          )
        }>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
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

  saveWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    zIndex: 5,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText:      { color: colors.white, fontSize: 16, fontFamily: font.semibold },
  saveBtnDisabled:  { opacity: 0.7 },
});
