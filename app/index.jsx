import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../src/context/AppContext';
import { colors } from '../src/theme';

export default function Index() {
  const { currentUser, loading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!currentUser) {
      router.replace('/(auth)/login');
    } else if (currentUser.role === 'therapist') {
      router.replace('/(therapist)');
    } else if (currentUser.role === 'client') {
      router.replace('/(client)');
    } else {
      // Unknown or missing role — fall back to login
      router.replace('/(auth)/login');
    }
  }, [currentUser, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
