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
  Image,
} from 'react-native';
import { useState, useEffect } from 'react';
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
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useEntries } from '../../src/hooks/useEntries';
import { hasCheckedInToday, calculateStreak } from '../../src/utils/streakCalculator';
import { formatActivity } from '../../src/utils/labelHelpers';
import { getTodayDateString } from '../../src/utils/dateHelpers';
import { colors, spacing, radius, font } from '../../src/theme';
import { MoodFace } from '../../src/components/MoodFace';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRADIENT = ['#4361EE', '#48CAE4'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const STARS = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: Math.random() * 92 + 2,
  y: Math.random() * 88 + 2,
  size: 1.5 + Math.random() * 2.5,
  baseOpacity: 0.5 + Math.random() * 0.5,
  group: i % 4,
}));

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

function getMotivation(streak) {
  if (streak === 0) return "Start your streak today";
  if (streak === 1) return "Day one done — keep it going";
  if (streak < 5) return "Building momentum";
  if (streak < 10) return "You're on a roll";
  if (streak < 21) return "Incredible consistency";
  if (streak < 50) return "You're unstoppable";
  return "Legendary streak";
}

function getTrophyTier(streak) {
  if (streak === 0) return { name: 'trophy-outline', color: '#9ca3af', tier: 'NO STREAK YET' };
  if (streak < 7)   return { name: 'trophy',         color: '#CD7F32', tier: 'BRONZE TIER' };
  if (streak < 21)  return { name: 'trophy',         color: '#C0C0C0', tier: 'SILVER TIER' };
  if (streak < 50)  return { name: 'trophy',         color: '#FFE066', tier: 'GOLD TIER' };
  return                   { name: 'trophy',         color: '#B2EBF2', tier: 'PLATINUM TIER' };
}

const NAV_ITEMS = [
  { label: 'Home', icon: 'home-outline', route: '/(client)/' },
  { label: 'Insights', icon: 'bar-chart-outline', route: '/(client)/insights' },
  { label: 'Settings', icon: 'settings-outline', route: '/(client)/settings' },
];

// ── EntryCard: staggered entrance + card lift + expand/collapse ───────────────
function EntryCard({ entry, index, isExpanded, onToggle }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(index * 70, withTiming(1, { duration: 320 }));
    translateY.value = withDelay(index * 70, withSpring(0, { damping: 18, stiffness: 120 }));
  }, []);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={() => onToggle(entry.id)}
      onPressIn={() => { scale.value = withTiming(0.985, { duration: 100, easing: Easing.out(Easing.quad) }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }); }}
    >
      <Animated.View style={[styles.entryCard, entranceStyle]}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryTime}>{formatEntryTime(entry)}</Text>
          <MoodFace mood={entry.mood} size={28} color={colors.text} />
        </View>

        <View style={styles.metricRow}>
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
        </View>

        {isExpanded && (
          <>
            {!!entry.wordOfDay && (
              <Text style={styles.wordRow}>
                <Text style={styles.wordLabel}>WORD: </Text>
                <Text style={styles.wordValue}>{entry.wordOfDay}</Text>
              </Text>
            )}
            {entry.activities?.length > 0 && (
              <View style={styles.tagRow}>
                {entry.activities.slice(0, 3).map(a => (
                  <View key={a} style={styles.tag}>
                    <Text style={styles.tagText}>{formatActivity(a)}</Text>
                  </View>
                ))}
                {entry.activities.length > 3 && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>+{entry.activities.length - 3} more</Text>
                  </View>
                )}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [tierInfoVisible, setTierInfoVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);

  const checkedInToday = hasCheckedInToday(entries);
  const { currentStreak, longestStreak, totalCheckIns, lastCheckInDate } = calculateStreak(entries);
  const trophyTier = getTrophyTier(currentStreak);
  const [streakModalOpen, setStreakModalOpen] = useState(false);
  const weekDates = getWeekDates();
  const entryDates = new Set(entries.map(e => e.date));
  const entryForSelectedDay = selectedDay ? entries.find(e => e.date === selectedDay) : null;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const firstName = currentUser?.displayName?.split(' ')[0] || 'there';
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  const timeIcon  = hour < 12 ? 'sunny-outline' : hour < 17 ? 'partly-sunny-outline' : 'moon-outline';
  const timeColor = hour < 12 ? '#FBBF24' : hour < 17 ? '#FB923C' : '#C7D2FE';
  const todayEntry = entries.find(e => e.date === getTodayDateString()) ?? null;
  const recentEntries = (checkedInToday && todayEntry)
    ? entries.filter(e => e.date !== getTodayDateString()).slice(0, 4)
    : entries.slice(0, 5);
  const recentTitle = (checkedInToday && todayEntry) ? 'Earlier this week' : 'Recent Entries';

  // ── Single scroll driving all parallax ───────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });

  // ── Calendar inline expand ────────────────────────────────────────────────
  const dayPanelHeight = useSharedValue(0);

  // ── Check-in button glow + float ─────────────────────────────────────────
  const glowOpacity = useSharedValue(0);
  const floatY = useSharedValue(0);

  // ── Star twinkle groups ───────────────────────────────────────────────────
  const twinkle0 = useSharedValue(1);
  const twinkle1 = useSharedValue(1);
  const twinkle2 = useSharedValue(1);
  const twinkle3 = useSharedValue(1);

  // ── Bottom moon float ─────────────────────────────────────────────────────
  const moonFloat = useSharedValue(0);


  useEffect(() => {
    if (!checkedInToday) {
      glowOpacity.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
      floatY.value = withRepeat(withTiming(-5, { duration: 1800 }), -1, true);
    } else {
      glowOpacity.value = withTiming(0, { duration: 400 });
      floatY.value = withTiming(0, { duration: 400 });
    }
  }, [checkedInToday]);

  useEffect(() => {
    twinkle0.value = withRepeat(withTiming(0.2, { duration: 1300 }), -1, true);
    twinkle1.value = withDelay(300, withRepeat(withTiming(0.15, { duration: 1600 }), -1, true));
    twinkle2.value = withDelay(600, withRepeat(withTiming(0.25, { duration: 1050 }), -1, true));
    twinkle3.value = withDelay(900, withRepeat(withTiming(0.1, { duration: 1800 }), -1, true));
    moonFloat.value = withRepeat(withTiming(-6, { duration: 2200 }), -1, true);
  }, []);


  // ── Parallax: header elements resist scroll at different rates ────────────
  // scrollY * -0.3 → top row moves at 70% of scroll speed (sticks slightly)
  // scrollY * -0.15 → calendar moves at 85% of scroll speed (deeper layer)
  const topRowParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * -0.3 }],
  }));

  const calendarParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * -0.15 }],
  }));

  // ── Calendar expand panel ─────────────────────────────────────────────────
  const dayPanelStyle = useAnimatedStyle(() => ({
    height: dayPanelHeight.value,
    overflow: 'hidden',
  }));

  // ── Check-in glow + float ─────────────────────────────────────────────────
  const glowRingStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * 0.45,
    transform: [{ scale: 1 + glowOpacity.value * 0.09 }],
  }));

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const twinkleStyle0 = useAnimatedStyle(() => ({ opacity: twinkle0.value }));
  const twinkleStyle1 = useAnimatedStyle(() => ({ opacity: twinkle1.value }));
  const twinkleStyle2 = useAnimatedStyle(() => ({ opacity: twinkle2.value }));
  const twinkleStyle3 = useAnimatedStyle(() => ({ opacity: twinkle3.value }));
  const twinkleStyles = [twinkleStyle0, twinkleStyle1, twinkleStyle2, twinkleStyle3];

  const floatingMoonStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: moonFloat.value }],
  }));



  // ── Calendar day tap ──────────────────────────────────────────────────────
  const handleDayPress = (dateStr) => {
    if (!entryDates.has(dateStr)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedDay === dateStr) {
      setSelectedDay(null);
      dayPanelHeight.value = withTiming(0, { duration: 260 });
    } else {
      setSelectedDay(dateStr);
      dayPanelHeight.value = withTiming(88, { duration: 280 });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const starGroups = [0, 1, 2, 3].map(g => STARS.filter(s => s.group === g));

  return (
    <View style={styles.container}>
      {/* Header extension — sits behind ScrollView, revealed on iOS overscroll.
          Gradient fades from dark navy at top into the exact header blue at bottom
          so it looks like the header simply continues upward. */}
      <View style={styles.headerExtension} pointerEvents="none">
        <LinearGradient
          colors={['#0a0e1f', '#0d1535', '#1e2f7a', '#4361EE']}
          style={StyleSheet.absoluteFill}
        />
        {starGroups.map((group, gi) => (
          <Animated.View key={gi} style={[StyleSheet.absoluteFill, twinkleStyles[gi]]}>
            {group.map(star => (
              <View
                key={star.id}
                style={[styles.star, {
                  left: `${star.x}%`,
                  top: `${star.y * 0.72}%`,
                  width: star.size,
                  height: star.size,
                  opacity: star.baseOpacity,
                }]}
              />
            ))}
          </Animated.View>
        ))}
        <Text style={styles.skyMoon}>🌙</Text>
      </View>

      <Animated.ScrollView
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
              <TouchableOpacity
                style={styles.trophyWrap}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setStreakModalOpen(true);
                }}
              >
                <Image source={require('../../assets/trophy.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
                {currentStreak > 0 && (
                  <View style={styles.streakPill}>
                    <Text style={styles.streakPillText}>{currentStreak}</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.greetingCenter}>
                <View style={styles.greetingRow}>
                  <Ionicons name={timeIcon} size={16} color={timeColor} />
                  <Text style={styles.greetingText}>{greeting}, {firstName}</Text>
                </View>
                <Text style={styles.greetingDate}>{dateLabel}</Text>
              </View>

              <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="menu-outline" size={22} color={colors.text} />
              </TouchableOpacity>
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

              {/* Inline day summary — expands below calendar strip */}
              <Animated.View style={dayPanelStyle}>
                {entryForSelectedDay && (
                  <View style={styles.daySummary}>
                    <MoodFace mood={entryForSelectedDay.mood} size={28} color="rgba(255,255,255,0.95)" />
                    <View style={styles.daySummaryMetrics}>
                      {entryForSelectedDay.mood != null && (
                        <Text style={styles.daySummaryMetric}>Mood {entryForSelectedDay.mood}</Text>
                      )}
                      {entryForSelectedDay.stress != null && (
                        <Text style={styles.daySummaryMetric}>· Stress {entryForSelectedDay.stress}</Text>
                      )}
                      {entryForSelectedDay.focus != null && (
                        <Text style={styles.daySummaryMetric}>· Focus {entryForSelectedDay.focus}</Text>
                      )}
                    </View>
                    {entryForSelectedDay.activities?.length > 0 && (
                      <Text style={styles.daySummaryActivities} numberOfLines={1}>
                        {entryForSelectedDay.activities.slice(0, 3).map(formatActivity).join(' · ')}
                      </Text>
                    )}
                  </View>
                )}
              </Animated.View>
            </Animated.View>

          </SafeAreaView>
        </LinearGradient>

        {/* ── White section — curves over header, fills rest of screen ── */}
        <View style={styles.whiteSection}>

          {/* Check-in button straddles the gradient/white boundary */}
          <View style={styles.checkinRow}>
            <Animated.View style={[styles.checkinFloat, floatStyle]}>
              <Animated.View style={[styles.checkinGlowRing, glowRingStyle]} />
              <TouchableOpacity
                style={styles.checkinCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(client)/checkin');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.checkinText}>
                  {checkedInToday ? '+ New Check-in' : 'Start Check-in'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Today at a Glance card */}
          {checkedInToday && todayEntry && (
            <LinearGradient
              colors={['#EEF1FF', '#E0F7FA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.todayCard}
            >
              <View style={styles.todayCardHeader}>
                <MoodFace mood={todayEntry.mood} size={72} color={colors.text} />
                <View style={{ marginLeft: -4 }}>
                  <Text style={styles.todayCardTitle}>Today at a glance</Text>
                  <Text style={styles.todayCardTime}>{formatEntryTime(todayEntry)}</Text>
                </View>
              </View>
              <View style={styles.todayMetrics}>
                {todayEntry.mood != null && (
                  <View style={styles.todayMetric}>
                    <Text style={styles.todayMetricValue}>{todayEntry.mood}</Text>
                    <Text style={styles.todayMetricLabel}>MOOD</Text>
                  </View>
                )}
                {todayEntry.stress != null && (
                  <View style={styles.todayMetric}>
                    <Text style={styles.todayMetricValue}>{todayEntry.stress}</Text>
                    <Text style={styles.todayMetricLabel}>STRESS</Text>
                  </View>
                )}
                {todayEntry.focus != null && (
                  <View style={styles.todayMetric}>
                    <Text style={styles.todayMetricValue}>{todayEntry.focus}</Text>
                    <Text style={styles.todayMetricLabel}>FOCUS</Text>
                  </View>
                )}
              </View>
              {!!todayEntry.wordOfDay && (
                <Text style={styles.todayWord}>
                  "<Text style={styles.todayWordValue}>{todayEntry.wordOfDay}</Text>"
                </Text>
              )}
              {todayEntry.activities?.length > 0 && (
                <View style={styles.tagRow}>
                  {todayEntry.activities.slice(0, 4).map(a => (
                    <View key={a} style={styles.tag}><Text style={styles.tagText}>{formatActivity(a)}</Text></View>
                  ))}
                  {todayEntry.activities.length > 4 && (
                    <View style={styles.tag}><Text style={styles.tagText}>+{todayEntry.activities.length - 4}</Text></View>
                  )}
                </View>
              )}
            </LinearGradient>
          )}

          {/* Entries */}
          <View style={styles.entriesContainer}>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>No entries yet. Start your first check-in!</Text>
            ) : recentEntries.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>{recentTitle}</Text>
                <View style={styles.entriesList}>
                  {recentEntries.map((entry, index) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      index={index}
                      isExpanded={expandedEntry === entry.id}
                      onToggle={(id) => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setExpandedEntry(prev => prev === id ? null : id);
                      }}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </View>

          {/* Bottom easter egg — gradient fades from background into twilight */}
          <LinearGradient
            colors={[colors.background, '#DCE6F8', '#C8D6F0']}
            style={styles.bottomEaster}
          >
            <Text style={styles.bottomTitle}>nothing to see here</Text>
          </LinearGradient>

        </View>
      </Animated.ScrollView>

      {/* ── Streak modal ── */}
      <Modal visible={streakModalOpen} transparent animationType="fade" onRequestClose={() => { setStreakModalOpen(false); setTierInfoVisible(false); }}>
        <TouchableOpacity style={styles.streakOverlay} activeOpacity={1} onPress={() => { setStreakModalOpen(false); setTierInfoVisible(false); }}>
          <View style={styles.streakCard}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <LinearGradient
                colors={['#0d1535', '#162040']}
                style={styles.streakCardInner}
              >
                {/* Tier color top accent bar */}
                <View style={[styles.streakAccentBar, { backgroundColor: trophyTier.color }]} />

                {/* Close button */}
                <TouchableOpacity style={styles.streakClose} onPress={() => { setStreakModalOpen(false); setTierInfoVisible(false); }}>
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>

                {/* Tier badge — tappable to see tier breakdown */}
                <TouchableOpacity
                  style={[styles.streakTierBadge, { backgroundColor: trophyTier.color + '22' }]}
                  onPress={() => setTierInfoVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.streakTierBadgeText, { color: trophyTier.color }]}>
                    ✦ {trophyTier.tier} ✦
                  </Text>
                </TouchableOpacity>

                {/* Trophy in glow circle */}
                <View style={[styles.streakGlowCircle, { backgroundColor: trophyTier.color + '22' }]}>
                  <Ionicons name={trophyTier.name} size={72} color={trophyTier.color} />
                </View>

                {/* Hero streak number */}
                <Text style={[styles.streakHeroNumber, { color: trophyTier.color }]}>
                  {currentStreak}
                </Text>
                <Text style={styles.streakHeroLabel}>DAY STREAK</Text>

                {/* Motivational text */}
                <Text style={styles.streakMotivation}>{getMotivation(currentStreak)}</Text>

                {/* Divider */}
                <View style={styles.streakDivider} />

                {/* Stats row */}
                <View style={styles.streakStatsRow}>
                  <View style={styles.streakStatItem}>
                    <Text style={[styles.streakStatValue, { color: trophyTier.color }]}>{longestStreak}</Text>
                    <Text style={styles.streakStatLabel}>LONGEST</Text>
                  </View>
                  <View style={styles.streakStatDivider} />
                  <View style={styles.streakStatItem}>
                    <Text style={[styles.streakStatValue, { color: trophyTier.color }]}>{totalCheckIns}</Text>
                    <Text style={styles.streakStatLabel}>CHECK-INS</Text>
                  </View>
                  <View style={styles.streakStatDivider} />
                  <View style={styles.streakStatItem}>
                    <Text style={[styles.streakStatValue, { color: trophyTier.color }]}>
                      {lastCheckInDate
                        ? new Date(lastCheckInDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </Text>
                    <Text style={styles.streakStatLabel}>LAST CHECK-IN</Text>
                  </View>
                </View>

                {/* Tier info overlay */}
                {tierInfoVisible && (
                  <View style={styles.tierInfoOverlay}>
                    <Text style={styles.tierInfoTitle}>Tier System</Text>
                    <Text style={styles.tierInfoSubtitle}>Based on your current daily streak</Text>
                    {[
                      { color: '#9ca3af', label: 'No Streak',  range: '0 days' },
                      { color: '#CD7F32', label: 'Bronze',     range: '1 – 6 days' },
                      { color: '#C0C0C0', label: 'Silver',     range: '7 – 20 days' },
                      { color: '#FFE066', label: 'Gold',       range: '21 – 49 days' },
                      { color: '#B2EBF2', label: 'Platinum',   range: '50+ days' },
                    ].map(t => (
                      <View key={t.label} style={styles.tierInfoRow}>
                        <View style={[styles.tierInfoDot, { backgroundColor: t.color }]} />
                        <Text style={[styles.tierInfoLabel, { color: t.color }]}>{t.label}</Text>
                        <Text style={styles.tierInfoRange}>{t.range}</Text>
                      </View>
                    ))}
                    <Text style={styles.tierInfoNote}>
                      Missing a day resets your streak back to 0.
                    </Text>
                    <TouchableOpacity style={[styles.tierInfoClose, { borderColor: trophyTier.color + '55' }]} onPress={() => setTierInfoVisible(false)}>
                      <Text style={[styles.tierInfoCloseText, { color: trophyTier.color }]}>Got it</Text>
                    </TouchableOpacity>
                  </View>
                )}

              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Dropdown nav menu ── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuDropdown}>
            {NAV_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.menuItem,
                  item.label === 'Home' && styles.menuItemActive,
                  i < NAV_ITEMS.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => {
                  setMenuOpen(false);
                  router.replace(item.route);
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.label === 'Home' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.menuItemLabel, item.label === 'Home' && styles.menuItemLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1f',
  },
  headerExtension: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#ffffff',
  },
  skyMoon: {
    position: 'absolute',
    top: 28,
    right: 28,
    fontSize: 26,
    opacity: 0.85,
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  trophyWrap: {
    position: 'relative',
    width: 44,
    alignItems: 'flex-start',
  },
  streakPill: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFB800',
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  streakPillText: {
    fontSize: 11,
    fontFamily: font.bold,
    color: colors.white,
  },
  dateHeader: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.white,
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
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
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
  daySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  daySummaryMetrics: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  daySummaryMetric: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    fontFamily: font.semibold,
  },
  daySummaryActivities: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    width: '100%',
    paddingLeft: 38,
  },

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
  checkinText: {
    fontSize: 17,
    fontFamily: font.semibold,
    color: colors.primary,
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
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    fontSize: 15,
  },

  // ── Streak modal ─────────────────────────────────────────────
  streakOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  streakCard: {
    width: SCREEN_HEIGHT * 0.42,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 24,
  },
  streakCardInner: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  streakAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  streakClose: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakTierBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 5,
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  streakTierBadgeText: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.5,
  },
  streakGlowCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  streakHeroNumber: {
    fontSize: 62,
    fontFamily: font.bold,
    lineHeight: 68,
  },
  streakHeroLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2.5,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  streakMotivation: {
    fontSize: 15,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  streakDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
  },
  streakStatsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  streakStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  streakStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  streakStatValue: {
    fontSize: 20,
    fontFamily: font.bold,
  },
  streakStatLabel: {
    fontSize: 8,
    fontFamily: font.semibold,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
    textAlign: 'center',
  },

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
  todayCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  todayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: -6 },
  todayCardTitle: {
    fontSize: 17,
    fontFamily: font.bold,
    color: colors.text,
  },
  todayCardTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  todayMetrics: { flexDirection: 'row', gap: spacing.xl, paddingTop: spacing.xs },
  todayMetric: { alignItems: 'center' },
  todayMetricValue: {
    fontSize: 28,
    fontFamily: font.bold,
    color: colors.primary,
  },
  todayMetricLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: font.semibold,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  todayWord: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  todayWordValue: { color: colors.primary, fontFamily: font.semibold },

  // ── Dropdown menu ─────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
  },
  menuDropdown: {
    position: 'absolute',
    top: 100,
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
  menuItemActive: {
    backgroundColor: colors.primaryLight,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontFamily: font.medium,
  },
  menuItemLabelActive: {
    color: colors.primary,
    fontFamily: font.semibold,
  },

  // ── Tier info overlay ─────────────────────────────────────────
  tierInfoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0d1535',
    borderRadius: 28,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tierInfoTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 2,
  },
  tierInfoSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    fontFamily: font.regular,
    marginBottom: spacing.sm,
  },
  tierInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  tierInfoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierInfoLabel: {
    fontSize: 14,
    fontFamily: font.semibold,
    flex: 1,
  },
  tierInfoRange: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: font.regular,
  },
  tierInfoNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    fontFamily: font.regular,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  tierInfoClose: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tierInfoCloseText: {
    fontSize: 14,
    fontFamily: font.semibold,
  },
});
