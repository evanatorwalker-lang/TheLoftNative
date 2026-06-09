import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs, deleteField } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Link a client to a therapist using a pairing code
 * @param {string} clientId - Client's user ID
 * @param {string} pairingCode - Therapist's pairing code
 * @param {Object} clientData - Client's user data (displayName, email)
 * @returns {Promise<string>} Therapist ID
 */
export const linkClientToTherapist = async (clientId, pairingCode, clientData) => {
  try {
    // Find therapist by pairing code
    const usersRef = collection(db, 'users');
    const therapistQuery = query(
      usersRef,
      where('role', '==', 'therapist'),
      where('pairingCode', '==', pairingCode.toUpperCase())
    );

    const therapistSnapshot = await getDocs(therapistQuery);

    if (therapistSnapshot.empty) {
      throw new Error('Invalid pairing code. Please check and try again.');
    }

    const therapistDoc = therapistSnapshot.docs[0];
    const therapistId = therapistDoc.id;

    // Update client's user document with therapistId and set to therapist mode
    await updateDoc(doc(db, 'users', clientId), {
      therapistId,
      pairedAt: new Date().toISOString(),
      connectionMode: 'therapist'
    });

    // Add client to therapist's client list
    const therapistClientsRef = doc(db, 'therapist_clients', therapistId);
    const therapistClientsDoc = await getDoc(therapistClientsRef);

    const clientInfo = {
      displayName: clientData.displayName,
      email: clientData.email,
      connectedAt: new Date().toISOString()
    };

    if (therapistClientsDoc.exists()) {
      // Update existing document
      const existingClients = therapistClientsDoc.data().clients || {};
      existingClients[clientId] = clientInfo;

      await updateDoc(therapistClientsRef, {
        clients: existingClients
      });
    } else {
      // Create new document
      await setDoc(therapistClientsRef, {
        clients: {
          [clientId]: clientInfo
        }
      });
    }

    return therapistId;
  } catch (error) {
    console.error('Pairing error:', error);
    throw error;
  }
};

/**
 * Get therapist's pairing code
 * @param {string} therapistId - Therapist's user ID
 * @returns {Promise<string>} Pairing code
 */
export const getTherapistPairingCode = async (therapistId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', therapistId));

    if (!userDoc.exists()) {
      throw new Error('Therapist not found');
    }

    const userData = userDoc.data();

    if (userData.role !== 'therapist') {
      throw new Error('User is not a therapist');
    }

    return userData.pairingCode;
  } catch (error) {
    console.error('Get pairing code error:', error);
    throw error;
  }
};

/**
 * Validate if a pairing code exists
 * @param {string} pairingCode - Pairing code to validate
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
export const validatePairingCode = async (pairingCode) => {
  try {
    const usersRef = collection(db, 'users');
    const therapistQuery = query(
      usersRef,
      where('role', '==', 'therapist'),
      where('pairingCode', '==', pairingCode.toUpperCase())
    );

    const therapistSnapshot = await getDocs(therapistQuery);
    return !therapistSnapshot.empty;
  } catch (error) {
    console.error('Validate pairing code error:', error);
    return false;
  }
};

/**
 * Get therapist information for a client
 * @param {string} therapistId - Therapist's user ID
 * @returns {Promise<Object|null>} Therapist data or null if not found
 */
export const getTherapistInfo = async (therapistId) => {
  try {
    if (!therapistId) return null;

    const therapistDoc = await getDoc(doc(db, 'users', therapistId));

    if (!therapistDoc.exists()) {
      return null;
    }

    const therapistData = therapistDoc.data();

    return {
      id: therapistDoc.id,
      displayName: therapistData.displayName,
      email: therapistData.email,
      pairingCode: therapistData.pairingCode
    };
  } catch (error) {
    console.error('Get therapist info error:', error);
    return null;
  }
};

/**
 * Update client's account mode
 * Account modes:
 * - 'therapist': Use app with therapist oversight (therapist can view data)
 * - 'solo': Use app independently without therapist connection
 *
 * @param {string} clientId - Client's user ID
 * @param {string} connectionMode - Account mode ('therapist' or 'solo')
 * @returns {Promise<void>}
 */
export const updateConnectionMode = async (clientId, connectionMode) => {
  try {
    const validModes = ['therapist', 'solo'];

    if (!validModes.includes(connectionMode)) {
      throw new Error('Invalid connection mode. Must be: therapist or solo');
    }

    await updateDoc(doc(db, 'users', clientId), {
      connectionMode,
      connectionModeUpdatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update connection mode error:', error);
    throw error;
  }
};

/**
 * Disconnect a client from their therapist (switch to solo mode)
 * @param {string} clientId - Client's user ID
 * @param {string} therapistId - Current therapist's user ID
 * @returns {Promise<void>}
 */
export const disconnectFromTherapist = async (clientId, therapistId) => {
  try {
    // Clear therapist fields on client document
    await updateDoc(doc(db, 'users', clientId), {
      therapistId: deleteField(),
      pairedAt: deleteField(),
      connectionMode: 'solo',
      connectionModeUpdatedAt: new Date().toISOString(),
    });

    // Remove client from therapist's client list
    if (therapistId) {
      const therapistClientsRef = doc(db, 'therapist_clients', therapistId);
      const snap = await getDoc(therapistClientsRef);
      if (snap.exists()) {
        const clients = snap.data().clients || {};
        delete clients[clientId];
        await updateDoc(therapistClientsRef, { clients });
      }
    }
  } catch (error) {
    console.error('Disconnect therapist error:', error);
    throw error;
  }
};

/**
 * Change client's therapist (switch to a new therapist)
 * @param {string} clientId - Client's user ID
 * @param {string} oldTherapistId - Current therapist's ID
 * @param {string} newPairingCode - New therapist's pairing code
 * @param {Object} clientData - Client's user data
 * @returns {Promise<string>} New therapist ID
 */
export const switchTherapist = async (clientId, oldTherapistId, newPairingCode, clientData) => {
  try {
    // Link to new therapist first — if this fails, old state is preserved
    const newTherapistId = await linkClientToTherapist(clientId, newPairingCode, clientData);

    // Only remove from old therapist after new pairing succeeds
    if (oldTherapistId && oldTherapistId !== newTherapistId) {
      const oldTherapistClientsRef = doc(db, 'therapist_clients', oldTherapistId);
      const oldTherapistClientsDoc = await getDoc(oldTherapistClientsRef);

      if (oldTherapistClientsDoc.exists()) {
        const existingClients = oldTherapistClientsDoc.data().clients || {};
        delete existingClients[clientId];

        await updateDoc(oldTherapistClientsRef, {
          clients: existingClients
        });
      }
    }

    return newTherapistId;
  } catch (error) {
    console.error('Switch therapist error:', error);
    throw error;
  }
};
