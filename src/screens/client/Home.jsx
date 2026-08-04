import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useEntries } from '../../hooks/useEntries';
import { hasCheckedInToday, isFiveFactorEntry } from '../../utils/streakCalculator';
import { formatActivity } from '../../utils/labelHelpers';
import { getTodayDateString } from '../../utils/dateHelpers';
import { colors, spacing, radius, font } from '../../theme';
import { MoodFace } from '../../components/MoodFace';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRADIENT = ['#4361EE', '#48CAE4'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

function formatEntryTime(entry) {
  if (!entry.timestamp) return entry.date;
  const d = new Date(entry.timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today at ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + ` at ${time}`;
}

function FactorPill({ icon, label, done }) {
  return (
    <View style={styles.factorPill}>
      <Ionicons name={icon} size={20} color={done ? colors.primary : colors.border} />
      <Text style={[styles.factorPillLabel, done && styles.factorPillLabelDone]}>{label}</Text>
    </View>
  );
}

// ── EntryCard: staggered entrance + card lift + expand/collapse ───────────────
function EntryCard({ entry, index, isExpanded, onToggle, highlightKey }) {
  const isFiveFactors = entry.type === 'fiveFactors';
  const tags = isFiveFactors
    ? [...(entry.movementActivities || []), ...(entry.outsideActivities || [])]
    : entry.activities;
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const scale = useSharedValue(1);
  const highlight = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(index * 70, withTiming(1, { duration: 320 }));
    translateY.value = withDelay(index * 70, withSpring(0, { damping: 18, stiffness: 120 }));
  }, []);

  // Brief highlight flash when jumped to from the calendar — keyed so
  // re-tapping the same date re-triggers it even if already faded.
  useEffect(() => {
    if (highlightKey) {
      highlight.value = 1;
      highlight.value = withDelay(400, withTiming(0, { duration: 2200 }));
    }
  }, [highlightKey]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    backgroundColor: interpolateColor(highlight.value, [0, 1], [colors.white, '#CBDEFC']),
  }));

  return (
    <Pressable
      onPress={() => onToggle(entry.id)}
      onPressIn={() => { scale.value = withTiming(0.985, { duration: 100, easing: Easing.out(Easing.quad) }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }); }}
    >
      <Animated.View style={[styles.entryCard, entranceStyle]}>
        <View style={styles.entryHeader}>
          <View>
            <Text style={styles.entryTypeLabel}>{isFiveFactors ? '5 THINGS' : 'MOOD'}</Text>
            <Text style={styles.entryTime}>{formatEntryTime(entry)}</Text>
          </View>
          {isFiveFactors
            ? <Ionicons name="checkmark-done-circle" size={28} color={colors.primary} />
            : <MoodFace mood={entry.mood} size={28} color={colors.text} />}
        </View>

        <View style={styles.metricRow}>
          {isFiveFactors ? (
            <>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>MOVED:</Text>
                <Text style={styles.metricValue}>{entry.movedYesterday ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>OUTSIDE:</Text>
                <Text style={styles.metricValue}>{entry.wentOutside ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>SLEEP:</Text>
                <Text style={styles.metricValue}>{entry.sleepHours}h</Text>
              </View>
            </>
          ) : (
            <>
              {entry.mood != null && (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>MOOD:</Text>
                  <Text style={styles.metricValue}>{entry.mood}/10</Text>
                </View>
              )}
              {entry.stress != null && (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>STRESS:</Text>
                  <Text style={styles.metricValue}>{entry.stress}/10</Text>
                </View>
              )}
              {entry.focus != null && (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>FOCUS:</Text>
                  <Text style={styles.metricValue}>{entry.focus}/10</Text>
                </View>
              )}
            </>
          )}
        </View>

        {isExpanded && (
          <>
            {/* Collapsed preview above only shows a few factors — expanded
                view fills in the rest so every factor is visible here. */}
            <View style={[styles.metricRow, styles.metricRowWrap]}>
              {isFiveFactors ? (
                <>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>SOCIAL:</Text>
                    <Text style={styles.metricValue}>{entry.socialized ? 'Yes' : 'No'}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>ATE WELL:</Text>
                    <Text style={styles.metricValue}>{entry.ateWell ? 'Yes' : 'No'}</Text>
                  </View>
                </>
              ) : (
                <>
                  {entry.worry != null && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>WORRY:</Text>
                      <Text style={styles.metricValue}>{entry.worry}/10</Text>
                    </View>
                  )}
                  {entry.emotions != null && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>EMOTIONS:</Text>
                      <Text style={styles.metricValue}>{entry.emotions}/10</Text>
                    </View>
                  )}
                  {entry.motivation != null && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>MOTIVATION:</Text>
                      <Text style={styles.metricValue}>{entry.motivation}/10</Text>
                    </View>
                  )}
                  {entry.suicidalIdeation != null && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>SUICIDAL IDEATION:</Text>
                      <Text style={styles.metricValue}>{entry.suicidalIdeation}/10</Text>
                    </View>
                  )}
                  {entry.selfHarm != null && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>SELF-HARM:</Text>
                      <Text style={styles.metricValue}>{entry.selfHarm ? 'Yes' : 'No'}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {!!entry.wordOfDay && (
              <Text style={styles.wordRow}>
                <Text style={styles.wordLabel}>WORD: </Text>
                <Text style={styles.wordValue}>{entry.wordOfDay}</Text>
              </Text>
            )}
            {tags?.length > 0 && (
              <View style={styles.tagRow}>
                {tags.slice(0, 3).map(a => (
                  <View key={a} style={styles.tag}>
                    <Text style={styles.tagText}>{formatActivity(a)}</Text>
                  </View>
                ))}
                {tags.length > 3 && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>+{tags.length - 3} more</Text>
                  </View>
                )}
              </View>
            )}
            {!!entry.therapistMessage && (
              <View style={styles.therapistMsg}>
                <Text style={styles.therapistMsgLabel}>From your therapist</Text>
                <Text style={styles.therapistMsgText}>{entry.therapistMessage}</Text>
              </View>
            )}
          </>
        )}

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
          style={{ alignSelf: 'center' }}
        />
      </Animated.View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ClientHome() {
  const { currentUser } = useApp();
  const { entries = [], loading } = useEntries(currentUser?.uid);
  const router = useRouter();
  const scrollViewRef = useRef(null);
  const entryRefs = useRef({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [expandedEntries, setExpandedEntries] = useState(() => new Set());
  const [highlight, setHighlight] = useState({ ids: new Set(), key: 0 });
  const [showMoodTooltip, setShowMoodTooltip] = useState(false);

  useEffect(() => {
    // TEMP: forcing this to always show so it can be previewed after the
    // color tweak — remove this removeItem call once reviewed, the normal
    // one-time check below already does the right thing on its own.
    AsyncStorage.removeItem('mood_tooltip_seen').then(() => {
      AsyncStorage.getItem('mood_tooltip_seen').then(seen => {
        if (!seen) setShowMoodTooltip(true);
      });
    });
  }, []);

  const dismissMoodTooltip = () => {
    setShowMoodTooltip(false);
    AsyncStorage.setItem('mood_tooltip_seen', 'true').catch(() => {});
  };

  const fiveFactorEntries = entries.filter(isFiveFactorEntry);
  const checkedInToday = hasCheckedInToday(fiveFactorEntries);
  const weekDates = getWeekDates();
  const entryDates = new Set(entries.map(e => e.date));

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const firstName = currentUser?.username || 'there';
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  const timeIcon  = hour < 12 ? 'sunny-outline' : hour < 17 ? 'partly-sunny-outline' : 'moon-outline';
  const timeColor = hour < 12 ? '#FBBF24' : hour < 17 ? '#FB923C' : '#C7D2FE';
  const todayStr = getTodayDateString();
  const todayFiveFactorEntry = fiveFactorEntries.find(e => e.date === todayStr) ?? null;
  const recentEntries = entries;
  const recentTitle = 'Previous Check-ins';

  // ── Single scroll driving all parallax ───────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });

  // ── Check-in button glow + float ─────────────────────────────────────────
  const glowOpacity = useSharedValue(0);
  const floatY = useSharedValue(0);

  useEffect(() => {
    if (!checkedInToday) {
      glowOpacity.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
      floatY.value = withRepeat(withTiming(-5, { duration: 1800 }), -1, true);
    } else {
      glowOpacity.value = withTiming(0, { duration: 400 });
      floatY.value = withTiming(0, { duration: 400 });
    }
  }, [checkedInToday]);


  // ── Parallax: header elements resist scroll at different rates ────────────
  // scrollY * -0.3 → top row moves at 70% of scroll speed (sticks slightly)
  // scrollY * -0.15 → calendar moves at 85% of scroll speed (deeper layer)
  const topRowParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * -0.3 }],
  }));

  const calendarParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * -0.15 }],
  }));

  // ── Check-in glow + float ─────────────────────────────────────────────────
  const glowRingStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * 0.45,
    transform: [{ scale: 1 + glowOpacity.value * 0.09 }],
  }));

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  // ── Calendar day tap — jump to and expand that day's entries in the list
  // below (all of them, timestamped in order) instead of a separate panel ──
  const handleDayPress = (dateStr) => {
    const dayEntries = entries.filter(e => e.date === dateStr);
    if (dayEntries.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDay(dateStr);
    setExpandedEntries(new Set(dayEntries.map(e => e.id)));
    setHighlight({ ids: new Set(dayEntries.map(e => e.id)), key: Date.now() });

    requestAnimationFrame(() => {
      const target = entryRefs.current[dayEntries[0].id];
      if (!target || !scrollViewRef.current) return;
      target.measureInWindow((tx, ty, tw, th) => {
        scrollViewRef.current.measureInWindow((sx, sy) => {
          // Center the entry in the screen rather than just pinning it near the top
          const targetY = scrollY.value + (ty - sy) - (SCREEN_HEIGHT / 2) + (th / 2);
          scrollViewRef.current.scrollTo({ y: Math.max(0, targetY), animated: true });
        });
      });
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header extension — sits behind ScrollView, revealed on overscroll bounce.
          Solid fill of the header gradient's top color, so it matches exactly where
          the header gradient begins instead of showing its own (differently-scaled) gradient. */}
      <View style={[styles.headerExtension, { backgroundColor: GRADIENT[0] }]} pointerEvents="none" />

      <Animated.ScrollView
        ref={scrollViewRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces
        style={{ backgroundColor: 'transparent' }}
      >
        {/* ── Blue gradient header (scrolls away naturally) ── */}
        <LinearGradient colors={GRADIENT} style={styles.gradient}>
          <SafeAreaView edges={['top']}>

            {/* Top row — parallax layer 1 (moves most: 70% of scroll speed) */}
            <Animated.View style={[styles.topRow, topRowParallax]}>
              <View style={styles.greetingCenter}>
                <View style={styles.greetingRow}>
                  <Ionicons name={timeIcon} size={16} color={timeColor} />
                  <Text style={styles.greetingText}>{greeting}, {firstName}</Text>
                </View>
                <Text style={styles.greetingDate}>{dateLabel}</Text>
              </View>
            </Animated.View>

            {/* Calendar strip — parallax layer 2 (moves at 85% of scroll speed) */}
            <Animated.View style={calendarParallax}>
              <View style={styles.weekRow}>
                {DAY_LETTERS.map((letter, i) => {
                  const dateStr = weekDates[i];
                  const isToday = dateStr === getTodayDateString();
                  const hasEntry = entryDates.has(dateStr);
                  const isSelected = selectedDay === dateStr;
                  const dayNum = new Date(dateStr + 'T12:00:00').getDate();
                  return (
                    <Pressable key={i} style={styles.dayCol} onPress={() => handleDayPress(dateStr)}>
                      <Text style={styles.dayLetter}>{letter}</Text>
                      <View style={[
                        styles.dayCircle,
                        isToday && styles.dayCircleToday,
                        isSelected && styles.dayCircleSelected,
                      ]}>
                        <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                          {dayNum}
                        </Text>
                      </View>
                      <View style={[styles.dot, hasEntry && styles.dotFilled]} />
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

          </SafeAreaView>
        </LinearGradient>

        {/* ── White section — curves over header, fills rest of screen ── */}
        <View style={styles.whiteSection}>
        <View style={{ flex: 1 }}>

          {/* Check-in button straddles the gradient/white boundary */}
          <View style={styles.checkinRow}>
            <Animated.View style={[styles.checkinFloat, floatStyle]}>
              <Animated.View style={[styles.checkinGlowRing, glowRingStyle]} />

              <TouchableOpacity
                style={styles.checkinCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(client)/checkin-daily');
                }}
                activeOpacity={0.85}
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.checkinLabel}>5 THINGS CHECK-IN</Text>
                  <View style={styles.checkinTextRow}>
                    <Text style={styles.checkinText}>
                      {checkedInToday ? 'Logged — Tap to Edit' : 'Log Yesterday'}
                    </Text>
                    <Ionicons
                      name={checkedInToday ? 'checkmark-circle' : 'arrow-forward'}
                      size={18}
                      color={checkedInToday ? colors.success : colors.primary}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Yesterday's 5 Things summary — appears once logged */}
          {todayFiveFactorEntry && (
            <View style={styles.fiveFactorSummary}>
              <Text style={styles.fiveFactorSummaryTitle}>Yesterday's 5 Things</Text>
              <View style={styles.fiveFactorRow}>
                <FactorPill icon="walk-outline" label="Moved" done={!!todayFiveFactorEntry.movedYesterday} />
                <FactorPill icon="sunny-outline" label="Outside" done={!!todayFiveFactorEntry.wentOutside} />
                <FactorPill icon="people-outline" label="Social" done={!!todayFiveFactorEntry.socialized} />
                <FactorPill icon="moon-outline" label={`${todayFiveFactorEntry.sleepHours ?? '—'}h`} done={(todayFiveFactorEntry.sleepHours ?? 0) >= 6} />
                <FactorPill icon="restaurant-outline" label="Ate well" done={!!todayFiveFactorEntry.ateWell} />
              </View>
            </View>
          )}

          {/* Mood check-in — quick access anytime, unlimited per day */}
          <View style={styles.moodPillWrap}>
            <TouchableOpacity
              style={styles.moodPill}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (showMoodTooltip) dismissMoodTooltip();
                router.push('/(client)/checkin');
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#FF9A76', '#FF6B6B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.moodPillIconWrap}>
                <Ionicons name="happy-outline" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.moodPillTitle}>How are you feeling right now?</Text>
                <Text style={styles.moodPillSubtitle}>Tap to log your mood — anytime, as often as you like</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>

            {showMoodTooltip && (
              <View style={styles.moodTooltip}>
                <View style={styles.moodTooltipArrow} />
                <Text style={styles.moodTooltipText}>
                  Tap here anytime your mood changes — log as often as you like!
                </Text>
                <TouchableOpacity onPress={dismissMoodTooltip} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.white} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Entries */}
          <View style={styles.entriesContainer}>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>No entries yet. Start your first check-in!</Text>
            ) : recentEntries.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>{recentTitle}</Text>
                <View style={styles.entriesList}>
                  {recentEntries.map((entry, index) => (
                    <View key={entry.id} ref={(el) => { entryRefs.current[entry.id] = el; }}>
                      <EntryCard
                        entry={entry}
                        index={index}
                        isExpanded={expandedEntries.has(entry.id)}
                        highlightKey={highlight.ids.has(entry.id) ? highlight.key : null}
                        onToggle={(id) => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setExpandedEntries(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          });
                        }}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>

        </View>

          {/* Bottom easter egg — gradient fades from background into twilight, pinned below the fold */}
          <LinearGradient
            colors={[colors.background, '#DCE6F8', '#C8D6F0']}
            style={styles.bottomEaster}
          >
            <Text style={styles.bottomTitle}>nothing to see here</Text>
          </LinearGradient>

        </View>
      </Animated.ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GRADIENT[0],
  },
  headerExtension: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // ── Gradient header ──────────────────────────────────────────
  gradient: {
    paddingBottom: 72,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dateHeader: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.white,
  },

  // ── Week calendar ────────────────────────────────────────────
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayLetter: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: font.medium,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleToday: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  dayCircleSelected: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 2,
    borderColor: colors.white,
  },
  dayNum: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: font.medium,
  },
  dayNumToday: {
    color: colors.white,
    fontFamily: font.bold,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.white,
  },

  // ── Day summary panel ────────────────────────────────────────

  // ── White section ────────────────────────────────────────────
  // minHeight ensures white always covers the full screen even with few entries
  whiteSection: {
    minHeight: SCREEN_HEIGHT,
    marginTop: -36,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: colors.background,
  },
  checkinRow: {
    marginTop: -28,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 10,
    position: 'relative',
  },
  checkinFloat: {
    width: '85%',
    alignItems: 'center',
  },
  checkinGlowRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: radius.xl + 8,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  checkinCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    paddingVertical: 18,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    width: '100%',
    justifyContent: 'center',
  },
  checkinLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  checkinTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkinText: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.primary,
  },
  moodPillWrap: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  moodPillIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodPillTitle: {
    fontSize: 15,
    fontFamily: font.semibold,
    color: colors.white,
  },
  moodPillSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  moodTooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  moodTooltipArrow: {
    position: 'absolute',
    top: -6,
    left: spacing.lg,
    width: 12,
    height: 12,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  moodTooltipText: {
    flex: 1,
    fontSize: 12,
    color: colors.white,
    lineHeight: 17,
  },
  fiveFactorSummary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl + 4,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fiveFactorSummaryTitle: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fiveFactorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  factorPill: { alignItems: 'center', gap: 4, flex: 1 },
  factorPillLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: font.medium },
  factorPillLabelDone: { color: colors.primary, fontFamily: font.semibold },
  entryTypeLabel: {
    fontSize: 10,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 1,
  },

  // ── Entries ───────────────────────────────────────────────────
  entriesContainer: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  bottomEaster: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: 64,
    gap: 6,
  },
  bottomMoon: {
    fontSize: 40,
  },
  bottomTitle: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginTop: spacing.xs,
  },
  bottomSub: {
    fontSize: 12,
    color: colors.border,
    fontFamily: font.regular,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  entriesList: {
    gap: spacing.md,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: spacing.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryTime: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: colors.text,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metricRowWrap: {
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: font.medium,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: colors.primary,
  },
  wordRow: {
    fontSize: 13,
    color: colors.text,
  },
  wordLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: font.medium,
    letterSpacing: 0.5,
  },
  wordValue: {
    fontSize: 13,
    fontStyle: 'italic',
    fontFamily: font.semibold,
    color: colors.primary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    color: colors.white,
    fontFamily: font.medium,
  },
  therapistMsg: {
    marginTop: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
    borderRadius: 6,
    padding: spacing.sm,
  },
  therapistMsgLabel: {
    fontSize: 10,
    color: '#059669',
    fontFamily: font.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  therapistMsgText: {
    fontSize: 13,
    color: '#065f46',
    lineHeight: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    fontSize: 15,
  },

  // ── Streak modal ─────────────────────────────────────────────
  // ── Greeting ──────────────────────────────────────────────────
  greetingCenter: { alignItems: 'center' },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greetingText: {
    fontSize: 18,
    fontFamily: font.semibold,
    color: colors.white,
  },
  greetingDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  // ── Today at a Glance card ────────────────────────────────────
  todayWord: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  todayWordValue: { color: colors.primary, fontFamily: font.semibold },
});
