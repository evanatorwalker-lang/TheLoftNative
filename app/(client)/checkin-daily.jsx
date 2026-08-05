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
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolateColor,
  runOnJS,
  Easing,
  FadeInDown,
  FadeIn,
  LinearTransition,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../../src/context/AppContext';
import { useEntries } from '../../src/hooks/useEntries';
import { createEntry, updateEntry, getTodayEntries } from '../../src/services/entry.service';
import { scheduleStreakRisk } from '../../src/services/notification.service';
import { timeStringToDate, dateToTimeString, formatTime, computeSleepHours } from '../../src/utils/timeHelpers';
import { getYesterdayDateString, getTodayDateString } from '../../src/utils/dateHelpers';
import { calculateStreak, getTrophyTier, isFiveFactorEntry } from '../../src/utils/streakCalculator';
import { SwipeHint } from '../../src/components/SwipeHint';
import { colors, spacing, radius, font } from '../../src/theme';

// 5-minute steps up to 2hr (24 stops) — shared by Movement's dial and
// Outside's meter so both drag interactions feel equally responsive.
const FINE_DURATIONS = Array.from({ length: 24 }, (_, i) => {
  const totalMin = (i + 1) * 5; // 5..120
  if (totalMin === 120) return '2 hr+';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
});

// Sleep step health windows — bedtime 7-11pm, wake 5-9am, duration 7-9h.
// Anything outside is flagged amber rather than the neutral Sleep indigo.
const timeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const isBedTimeHealthy  = (t) => { const m = timeToMinutes(t); return m >= 19 * 60 && m <= 23 * 60; };
const isWakeTimeHealthy = (t) => { const m = timeToMinutes(t); return m >= 5 * 60 && m <= 9 * 60; };
const isSleepHoursHealthy = (hours) => hours >= 7 && hours <= 9;

// Recap ring fill for a duration answer — proportional to where it falls
// in FINE_DURATIONS, so a longer walk fills more of the ring than a
// quick one. A tiny sliver (not 0) for "no" so the ring stays visible.
const durationProgress = (amount) => {
  if (!amount) return 0.06;
  const idx = FINE_DURATIONS.indexOf(amount);
  return idx >= 0 ? (idx + 1) / FINE_DURATIONS.length : 0.5;
};

// Per-meal entry fields for the Eat step. The stored entry still has a
// single `meals` string (therapist view and Insights both render it as
// one text block) — these just format/parse that string on the way in
// and out so the UI can offer 4 small fields instead of one big blob.
// Reflect step — cycled through by the journal's "shuffle" button when
// the field is empty; tapping the resulting chip inserts it as a starter.
const REFLECTION_PROMPTS = [
  'What made yesterday feel good?',
  "What's one thing you'd change about yesterday?",
  'What are you looking forward to today?',
  "What's something you're grateful for right now?",
  'Describe yesterday in a few sentences.',
  'What drained your energy yesterday?',
];

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: 'cafe-outline' },
  { key: 'lunch',     label: 'Lunch',     icon: 'fast-food-outline' },
  { key: 'dinner',    label: 'Dinner',    icon: 'restaurant-outline' },
  { key: 'snacks',    label: 'Snacks',    icon: 'nutrition-outline' },
];

const formatMeals = (byType) =>
  MEAL_TYPES
    .filter(m => byType[m.key]?.trim())
    .map(m => `${m.label}: ${byType[m.key].trim()}`)
    .join('\n');

const parseMeals = (str) => {
  const result = { breakfast: '', lunch: '', dinner: '', snacks: '' };
  if (!str) return result;
  str.split('\n').forEach(line => {
    const match = MEAL_TYPES.find(m => line.startsWith(`${m.label}: `));
    if (match) result[match.key] = line.slice(match.label.length + 2);
  });
  return result;
};

const MOVEMENT_ACTIVITIES = [
  { id: 'exercise', label: 'Exercise', image: require('../../assets/activities/exercise.png') },
  { id: 'sports',   label: 'Sports',   image: require('../../assets/activities/sports.png') },
  { id: 'walk',     label: 'Walk',     image: require('../../assets/activities/walk.png') },
  { id: 'swimming', label: 'Swimming', image: require('../../assets/activities/swimming.png') },
  { id: 'other',    label: 'Other',    image: require('../../assets/activities/other.png') },
];

const OUTSIDE_ACTIVITIES = [
  { id: 'nature',   label: 'Nature',   image: require('../../assets/activities/nature.png') },
  { id: 'sports',   label: 'Sports',   image: require('../../assets/activities/sports.png') },
  { id: 'walk',     label: 'Walk',     image: require('../../assets/activities/walk.png') },
  { id: 'swimming', label: 'Swimming', image: require('../../assets/activities/swimming.png') },
  { id: 'other',    label: 'Other',    image: require('../../assets/activities/other.png') },
];

const MOVEMENT_STEP  = 0;
const OUTSIDE_STEP   = 1;
const SOCIAL_STEP    = 2;
const SLEEP_STEP     = 3;
const EAT_STEP       = 4;
const REFLECT_STEP   = 5;
const TOTAL_STEPS    = 6;

// One identity per step — drives the background wash, the step-path
// indicator, and every accent color on that slide. Index must line up
// with the *_STEP constants above.
const STEP_THEMES = [
  { key: 'movement', icon: 'walk',       color: '#FB923C', colorLight: '#FFF3E8' },
  { key: 'outside',  icon: 'sunny',      color: '#22C55E', colorLight: '#EAFBF0' },
  { key: 'social',   icon: 'people',     color: '#EC4899', colorLight: '#FDF1F7' },
  { key: 'sleep',    icon: 'moon',       color: '#6366F1', colorLight: '#EEF0FE' },
  { key: 'eat',      icon: 'restaurant', color: '#EAB308', colorLight: '#FEFBEA' },
  { key: 'reflect',  icon: 'book',       color: '#A855F7', colorLight: '#F8F0FE' },
];

// ─────────────────────────────────────────────────────────────
// Step-path progress indicator — replaces the flat bar. Each node
// pops when it becomes current; the connector after it fills once
// you've moved past it.
// ─────────────────────────────────────────────────────────────
function StepNode({ index, theme, done, isCurrent, isLast }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isCurrent) {
      scale.value = withSequence(withTiming(1.22, { duration: 140 }), withTiming(1, { duration: 140 }));
    }
  }, [isCurrent]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const state = done ? 'done' : isCurrent ? 'current' : 'upcoming';

  return (
    <View style={pathStyles.nodeWrap}>
      <Animated.View
        style={[
          pathStyles.circle,
          circleStyle,
          state === 'done'     && { backgroundColor: theme.color, borderColor: theme.color },
          state === 'current'  && { backgroundColor: theme.colorLight, borderColor: theme.color },
          state === 'upcoming' && { backgroundColor: colors.white, borderColor: colors.border },
        ]}
      >
        <Ionicons
          name={state === 'upcoming' ? `${theme.icon}-outline` : theme.icon}
          size={15}
          color={state === 'done' ? colors.white : state === 'current' ? theme.color : colors.textSecondary}
        />
      </Animated.View>
      {!isLast && (
        <View style={pathStyles.lineTrack}>
          <Animated.View
            layout={LinearTransition.duration(280)}
            style={[pathStyles.lineFill, { width: done ? '100%' : '0%', backgroundColor: theme.color }]}
          />
        </View>
      )}
    </View>
  );
}

const pathStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  nodeWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  lineFill: { height: '100%' },
});

// ─────────────────────────────────────────────────────────────
// Big choice card — replaces a plain Yes/No button with a large
// tappable card that pops when selected.
// ─────────────────────────────────────────────────────────────
function BigChoiceCard({ label, icon, iconOutline, iconFamily = 'ionicons', selected, onPress, accent }) {
  const IconComponent = iconFamily === 'material' ? MaterialCommunityIcons : Ionicons;
  const scale = useSharedValue(1);
  const wasSelected = useRef(selected);

  useEffect(() => {
    if (selected && !wasSelected.current) {
      scale.value = withSequence(
        withTiming(0.92, { duration: 90 }),
        withTiming(1.06, { duration: 150 }),
        withTiming(1, { duration: 120 })
      );
    }
    wasSelected.current = selected;
  }, [selected]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ flex: 1 }}>
      <Animated.View
        style={[
          bigChoiceStyles.card,
          cardStyle,
          selected
            ? { borderColor: accent, backgroundColor: accent + '14' }
            : { borderColor: colors.border, backgroundColor: colors.white },
        ]}
      >
        <IconComponent name={selected ? icon : iconOutline} size={38} color={selected ? accent : colors.textSecondary} />
        <Text style={[bigChoiceStyles.label, selected && { color: accent, fontFamily: font.semibold }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const bigChoiceStyles = StyleSheet.create({
  card: {
    aspectRatio: 1.15,
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: { fontSize: 16, fontFamily: font.medium, color: colors.text },
});

// ─────────────────────────────────────────────────────────────
// Duration dial — a circular drag-to-fill gauge standing in for
// the flat chip duration picker. Divides the ring into N equal
// zones (one per `options` entry) starting at 12 o'clock, clockwise —
// more options = finer-grained, more sensitive drag.
// ─────────────────────────────────────────────────────────────
const DIAL_SIZE   = 190;
const DIAL_STROKE = 14;
const DIAL_R      = (DIAL_SIZE - DIAL_STROKE) / 2;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_CIRC   = 2 * Math.PI * DIAL_R;
const DIAL_DOT_R  = DIAL_R + DIAL_STROKE / 2 + 10;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Point on the ring at `angleFromTop` degrees, measured clockwise from 12 o'clock.
const polarPoint = (angleFromTop, radius) => {
  const rad = ((angleFromTop - 90) * Math.PI) / 180;
  return { x: DIAL_CENTER + radius * Math.cos(rad), y: DIAL_CENTER + radius * Math.sin(rad) };
};

function DurationDial({ value, onChange, accent, options }) {
  const N = options.length;
  const indexOf = (v) => (v ? options.indexOf(v) : -1);
  const progress = useSharedValue(indexOf(value) >= 0 ? (indexOf(value) + 1) / N : 0);
  const lastIndex = useRef(indexOf(value));

  useEffect(() => {
    const idx = indexOf(value);
    progress.value = withTiming(idx >= 0 ? (idx + 1) / N : 0, { duration: 260 });
    lastIndex.current = idx;
  }, [value]);

  // e.x/e.y from Gesture.Pan are local to the gesture's own view — exactly
  // the DIAL_SIZE x DIAL_SIZE box below, so no measure() dance needed.
  const updateFromTouch = (x, y) => {
    const dx = x - DIAL_CENTER;
    const dy = y - DIAL_CENTER;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = 3 o'clock, clockwise
    const fromTop = ((deg + 90) % 360 + 360) % 360;
    const idx = Math.min(N - 1, Math.floor((fromTop / 360) * N));
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      progress.value = withTiming((idx + 1) / N, { duration: 180 });
      Haptics.selectionAsync();
      onChange(options[idx]);
    }
  };

  const dialGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => updateFromTouch(e.x, e.y))
    .onEnd((e) => updateFromTouch(e.x, e.y));

  const circleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: DIAL_CIRC * (1 - progress.value),
  }));

  const handleStyle = useAnimatedStyle(() => {
    const angle = progress.value * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    return {
      transform: [
        { translateX: DIAL_CENTER + DIAL_R * Math.cos(rad) - 9 },
        { translateY: DIAL_CENTER + DIAL_R * Math.sin(rad) - 9 },
      ],
    };
  });

  const selectedIdx = indexOf(value);

  return (
    <View style={dialStyles.wrap}>
      <GestureDetector gesture={dialGesture}>
        <View style={{ width: DIAL_SIZE, height: DIAL_SIZE }} collapsable={false}>
          <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
            <Circle
              cx={DIAL_CENTER} cy={DIAL_CENTER} r={DIAL_R}
              stroke={colors.border} strokeWidth={DIAL_STROKE} fill="none"
            />
            <AnimatedCircle
              cx={DIAL_CENTER} cy={DIAL_CENTER} r={DIAL_R}
              stroke={accent} strokeWidth={DIAL_STROKE} fill="none"
              strokeDasharray={DIAL_CIRC}
              strokeLinecap="round"
              rotation={-90}
              origin={`${DIAL_CENTER}, ${DIAL_CENTER}`}
              animatedProps={circleAnimatedProps}
            />
          </Svg>
          <Animated.View style={[dialStyles.handle, { borderColor: accent }, handleStyle]} pointerEvents="none" />
          <View style={dialStyles.centerLabel} pointerEvents="none">
            <Text
              style={[dialStyles.centerValue, { color: selectedIdx >= 0 ? accent : colors.textSecondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {selectedIdx >= 0 ? value : 'Drag to set'}
            </Text>
          </View>
          {options.map((_, i) => {
            const mid = (i + 0.5) * (360 / N);
            const pt = polarPoint(mid, DIAL_DOT_R);
            const active = i === selectedIdx;
            return (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  dialStyles.dot,
                  active
                    ? { left: pt.x - 5, top: pt.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: accent }
                    : { left: pt.x - 3, top: pt.y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
                ]}
              />
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

const dialStyles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: spacing.lg },
  handle: {
    position: 'absolute',
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.white,
    borderWidth: 3,
  },
  centerLabel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 28,
  },
  centerValue: { fontSize: 17, fontFamily: font.semibold, textAlign: 'center' },
  dot: { position: 'absolute' },
});

// ─────────────────────────────────────────────────────────────
// Activity grid — all options visible at once (no scrolling), but
// each card still pops/glows/checks on selection like the carousel
// version did. Multi-select via tap.
// ─────────────────────────────────────────────────────────────
function ActivityCard({ item, selected, onToggle, accent, style }) {
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected]);

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * lift.value }, { scale: 1 + 0.05 * lift.value }],
  }));

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => { Haptics.selectionAsync(); onToggle(item.id); }} style={style}>
      <Animated.View
        style={[
          activityStyles.card,
          liftStyle,
          selected
            ? { borderColor: accent, backgroundColor: accent + '14' }
            : { borderColor: colors.border, backgroundColor: colors.white },
        ]}
      >
        {selected && (
          <View style={[activityStyles.checkBadge, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={11} color={colors.white} />
          </View>
        )}
        <Image source={item.image} style={{ width: 32, height: 32 }} resizeMode="contain" />
        <Text style={[activityStyles.label, selected && { color: accent, fontFamily: font.semibold }]}>{item.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function ActivityGrid({ list, selected, onToggle, accent }) {
  return (
    <View style={activityStyles.grid}>
      {list.map(item => (
        <ActivityCard
          key={item.id}
          item={item}
          selected={selected.includes(item.id)}
          onToggle={onToggle}
          accent={accent}
          style={activityStyles.cardWrap}
        />
      ))}
    </View>
  );
}

const activityStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardWrap: { width: '30%' },
  card: {
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  checkBadge: {
    position: 'absolute',
    top: 8, right: 8,
    width: 18, height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
});

// ─────────────────────────────────────────────────────────────
// Movement step — reveals one piece at a time: Yes/No, then the
// duration dial once you've said yes, then the activity grid once
// a duration is picked. Only the dial's arrival auto-scrolls to
// usher the user toward it; the activity grid appears in place.
// ─────────────────────────────────────────────────────────────
function MovementStep({ values, setValues, setVal, toggleMovementActivity, advanceOnAnswer, theme }) {
  const scrollRef = useRef(null);

  // Only the dial reveal ushers the user down — once they're picking
  // activities they're already looking at the right part of the screen.
  // Skipped on mount so opening an existing (already-answered) entry for
  // editing doesn't immediately yank the screen down.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (values.movedYesterday === true) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 280);
      return () => clearTimeout(t);
    }
  }, [values.movedYesterday]);

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Movement</Animated.Text>
        <Text style={styles.subLabel}>Did you move yesterday?</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <BigChoiceCard
            label="Yes"
            icon="footsteps"
            iconOutline="footsteps-outline"
            selected={values.movedYesterday === true}
            onPress={() => { Haptics.selectionAsync(); setValues(p => ({ ...p, movedYesterday: true })); }}
            accent={theme.color}
          />
          <BigChoiceCard
            label="No"
            icon="sofa"
            iconOutline="sofa-outline"
            iconFamily="material"
            selected={values.movedYesterday === false}
            onPress={() => {
              Haptics.selectionAsync();
              setValues(p => ({ ...p, movedYesterday: false, movementAmount: null, movementActivities: [] }));
              advanceOnAnswer();
            }}
            accent={theme.color}
          />
        </View>

        {values.movedYesterday === true && (
          <Animated.View entering={FadeInDown.duration(260).springify()}>
            <Text style={styles.subLabel}>How much?</Text>
            <DurationDial
              value={values.movementAmount}
              onChange={setVal('movementAmount')}
              accent={theme.color}
              options={FINE_DURATIONS}
            />
          </Animated.View>
        )}

        {values.movedYesterday === true && values.movementAmount && (
          <Animated.View entering={FadeInDown.duration(260).springify()} style={{ marginTop: spacing.lg }}>
            <Text style={[styles.subLabel, { marginBottom: spacing.md }]}>What kind? (optional)</Text>
            <ActivityGrid
              list={MOVEMENT_ACTIVITIES}
              selected={values.movementActivities}
              onToggle={toggleMovementActivity}
              accent={theme.color}
            />
          </Animated.View>
        )}
      </ScrollView>
      <SwipeHint />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Outside step — same progressive-reveal shape as Movement (Yes/No,
// then the meter, then activities), but with the vertical meter in
// place of the circular dial for a bit of its own identity.
// ─────────────────────────────────────────────────────────────
function OutsideStep({ values, setValues, setVal, toggleOutsideActivity, advanceOnAnswer, theme }) {
  const scrollRef = useRef(null);

  // Skipped on mount so opening an existing (already-answered) entry for
  // editing doesn't immediately yank the screen down.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (values.wentOutside === true) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 280);
      return () => clearTimeout(t);
    }
  }, [values.wentOutside]);

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Outside</Animated.Text>
        <Text style={styles.subLabel}>Did you get outside yesterday?</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <BigChoiceCard
            label="Yes"
            icon="sunny"
            iconOutline="sunny-outline"
            selected={values.wentOutside === true}
            onPress={() => { Haptics.selectionAsync(); setValues(p => ({ ...p, wentOutside: true })); }}
            accent={theme.color}
          />
          <BigChoiceCard
            label="No"
            icon="home"
            iconOutline="home-outline"
            selected={values.wentOutside === false}
            onPress={() => {
              Haptics.selectionAsync();
              setValues(p => ({ ...p, wentOutside: false, outsideAmount: null, outsideActivities: [] }));
              advanceOnAnswer();
            }}
            accent={theme.color}
          />
        </View>

        {values.wentOutside === true && (
          <Animated.View entering={FadeInDown.duration(260).springify()}>
            <Text style={styles.subLabel}>How much?</Text>
            <DurationDial
              value={values.outsideAmount}
              onChange={setVal('outsideAmount')}
              accent={theme.color}
              options={FINE_DURATIONS}
            />
          </Animated.View>
        )}

        {values.wentOutside === true && values.outsideAmount && (
          <Animated.View entering={FadeInDown.duration(260).springify()} style={{ marginTop: spacing.lg }}>
            <Text style={[styles.subLabel, { marginBottom: spacing.md }]}>What kind? (optional)</Text>
            <ActivityGrid
              list={OUTSIDE_ACTIVITIES}
              selected={values.outsideActivities}
              onToggle={toggleOutsideActivity}
              accent={theme.color}
            />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Social step — a single Yes/No question, same BigChoiceCard
// treatment and top-aligned layout as Movement/Outside.
// ─────────────────────────────────────────────────────────────
function SocialStep({ values, setValues, advanceOnAnswer, theme }) {
  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Socializing</Animated.Text>
        <Text style={styles.subLabel}>Did you socialize yesterday?</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <BigChoiceCard
            label="Yes"
            icon="people"
            iconOutline="people-outline"
            selected={values.socialized === true}
            onPress={() => {
              Haptics.selectionAsync();
              setValues(p => ({ ...p, socialized: true }));
              advanceOnAnswer();
            }}
            accent={theme.color}
          />
          <BigChoiceCard
            label="No"
            icon="person"
            iconOutline="person-outline"
            selected={values.socialized === false}
            onPress={() => {
              Haptics.selectionAsync();
              setValues(p => ({ ...p, socialized: false }));
              advanceOnAnswer();
            }}
            accent={theme.color}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Reflect step — Word of the Day gets a live "stamped" preview below
// the input; the journal gets a warm diary-card look plus a shuffle
// button (only while empty) that surfaces a prompt you can tap to
// drop in as a starting sentence.
// ─────────────────────────────────────────────────────────────
function ReflectStep({ wordOfDay, setWordOfDay, journal, setJournal, theme, handleSubmit, loading, editingEntryId, insets }) {
  const [promptIndex, setPromptIndex] = useState(0);
  const stampScale = useSharedValue(1);

  useEffect(() => {
    if (wordOfDay) {
      stampScale.value = withSequence(withTiming(1.12, { duration: 100 }), withTiming(1, { duration: 150 }));
    }
  }, [wordOfDay]);

  const stampStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stampScale.value }, { rotate: '-3deg' }],
  }));

  const shufflePrompt = () => {
    Haptics.selectionAsync();
    setPromptIndex(i => {
      if (REFLECTION_PROMPTS.length <= 1) return i;
      let next = Math.floor(Math.random() * REFLECTION_PROMPTS.length);
      if (next === i) next = (next + 1) % REFLECTION_PROMPTS.length;
      return next;
    });
  };

  const usePrompt = () => {
    Haptics.selectionAsync();
    setJournal(REFLECTION_PROMPTS[promptIndex] + ' ');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      collapsable={false}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 100}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Reflect</Animated.Text>

        <View style={styles.field}>
          <Text style={styles.subLabel}>Word of the Day</Text>
          <TextInput
            style={styles.input}
            placeholder="One word to describe yesterday"
            placeholderTextColor={colors.textSecondary}
            value={wordOfDay}
            onChangeText={setWordOfDay}
            maxLength={30}
          />
          <Animated.View style={[reflectStyles.stamp, stampStyle, { borderColor: theme.color }]}>
            <Text
              style={[reflectStyles.stampText, { color: theme.color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {wordOfDay ? wordOfDay.toUpperCase() : '···'}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.field}>
          <View style={reflectStyles.journalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="book-outline" size={16} color={theme.color} />
              <Text style={styles.subLabel}>Journal</Text>
            </View>
            {!journal && (
              <TouchableOpacity
                style={[reflectStyles.shuffleBtn, { backgroundColor: theme.colorLight }]}
                onPress={shufflePrompt}
              >
                <Ionicons name="shuffle" size={14} color={theme.color} />
              </TouchableOpacity>
            )}
          </View>

          {!journal && (
            <TouchableOpacity
              onPress={usePrompt}
              style={[reflectStyles.promptChip, { borderColor: theme.color, backgroundColor: theme.colorLight }]}
            >
              <Text style={[reflectStyles.promptChipText, { color: theme.color }]}>
                {REFLECTION_PROMPTS[promptIndex]}
              </Text>
              <Ionicons name="add-circle-outline" size={16} color={theme.color} />
            </TouchableOpacity>
          )}

          <TextInput
            style={[styles.input, styles.journalInput, reflectStyles.diaryInput, { borderColor: theme.color + '33' }]}
            placeholder="Anything else about yesterday worth noting?"
            placeholderTextColor={colors.textSecondary}
            value={journal}
            onChangeText={setJournal}
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
      <View style={[styles.saveWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.color }, loading && styles.saveBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.saveBtnText}>{editingEntryId ? 'Update Check-in' : 'Save Check-in'}</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const reflectStyles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
  },
  stampText: {
    fontSize: 22,
    fontFamily: font.bold,
    letterSpacing: 2,
  },
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  shuffleBtn: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  promptChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  promptChipText: { flex: 1, fontSize: 13, fontFamily: font.medium },
  diaryInput: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
  },
});

// ─────────────────────────────────────────────────────────────
// Streak celebration — shown once, right after the FIRST save of the
// day (not on edits). Staged for suspense rather than firing all at
// once:
//   0.0s  screen holds on a dim, barely-breathing flame — anticipation
//   1.0s  the burst: screen shake, shockwave ring, a radial spark
//         burst, the flame flares up, the streak number pops
//   ~1.7s the flame settles into a hand-built organic flicker (two
//         independent, differently-timed loops layered together
//         rather than one symmetric pulse) with embers continuously
//         rising off it; the trophy drops in with a small bounce
//   ~2.2s "tap anywhere to continue" fades in
// Everything here is built from Reanimated primitives — no new
// dependencies, since a native rebuild isn't something I can verify
// in this environment.
// ─────────────────────────────────────────────────────────────
const EMBER_COLORS = ['#FB923C', '#FDE047', '#F97316', '#EF4444'];

const BURST_PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  angle: i * 30,
  distance: 78 + (i % 3) * 18,
  color: EMBER_COLORS[i % EMBER_COLORS.length],
}));

const EMBER_PARTICLES = Array.from({ length: 5 }, (_, i) => ({
  xOffset: (i - 2) * 14,
  color: EMBER_COLORS[i % EMBER_COLORS.length],
  stagger: i * 260,
}));

function BurstParticle({ burstT, angle, color, distance }) {
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const t = burstT.value;
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = t < 0.25 ? 0.3 + 2.8 * (t / 0.25) : Math.max(0, 1.1 - 1.1 * ((t - 0.25) / 0.75));
    return {
      opacity: Math.max(0, 1 - t * 1.15),
      transform: [
        { translateX: Math.cos(rad) * distance * eased },
        { translateY: Math.sin(rad) * distance * eased },
        { scale },
      ],
    };
  });
  return <Animated.View style={[celebStyles.particle, { backgroundColor: color }, style]} pointerEvents="none" />;
}

function RisingEmber({ color, startDelay, xOffset }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      startDelay,
      withRepeat(withTiming(1, { duration: 1900, easing: Easing.linear }), -1, false)
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const opacity = t.value < 0.12 ? t.value / 0.12 : t.value > 0.75 ? Math.max(0, (1 - t.value) / 0.25) : 1;
    return {
      opacity,
      transform: [
        { translateY: -78 * t.value },
        { translateX: xOffset + Math.sin(t.value * Math.PI * 2) * 6 },
        { scale: 0.6 + 0.4 * (1 - t.value) },
      ],
    };
  });

  return <Animated.View style={[celebStyles.ember, { backgroundColor: color }, style]} pointerEvents="none" />;
}

function StreakCelebration({ previous, next, onContinue }) {
  const tier = getTrophyTier(next);
  const [displayStreak, setDisplayStreak] = useState(previous);
  const [canContinue, setCanContinue] = useState(false);
  const [showEmbers, setShowEmbers] = useState(false);

  const shakeX = useSharedValue(0);
  const flameScale = useSharedValue(0.4);
  const flameRotate = useSharedValue(0);
  // The flame is two stacked icons that crossfade — a grey hollow outline
  // (visible through the whole wait+buildup) and a colored filled flame
  // (invisible until the exact moment the burst peaks).
  const flameOutlineOpacity = useSharedValue(0.85);
  const flameFillOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.3);
  const ringOpacity = useSharedValue(0);
  const burstT = useSharedValue(0);
  const numberScale = useSharedValue(1);
  const numberOpacity = useSharedValue(1);
  const trophyY = useSharedValue(-24);
  const trophyOpacity = useSharedValue(0);
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    const BURST_AT = 1000;       // suspense holds this long before anything starts building
    const BUILD_DURATION = 1500; // the burst itself is dragged out over this long
    const PEAK_AT = BURST_AT + BUILD_DURATION; // the actual climax — shake, particles, color fill, number change
    const SETTLE_AT = PEAK_AT + 500;
    const HINT_AT = SETTLE_AT + 500;

    // ── Suspense (0 → BURST_AT): dim room tone. Small hollow flame,
    // barely breathing, three soft heartbeat taps building anticipation.
    flameScale.value = withRepeat(withSequence(withTiming(0.44, { duration: 600 }), withTiming(0.38, { duration: 600 })), -1, true);

    const hb1 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 250);
    const hb2 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 550);
    const hb3 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 850);

    // ── Buildup (BURST_AT → PEAK_AT): the burst has "started" but is
    // dragged out — a continuous rumble, the flame charging up while
    // STILL grey/hollow, escalating haptics. Nothing fills with color
    // yet; that's reserved for the peak.
    const buildHaptics = [];
    const tBuild = setTimeout(() => {
      shakeX.value = withRepeat(withSequence(withTiming(2.5, { duration: 80 }), withTiming(-2.5, { duration: 80 })), -1, true);

      flameScale.value = withTiming(0.85, { duration: BUILD_DURATION, easing: Easing.in(Easing.cubic) });
      flameOutlineOpacity.value = withTiming(1, { duration: 300 });

      buildHaptics.push(
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 550),
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 1050)
      );
    }, BURST_AT);

    // ── Peak (PEAK_AT): the actual explosion. Sharp shake, shockwave,
    // radial sparks, the flame snaps from hollow-grey to lit color, and
    // the streak number flips from the old value to the new one.
    const tPeak = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      shakeX.value = withSequence(
        withTiming(-12, { duration: 40 }),
        withTiming(12, { duration: 60 }),
        withTiming(-9, { duration: 60 }),
        withTiming(9, { duration: 60 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 50 }),
        withTiming(0, { duration: 40 })
      );

      ringScale.value = 0.3;
      ringOpacity.value = 0.9;
      ringScale.value = withTiming(2.8, { duration: 600, easing: Easing.out(Easing.cubic) });
      ringOpacity.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });

      burstT.value = 0;
      burstT.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });

      // The color fill — this is the one moment it happens.
      flameOutlineOpacity.value = withTiming(0, { duration: 220 });
      flameFillOpacity.value = withTiming(1, { duration: 220 });

      flameScale.value = withSequence(
        withTiming(1.55, { duration: 200, easing: Easing.out(Easing.back(2.2)) }),
        withTiming(1, { duration: 260 })
      );

      // Number flip: shrink/fade the old value out, swap the digits the
      // instant it's invisible, then pop the new value back in.
      numberOpacity.value = withSequence(
        withTiming(0, { duration: 110 }, (finished) => {
          if (finished) runOnJS(setDisplayStreak)(next);
        }),
        withTiming(1, { duration: 220 })
      );
      numberScale.value = withSequence(
        withTiming(0.6, { duration: 110 }),
        withTiming(1.35, { duration: 0 }),
        withTiming(1, { duration: 220 })
      );

      setCanContinue(true);
    }, PEAK_AT);

    const tSettle = setTimeout(() => {
      // Two independently-timed loops layered on the same value read
      // as organic flicker rather than a mechanical single pulse.
      flameScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 450 }),
          withTiming(0.95, { duration: 520 }),
          withTiming(1.04, { duration: 380 }),
          withTiming(0.97, { duration: 410 })
        ),
        -1,
        false
      );
      flameRotate.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 900 }),
          withTiming(3, { duration: 1000 }),
          withTiming(-2, { duration: 850 })
        ),
        -1,
        true
      );
      trophyOpacity.value = withTiming(1, { duration: 320 });
      trophyY.value = withSequence(
        withTiming(6, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 200 })
      );

      setShowEmbers(true);
    }, SETTLE_AT);

    const tHint = setTimeout(() => {
      hintOpacity.value = withTiming(1, { duration: 400 });
    }, HINT_AT);

    return () => {
      clearTimeout(hb1); clearTimeout(hb2); clearTimeout(hb3);
      clearTimeout(tBuild); clearTimeout(tPeak); clearTimeout(tSettle); clearTimeout(tHint);
      buildHaptics.forEach(clearTimeout);
    };
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const flameGroupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }, { rotate: `${flameRotate.value}deg` }],
  }));
  const flameOutlineStyle = useAnimatedStyle(() => ({ opacity: flameOutlineOpacity.value }));
  const flameFillStyle = useAnimatedStyle(() => ({ opacity: flameFillOpacity.value }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const numberStyle = useAnimatedStyle(() => ({
    opacity: numberOpacity.value,
    transform: [{ scale: numberScale.value }],
  }));
  const trophyStyle = useAnimatedStyle(() => ({
    opacity: trophyOpacity.value,
    transform: [{ translateY: trophyY.value }],
  }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={!canContinue}
      onPress={onContinue}
      style={celebStyles.container}
    >
      <Animated.View style={[celebStyles.center, containerStyle]}>
        <Animated.View style={[celebStyles.ring, { borderColor: tier.color }, ringStyle]} pointerEvents="none" />

        <View style={celebStyles.burstOrigin} pointerEvents="none">
          {BURST_PARTICLES.map((p, i) => (
            <BurstParticle key={i} burstT={burstT} angle={p.angle} color={p.color} distance={p.distance} />
          ))}
          {showEmbers && EMBER_PARTICLES.map((e, i) => (
            <RisingEmber key={i} color={e.color} startDelay={e.stagger} xOffset={e.xOffset} />
          ))}
        </View>

        <Animated.View style={flameGroupStyle}>
          <View style={celebStyles.flameStack}>
            <Animated.View style={[celebStyles.flameLayer, flameOutlineStyle]}>
              <Ionicons name="flame-outline" size={110} color={colors.textSecondary} />
            </Animated.View>
            <Animated.View style={[celebStyles.flameLayer, flameFillStyle]}>
              <Ionicons name="flame" size={110} color="#FB923C" />
            </Animated.View>
          </View>
        </Animated.View>
        <Animated.Text style={[celebStyles.streakNumber, numberStyle, { color: tier.color }]}>
          {displayStreak}
        </Animated.Text>
        <Text style={celebStyles.streakLabel}>day streak</Text>

        <Animated.View style={trophyStyle}>
          <Ionicons name="trophy" size={64} color={tier.color} style={{ marginTop: spacing.xl }} />
        </Animated.View>
        <Animated.Text style={[celebStyles.tierLabel, { color: tier.color }, trophyStyle]}>
          {tier.tier}
        </Animated.Text>
      </Animated.View>

      <Animated.View style={[celebStyles.hint, hintStyle]} pointerEvents="none">
        <Text style={celebStyles.hintText}>Tap anywhere to continue</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const celebStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14142B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { alignItems: 'center' },
  ring: {
    position: 'absolute',
    top: -40, alignSelf: 'center',
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 2.5,
  },
  burstOrigin: {
    position: 'absolute',
    top: 15, alignSelf: 'center',
    width: 1, height: 1,
  },
  flameStack: { width: 110, height: 110 },
  flameLayer: { position: 'absolute', top: 0, left: 0 },
  particle: {
    position: 'absolute',
    width: 7, height: 7, borderRadius: 3.5,
  },
  ember: {
    position: 'absolute',
    width: 5, height: 5, borderRadius: 2.5,
  },
  streakNumber: { fontSize: 72, fontFamily: font.bold, marginTop: spacing.sm },
  streakLabel: { fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: -4 },
  tierLabel: {
    fontSize: 13,
    fontFamily: font.semibold,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  hint: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
  },
  hintText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
});

// ─────────────────────────────────────────────────────────────
// Recap screen — the analytical "what you entered" readout shown
// after saving (always; the streak celebration above it only shows
// on the first save of the day). Rings fill proportionally so
// Movement/Outside read as "how much" rather than just yes/no.
// ─────────────────────────────────────────────────────────────
function MiniRing({ progress, color, icon, size = 56, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const center = size / 2;
  const circ = 2 * Math.PI * r;
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, { duration: 900 });
  }, [progress]);

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - animatedProgress.value),
  }));

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={center} cy={center} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={center} cy={center} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
          animatedProps={circleProps}
        />
      </Svg>
      <Ionicons name={icon} size={size * 0.36} color={color} />
    </View>
  );
}

function RecapRow({ icon, iconColor, label, value, sub }) {
  return (
    <View style={recapStyles.row}>
      <View style={[recapStyles.rowIconWrap, { backgroundColor: iconColor + '1F' }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={recapStyles.rowLabel}>{label}</Text>
        <Text style={recapStyles.rowValue}>{value}</Text>
        {sub ? <Text style={recapStyles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function RecapScreen({ values, wordOfDay, journal, meals, onDone }) {
  const insets = useSafeAreaInsets();
  const sleepHours = computeSleepHours(values.bedTime, values.wakeTime);
  const hoursHealthy = isSleepHoursHealthy(sleepHours);

  const movementProgress = values.movedYesterday === true ? durationProgress(values.movementAmount) : 0.06;
  const outsideProgress  = values.wentOutside === true ? durationProgress(values.outsideAmount) : 0.06;
  const socialProgress   = values.socialized === true ? 1 : 0.06;
  const sleepProgress    = Math.min(1, sleepHours / 9);
  const eatProgress      = values.ateWell === true ? 1 : 0.06;

  const activityLabels = (list, ids) =>
    ids.map(id => list.find(a => a.id === id)?.label).filter(Boolean).join(', ');

  const movementValue = values.movedYesterday === true
    ? values.movementAmount
    : values.movedYesterday === false ? "Didn't move" : 'Not answered';
  const movementSub = values.movedYesterday === true && values.movementActivities.length
    ? activityLabels(MOVEMENT_ACTIVITIES, values.movementActivities) : null;

  const outsideValue = values.wentOutside === true
    ? values.outsideAmount
    : values.wentOutside === false ? "Didn't go outside" : 'Not answered';
  const outsideSub = values.wentOutside === true && values.outsideActivities.length
    ? activityLabels(OUTSIDE_ACTIVITIES, values.outsideActivities) : null;

  const socialValue = values.socialized === true ? 'Socialized' : values.socialized === false ? 'Alone time' : 'Not answered';
  const eatValue = values.ateWell === true ? 'Ate well' : values.ateWell === false ? 'Could have eaten better' : 'Not answered';
  const sleepLine = `${formatTime(values.bedTime)} – ${formatTime(values.wakeTime)} • ${sleepHours}h`;
  const journalSnippet = journal && journal.length > 140 ? journal.slice(0, 140).trim() + '…' : journal;

  const rings = [
    { theme: STEP_THEMES[0], progress: movementProgress },
    { theme: STEP_THEMES[1], progress: outsideProgress },
    { theme: STEP_THEMES[2], progress: socialProgress },
    { theme: STEP_THEMES[3], progress: sleepProgress },
    { theme: STEP_THEMES[4], progress: eatProgress },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={recapStyles.scroll}>
        <Text style={recapStyles.title}>Your Day, Recapped</Text>

        <View style={recapStyles.ringRow}>
          {rings.map((r, i) => (
            <View key={i} style={recapStyles.ringWrap}>
              <MiniRing progress={r.progress} color={r.theme.color} icon={r.theme.icon} />
            </View>
          ))}
        </View>

        <View style={recapStyles.featureRow}>
          <View style={[recapStyles.featureCard, { borderColor: STEP_THEMES[5].color }]}>
            <Text style={recapStyles.featureLabel}>Word of the Day</Text>
            <Text
              style={[recapStyles.featureWord, { color: STEP_THEMES[5].color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {wordOfDay ? wordOfDay.toUpperCase() : '···'}
            </Text>
          </View>
          <View style={[recapStyles.featureCard, { borderColor: STEP_THEMES[3].color }]}>
            <Text style={recapStyles.featureLabel}>Sleep</Text>
            <Text style={[recapStyles.featureWord, { color: hoursHealthy ? colors.success : colors.warning }]}>
              {sleepHours}h
            </Text>
          </View>
        </View>

        <View style={recapStyles.list}>
          <RecapRow icon="walk" iconColor={STEP_THEMES[0].color} label="Movement" value={movementValue} sub={movementSub} />
          <RecapRow icon="sunny" iconColor={STEP_THEMES[1].color} label="Outside" value={outsideValue} sub={outsideSub} />
          <RecapRow icon="people" iconColor={STEP_THEMES[2].color} label="Social" value={socialValue} />
          <RecapRow icon="moon" iconColor={STEP_THEMES[3].color} label="Sleep" value={sleepLine} />
          <RecapRow icon="restaurant" iconColor={STEP_THEMES[4].color} label="Eating" value={eatValue} sub={meals || null} />
          {journalSnippet ? (
            <RecapRow icon="book" iconColor={STEP_THEMES[5].color} label="Journal" value={journalSnippet} />
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.saveWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.saveBtn} onPress={onDone}>
          <Text style={styles.saveBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const recapStyles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 140 },
  title: { fontSize: 22, fontFamily: font.bold, color: colors.text, marginBottom: spacing.lg },
  ringRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  ringWrap: { alignItems: 'center' },
  featureRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  featureCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  featureLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  featureWord: { fontSize: 24, fontFamily: font.bold },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { fontSize: 12, color: colors.textSecondary },
  rowValue: { fontSize: 15, fontFamily: font.medium, color: colors.text, marginTop: 1 },
  rowSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});

export default function DailyCheckInScreen() {
  const { currentUser } = useApp();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [editingEntryId, setEditingEntryId] = useState(null);

  // 'form' | 'streak' | 'recap' — post-save takeover of the whole screen.
  const [phase, setPhase] = useState('form');
  const [streakInfo, setStreakInfo] = useState({ previous: 0, next: 0 });

  // Streak flame in the header — same calculation Home/Trophy use.
  const { entries: streakEntries = [] } = useEntries(currentUser?.uid);
  const { currentStreak } = calculateStreak(streakEntries.filter(isFiveFactorEntry));
  const trophyTier = getTrophyTier(currentStreak);

  const [values, setValues] = useState({
    movedYesterday: null, movementAmount: null, movementActivities: [],
    wentOutside: null, outsideAmount: null, outsideActivities: [],
    socialized: null,
    bedTime: '23:00', wakeTime: '07:00',
    ateWell: null,
  });
  const [wordOfDay, setWordOfDay] = useState('');
  const [journal, setJournal]     = useState('');
  const [mealsByType, setMealsByType] = useState({ breakfast: '', lunch: '', dinner: '', snacks: '' });
  const setMealField = (key) => (v) => setMealsByType(prev => ({ ...prev, [key]: v }));
  const [sleepField, setSleepField] = useState(null); // 'bedTime' | 'wakeTime' | null

  const setVal = (key) => (v) => setValues(prev => ({ ...prev, [key]: v }));
  const toggleMovementActivity = (id) =>
    setValues(prev => ({
      ...prev,
      movementActivities: prev.movementActivities.includes(id)
        ? prev.movementActivities.filter(x => x !== id)
        : [...prev.movementActivities, id],
    }));
  const toggleOutsideActivity = (id) =>
    setValues(prev => ({
      ...prev,
      outsideActivities: prev.outsideActivities.includes(id)
        ? prev.outsideActivities.filter(x => x !== id)
        : [...prev.outsideActivities, id],
    }));

  // If today's 5 Things check-in already exists, load it so it can be edited
  // in place instead of creating a second entry for the same day.
  useEffect(() => {
    if (!currentUser?.uid) return;
    getTodayEntries(currentUser.uid)
      .then(entries => {
        const existing = entries.find(e => e.type === 'fiveFactors');
        if (existing) {
          setEditingEntryId(existing.id);
          setValues({
            movedYesterday: existing.movedYesterday ?? null,
            movementAmount: existing.movementAmount ?? null,
            movementActivities: existing.movementActivities ?? [],
            wentOutside: existing.wentOutside ?? null,
            outsideAmount: existing.outsideAmount ?? null,
            outsideActivities: existing.outsideActivities ?? [],
            socialized: existing.socialized ?? null,
            bedTime: existing.bedTime ?? '23:00',
            wakeTime: existing.wakeTime ?? '07:00',
            ateWell: existing.ateWell ?? null,
          });
          setWordOfDay(existing.wordOfDay ?? '');
          setJournal(existing.journal ?? '');
          setMealsByType(parseMeals(existing.meals));
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [currentUser?.uid]);

  const isStepAnswered = (idx) => {
    switch (idx) {
      case MOVEMENT_STEP: return values.movedYesterday !== null && (values.movedYesterday === false || !!values.movementAmount);
      case OUTSIDE_STEP:  return values.wentOutside !== null && (values.wentOutside === false || !!values.outsideAmount);
      case SOCIAL_STEP:   return values.socialized !== null;
      case SLEEP_STEP:    return true;
      case EAT_STEP:      return values.ateWell !== null;
      default:            return true;
    }
  };

  const handleSleepTimeChange = (_, date) => {
    if (!date || !sleepField) return;
    setValues(prev => ({ ...prev, [sleepField]: dateToTimeString(date) }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const sleepHours = computeSleepHours(values.bedTime, values.wakeTime);
      const entryData = {
        type: 'fiveFactors',
        forDate: getYesterdayDateString(),
        movedYesterday: values.movedYesterday,
        movementAmount: values.movementAmount,
        movementActivities: values.movementActivities,
        wentOutside: values.wentOutside,
        outsideAmount: values.outsideAmount,
        outsideActivities: values.outsideActivities,
        socialized: values.socialized,
        sleepHours,
        bedTime: values.bedTime,
        wakeTime: values.wakeTime,
        ateWell: values.ateWell,
        meals: formatMeals(mealsByType),
        wordOfDay,
        journal,
      };
      const wasFirstSaveToday = !editingEntryId;
      if (editingEntryId) {
        await updateEntry(editingEntryId, entryData);
      } else {
        await createEntry(entryData, currentUser?.uid, currentUser?.therapistId || null);
      }
      scheduleStreakRisk().catch(() => {});

      if (wasFirstSaveToday) {
        // Computed locally rather than waiting on the entries listener to
        // refresh, so the celebration can fire immediately on save.
        const fiveFactorEntries = streakEntries.filter(isFiveFactorEntry);
        const previous = calculateStreak(fiveFactorEntries).currentStreak;
        const next = calculateStreak([
          ...fiveFactorEntries,
          { date: getTodayDateString(), completed: true },
        ]).currentStreak;
        setStreakInfo({ previous, next });
        setPhase('streak');
      } else {
        setPhase('recap');
      }
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

  // ── Horizontal swipe animation ─────────────────────────────
  const totalOffset = useSharedValue(0);
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: totalOffset.value }],
  }));

  // Continuous step position (e.g. 2.4 mid-swipe) — drives the background
  // wash so the color arrives in lockstep with the slide, not after it.
  const stepProgress = useDerivedValue(() => -totalOffset.value / screenWidth);
  const bgWashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      stepProgress.value,
      STEP_THEMES.map((_, i) => i),
      STEP_THEMES.map(t => t.colorLight)
    ),
  }));

  const goNext = () => setStep(s => s + 1);
  const goPrev = () => setStep(s => s - 1);

  const handleHorizontalMove = (dx) => {
    const base = -step * screenWidth;
    const canGoNext = step < TOTAL_STEPS - 1 && isStepAnswered(step);
    const canGoBack = step > 0;
    if (dx < 0 && !canGoNext) {
      totalOffset.value = base + dx * 0.12; // rubber-band — locked until answered
      return;
    }
    if (dx > 0 && !canGoBack) {
      totalOffset.value = base + dx * 0.12;
      return;
    }
    totalOffset.value = base + dx;
  };

  const handleHorizontalEnd = (dx) => {
    const THRESHOLD = screenWidth * 0.15;
    const canGoNext = step < TOTAL_STEPS - 1 && isStepAnswered(step);
    const canGoBack = step > 0;

    if (dx < -THRESHOLD && canGoNext) {
      totalOffset.value = withTiming(-(step + 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goNext)();
      });
    } else if (dx > THRESHOLD && canGoBack) {
      totalOffset.value = withTiming(-(step - 1) * screenWidth, { duration: 260 }, (finished) => {
        if (finished) runOnJS(goPrev)();
      });
    } else {
      if (dx < -THRESHOLD && step < TOTAL_STEPS - 1 && !isStepAnswered(step)) {
        runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Warning);
      }
      totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    }
  };

  const advanceOnAnswer = () => {
    // Small delay so the tap's own highlight is visible before auto-advancing
    setTimeout(() => {
      setStep(s => {
        if (s < TOTAL_STEPS - 1) {
          totalOffset.value = withTiming(-(s + 1) * screenWidth, { duration: 260 });
          return s + 1;
        }
        return s;
      });
    }, 180);
  };

  // Up to 3 slides (step-1, step, step+1) are mounted at once, so each needs
  // its own Gesture.Pan() instance — a single shared gesture object can't
  // back multiple simultaneously-mounted GestureDetectors.
  const makeSwipeGesture = () => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => handleHorizontalMove(e.translationX))
    .onEnd((e) => handleHorizontalEnd(e.translationX))
    .onFinalize((_e, success) => {
      if (!success) totalOffset.value = withTiming(-step * screenWidth, { duration: 220 });
    });

  // ── Slide renderers ────────────────────────────────────────
  // Each takes an `accent` (the current step's theme color) so the
  // active states feel like they belong to that specific step.
  const renderYesNo = (value, onYes, onNo, accent = colors.primary) => (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, value === true && { borderColor: accent, backgroundColor: accent + '1A' }]}
        onPress={onYes}
      >
        <Text style={[styles.toggleBtnText, value === true && { color: accent, fontFamily: font.semibold }]}>Yes</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, value === false && { borderColor: accent, backgroundColor: accent + '1A' }]}
        onPress={onNo}
      >
        <Text style={[styles.toggleBtnText, value === false && { color: accent, fontFamily: font.semibold }]}>No</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSlideContent = (slideIndex) => {
    if (slideIndex < 0 || slideIndex >= TOTAL_STEPS) {
      return <View key={`empty-${slideIndex}`} style={{ flex: 1 }} />;
    }

    if (slideIndex === MOVEMENT_STEP) {
      const theme = STEP_THEMES[MOVEMENT_STEP];
      return (
        <GestureDetector key="movement" gesture={makeSwipeGesture()}>
          <MovementStep
            values={values}
            setValues={setValues}
            setVal={setVal}
            toggleMovementActivity={toggleMovementActivity}
            advanceOnAnswer={advanceOnAnswer}
            theme={theme}
          />
        </GestureDetector>
      );
    }

    if (slideIndex === OUTSIDE_STEP) {
      const theme = STEP_THEMES[OUTSIDE_STEP];
      return (
        <GestureDetector key="outside" gesture={makeSwipeGesture()}>
          <OutsideStep
            values={values}
            setValues={setValues}
            setVal={setVal}
            toggleOutsideActivity={toggleOutsideActivity}
            advanceOnAnswer={advanceOnAnswer}
            theme={theme}
          />
        </GestureDetector>
      );
    }

    if (slideIndex === SOCIAL_STEP) {
      const theme = STEP_THEMES[SOCIAL_STEP];
      return (
        <GestureDetector key="social" gesture={makeSwipeGesture()}>
          <SocialStep
            values={values}
            setValues={setValues}
            advanceOnAnswer={advanceOnAnswer}
            theme={theme}
          />
        </GestureDetector>
      );
    }

    if (slideIndex === SLEEP_STEP) {
      const theme = STEP_THEMES[SLEEP_STEP];
      const sleepHours = computeSleepHours(values.bedTime, values.wakeTime);
      const bedHealthy = isBedTimeHealthy(values.bedTime);
      const wakeHealthy = isWakeTimeHealthy(values.wakeTime);
      const hoursHealthy = isSleepHoursHealthy(sleepHours);
      const hoursCaption = hoursHealthy ? 'Great range' : sleepHours < 7 ? 'A bit short' : 'A bit long';
      return (
        <GestureDetector key="sleep" gesture={makeSwipeGesture()}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Sleep</Animated.Text>
            <Text style={styles.subLabel}>How much did you sleep last night?</Text>

            <TouchableOpacity style={styles.sleepRow} onPress={() => setSleepField('bedTime')}>
              <View style={styles.sleepRowLeft}>
                <View style={[styles.sleepIconWrap, { backgroundColor: theme.colorLight }]}>
                  <Ionicons name="moon" size={22} color={theme.color} />
                </View>
                <View>
                  <Text style={styles.sleepRowLabel}>Went to sleep</Text>
                  <Text style={[styles.sleepRowCaption, { color: bedHealthy ? colors.success : colors.warning }]}>
                    {bedHealthy ? 'Good bedtime' : 'Outside typical range'}
                  </Text>
                </View>
              </View>
              <View style={styles.sleepRowRight}>
                <Text style={[styles.sleepRowValue, { color: bedHealthy ? colors.success : colors.warning }]}>
                  {formatTime(values.bedTime)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sleepRow} onPress={() => setSleepField('wakeTime')}>
              <View style={styles.sleepRowLeft}>
                <View style={[styles.sleepIconWrap, { backgroundColor: theme.colorLight }]}>
                  <Ionicons name="sunny" size={22} color={theme.color} />
                </View>
                <View>
                  <Text style={styles.sleepRowLabel}>Woke up</Text>
                  <Text style={[styles.sleepRowCaption, { color: wakeHealthy ? colors.success : colors.warning }]}>
                    {wakeHealthy ? 'Good wake time' : 'Outside typical range'}
                  </Text>
                </View>
              </View>
              <View style={styles.sleepRowRight}>
                <Text style={[styles.sleepRowValue, { color: wakeHealthy ? colors.success : colors.warning }]}>
                  {formatTime(values.wakeTime)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <View style={styles.sleepTotalWrap}>
              <Text style={[styles.sleepTotalValue, { color: hoursHealthy ? colors.success : colors.warning }]}>
                {sleepHours}
              </Text>
              <Text style={styles.sleepTotalLabel}>hours of sleep</Text>
              <Text style={[styles.sleepTotalCaption, { color: hoursHealthy ? colors.success : colors.warning }]}>
                {hoursCaption}
              </Text>
            </View>
          </ScrollView>
        </GestureDetector>
      );
    }

    if (slideIndex === EAT_STEP) {
      const theme = STEP_THEMES[EAT_STEP];
      return (
        <GestureDetector key="eat" gesture={makeSwipeGesture()}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={insets.top + 100}
          >
            <ScrollView
              contentContainerStyle={[styles.scroll, { paddingBottom: 260 }]}
              keyboardShouldPersistTaps="handled"
            >
              <Animated.Text entering={FadeInDown.duration(260).springify()} style={styles.stepTitle}>Eating</Animated.Text>
              <Text style={styles.subLabel}>Did you eat well yesterday?</Text>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                <BigChoiceCard
                  label="Yes"
                  icon="checkmark-circle"
                  iconOutline="checkmark-circle-outline"
                  selected={values.ateWell === true}
                  onPress={() => { Haptics.selectionAsync(); setVal('ateWell')(true); }}
                  accent={theme.color}
                />
                <BigChoiceCard
                  label="No"
                  icon="close-circle"
                  iconOutline="close-circle-outline"
                  selected={values.ateWell === false}
                  onPress={() => { Haptics.selectionAsync(); setVal('ateWell')(false); }}
                  accent={theme.color}
                />
              </View>

              <Text style={[styles.subLabel, { marginTop: spacing.lg }]}>What did you eat yesterday? (optional)</Text>
              {MEAL_TYPES.map(m => (
                <View key={m.key} style={styles.mealRow}>
                  <View style={[styles.mealIconWrap, { backgroundColor: theme.colorLight }]}>
                    <Ionicons name={m.icon} size={18} color={theme.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealLabel}>{m.label}</Text>
                    <TextInput
                      style={styles.mealInput}
                      placeholder={`What did you have for ${m.label.toLowerCase()}?`}
                      placeholderTextColor={colors.textSecondary}
                      value={mealsByType[m.key]}
                      onChangeText={setMealField(m.key)}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </GestureDetector>
      );
    }

    if (slideIndex === REFLECT_STEP) {
      const theme = STEP_THEMES[REFLECT_STEP];
      return (
        <GestureDetector key="reflect" gesture={makeSwipeGesture()}>
          <ReflectStep
            wordOfDay={wordOfDay}
            setWordOfDay={setWordOfDay}
            journal={journal}
            setJournal={setJournal}
            theme={theme}
            handleSubmit={handleSubmit}
            loading={loading}
            editingEntryId={editingEntryId}
            insets={insets}
          />
        </GestureDetector>
      );
    }

    return null;
  };

  if (checking) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (phase === 'streak') {
    return (
      <StreakCelebration
        previous={streakInfo.previous}
        next={streakInfo.next}
        onContinue={() => setPhase('recap')}
      />
    );
  }

  if (phase === 'recap') {
    return (
      <RecapScreen
        values={values}
        wordOfDay={wordOfDay}
        journal={journal}
        meals={formatMeals(mealsByType)}
        onDone={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[StyleSheet.absoluteFillObject, bgWashStyle]} pointerEvents="none" />

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
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{editingEntryId ? 'Edit 5 Things' : '5 Things Check-in'}</Text>
          {currentStreak > 0 && (
            <View style={styles.streakPill}>
              <Ionicons name="flame" size={12} color={trophyTier.color} />
              <Text style={[styles.streakText, { color: trophyTier.color }]}>{currentStreak}</Text>
            </View>
          )}
        </View>
        <Text style={styles.stepLabel}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      <View style={[pathStyles.row, { zIndex: 10 }]}>
        {STEP_THEMES.map((theme, i) => (
          <StepNode
            key={theme.key}
            index={i}
            theme={theme}
            done={i < step}
            isCurrent={i === step}
            isLast={i === STEP_THEMES.length - 1}
          />
        ))}
      </View>

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

      <Modal
        visible={!!sleepField}
        transparent
        animationType="slide"
        onRequestClose={() => setSleepField(null)}
      >
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSleepField(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.sheetTitle}>
              {sleepField === 'bedTime' ? 'Went to Sleep' : 'Woke Up'}
            </Text>
            {sleepField && (
              <DateTimePicker
                value={timeStringToDate(values[sleepField])}
                mode="time"
                display="spinner"
                onChange={handleSleepTimeChange}
                style={{ width: '100%' }}
              />
            )}
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setSleepField(null)}>
              <Text style={styles.confirmBtnText}>Confirm</Text>
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
    paddingVertical: spacing.md,
  },
  cancel:    { fontSize: 16, color: colors.textSecondary },
  headerCenter: { alignItems: 'center', gap: 3 },
  title:     { fontSize: 17, fontFamily: font.semibold, color: colors.text },
  stepLabel: { fontSize: 14, color: colors.textSecondary },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.white,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  streakText: { fontSize: 11, fontFamily: font.semibold },

  scroll:    { padding: spacing.lg, paddingBottom: 120 },
  stepTitle: { fontSize: 24, fontFamily: font.bold, color: colors.text, marginBottom: spacing.lg },
  subLabel:  { fontSize: 15, fontFamily: font.medium, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },

  toggleRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  toggleBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  toggleBtnActive:    { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  toggleBtnText:      { fontSize: 16, fontFamily: font.medium, color: colors.text },
  toggleBtnTextActive:{ color: colors.primary, fontFamily: font.semibold },

  field:      { marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.white,
  },
  journalInput: { minHeight: 150, paddingTop: spacing.md },

  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mealIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  mealLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  mealInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.white,
  },

  saveWrap: { paddingHorizontal: spacing.lg },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText:     { color: colors.white, fontSize: 16, fontFamily: font.semibold },
  saveBtnDisabled: { opacity: 0.7 },

  sleepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  sleepIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  sleepRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sleepRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sleepRowLabel: { fontSize: 16, fontFamily: font.medium, color: colors.text },
  sleepRowCaption: { fontSize: 12, marginTop: 2 },
  sleepRowValue: { fontSize: 18, fontFamily: font.semibold },
  sleepTotalWrap: { alignItems: 'center', marginTop: spacing.xl },
  sleepTotalValue: { fontSize: 56, fontFamily: font.bold },
  sleepTotalLabel: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  sleepTotalCaption: { fontSize: 13, fontFamily: font.medium, marginTop: 4 },

  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: font.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  confirmBtnText: { color: colors.white, fontSize: 16, fontFamily: font.semibold },
});
