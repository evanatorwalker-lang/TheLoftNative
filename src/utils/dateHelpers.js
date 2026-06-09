/**
 * Date utility functions for mental health tracker
 */

/** Format a Date object as local YYYY-MM-DD (avoids UTC-shift bugs) */
const toLocalDateString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Get today's date as YYYY-MM-DD string (local time)
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayDateString = () => toLocalDateString(new Date());

/**
 * Get yesterday's date as YYYY-MM-DD string (local time)
 * @returns {string} Yesterday's date in YYYY-MM-DD format
 */
export const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
};

/**
 * Get previous day's date string from a given date
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Previous day's date in YYYY-MM-DD format
 */
export const getPreviousDayString = (dateString) => {
  if (!dateString) return getTodayDateString();
  // Parse at local noon to prevent UTC midnight from shifting the day
  const date = new Date(dateString + 'T12:00:00');
  if (isNaN(date.getTime())) return getTodayDateString();
  date.setDate(date.getDate() - 1);
  return toLocalDateString(date);
};

/**
 * Calculate day difference between two dates
 * @param {string} date1 - First date in YYYY-MM-DD format
 * @param {string} date2 - Second date in YYYY-MM-DD format
 * @returns {number} Number of days between the dates
 */
export const getDaysDifference = (date1, date2) => {
  if (!date1 || !date2) return 0;
  // Parse at local noon to prevent UTC midnight from shifting the day
  const d1 = new Date(date1 + 'T12:00:00');
  const d2 = new Date(date2 + 'T12:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = Math.abs(d2 - d1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Format date for display (e.g., "Monday, Feb 16")
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
export const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T12:00:00');
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Check if a date is today
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {boolean} True if date is today
 */
export const isToday = (dateString) => {
  return dateString === getTodayDateString();
};

/**
 * Check if a date is yesterday
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {boolean} True if date is yesterday
 */
export const isYesterday = (dateString) => {
  return dateString === getYesterdayDateString();
};

/**
 * Get relative date string (e.g., "Today", "Yesterday", "3 days ago")
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Relative date description
 */
export const getRelativeDateString = (dateString) => {
  if (!dateString) return '';
  if (isToday(dateString)) return 'Today';
  if (isYesterday(dateString)) return 'Yesterday';

  const daysDiff = getDaysDifference(getTodayDateString(), dateString);
  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  return `${daysDiff} days ago`;
};
