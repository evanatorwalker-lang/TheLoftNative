import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Text, TextInput } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider } from '../src/context/AppContext';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  Text.defaultProps = Object.assign(Text.defaultProps || {}, {
    style: { fontFamily: 'Poppins_400Regular' },
  });
  TextInput.defaultProps = Object.assign(TextInput.defaultProps || {}, {
    style: { fontFamily: 'Poppins_400Regular' },
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
