import { getTodayDateString, getYesterdayDateString, getPreviousDayString } from './dateHelpers';

/**
 * Calculate the longest streak from an array of entries
 * @param {Array} sortedEntries - Array of entries sorted by date (newest first)
 * @returns {number} Longest streak count
 */
const calculateLongestStreakFromHistory = (sortedEntries) => {
  if (sortedEntries.length === 0) return 0;
  if (sortedEntries.length === 1) return 1;

  let longestStreak = 1;
  let currentTempStreak = 1;

  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const currentDate = new Date(sortedEntries[i].date);
    const nextDate = new Date(sortedEntries[i + 1].date);
    const dayDiff = Math.floor((currentDate - nextDate) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      // Consecutive days
      currentTempStreak++;
      longestStreak = Math.max(longestStreak, currentTempStreak);
    } else {
      // Gap found, reset temp streak
      currentTempStreak = 1;
    }
  }

  return longestStreak;
};

/**
 * Calculate current and longest streak from user entries
 * Duolingo-style: streak stays alive if checked in today OR yesterday (grace period)
 *
 * @param {Array} entries - Array of entry objects with date and completed fields
 * @returns {Object} { currentStreak, longestStreak, totalCheckIns, lastCheckInDate }
 */
export const calculateStreak = (entries) => {
  if (!entries || entries.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
      lastCheckInDate: null
    };
  }

  // Filter only completed entries and sort by date (newest first)
  const completedEntries = entries
    .filter(entry => entry.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (completedEntries.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
      lastCheckInDate: null
    };
  }

  // Deduplicate by date - multiple check-ins per day count as one streak day
  const seenDates = new Set();
  const uniqueDayEntries = completedEntries.filter(entry => {
    if (seenDates.has(entry.date)) return false;
    seenDates.add(entry.date);
    return true;
  });

  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();
  const latestEntry = uniqueDayEntries[0];

  // Check if streak is alive (entry today or yesterday - grace period)
  const streakAlive = latestEntry.date === today || latestEntry.date === yesterday;

  // Calculate longest historical streak
  const longestStreak = calculateLongestStreakFromHistory(uniqueDayEntries);

  // If streak is dead, return 0 current streak
  if (!streakAlive) {
    return {
      currentStreak: 0,
      longestStreak,
      totalCheckIns: uniqueDayEntries.length,
      lastCheckInDate: latestEntry.date
    };
  }

  // Calculate current streak by counting backwards from latest entry
  let currentStreak = 0;
  let expectedDate = latestEntry.date === today ? today : yesterday;

  for (const entry of uniqueDayEntries) {
    if (entry.date === expectedDate) {
      currentStreak++;
      expectedDate = getPreviousDayString(expectedDate);
    } else {
      // Check if there's a one-day gap (only happens if latest was yesterday and we're checking today)
      const daysBetween = Math.floor(
        (new Date(entry.date) - new Date(expectedDate)) / (1000 * 60 * 60 * 24)
      );

      if (daysBetween === -1) {
        // This entry is one day before expected, which means streak continues
        currentStreak++;
        expectedDate = getPreviousDayString(entry.date);
      } else {
        // Gap found, streak ends
        break;
      }
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, longestStreak),
    totalCheckIns: uniqueDayEntries.length,
    lastCheckInDate: latestEntry.date
  };
};

/**
 * Check if user has checked in today
 * @param {Array} entries - Array of entry objects
 * @returns {boolean} True if user has checked in today
 */
export const hasCheckedInToday = (entries) => {
  if (!entries || entries.length === 0) return false;

  const today = getTodayDateString();
  return entries.some(entry => entry.date === today && entry.completed);
};

/**
 * Get today's entry if it exists
 * @param {Array} entries - Array of entry objects
 * @returns {Object|null} Today's entry or null
 */
export const getTodayEntry = (entries) => {
  if (!entries || entries.length === 0) return null;

  const today = getTodayDateString();
  return entries.find(entry => entry.date === today) || null;
};
