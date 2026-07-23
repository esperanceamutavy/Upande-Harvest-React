import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** Non-sensitive keys stored in AsyncStorage */
export const STORAGE_KEYS = {
  INSTANCE_URL_BACKUP: 'instanceurl_backup',
  EMAIL_BACKUP: 'email_backup',
  USER_FARM: 'userFarm',
} as const;

/** Sensitive keys stored in expo-secure-store */
export const SECURE_KEYS = {
  SID: 'sid',
  INSTANCE_URL: 'instanceurl',
} as const;

export const getStorageItem = (key: string): Promise<string | null> =>
  AsyncStorage.getItem(key);

export const setStorageItem = (key: string, value: string): Promise<void> =>
  AsyncStorage.setItem(key, value);

export const removeStorageItem = (key: string): Promise<void> =>
  AsyncStorage.removeItem(key);

export const getSecureItem = (key: string): Promise<string | null> =>
  SecureStore.getItemAsync(key);

export const setSecureItem = (key: string, value: string): Promise<void> =>
  SecureStore.setItemAsync(key, value);

export const deleteSecureItem = (key: string): Promise<void> =>
  SecureStore.deleteItemAsync(key);
