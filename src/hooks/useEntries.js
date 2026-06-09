import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Custom hook to fetch and listen to user's entries in real-time
 * @param {string} userId - User ID to fetch entries for
 * @returns {Object} { entries, loading, error }
 */
export const useEntries = (userId) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Create query for user's entries
    const entriesQuery = query(
      collection(db, 'entries'),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const entriesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setEntries(entriesData);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching entries:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return unsubscribe;
  }, [userId]);

  return { entries, loading, error };
};
