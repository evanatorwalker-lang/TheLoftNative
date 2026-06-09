import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Sign up a new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} displayName - User display name
 * @param {string} role - User role ('client' or 'therapist')
 * @returns {Promise<Object>} User object with role
 */
export const signUp = async (email, password, displayName, role) => {
  try {
    // Create Firebase auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName });

    // Create user document in Firestore with role
    const userData = {
      email,
      displayName,
      role,
      createdAt: new Date().toISOString()
    };

    // If therapist, generate pairing code; if client, default to solo mode
    if (role === 'therapist') {
      userData.pairingCode = generatePairingCode();
    } else if (role === 'client') {
      userData.connectionMode = 'solo';
    }

    await setDoc(doc(db, 'users', user.uid), userData);

    // If therapist, create empty client list
    if (role === 'therapist') {
      await setDoc(doc(db, 'therapist_clients', user.uid), {
        clients: {}
      });
    }

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      ...userData
    };
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};

/**
 * Sign in an existing user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User object with role
 */
export const login = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      throw new Error('User data not found');
    }

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      ...userDoc.data()
    };
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

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      ...userDoc.data()
    };
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
