import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { Contact } from '../types';

const CONTACTS_COLLECTION = 'contacts';

export const contactService = {
  async getContacts(userUid: string): Promise<Contact[]> {
    const q = query(
      collection(db, CONTACTS_COLLECTION),
      where('ownerUid', '==', userUid),
      orderBy('email', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Contact[];
  },

  async addContact(userUid: string, email: string, name: string = ''): Promise<Contact> {
    const normalizedEmail = email.toLowerCase().trim();
    const docRef = await addDoc(collection(db, CONTACTS_COLLECTION), {
      ownerUid: userUid,
      email: normalizedEmail,
      name: name.trim(),
    });
    return {
      id: docRef.id,
      ownerUid: userUid,
      email: normalizedEmail,
      name: name.trim(),
    };
  },

  async deleteContact(contactId: string): Promise<void> {
    await deleteDoc(doc(db, CONTACTS_COLLECTION, contactId));
  },
};
