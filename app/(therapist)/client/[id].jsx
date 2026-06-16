import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/services/firebase';
import { useApp } from '../../../src/context/AppContext';
import { useClientDetails } from '../../../src/hooks/useClientDetails';
import { calculateStreak } from '../../../src/utils/streakCalculator';
import { getRelativeDateString } from '../../../src/utils/dateHelpers';
import { spacing, font } from '../../../src/theme';
import {
  subscribeToClientNotes,
  addClientNote,
  deleteClientNote,
  addClientLabel,
  removeClientLabel,
} from '../../../src/services/therapist.service';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────

const BLUE       = '#5B8DEF';
const BLUE_LIGHT = '#EEF3FD';
const PAGE_BG    = '#F4F5F7';
const DARK       = '#111827';
const GRAY       = '#6B7280';
const BORDER     = '#E5E7EB';
const DANGER     = '#c62828';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 4,
  elevation: 2,
};

const TABS = [
  { key: 'history',  label: 'History' },
  { key: 'trends',   label: 'Trends' },
  { key: 'clinical', label: 'Clinical' },
];

// ─── Metric status ─────────────────────────────────────────────────────────────

const METRICS = [
  { key: 'mood',       label: 'Mood',       max: 10 },
  { key: 'stress',     label: 'Stress',     max: 10 },
  { key: 'worry',      label: 'Worry',      max: 10 },
  { key: 'emotions',   label: 'Emotions',   max: 10 },
  { key: 'focus',      label: 'Focus',      max: 10 },
  { key: 'motivation', label: 'Motivation', max: 10 },
  { key: 'sleepHours', label: 'Sleep',      max: 12 },
];

function getMetricStatus(key, value) {
  if (value == null) return { color: '#888', label: '—' };
  if (key === 'stress' || key === 'worry' || key === 'emotions') {
    if (value <= 4) return { color: '#2a7a3b', label: 'LOW' };
    if (value <= 7) return { color: '#888',    label: 'MODERATE' };
    if (value <= 8) return { color: '#e6a817', label: 'ELEVATED' };
    return                 { color: DANGER,    label: 'HIGH' };
  }
  if (key === 'sleepHours') {
    if (value >= 7 && value <= 9) return { color: '#2a7a3b', label: 'GOOD' };
    if (value >= 5)               return { color: '#888',    label: 'MODERATE' };
    if (value >= 4)               return { color: '#e6a817', label: 'LOW' };
    return                               { color: DANGER,    label: 'CRITICAL' };
  }
  if (value >= 7) return { color: '#2a7a3b', label: 'GOOD' };
  if (value >= 6) return { color: '#888',    label: 'MODERATE' };
  if (value >= 3) return { color: '#e6a817', label: 'FAIR' };
  return                 { color: DANGER,    label: 'LOW' };
}

// ─── Mini line chart ──────────────────────────────────────────────────────────

function MiniLineChart({ values, dates, color, max = 10 }) {
  const [chartWidth, setChartWidth] = useState(0);

  if (!values || values.length < 2) {
    return (
      <View style={chartStyles.empty}>
        <Text style={chartStyles.emptyText}>NOT ENOUGH DATA</Text>
      </View>
    );
  }

  const H = 80;
  const LABEL_H = 16;
  const PAD = 8;
  const innerW = Math.max(chartWidth - PAD * 2, 0);
  const innerH = H - PAD * 2;

  const pts = values.map((v, i) => ({
    x: PAD + (i / Math.max(values.length - 1, 1)) * innerW,
    y: PAD + (1 - v / max) * innerH,
  }));

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [, mm, dd] = dateStr.split('-');
    return `${parseInt(mm)}/${parseInt(dd)}`;
  };

  return (
    <View
      style={{ height: H + LABEL_H, position: 'relative' }}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && (
        <>
          {[0.25, 0.5, 0.75].map(pct => (
            <View
              key={pct}
              style={{
                position: 'absolute',
                left: PAD,
                right: PAD,
                top: PAD + pct * innerH,
                height: 1,
                backgroundColor: '#F0F0F0',
              }}
            />
          ))}
          {pts.map((pt, i) => {
            if (i === 0) return null;
            const prev = pts[i - 1];
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const cx = (prev.x + pt.x) / 2;
            const cy = (prev.y + pt.y) / 2;
            return (
              <View
                key={`seg-${i}`}
                style={{
                  position: 'absolute',
                  width: len,
                  height: 2,
                  backgroundColor: color,
                  left: cx - len / 2,
                  top: cy - 1,
                  transform: [{ rotate: `${angle}deg` }],
                  opacity: 0.85,
                }}
              />
            );
          })}
          {pts.map((pt, i) => {
            const isLast = i === pts.length - 1;
            const size = isLast ? 8 : 5;
            return (
              <View
                key={`dot-${i}`}
                style={{
                  position: 'absolute',
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: color,
                  left: pt.x - size / 2,
                  top: pt.y - size / 2,
                  ...(isLast && { borderWidth: 2, borderColor: '#fff', shadowColor: color, shadowOpacity: 0.4, shadowRadius: 3 }),
                }}
              />
            );
          })}
          {dates && pts.map((pt, i) => (
            <Text
              key={`label-${i}`}
              style={{
                position: 'absolute',
                top: H,
                left: pt.x - 16,
                width: 32,
                textAlign: 'center',
                fontSize: 7,
                color: '#999',
              }}
            >
              {formatDate(dates[i])}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  empty: { height: 80, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 10, color: '#bbb', letterSpacing: 0.8, fontWeight: '600' },
});

// ─── Metric bar ───────────────────────────────────────────────────────────────

function MetricBar({ label, value, max = 10, barColor = BLUE }) {
  if (value == null) return null;
  return (
    <View style={barStyles.container}>
      <View style={barStyles.header}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={barStyles.val}>{value}/{max}</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${(value / max) * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 12, color: GRAY, fontWeight: String(font.medium) },
  val: { fontSize: 12, fontWeight: String(font.bold), color: DARK },
  track: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3 },
  fill: { height: 6, borderRadius: 3 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNoteDate(isoString) {
  try {
    const d = new Date(isoString);
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
  } catch {
    return '';
  }
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClientDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { currentUser } = useApp();
  const router = useRouter();
  const { client, entries, loading, error } = useClientDetails(id, currentUser?.uid);
  const { currentStreak, longestStreak, totalCheckIns } = calculateStreak(entries);

  const metricTrends = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    cutoff.setHours(0, 0, 0, 0);
    const recent = [...entries]
      .filter(e => new Date(e.date) >= cutoff)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const result = {};
    for (const m of METRICS) {
      const pairs = recent
        .map(e => ({
          val: m.key === 'emotions' ? (typeof e.emotions === 'number' ? e.emotions : null) : e[m.key],
          date: e.date,
        }))
        .filter(({ val }) => val != null && typeof val === 'number');
      const vals = pairs.map(p => p.val);
      const dates = pairs.map(p => p.date);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const { color, label } = getMetricStatus(m.key, avg);
      result[m.key] = { color, label, values: vals, dates, avg, max: m.max };
    }
    return result;
  }, [entries]);

  const [activeTabIndex, setActiveTabIndex]            = useState(0);
  const [expandedEntryId, setExpandedEntryId]          = useState(null);
  const [notes, setNotes]                              = useState([]);
  const [addingNoteForEntry, setAddingNoteForEntry]    = useState(null);
  const [noteText, setNoteText]                        = useState('');
  const [noteFocused, setNoteFocused]                  = useState(false);
  const [savingNote, setSavingNote]                    = useState(false);
  const [clientLabels, setClientLabels]                = useState([]);

  const flatListRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.uid || !id) return;
    const unsub = subscribeToClientNotes(currentUser.uid, id, setNotes);
    return unsub;
  }, [currentUser?.uid, id]);

  useEffect(() => {
    if (!currentUser?.uid || !id) return;
    getDoc(doc(db, 'therapist_clients', currentUser.uid)).then(snap => {
      if (snap.exists()) {
        setClientLabels(snap.data().clients?.[id]?.labels || []);
      }
    });
  }, [currentUser?.uid, id]);

  const goToTab = (index) => {
    setActiveTabIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  const onSwipeEnd = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveTabIndex(index);
  };

  const handleLabelToggle = async (label) => {
    const isActive = clientLabels.includes(label);
    setClientLabels(prev => isActive ? prev.filter(l => l !== label) : [...prev, label]);
    try {
      if (isActive) await removeClientLabel(currentUser.uid, id, label);
      else await addClientLabel(currentUser.uid, id, label);
    } catch {
      setClientLabels(prev => isActive ? [...prev, label] : prev.filter(l => l !== label));
    }
  };

  const handleSaveNote = async (entryId) => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await addClientNote(currentUser.uid, id, noteText.trim(), entryId);
      setNoteText('');
      setAddingNoteForEntry(null);
    } catch {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = (noteId) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClientNote(currentUser.uid, id, noteId);
          } catch {
            Alert.alert('Error', 'Failed to delete note. Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={BLUE} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isSuicidal = clientLabels.includes('Suicidal');

  // ── Tab panel renderers ────────────────────────────────────────────────────

  const renderHistory = () => (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
    >
      {renderClientHeader()}
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>No check-ins yet.</Text>
      ) : (
        entries.map(entry => {
          const isExpanded = expandedEntryId === entry.id;
          const notesForEntry = notes.filter(n => n.entryId === entry.id);
          const moodStatus = getMetricStatus('mood', entry.mood);

          return (
            <View key={entry.id} style={[styles.entryCard, CARD_SHADOW]}>
              <TouchableOpacity
                style={styles.entryRow}
                onPress={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                activeOpacity={0.7}
              >
                <View style={styles.entryRowLeft}>
                  <Text style={styles.entryDate}>
                    {getRelativeDateString(entry.date)}
                  </Text>
                  {entry.checkinTime && (
                    <Text style={styles.entryTime}>{entry.checkinTime}</Text>
                  )}
                </View>
                <View style={styles.entryRowRight}>
                  {entry.mood != null && (
                    <View style={[styles.moodPill, { backgroundColor: moodStatus.color + '22' }]}>
                      <Text style={[styles.moodPillText, { color: moodStatus.color }]}>
                        {Math.round(entry.mood)}/10
                      </Text>
                    </View>
                  )}
                  <Text style={styles.entryChevron}>{isExpanded ? '∨' : '›'}</Text>
                </View>
              </TouchableOpacity>

              {notesForEntry.length > 0 && (
                <View style={styles.notePreviewList}>
                  {notesForEntry.map(note => (
                    <View key={note.id} style={styles.notePreviewItem}>
                      <Text style={styles.notePreviewText} numberOfLines={2}>{note.content}</Text>
                      <Text style={styles.notePreviewDate}>{formatNoteDate(note.createdAt)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {isExpanded && (
                <View style={styles.entryExpanded}>
                  <MetricBar label="Mood"       value={entry.mood}       barColor={getMetricStatus('mood',       entry.mood).color} />
                  <MetricBar label="Stress"     value={entry.stress}     barColor={getMetricStatus('stress',     entry.stress).color} />
                  <MetricBar label="Worry"      value={entry.worry}      barColor={getMetricStatus('worry',      entry.worry).color} />
                  <MetricBar
                    label="Emotions"
                    value={typeof entry.emotions === 'number' ? entry.emotions : null}
                    barColor={getMetricStatus('emotions', typeof entry.emotions === 'number' ? entry.emotions : null).color}
                  />
                  <MetricBar label="Focus"      value={entry.focus}      barColor={getMetricStatus('focus',      entry.focus).color} />
                  <MetricBar label="Motivation" value={entry.motivation} barColor={getMetricStatus('motivation', entry.motivation).color} />
                  <MetricBar label="Sleep"      value={entry.sleepHours} max={12} barColor={getMetricStatus('sleepHours', entry.sleepHours).color} />

                  {entry.activities?.length > 0 && (
                    <View style={styles.expandedSection}>
                      <Text style={styles.expandedSectionLabel}>Activities</Text>
                      <View style={styles.tagsRow}>
                        {entry.activities.map(a => (
                          <View key={a} style={styles.tag}>
                            <Text style={styles.tagText}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {entry.wordOfDay ? (
                    <View style={styles.expandedSection}>
                      <Text style={styles.expandedSectionLabel}>Word of the Day</Text>
                      <Text style={styles.wordOfDay}>"{entry.wordOfDay}"</Text>
                    </View>
                  ) : null}

                  {entry.journal ? (
                    <View style={styles.journalWrap}>
                      <Text style={styles.journal}>{entry.journal}</Text>
                    </View>
                  ) : null}

                  <View style={styles.notesDivider} />

                  <View style={styles.notesHeader}>
                    <Text style={styles.notesLabel}>Therapist Notes</Text>
                    <TouchableOpacity
                      onPress={() => { setAddingNoteForEntry(entry.id); setNoteText(''); }}
                      style={styles.addNoteBtn}
                    >
                      <Text style={styles.addNoteBtnText}>+ Add Note</Text>
                    </TouchableOpacity>
                  </View>

                  {notesForEntry.length === 0 && addingNoteForEntry !== entry.id && (
                    <Text style={styles.noNotesText}>No notes yet.</Text>
                  )}

                  {notesForEntry.map(note => (
                    <View key={note.id} style={styles.noteItem}>
                      <View style={styles.noteItemHeader}>
                        <Text style={styles.noteItemDate}>{formatNoteDate(note.createdAt)}</Text>
                        <TouchableOpacity onPress={() => handleDeleteNote(note.id)}>
                          <Text style={styles.noteDeleteBtn}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.noteItemText}>{note.content}</Text>
                    </View>
                  ))}

                  {addingNoteForEntry === entry.id && (
                    <View style={[styles.noteInputWrap, noteFocused && styles.noteInputWrapFocused]}>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Add a clinical note..."
                        placeholderTextColor="#9CA3AF"
                        value={noteText}
                        onChangeText={setNoteText}
                        onFocus={() => setNoteFocused(true)}
                        onBlur={() => setNoteFocused(false)}
                        multiline
                        autoFocus
                        textAlignVertical="top"
                      />
                      <View style={styles.noteInputActions}>
                        <TouchableOpacity
                          onPress={() => { setAddingNoteForEntry(null); setNoteText(''); }}
                          style={styles.noteCancelBtnWrap}
                        >
                          <Text style={styles.noteCancelBtn}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.noteSaveBtn, savingNote && { opacity: 0.6 }]}
                          onPress={() => handleSaveNote(entry.id)}
                          disabled={savingNote}
                        >
                          <Text style={styles.noteSaveBtnText}>
                            {savingNote ? 'Saving...' : 'Save'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  const renderTrends = () => (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      {renderClientHeader()}
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>No check-ins yet.</Text>
      ) : (
        METRICS.map(m => {
          const t = metricTrends[m.key];
          if (!t || t.values.length === 0) return null;
          return (
            <View key={m.key} style={[styles.trendCard, CARD_SHADOW]}>
              <View style={styles.trendCardHeader}>
                <Text style={styles.trendMetricLabel}>{m.label}</Text>
                <View style={styles.trendCardRight}>
                  {t.avg != null && (
                    <Text style={styles.trendAvg}>avg {t.avg.toFixed(1)}/{m.max}</Text>
                  )}
                  <View style={[styles.trendStatusPill, { backgroundColor: t.color + '22' }]}>
                    <Text style={[styles.trendStatusText, { color: t.color }]}>{t.label}</Text>
                  </View>
                </View>
              </View>
              <MiniLineChart values={t.values} dates={t.dates} color={t.color} max={m.max} />
            </View>
          );
        })
      )}
    </ScrollView>
  );

  const renderClinical = () => (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      {renderClientHeader()}
      <Text style={styles.sectionTitle}>Risk Labels</Text>
      <TouchableOpacity
        style={[styles.labelCard, CARD_SHADOW, isSuicidal && styles.labelCardActive]}
        onPress={() => handleLabelToggle('Suicidal')}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.labelCardTitle, isSuicidal && { color: DANGER }]}>
            Suicidal Ideation
          </Text>
          <Text style={styles.labelCardSub}>
            {isSuicidal
              ? 'Flag is active — check-in slider is visible to client'
              : 'Tap to activate risk monitoring'}
          </Text>
        </View>
        <View style={[styles.labelIndicator, isSuicidal && styles.labelIndicatorActive]} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderClientHeader = () => (
    <View style={styles.clientHeader}>
      <View style={styles.profileSection}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{getInitials(client?.displayName)}</Text>
        </View>
        <Text style={styles.clientName}>{client?.displayName}</Text>
        <Text style={styles.clientEmail}>{client?.email}</Text>
      </View>
      <View style={styles.statsRow}>
        {[
          { value: currentStreak,  label: 'Current\nStreak' },
          { value: longestStreak,  label: 'Longest\nStreak' },
          { value: totalCheckIns,  label: 'Total\nCheck-ins' },
        ].map(({ value, label }) => (
          <View key={label} style={[styles.statCard, CARD_SHADOW]}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const PANEL_RENDERERS = [renderHistory, renderTrends, renderClinical];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Fixed header bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Clients</Text>
        </TouchableOpacity>
      </View>

      {/* Fixed tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTabIndex === index && styles.tabActive]}
            onPress={() => goToTab(index)}
          >
            <Text style={[styles.tabText, activeTabIndex === index && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Swipeable panels */}
      <FlatList
        ref={flatListRef}
        data={PANEL_RENDERERS}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onSwipeEnd}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        renderItem={({ item: renderPanel }) => renderPanel()}
        style={styles.pager}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAGE_BG,
  },
  errorText: { fontSize: 16, color: DANGER, marginBottom: spacing.md },
  backLink: { fontSize: 15, color: BLUE },

  headerBar: {
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backBtnText: {
    fontSize: 14,
    fontWeight: String(font.semibold),
    color: BLUE,
  },

  clientHeader: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.md,
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#fff',
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BLUE_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  profileAvatarText: {
    fontSize: 20,
    fontWeight: String(font.bold),
    color: BLUE,
  },
  clientName: {
    fontSize: 20,
    fontWeight: String(font.bold),
    color: DARK,
    textAlign: 'center',
  },
  clientEmail: {
    fontSize: 13,
    color: GRAY,
    marginTop: 2,
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: String(font.bold),
    color: BLUE,
  },
  statLabel: {
    fontSize: 10,
    color: GRAY,
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1.5,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
    marginBottom: -1.5,
  },
  tabActive: {
    borderBottomColor: BLUE,
  },
  tabText: {
    fontSize: 13,
    fontWeight: String(font.semibold),
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: BLUE,
  },

  // Pager
  pager: { flex: 1 },
  panel: { width: SCREEN_W, flex: 1, backgroundColor: PAGE_BG },
  panelContent: { padding: spacing.lg, paddingBottom: 80 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: String(font.bold),
    color: DARK,
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },
  emptyText: { color: GRAY, fontSize: 14 },

  // Clinical label card
  labelCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  labelCardActive: {
    backgroundColor: '#FEF2F2',
  },
  labelCardTitle: {
    fontSize: 15,
    fontWeight: String(font.semibold),
    color: DARK,
    marginBottom: 2,
  },
  labelCardSub: {
    fontSize: 12,
    color: GRAY,
    lineHeight: 16,
  },
  labelIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BORDER,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    flexShrink: 0,
  },
  labelIndicatorActive: {
    backgroundColor: DANGER,
    borderColor: DANGER,
  },

  // Trend cards
  trendCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  trendCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  trendCardRight: { alignItems: 'flex-end', gap: 4 },
  trendMetricLabel: {
    fontSize: 13,
    fontWeight: String(font.bold),
    color: BLUE,
  },
  trendAvg: { fontSize: 11, color: GRAY },
  trendStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  trendStatusText: { fontSize: 10, fontWeight: String(font.bold), letterSpacing: 0.3 },

  // Entry cards (history)
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  entryRowLeft: { gap: 2 },
  entryDate: { fontSize: 14, fontWeight: String(font.semibold), color: DARK },
  entryTime: { fontSize: 11, color: GRAY },
  entryRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moodPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  moodPillText: { fontSize: 12, fontWeight: String(font.bold) },
  entryChevron: { fontSize: 18, color: '#C8CDD5' },

  entryExpanded: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  expandedSection: { marginTop: spacing.md },
  expandedSectionLabel: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: GRAY,
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: BLUE_LIGHT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 11, color: BLUE, fontWeight: String(font.medium) },
  wordOfDay: { fontSize: 16, fontStyle: 'italic', color: DARK, marginTop: 2 },
  journalWrap: { marginTop: spacing.md, borderLeftWidth: 3, borderLeftColor: BLUE_LIGHT, paddingLeft: spacing.sm },
  journal: { fontSize: 13, color: GRAY, lineHeight: 20 },

  notePreviewList: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
    backgroundColor: '#FAFBFC',
  },
  notePreviewItem: { gap: 2 },
  notePreviewText: { fontSize: 12, color: DARK, lineHeight: 16 },
  notePreviewDate: { fontSize: 10, color: '#9CA3AF' },

  notesDivider: { height: 1, backgroundColor: BORDER, marginVertical: spacing.md },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: String(font.bold),
    color: GRAY,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  addNoteBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: BLUE_LIGHT },
  addNoteBtnText: { fontSize: 11, fontWeight: String(font.bold), color: BLUE },
  noNotesText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  noteItem: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_LIGHT,
  },
  noteItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteItemDate: { fontSize: 10, color: '#9CA3AF' },
  noteDeleteBtn: { fontSize: 11, color: DANGER },
  noteItemText: { fontSize: 13, color: DARK, lineHeight: 18 },

  noteInputWrap: {
    marginTop: spacing.sm,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: spacing.sm,
    backgroundColor: '#fff',
  },
  noteInputWrapFocused: { borderColor: BLUE },
  noteInput: { fontSize: 13, color: DARK, minHeight: 80, textAlignVertical: 'top' },
  noteInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  noteCancelBtnWrap: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  noteCancelBtn: { fontSize: 13, color: GRAY },
  noteSaveBtn: { backgroundColor: BLUE, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6 },
  noteSaveBtnText: { fontSize: 13, color: '#fff', fontWeight: String(font.bold) },
});
