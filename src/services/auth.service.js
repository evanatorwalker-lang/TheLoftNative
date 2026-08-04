import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const SYNTHETIC_EMAIL_DOMAIN = 'users.theloftapp.internal';

/**
 * Sanitize a username into a valid Firebase email local-part
 * @param {string} raw - Raw username
 * @returns {string} Sanitized username
 */
export const sanitizeUsername = (raw) => {
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
};

/**
 * Firebase Auth requires an email-shaped credential internally. We never
 * collect or show a real email, so we derive a fake one from the username.
 * @param {string} username - Username
 * @returns {string} Synthetic email
 */
export const usernameToSyntheticEmail = (username) => {
  return `${sanitizeUsername(username)}@${SYNTHETIC_EMAIL_DOMAIN}`;
};

/**
 * Build the app-facing user object. Never surfaces email. Falls back to the
 * legacy displayName field so existing accounts (created before usernames
 * existed) work everywhere without a data migration.
 * @param {Object} firebaseUser - Firebase auth user
 * @param {Object} docData - Firestore users/{uid} document data
 * @returns {Object} Normalized user object
 */
const normalizeUserData = (firebaseUser, docData) => {
  return {
    uid: firebaseUser.uid,
    username: docData.username || docData.displayName || firebaseUser.displayName || 'User',
    ...docData,
  };
};

/**
 * Sign up a new user with a username and password
 * @param {string} username - User's chosen username
 * @param {string} password - User password
 * @param {string} role - User role ('client' or 'therapist')
 * @returns {Promise<Object>} User object with role
 */
export const signUp = async (username, password, role, notificationTime = '09:00') => {
  try {
    const syntheticEmail = usernameToSyntheticEmail(username);

    // Create Firebase auth user (email is a fake, internal-only credential)
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, syntheticEmail, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('That username is already taken. Please choose another.');
      }
      throw error;
    }
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName: username });

    // Create user document in Firestore with role
    const userData = {
      username,
      role,
      createdAt: new Date().toISOString()
    };

    // If therapist, generate pairing code; if client, default to solo mode
    if (role === 'therapist') {
      userData.pairingCode = generatePairingCode();
    } else if (role === 'client') {
      userData.connectionMode = 'solo';
      userData.notificationTime = notificationTime;
      userData.notificationsEnabled = true;
      userData.therapistMessageNotif = true;
    }

    await setDoc(doc(db, 'users', user.uid), userData);

    // If therapist, create empty client list
    if (role === 'therapist') {
      await setDoc(doc(db, 'therapist_clients', user.uid), {
        clients: {}
      });
    }

    return normalizeUserData(user, userData);
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};

/**
 * Sign in an existing user
 * @param {string} identifier - Username (new accounts) or real email (legacy accounts)
 * @param {string} password - User password
 * @returns {Promise<Object>} User object with role
 */
export const login = async (identifier, password) => {
  try {
    // Legacy accounts (created before usernames existed) still sign in with
    // their real email. New accounts never have a real email — sign in with
    // the synthetic one derived from their username.
    const signInEmail = identifier.includes('@') ? identifier : usernameToSyntheticEmail(identifier);
    const userCredential = await signInWithEmailAndPassword(auth, signInEmail, password);
    const user = userCredential.user;

    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      throw new Error('User data not found');
    }

    return normalizeUserData(user, userDoc.data());
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

/**
 * Get the current user with Firestore data
 * @param {Object} firebaseUser - Firebase auth user
 * @returns {Promise<Object|null>} User object with role or null
 */
export const getCurrentUser = async (firebaseUser, retryCount = 0) => {
  if (!firebaseUser) return null;

  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

    if (!userDoc.exists()) {
      // Retry up to 3 times with exponential backoff
      // This handles race conditions where auth user is created before Firestore document
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay));
        return getCurrentUser(firebaseUser, retryCount + 1);
      }

      console.error('User document does not exist for:', firebaseUser.uid);
      return null;
    }

    return normalizeUserData(firebaseUser, userDoc.data());
  } catch (error) {
    console.error('Get current user error:', error);

    // Retry on permission errors too
    if (retryCount < 3 && error.code === 'permission-denied') {
      const delay = Math.pow(2, retryCount) * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
      return getCurrentUser(firebaseUser, retryCount + 1);
    }

    return null;
  }
};

/**
 * Listen to auth state changes
 * @param {Function} callback - Callback function called with user data
 * @returns {Function} Unsubscribe function
 */
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userData = await getCurrentUser(firebaseUser);
      callback(userData);
    } else {
      callback(null);
    }
  });
};

/**
 * Generate a random 6-digit alphanumeric pairing code
 * @returns {string} Pairing code (e.g., "A4K9P2")
 */
export const generatePairingCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (0, O, I, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
