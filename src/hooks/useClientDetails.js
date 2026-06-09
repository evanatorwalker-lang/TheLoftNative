import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getClientEntries } from '../services/therapist.service';

/**
 * Custom hook to fetch a specific client's details and their entries
 * @param {string} clientId - Client's user ID
 * @param {string} therapistId - Therapist's user ID (for authorization)
 * @returns {Object} { client, entries, loading, error }
 */
export const useClientDetails = (clientId, therapistId) => {
  const [client, setClient] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId || !therapistId) {
      setLoading(false);
      return;
    }

    const fetchClientDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch client's user data
        const clientDoc = await getDoc(doc(db, 'users', clientId));

        if (!clientDoc.exists()) {
          throw new Error('Client not found');
        }

        const clientData = { id: clientDoc.id, ...clientDoc.data() };

        // Verify the client is connected to this therapist
        if (clientData.therapistId !== therapistId) {
          throw new Error('Unauthorized: Client is not connected to this therapist');
        }

        setClient(clientData);

        // Fetch client's entries
        const clientEntries = await getClientEntries(clientId, therapistId);
        setEntries(clientEntries);
      } catch (err) {
        console.error('Error fetching client details:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClientDetails();
  }, [clientId, therapistId]);

  return { client, entries, loading, error };
};
