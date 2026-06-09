import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { getTodayDateString } from '../utils/dateHelpers';

/**
 * Create a new mental health entry
 * @param {Object} entryData - Entry data (mood, anxiety, etc.)
 * @param {string} userId - Client's user ID
 * @param {string} therapistId - Therapist's user ID
 * @returns {Promise<string>} Entry ID
 */
export const createEntry = async (entryData, userId, therapistId) => {
  try {
    const now = new Date();
    const entry = {
      userId,
      therapistId,
      date: getTodayDateString(),
      timestamp: Date.now(),
      checkinTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      mood: entryData.mood,
      stress: entryData.stress,
      worry: entryData.worry,
      emotions: entryData.emotions,
      focus: entryData.focus,
      motivation: entryData.motivation,
      sleepHours: entryData.sleepHours,
      wordOfDay: entryData.wordOfDay || '',
      activities: entryData.activities || [],
      journal: entryData.journal || '',
      completed: true,
      createdAt: now.toISOString()
    };

    const docRef = await addDoc(collection(db, 'entries'), entry);
    return docRef.id;
  } catch (error) {
    console.error('Create entry error:', error);
    throw error;
  }
};

/**
 * Update an existing entry
 * @param {string} entryId - Entry ID to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export const updateEntry = async (entryId, updates) => {
  try {
    await updateDoc(doc(db, 'entries', entryId), {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update entry error:', error);
    throw error;
  }
};

/**
 * Get all entries for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of entries
 */
export const getUserEntries = async (userId) => {
  try {
    const entriesQuery = query(
      collection(db, 'entries'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get user entries error:', error);
    throw error;
  }
};

/**
 * Get all of today's entries for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of today's entries (empty if none)
 */
export const getTodayEntries = async (userId) => {
  try {
    const today = getTodayDateString();
    const entriesQuery = query(
      collection(db, 'entries'),
      where('userId', '==', userId),
      where('date', '==', today)
    );

    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get today entries error:', error);
    throw error;
  }
};

/**
 * Get entries for a specific date range
 * @param {string} userId - User ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of entries
 */
export const getEntriesByDateRange = async (userId, startDate, endDate) => {
  try {
    const entriesQuery = query(
      collection(db, 'entries'),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get entries by date range error:', error);
    throw error;
  }
};

/**
 * Delete an entry
 * @param {string} entryId - Entry ID to delete
 * @returns {Promise<void>}
 */
export const deleteEntry = async (entryId) => {
  try {
    await deleteDoc(doc(db, 'entries', entryId));
  } catch (error) {
    console.error('Delete entry error:', error);
    throw error;
  }
};
