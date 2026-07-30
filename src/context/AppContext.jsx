import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChange } from '../services/auth.service';
import { reschedule, cancelAllNotifications, registerPushToken } from '../services/notification.service';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setCurrentUser(prev => {
        // Reschedule when a client logs in; cancel when anyone logs out
        if (user?.role === 'client' && user.notificationsEnabled !== false) {
          reschedule(user.notificationTime || '09:00').catch(() => {});
          registerPushToken(user.uid).catch(() => {});
        } else if (!user && prev) {
          cancelAllNotifications().catch(() => {});
        }
        return user;
      });
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const updateUser = (userData) => {
    setCurrentUser(prev => ({ ...prev, ...userData }));
  };

  const setAppError = (errorMessage) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000);
  };

  const value = {
    currentUser,
    loading,
    error,
    updateUser,
    setAppError,
    isAuthenticated: !!currentUser,
    isClient: currentUser?.role === 'client',
    isTherapist: currentUser?.role === 'therapist',
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
