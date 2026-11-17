import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabaseConfig =
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('YOUR_') &&
  !supabaseAnonKey.includes('YOUR_')
    ? { url: supabaseUrl, anonKey: supabaseAnonKey }
    : null;

export const isSupabaseConfigured = supabaseConfig !== null;

const isWebServer = Platform.OS === 'web' && typeof window === 'undefined';
const sessionStorage = {
  getItem: (key: string) => (isWebServer ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) =>
    isWebServer ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) =>
    isWebServer ? Promise.resolve() : AsyncStorage.removeItem(key),
};

const supabase = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env before using Supabase.'
    );
  }

  return supabase;
}
