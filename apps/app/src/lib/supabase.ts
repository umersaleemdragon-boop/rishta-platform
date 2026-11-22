import './polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

// Which channels the backend can deliver login codes on, e.g. "whatsapp,sms" (first = default).
export type OtpChannel = 'sms' | 'whatsapp';
export const otpChannels: OtpChannel[] = String(process.env.EXPO_PUBLIC_OTP_CHANNELS ?? 'sms')
  .split(',').map((c: string) => c.trim()).filter((c: string): c is OtpChannel => c === 'sms' || c === 'whatsapp');

// Sign-in methods offered, first = default: "email", or "email,phone".
export type LoginMethod = 'email' | 'phone';
export const loginMethods: LoginMethod[] = String(process.env.EXPO_PUBLIC_LOGIN_METHODS ?? 'email')
  .split(',').map((m: string) => m.trim()).filter((m: string): m is LoginMethod => m === 'email' || m === 'phone');

export const isBackendConfigured = url.startsWith('https://') && key.length > 20;

export const supabase = createClient(isBackendConfigured ? url : 'https://not-configured.invalid', key || 'missing', {
  auth: {
    // Web: browser localStorage (default). Native: AsyncStorage.
    ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage, lock: processLock }),
    autoRefreshToken: true,
    persistSession: true,
    // Web: also accept the sign-in LINK from the email (session arrives in the URL).
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Native apps: only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// Where the email sign-in link should land: the site the person is using.
export const emailRedirectTo =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
