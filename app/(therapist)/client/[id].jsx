import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
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

// ─── Metric status (range-based) ─────────────────────────────────────────────

const METRICS = [
  { key: 'mood',       label: 'MOOD',       max: 10 },
  { key: 'stress',     label: 'STRESS',     max: 10 },
  { key: 'worry',      label: 'WORRY',      max: 10 },
  { key: 'emotions',   label: 'EMOTIONS',   max: 10 },
  { key: 'focus',      label: 'FOCUS',      max: 10 },
  { key: 'motivation', label: 'MOTIVATION', max: 10 },
  { key: 'sleepHours', label: 'SLEEP',      max: 12 },
];

// Returns { color, label } based on where a value sits clinically.
// bad metrics (stress, worry, emotions): lower = better; good metrics: higher = better.
function getMetricStatus(key, value) {
  if (value == null) return { color: '#888', label: '—' };

  if (key === 'stress' || key === 'worry' || key === 'emotions') {
    if (value <= 4) return { color: '#2a7a3b', label: 'LOW' };
    if (value <= 7) return { color: '#888',    label: 'MODERATE' };
    if (value <= 8) return { color: '#e6a817', label: 'ELEVATED' };
    return                 { color: '#c62828', label: 'HIGH' };
  }

  if (key === 'sleepHours') {
    if (value >= 7 && value <= 9) return { color: '#2a7a3b', label: 'GOOD' };
    if (value >= 5)               return { color: '#888',    label: 'MODERATE' };
    if (value >= 4)               return { color: '#e6a817', label: 'LOW' };
    return                               { color: '#c62828', label: 'CRITICAL' };
  }

  // mood, focus, motivation, emotions — higher is better
  if (value >= 7) return { color: '#2a7a3b', label: 'GOOD' };
  if (value >= 6) return { color: '#888',    label: 'MODERATE' };
  if (value >= 3) return { color: '#e6a817', label: 'FAIR' };
  return                 { color: '#c62828', label: 'LOW' };
}

// ─── Mini line chart (no extra dependencies) ──────────────────────────────────

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
          {/* Background grid lines */}
          {[0.25, 0.5, 0.75].map(pct => (
            <View
              key={pct}
              style={{
                position: 'absolute',
                left: PAD,
                right: PAD,
                top: PAD + pct * innerH,
                height: 1,
                backgroundColor: '#f0f0f0',
              }}
            />
          ))}

          {/* Line segments */}
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

          {/* Dots */}
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

          {/* Date labels */}
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

function MetricBar({ label, value, max = 10, barColor = '#000' }) {
  if (value == null) return null;
  return (
    <View style={barStyles.container}>
      <View style={barStyles.header}>
        <Text style={barStyles.label}>{label.toUpperCase()}</Text>
        <Text style={barStyles.val}>{value}/{max}</Text>
      </View>
      <View style={barStyles.track}>
        <View
          style={[barStyles.fill, { width: `${(value / max) * 100}%`, backgroundColor: barColor }]}
        />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 10, color: '#666', letterSpacing: 0.8, fontWeight: String(font.bold) },
  val: { fontSize: 12, fontWeight: String(font.bold), color: '#000' },
  track: { height: 4, backgroundColor: '#e0e0e0' },
  fill: { height: 4 },
});

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

export default function ClientDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { currentUser } = useApp();
  const router = useRouter();
  const { client, entries, loading, error } = useClientDetails(id, currentUser?.uid);
  const { currentStreak, longestStreak, totalCheckIns } = calculateStreak(entries);

  // Compute per-metric status from last 14 days of check-ins
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

  const [activeTab, setActiveTab]                    = useState('history');
  const [expandedEntryId, setExpandedEntryId]       = useState(null);
  const [notes, setNotes]                            = useState([]);
  const [addingNoteForEntry, setAddingNoteForEntry]  = useState(null);
  const [noteText, setNoteText]                      = useState('');
  const [savingNote, setSavingNote]                  = useState(false);
  const [clientLabels, setClientLabels]              = useState([]);

  // Real-time notes subscription
  useEffect(() => {
    if (!currentUser?.uid || !id) return;
    const unsub = subscribeToClientNotes(currentUser.uid, id, setNotes);
    return unsub;
  }, [currentUser?.uid, id]);

  // One-time labels fetch (optimistic updates handle changes)
  useEffect(() => {
    if (!currentUser?.uid || !id) return;
    getDoc(doc(db, 'therapist_clients', currentUser.uid)).then(snap => {
      if (snap.exists()) {
        setClientLabels(snap.data().clients?.[id]?.labels || []);
      }
    });
  }, [currentUser?.uid, id]);

  const handleLabelToggle = async (label) => {
    const isActive = clientLabels.includes(label);
    setClientLabels(prev => isActive ? prev.filter(l => l !== label) : [...prev, label]);
    try {
      if (isActive) {
        await removeClientLabel(currentUser.uid, id, label);
      } else {
        await addClientLabel(currentUser.uid, id, label);
      }
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
        <ActivityIndicator size="large" color="#000" />
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← CLIENTS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Client profile — no avatar box */}
        <View style={styles.profileSection}>
          <Text style={styles.clientName}>{client?.displayName?.toUpperCase()}</Text>
          <Text style={styles.clientEmail}>{client?.email}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{currentStreak}</Text>
            <Text style={styles.statLabel}>CURRENT{'\n'}STREAK</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{longestStreak}</Text>
            <Text style={styles.statLabel}>LONGEST{'\n'}STREAK</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalCheckIns}</Text>
            <Text style={styles.statLabel}>TOTAL{'\n'}CHECK-INS</Text>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {[
            { key: 'history',  label: 'CHECK-IN HISTORY' },
            { key: 'trends',   label: 'TRENDS' },
            { key: 'clinical', label: 'CLINICAL' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Clinical Tab — Risk Labels */}
        {activeTab === 'clinical' && (
          <View style={styles.labelSection}>
            <Text style={styles.sectionTitle}>RISK LABELS</Text>
            <TouchableOpacity
              style={[styles.labelToggleRow, isSuicidal && styles.labelToggleActive]}
              onPress={() => handleLabelToggle('Suicidal')}
            >
              <Text style={[styles.labelToggleText, isSuicidal && styles.labelToggleTextActive]}>
                SUICIDAL
              </Text>
              <Text style={[styles.labelToggleStatus, isSuicidal && styles.labelToggleTextActive]}>
                {isSuicidal ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          entries.length === 0 ? (
            <Text style={styles.emptyText}>No check-ins yet.</Text>
          ) : (
            <View>
              {METRICS.map(m => {
                const t = metricTrends[m.key];
                if (!t || t.values.length === 0) return null;
                return (
                  <View key={m.key} style={styles.trendCard}>
                    <View style={styles.trendCardHeader}>
                      <Text style={styles.trendMetricLabel}>{m.label}</Text>
                      <View style={styles.trendCardRight}>
                        {t.avg != null && (
                          <Text style={styles.trendAvg}>
                            avg {t.avg.toFixed(1)}/{m.max}
                          </Text>
                        )}
                        <Text style={[styles.trendDirectionLabel, { color: t.color }]}>
                          {t.label}
                        </Text>
                      </View>
                    </View>
                    <MiniLineChart values={t.values} dates={t.dates} color={t.color} max={m.max} />
                  </View>
                );
              })}
            </View>
          )
        )}

        {/* Check-in History Tab */}
        {activeTab === 'history' && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>CHECK-IN HISTORY</Text>
          </>
        )}
        {activeTab === 'history' && (entries.length === 0 ? (
          <Text style={styles.emptyText}>No check-ins yet.</Text>
        ) : (
          entries.map(entry => {
            const isExpanded = expandedEntryId === entry.id;
            const notesForEntry = notes.filter(n => n.entryId === entry.id);

            return (
              <View key={entry.id} style={styles.entryCard}>

                {/* Collapsed row — always visible */}
                <TouchableOpacity
                  style={styles.entryRow}
                  onPress={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                >
                  <View>
                    <Text style={styles.entryDate}>
                      {getRelativeDateString(entry.date)?.toUpperCase()}
                    </Text>
                    {entry.checkinTime && (
                      <Text style={styles.entryTime}>{entry.checkinTime}</Text>
                    )}
                  </View>
                  <View style={styles.entryRowRight}>
                    {entry.mood != null && (
                      <Text style={styles.entryMoodText}>mood {Math.round(entry.mood)}</Text>
                    )}
                    <Text style={styles.entryChevron}>{isExpanded ? '∨' : '›'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Notes — always visible below the header row */}
                {notesForEntry.length > 0 && (
                  <View style={styles.notePreviewList}>
                    {notesForEntry.map(note => (
                      <View key={note.id} style={styles.notePreviewItem}>
                        <Text style={styles.notePreviewText}>{note.content}</Text>
                        <Text style={styles.notePreviewDate}>{formatNoteDate(note.createdAt)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Expanded content */}
                {isExpanded && (
                  <View style={styles.entryExpanded}>

                    {/* All 7 metrics — bars colored by this entry's value */}
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

                    {/* Activities */}
                    {entry.activities?.length > 0 && (
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedSectionLabel}>ACTIVITIES</Text>
                        <View style={styles.tagsRow}>
                          {entry.activities.map(a => (
                            <View key={a} style={styles.tag}>
                              <Text style={styles.tagText}>{a.toUpperCase()}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Word of Day */}
                    {entry.wordOfDay ? (
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedSectionLabel}>WORD OF THE DAY</Text>
                        <Text style={styles.wordOfDay}>"{entry.wordOfDay}"</Text>
                      </View>
                    ) : null}

                    {/* Journal */}
                    {entry.journal ? (
                      <Text style={styles.journal}>{entry.journal}</Text>
                    ) : null}

                    {/* Notes section */}
                    <View style={styles.notesDivider} />

                    <View style={styles.notesHeader}>
                      <Text style={styles.notesLabel}>THERAPIST NOTES</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setAddingNoteForEntry(entry.id);
                          setNoteText('');
                        }}
                        style={styles.addNoteBtn}
                      >
                        <Text style={styles.addNoteBtnText}>+ ADD</Text>
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
                            <Text style={styles.noteDeleteBtn}>× Delete</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.noteItemText}>{note.content}</Text>
                      </View>
                    ))}

                    {/* Inline note input */}
                    {addingNoteForEntry === entry.id && (
                      <View style={styles.noteInputWrap}>
                        <TextInput
                          style={styles.noteInput}
                          placeholder="Add a note..."
                          placeholderTextColor="#aaa"
                          value={noteText}
                          onChangeText={setNoteText}
                          multiline
                          autoFocus
                          textAlignVertical="top"
                        />
                        <View style={styles.noteInputActions}>
                          <TouchableOpacity
                            onPress={() => { setAddingNoteForEntry(null); setNoteText(''); }}
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
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorText: { fontSize: 16, color: '#d32f2f', marginBottom: spacing.md },
  backLink: { fontSize: 15, color: '#000' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backBtnText: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 1,
  },
  scroll: { padding: spacing.lg, paddingBottom: 80 },

  // Profile
  profileSection: {
    marginBottom: spacing.lg,
  },
  clientName: {
    fontSize: 22,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 1,
  },
  clientEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: String(font.bold),
    color: '#000',
  },
  statLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -2,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomColor: '#000',
  },
  tabText: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: '#999',
    letterSpacing: 1,
  },
  tabTextActive: {
    color: '#000',
  },

  // Trend cards
  trendCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  trendCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  trendCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  trendMetricLabel: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 1,
  },
  trendAvg: {
    fontSize: 10,
    color: '#999',
    letterSpacing: 0.3,
  },
  trendDirectionLabel: {
    fontSize: 11,
    fontWeight: String(font.bold),
    letterSpacing: 0.5,
  },

  // Risk Labels
  labelSection: {
    marginBottom: spacing.lg,
  },
  labelToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  labelToggleActive: {
    backgroundColor: '#d32f2f',
    borderColor: '#d32f2f',
  },
  labelToggleText: {
    fontSize: 13,
    fontWeight: String(font.bold),
    color: '#333',
    letterSpacing: 0.5,
  },
  labelToggleTextActive: {
    color: '#fff',
  },
  labelToggleStatus: {
    fontSize: 11,
    fontWeight: String(font.bold),
    color: '#999',
    letterSpacing: 1,
  },

  // Divider
  sectionDivider: {
    height: 2,
    backgroundColor: '#000',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: String(font.bold),
    color: '#000',
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  emptyText: { color: '#666', fontSize: 14 },

  // Entry cards
  entryCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: spacing.md,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  entryDate: {
    fontSize: 13,
    fontWeight: String(font.bold),
    color: '#000',
    letterSpacing: 0.5,
  },
  entryTime: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  entryRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryMoodText: {
    fontSize: 12,
    color: '#999',
    letterSpacing: 0.3,
  },
  entryChevron: {
    fontSize: 18,
    color: '#aaa',
  },

  // Expanded entry
  entryExpanded: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: spacing.md,
  },
  expandedSection: {
    marginTop: spacing.md,
  },
  expandedSectionLabel: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: '#666',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  tagText: { fontSize: 10, color: '#000', letterSpacing: 0.3 },
  wordOfDay: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#333',
    marginTop: 2,
  },
  journal: {
    fontSize: 13,
    color: '#555',
    marginTop: spacing.md,
    lineHeight: 18,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    borderLeftColor: '#000',
    paddingLeft: spacing.sm,
  },

  // Collapsed note previews
  notePreviewList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#fafafa',
  },
  notePreviewItem: {
    gap: 2,
  },
  notePreviewText: {
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  notePreviewDate: {
    fontSize: 10,
    color: '#aaa',
    letterSpacing: 0.2,
  },

  // Notes
  notesDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: spacing.md,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: '#666',
    letterSpacing: 1,
  },
  addNoteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: '#333',
  },
  addNoteBtnText: {
    fontSize: 10,
    fontWeight: String(font.bold),
    color: '#333',
    letterSpacing: 0.5,
  },
  noNotesText: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
  },
  noteItem: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  noteItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteItemDate: {
    fontSize: 10,
    color: '#999',
    letterSpacing: 0.3,
  },
  noteDeleteBtn: {
    fontSize: 11,
    color: '#d32f2f',
    letterSpacing: 0.3,
  },
  noteItemText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  noteInputWrap: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#333',
    padding: spacing.sm,
  },
  noteInput: {
    fontSize: 13,
    color: '#000',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  noteCancelBtn: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noteSaveBtn: {
    backgroundColor: '#000',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  noteSaveBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: String(font.bold),
    letterSpacing: 0.5,
  },
});
