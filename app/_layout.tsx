import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppUpdateGate } from '@/components/app-update-gate';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppUpdate } from '@/hooks/use-app-update';

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appUpdate = useAppUpdate();

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  if (!appUpdate.checked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD400" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (appUpdate.required) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <AppUpdateGate update={appUpdate} onRetry={appUpdate.refresh} />
        <StatusBar style="light" />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="gallery"
            options={{
              title: 'IntelliCam',
              headerBackTitle: 'Camera',
              headerStyle: { backgroundColor: '#080808' },
              headerTintColor: 'white',
              contentStyle: { backgroundColor: '#080808' },
            }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080808',
  },
});
