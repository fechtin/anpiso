import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserSettings } from '../types';

const SETTINGS_COLLECTION = 'userSettings';

export const userSettingsService = {
  async getSettings(userUid: string): Promise<UserSettings> {
    const docRef = doc(db, SETTINGS_COLLECTION, userUid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserSettings;
    }
    return { driveEnabled: false };
  },

  async updateSettings(userUid: string, settings: Partial<UserSettings>): Promise<void> {
    const docRef = doc(db, SETTINGS_COLLECTION, userUid);
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },
};
