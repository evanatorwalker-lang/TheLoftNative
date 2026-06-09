import { Stack } from 'expo-router';

export default function ClientLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="checkin" />
    </Stack>
  );
}
