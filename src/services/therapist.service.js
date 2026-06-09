import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Get all clients for a therapist
 * @param {string} therapistId - Therapist's user ID
 * @returns {Promise<Array>} Array of client objects
 */
export const getTherapistClients = async (therapistId) => {
  try {
    const therapistClientsDoc = await getDoc(doc(db, 'therapist_clients', therapistId));

    if (!therapistClientsDoc.exists()) {
      return [];
    }

    const clientsData = therapistClientsDoc.data().clients || {};
    const clientIds = Object.keys(clientsData);

    if (clientIds.length === 0) {
      return [];
    }

    // Fetch additional data for each client
    const clientsWithData = await Promise.all(
      clientIds.map(async (clientId) => {
        // Get client's user data
        const userDoc = await getDoc(doc(db, 'users', clientId));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // Get client's latest entry
        const entriesQuery = query(
          collection(db, 'entries'),
          where('userId', '==', clientId),
          orderBy('date', 'desc'),
          limit(1)
        );
        const entriesSnapshot = await getDocs(entriesQuery);
        const latestEntry = entriesSnapshot.docs[0]?.data() || null;

        return {
          id: clientId,
          ...clientsData[clientId],
          ...userData,
          latestEntry
        };
      })
    );

    return clientsWithData;
  } catch (error) {
    console.error('Get therapist clients error:', error);
    throw error;
  }
};

/**
 * Get all entries for a specific client (therapist view)
 * @param {string} clientId - Client's user ID
 * @param {string} therapistId - Therapist's user ID (for authorization)
 * @returns {Promise<Array>} Array of client entries
 */
export const getClientEntries = async (clientId, therapistId) => {
  try {
    // Verify this client is linked to the therapist
    const clientDoc = await getDoc(doc(db, 'users', clientId));

    if (!clientDoc.exists() || clientDoc.data().therapistId !== therapistId) {
      throw new Error('Unauthorized: Client not linked to this therapist');
    }

    // Fetch all entries for the client
    const entriesQuery = query(
      collection(db, 'entries'),
      where('userId', '==', clientId),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get client entries error:', error);
    throw error;
  }
};

/**
 * Get a specific client's data (for therapist)
 * @param {string} clientId - Client's user ID
 * @param {string} therapistId - Therapist's user ID (for authorization)
 * @returns {Promise<Object>} Client data with entries
 */
export const getClientData = async (clientId, therapistId) => {
  try {
    // Get client user data
    const clientDoc = await getDoc(doc(db, 'users', clientId));

    if (!clientDoc.exists()) {
      throw new Error('Client not found');
    }

    const clientData = clientDoc.data();

    // Verify client is linked to this therapist
    if (clientData.therapistId !== therapistId) {
      throw new Error('Unauthorized: Client not linked to this therapist');
    }

    // Get all client entries
    const entries = await getClientEntries(clientId, therapistId);

    return {
      id: clientId,
      ...clientData,
      entries
    };
  } catch (error) {
    console.error('Get client data error:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time updates for therapist's client list
 * @param {string} therapistId - Therapist's user ID
 * @param {Function} callback - Callback function called with updated client list
 * @returns {Function} Unsubscribe function
 */
export const subscribeToClients = (therapistId, callback, errorCallback) => {
  const therapistClientsRef = doc(db, 'therapist_clients', therapistId);

  return onSnapshot(therapistClientsRef, async (docSnap) => {
    try {
      if (!docSnap.exists()) {
        callback([]);
        return;
      }

      const clientsData = docSnap.data().clients || {};
      const clientIds = Object.keys(clientsData);

      if (clientIds.length === 0) {
        callback([]);
        return;
      }

      // Fetch additional data for each client
      const clientsWithData = await Promise.all(
        clientIds.map(async (clientId) => {
          // Get client's user data
          const userDoc = await getDoc(doc(db, 'users', clientId));
          const userData = userDoc.exists() ? userDoc.data() : {};

          // Get client's latest entry
          const entriesQuery = query(
            collection(db, 'entries'),
            where('userId', '==', clientId),
            orderBy('date', 'desc'),
            limit(1)
          );
          const entriesSnapshot = await getDocs(entriesQuery);
          const latestEntry = entriesSnapshot.docs[0]?.data() || null;

          return {
            id: clientId,
            ...clientsData[clientId],
            ...userData,
            latestEntry
          };
        })
      );

      callback(clientsWithData);
    } catch (err) {
      console.error('subscribeToClients error:', err);
      if (errorCallback) errorCallback(err);
    }
  }, (err) => {
    console.error('subscribeToClients snapshot error:', err);
    if (errorCallback) errorCallback(err);
  });
};

/**
 * Subscribe to real-time updates for a specific client's entries
 * @param {string} clientId - Client's user ID
 * @param {Function} callback - Callback function called with updated entries
 * @returns {Function} Unsubscribe function
 */
export const subscribeToClientEntries = (clientId, callback, errorCallback) => {
  const entriesQuery = query(
    collection(db, 'entries'),
    where('userId', '==', clientId),
    orderBy('date', 'desc')
  );

  return onSnapshot(entriesQuery, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(entries);
  }, (err) => {
    console.error('subscribeToClientEntries snapshot error:', err);
    if (errorCallback) errorCallback(err);
  });
};

/**
 * Get notes for a specific client
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @returns {Promise<Array>} Array of notes
 */
export const getClientNotes = async (therapistId, clientId) => {
  try {
    const notesDocRef = doc(db, 'client_notes', `${therapistId}_${clientId}`);
    const notesDoc = await getDoc(notesDocRef);

    if (!notesDoc.exists()) {
      return [];
    }

    return notesDoc.data().notes || [];
  } catch (error) {
    console.error('Get client notes error:', error);
    throw error;
  }
};

/**
 * Add a new note for a client
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {string} content - Note content
 * @returns {Promise<Object>} Created note
 */
export const addClientNote = async (therapistId, clientId, content, entryId = null) => {
  try {
    const notesDocRef = doc(db, 'client_notes', `${therapistId}_${clientId}`);
    const notesDoc = await getDoc(notesDocRef);

    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entryId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!notesDoc.exists()) {
      // Create new document
      await setDoc(notesDocRef, {
        therapistId,
        clientId,
        notes: [newNote],
        updatedAt: serverTimestamp()
      });
    } else {
      // Add to existing notes
      const existingNotes = notesDoc.data().notes || [];
      await updateDoc(notesDocRef, {
        notes: [newNote, ...existingNotes],
        updatedAt: serverTimestamp()
      });
    }

    return newNote;
  } catch (error) {
    console.error('Add client note error:', error);
    throw error;
  }
};

/**
 * Update an existing note
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {string} noteId - Note ID to update
 * @param {string} content - Updated content
 * @returns {Promise<void>}
 */
export const updateClientNote = async (therapistId, clientId, noteId, content) => {
  try {
    const notesDocRef = doc(db, 'client_notes', `${therapistId}_${clientId}`);
    const notesDoc = await getDoc(notesDocRef);

    if (!notesDoc.exists()) {
      throw new Error('Notes document not found');
    }

    const notes = notesDoc.data().notes || [];
    const updatedNotes = notes.map(note =>
      note.id === noteId
        ? { ...note, content, updatedAt: new Date().toISOString() }
        : note
    );

    await updateDoc(notesDocRef, {
      notes: updatedNotes,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Update client note error:', error);
    throw error;
  }
};

/**
 * Delete a note
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {string} noteId - Note ID to delete
 * @returns {Promise<void>}
 */
export const deleteClientNote = async (therapistId, clientId, noteId) => {
  try {
    const notesDocRef = doc(db, 'client_notes', `${therapistId}_${clientId}`);
    const notesDoc = await getDoc(notesDocRef);

    if (!notesDoc.exists()) {
      throw new Error('Notes document not found');
    }

    const notes = notesDoc.data().notes || [];
    const filteredNotes = notes.filter(note => note.id !== noteId);

    await updateDoc(notesDocRef, {
      notes: filteredNotes,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Delete client note error:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time updates for client notes
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {Function} callback - Callback function called with updated notes
 * @returns {Function} Unsubscribe function
 */
export const subscribeToClientNotes = (therapistId, clientId, callback) => {
  const notesDocRef = doc(db, 'client_notes', `${therapistId}_${clientId}`);

  return onSnapshot(notesDocRef, (docSnap) => {
    if (!docSnap.exists()) {
      callback([]);
      return;
    }

    callback(docSnap.data().notes || []);
  });
};

/**
 * Add a label to a client
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {string} label - Label to add
 * @returns {Promise<void>}
 */
export const addClientLabel = async (therapistId, clientId, label) => {
  try {
    const therapistClientsRef = doc(db, 'therapist_clients', therapistId);
    const therapistClientsDoc = await getDoc(therapistClientsRef);

    if (!therapistClientsDoc.exists()) {
      throw new Error('Therapist clients document not found');
    }

    const clientsData = therapistClientsDoc.data().clients || {};
    const clientData = clientsData[clientId] || {};
    const currentLabels = clientData.labels || [];

    // Check if label already exists
    if (currentLabels.includes(label)) {
      return;
    }

    const updatedLabels = [...currentLabels, label];

    await updateDoc(therapistClientsRef, {
      [`clients.${clientId}.labels`]: updatedLabels,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Add client label error:', error);
    throw error;
  }
};

/**
 * Get the suicidal risk flag for a client (used by the client's native app).
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @returns {Promise<boolean>} Whether the suicidal risk flag is enabled
 */
export const getClientSuicidalFlag = async (therapistId, clientId) => {
  try {
    // Use getDocFromServer to bypass local cache and always get the latest value
    const therapistClientsDoc = await getDocFromServer(doc(db, 'therapist_clients', therapistId));
    if (!therapistClientsDoc.exists()) {
      console.log('[SuicidalFlag] therapist_clients doc does not exist');
      return false;
    }
    const clients = therapistClientsDoc.data().clients || {};
    const clientEntry = clients[clientId];
    console.log('[SuicidalFlag] clientEntry:', JSON.stringify(clientEntry));
    // Check the explicit boolean flag OR a "suicidal" text label
    const hasFlag = !!(clientEntry?.suicidalFlag);
    const hasLabel = (clientEntry?.labels || []).some(
      l => l.toLowerCase().includes('suicid')
    );
    return hasFlag || hasLabel;
  } catch (error) {
    console.error('Get suicidal flag error:', error);
    return false;
  }
};

/**
 * Remove a label from a client
 * @param {string} therapistId - Therapist's user ID
 * @param {string} clientId - Client's user ID
 * @param {string} label - Label to remove
 * @returns {Promise<void>}
 */
export const removeClientLabel = async (therapistId, clientId, label) => {
  try {
    const therapistClientsRef = doc(db, 'therapist_clients', therapistId);
    const therapistClientsDoc = await getDoc(therapistClientsRef);

    if (!therapistClientsDoc.exists()) {
      throw new Error('Therapist clients document not found');
    }

    const clientsData = therapistClientsDoc.data().clients || {};
    const clientData = clientsData[clientId] || {};
    const currentLabels = clientData.labels || [];

    const updatedLabels = currentLabels.filter(l => l !== label);

    await updateDoc(therapistClientsRef, {
      [`clients.${clientId}.labels`]: updatedLabels,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Remove client label error:', error);
    throw error;
  }
};
