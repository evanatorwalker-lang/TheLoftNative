import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const EXPO_PROJECT_ID = '2accb6eb-5639-407e-a0d5-e96b8356880e';

const DAILY_ID_KEY = 'notif_daily_id';
const STREAK_ID_KEY = 'notif_streak_id';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestPermissions = async () => {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

export const scheduleDailyReminder = async (timeString) => {
  const existingId = await AsyncStorage.getItem(DAILY_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const [hour, minute] = timeString.split(':').map(Number);

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time for your daily check-in',
      body: 'How are you feeling today? It only takes a minute.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  });

  await AsyncStorage.setItem(DAILY_ID_KEY, id);
  return id;
};

export const scheduleStreakRisk = async () => {
  const existingId = await AsyncStorage.getItem(STREAK_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Don't lose your streak! 🔥",
      body: "You haven't checked in yet today. Keep your streak alive.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: 20,
      minute: 0,
      repeats: true,
    },
  });

  await AsyncStorage.setItem(STREAK_ID_KEY, id);
  return id;
};

export const cancelAllNotifications = async () => {
  const [dailyId, streakId] = await Promise.all([
    AsyncStorage.getItem(DAILY_ID_KEY),
    AsyncStorage.getItem(STREAK_ID_KEY),
  ]);
  await Promise.all([
    dailyId ? Notifications.cancelScheduledNotificationAsync(dailyId).catch(() => {}) : Promise.resolve(),
    streakId ? Notifications.cancelScheduledNotificationAsync(streakId).catch(() => {}) : Promise.resolve(),
    AsyncStorage.removeItem(DAILY_ID_KEY),
    AsyncStorage.removeItem(STREAK_ID_KEY),
  ]);
};

export const reschedule = async (timeString) => {
  if (!timeString) return;
  await cancelAllNotifications();
  await scheduleDailyReminder(timeString);
  await scheduleStreakRisk();
};

// Saves the device's Expo push token to the user's Firestore doc.
// Called once on client login so therapists can push to them.
export const registerPushToken = async (userId) => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
  } catch {
    // Simulator or permissions denied — silently skip
  }
};

// Called from the therapist's device after saving a client message.
// Reads the client's token + preference then fires via the Expo Push API.
export const sendTherapistMessageNotif = async (clientId, messageText) => {
  try {
    const clientDoc = await getDoc(doc(db, 'users', clientId));
    if (!clientDoc.exists()) return;
    const { expoPushToken, therapistMessageNotif } = clientDoc.data();
    if (!expoPushToken || therapistMessageNotif === false) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: expoPushToken,
        title: 'Message from your therapist',
        body: messageText.length > 100 ? messageText.slice(0, 97) + '...' : messageText,
        sound: 'default',
      }),
    });
  } catch {
    // Non-critical — message is already saved, notification is best-effort
  }
};
