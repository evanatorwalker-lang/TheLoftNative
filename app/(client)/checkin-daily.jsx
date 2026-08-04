import { useState, useEffect } from 'react';
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
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../../src/context/AppContext';
import { createEntry, updateEntry, getTodayEntries } from '../../src/services/entry.service';
import { scheduleStreakRisk } from '../../src/services/notification.service';
import { timeStringToDate, dateToTimeString, formatTime, computeSleepHours } from '../../src/utils/timeHelpers';
import { getYesterdayDateString } from '../../src/utils/dateHelpers';
import { SwipeHint } from '../../src/components/SwipeHint';
import { colors, spacing, radius, font } from '../../src/theme';

const DURATIONS = ['<30 min', '30-60 min', '1hr+'];

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

export default function DailyCheckInScreen() {
  const { currentUser } = useApp();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [editingEntryId, setEditingEntryId] = useState(null);

  const [values, setValues] = useState({
    movedYesterday: null, movementAmount: null, movementActivities: [],
    wentOutside: null, outsideAmount: null, outsideActivities: [],
    socialized: null,
    bedTime: '23:00', wakeTime: '07:00',
    ateWell: null,
  });
  const [wordOfDay, setWordOfDay] = useState('');
  const [journal, setJournal]     = useState('');
  const [meals, setMeals]         = useState('');
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
          setMeals(existing.meals ?? '');
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
        meals,
        wordOfDay,
        journal,
      };
      if (editingEntryId) {
        await updateEntry(editingEntryId, entryData);
      } else {
        await createEntry(entryData, currentUser?.uid, currentUser?.therapistId || null);
      }
      scheduleStreakRisk().catch(() => {});
      Alert.alert('Done!', editingEntryId ? 'Your 5 Things check-in is updated.' : 'Your 5 Things check-in is saved.', [
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

  // ── Horizontal swipe animation ─────────────────────────────
  const totalOffset = useSharedValue(0);
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: totalOffset.value }],
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
  const renderYesNo = (value, onYes, onNo) => (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, value === true && styles.toggleBtnActive]}
        onPress={onYes}
      >
        <Text style={[styles.toggleBtnText, value === true && styles.toggleBtnTextActive]}>Yes</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, value === false && styles.toggleBtnActive]}
        onPress={onNo}
      >
        <Text style={[styles.toggleBtnText, value === false && styles.toggleBtnTextActive]}>No</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChips = (amount, onPick) => (
    <View style={styles.chipRow}>
      {DURATIONS.map(d => (
        <TouchableOpacity
          key={d}
          style={[styles.chip, amount === d && styles.chipActive]}
          onPress={onPick(d)}
        >
          <Text style={[styles.chipText, amount === d && styles.chipTextActive]}>{d}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderActivityGrid = (list, selected, onToggle) => (
    <View style={styles.activityGrid}>
      {list.map(a => (
        <TouchableOpacity
          key={a.id}
          style={[styles.activityBtn, selected.includes(a.id) && styles.activityBtnActive]}
          onPress={() => onToggle(a.id)}
        >
          <Image source={a.image} style={{ width: 28, height: 28 }} resizeMode="contain" />
          <Text style={[styles.activityLabel, selected.includes(a.id) && styles.activityLabelActive]}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSlideContent = (slideIndex) => {
    if (slideIndex < 0 || slideIndex >= TOTAL_STEPS) {
      return <View key={`empty-${slideIndex}`} style={{ flex: 1 }} />;
    }

    if (slideIndex === MOVEMENT_STEP) {
      return (
        <GestureDetector key="movement" gesture={makeSwipeGesture()}>
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.stepTitle}>Movement</Text>
              <Text style={styles.subLabel}>Did you move yesterday?</Text>
              {renderYesNo(
                values.movedYesterday,
                () => setValues(p => ({ ...p, movedYesterday: true })),
                () => { setValues(p => ({ ...p, movedYesterday: false, movementAmount: null, movementActivities: [] })); advanceOnAnswer(); }
              )}
              {values.movedYesterday === true && (
                <>
                  <Text style={styles.subLabel}>How much?</Text>
                  {renderChips(values.movementAmount, (d) => () => setVal('movementAmount')(d))}
                  <Text style={styles.subLabel}>What kind? (optional)</Text>
                  {renderActivityGrid(MOVEMENT_ACTIVITIES, values.movementActivities, toggleMovementActivity)}
                </>
              )}
            </ScrollView>
            <SwipeHint />
          </View>
        </GestureDetector>
      );
    }

    if (slideIndex === OUTSIDE_STEP) {
      return (
        <GestureDetector key="outside" gesture={makeSwipeGesture()}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Outside</Text>
            <Text style={styles.subLabel}>Did you get outside yesterday?</Text>
            {renderYesNo(
              values.wentOutside,
              () => setValues(p => ({ ...p, wentOutside: true })),
              () => { setValues(p => ({ ...p, wentOutside: false, outsideAmount: null, outsideActivities: [] })); advanceOnAnswer(); }
            )}
            {values.wentOutside === true && (
              <>
                <Text style={styles.subLabel}>How much?</Text>
                {renderChips(values.outsideAmount, (d) => () => setVal('outsideAmount')(d))}
                <Text style={styles.subLabel}>What kind? (optional)</Text>
                {renderActivityGrid(OUTSIDE_ACTIVITIES, values.outsideActivities, toggleOutsideActivity)}
              </>
            )}
          </ScrollView>
        </GestureDetector>
      );
    }

    if (slideIndex === SOCIAL_STEP) {
      return (
        <GestureDetector key="social" gesture={makeSwipeGesture()}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
            <Text style={styles.stepTitle}>Socializing</Text>
            <Text style={styles.subLabel}>Did you socialize yesterday?</Text>
            {renderYesNo(
              values.socialized,
              () => { setVal('socialized')(true); advanceOnAnswer(); },
              () => { setVal('socialized')(false); advanceOnAnswer(); }
            )}
          </View>
        </GestureDetector>
      );
    }

    if (slideIndex === SLEEP_STEP) {
      const sleepHours = computeSleepHours(values.bedTime, values.wakeTime);
      return (
        <GestureDetector key="sleep" gesture={makeSwipeGesture()}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
            <Text style={styles.stepTitle}>Sleep</Text>
            <Text style={styles.subLabel}>How much did you sleep last night?</Text>

            <TouchableOpacity style={styles.sleepRow} onPress={() => setSleepField('bedTime')}>
              <View style={styles.sleepRowLeft}>
                <Ionicons name="moon-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.sleepRowLabel}>Went to sleep</Text>
              </View>
              <View style={styles.sleepRowRight}>
                <Text style={styles.sleepRowValue}>{formatTime(values.bedTime)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sleepRow} onPress={() => setSleepField('wakeTime')}>
              <View style={styles.sleepRowLeft}>
                <Ionicons name="sunny-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.sleepRowLabel}>Woke up</Text>
              </View>
              <View style={styles.sleepRowRight}>
                <Text style={styles.sleepRowValue}>{formatTime(values.wakeTime)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <View style={styles.sleepTotalWrap}>
              <Text style={styles.sleepTotalValue}>{sleepHours}</Text>
              <Text style={styles.sleepTotalLabel}>hours of sleep</Text>
            </View>
          </View>
        </GestureDetector>
      );
    }

    if (slideIndex === EAT_STEP) {
      return (
        <GestureDetector key="eat" gesture={makeSwipeGesture()}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={insets.top + 70}
          >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.stepTitle}>Eating</Text>
              <Text style={styles.subLabel}>Did you eat well yesterday?</Text>
              {renderYesNo(
                values.ateWell,
                () => setVal('ateWell')(true),
                () => setVal('ateWell')(false)
              )}
              <View style={styles.field}>
                <Text style={styles.subLabel}>What did you eat yesterday? (optional)</Text>
                <TextInput
                  style={[styles.input, styles.journalInput]}
                  placeholder="Breakfast, lunch, dinner, snacks..."
                  placeholderTextColor={colors.textSecondary}
                  value={meals}
                  onChangeText={setMeals}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </GestureDetector>
      );
    }

    if (slideIndex === REFLECT_STEP) {
      return (
        <GestureDetector key="reflect" gesture={makeSwipeGesture()}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={insets.top + 70}
          >
            <ScrollView
              contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg }]}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.stepTitle}>Reflect</Text>
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
              </View>
              <View style={styles.field}>
                <Text style={styles.subLabel}>Journal</Text>
                <TextInput
                  style={[styles.input, styles.journalInput]}
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
                style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <Text style={styles.title}>{editingEntryId ? 'Edit 5 Things' : '5 Things Check-in'}</Text>
        <Text style={styles.stepLabel}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      <View style={[styles.progressBar, { zIndex: 10 }]}>
        <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
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

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive:     { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText:       { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.primary, fontFamily: font.medium },

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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    marginTop: spacing.md,
  },
  sleepRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sleepRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sleepRowLabel: { fontSize: 16, fontFamily: font.medium, color: colors.text },
  sleepRowValue: { fontSize: 16, color: colors.textSecondary },
  sleepTotalWrap: { alignItems: 'center', marginTop: spacing.xl },
  sleepTotalValue: { fontSize: 48, fontFamily: font.bold, color: colors.text },
  sleepTotalLabel: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },

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
