import {
  doc, setDoc, getDoc, updateDoc, collection,
  addDoc, onSnapshot, serverTimestamp, Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export const signalingService = {
  async createRoom(roomId: string, hostUid: string, hostName: string): Promise<void> {
    await setDoc(doc(db, 'rooms', roomId), {
      hostUid,
      hostName,
      status: 'active',
      createdAt: serverTimestamp(),
    });
  },

  async updateRoomStatus(roomId: string, status: 'active' | 'completed'): Promise<void> {
    await updateDoc(doc(db, 'rooms', roomId), { status });
  },

  async getRoom(roomId: string) {
    const snap = await getDoc(doc(db, 'rooms', roomId));
    return snap.exists() ? snap.data() : null;
  },

  async writePeerOffer(roomId: string, peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    await setDoc(doc(db, 'rooms', roomId, 'peers', peerId), {
      type: 'offer',
      sdp: JSON.stringify(offer),
      createdAt: serverTimestamp(),
    });
  },

  async writePeerAnswer(roomId: string, peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    await updateDoc(doc(db, 'rooms', roomId, 'peers', peerId), {
      type: 'answer',
      sdp: JSON.stringify(answer),
    });
  },

  async addIceCandidate(roomId: string, peerId: string, candidate: RTCIceCandidateInit, from: 'host' | 'viewer'): Promise<void> {
    await addDoc(collection(db, 'rooms', roomId, 'peers', peerId, `candidates_${from}`), {
      candidate: JSON.stringify(candidate),
      createdAt: serverTimestamp(),
    });
  },

  onNewPeers(roomId: string, callback: (peers: { id: string; sdp: string }[]) => void): Unsubscribe {
    return onSnapshot(collection(db, 'rooms', roomId, 'peers'), (snapshot) => {
      const newPeers = snapshot.docChanges()
        .filter(change => change.type === 'added' && change.doc.data().type === 'offer')
        .map(change => ({ id: change.doc.id, sdp: change.doc.data().sdp }));
      if (newPeers.length > 0) callback(newPeers);
    });
  },

  onPeerAnswer(roomId: string, peerId: string, callback: (sdp: string) => void): Unsubscribe {
    return onSnapshot(doc(db, 'rooms', roomId, 'peers', peerId), (snap) => {
      const data = snap.data();
      if (data?.type === 'answer' && data.sdp) {
        callback(data.sdp);
      }
    });
  },

  onIceCandidates(roomId: string, peerId: string, from: 'host' | 'viewer', callback: (candidate: RTCIceCandidateInit) => void): Unsubscribe {
    return onSnapshot(collection(db, 'rooms', roomId, 'peers', peerId, `candidates_${from}`), (snapshot) => {
      snapshot.docChanges()
        .filter(change => change.type === 'added')
        .forEach(change => {
          callback(JSON.parse(change.doc.data().candidate));
        });
    });
  },
};
