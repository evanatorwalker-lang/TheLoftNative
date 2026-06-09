import { useState, useEffect } from 'react';
import { subscribeToClients } from '../services/therapist.service';

/**
 * Custom hook to fetch and listen to therapist's clients in real-time
 * @param {string} therapistId - Therapist's user ID
 * @returns {Object} { clients, loading, error }
 */
export const useClients = (therapistId) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!therapistId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to real-time client updates
    const unsubscribe = subscribeToClients(
      therapistId,
      (clientsData) => {
        setClients(clientsData);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return unsubscribe;
  }, [therapistId]);

  return { clients, loading, error };
};
