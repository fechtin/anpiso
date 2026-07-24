import { useEffect, useRef, useState, useCallback } from 'react';
import { TranscriptLine, MeetingMinutes, RecordingStatus, User } from '../types';
import { HostMessage, FullStateMessage } from '../types/sharing';
import { signalingService } from '../services/signalingService';
import { RTC_CONFIG } from '../config/webrtc';

interface PeerEntry {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
}

export interface UseHostSharingReturn {
  isSharing: boolean;
  shareLink: string | null;
  viewerCount: number;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
}

export function useHostSharing(
  liveTranscript: TranscriptLine[],
  inputDraft: string,
  outputDraft: string,
  elapsedTime: number,
  status: RecordingStatus,
  minutes: MeetingMinutes | null,
  hqSegments: string[],
  fullTranslatedTranscript: string,
  user: User | null,
  translationEnabled: boolean = true
): UseHostSharingReturn {
  const [isSharing, setIsSharing] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const unsubPeersRef = useRef<(() => void) | null>(null);
  const lastSentIndexRef = useRef(0);
  // Track the last broadcast text per line ID to detect translation updates
  const broadcastedTextsRef = useRef<Map<string, string>>(new Map());

  // Refs to mirror current state for WebRTC callbacks (avoid stale closures)
  const liveTranscriptRef = useRef(liveTranscript);
  const inputDraftRef = useRef(inputDraft);
  const outputDraftRef = useRef(outputDraft);
  const elapsedTimeRef = useRef(elapsedTime);
  const statusRef = useRef(status);
  const minutesRef = useRef(minutes);
  const hqSegmentsRef = useRef(hqSegments);
  const fullTranslatedTranscriptRef = useRef(fullTranslatedTranscript);
  const translationEnabledRef = useRef(translationEnabled);

  // Keep refs in sync
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { inputDraftRef.current = inputDraft; }, [inputDraft]);
  useEffect(() => { outputDraftRef.current = outputDraft; }, [outputDraft]);
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { minutesRef.current = minutes; }, [minutes]);
  useEffect(() => { hqSegmentsRef.current = hqSegments; }, [hqSegments]);
  useEffect(() => { fullTranslatedTranscriptRef.current = fullTranslatedTranscript; }, [fullTranslatedTranscript]);
  useEffect(() => { translationEnabledRef.current = translationEnabled; }, [translationEnabled]);

  const broadcast = useCallback((message: HostMessage) => {
    const data = JSON.stringify(message);
    peersRef.current.forEach((peer) => {
      try {
        if (peer.dc.readyState === 'open') {
          peer.dc.send(data);
        }
      } catch {
        // ignore send errors
      }
    });
  }, []);

  const handleNewPeer = useCallback(async (peerId: string, offerSdp: string, currentRoomId: string) => {
    if (peersRef.current.has(peerId)) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel('meeting-data', { ordered: true });

    dc.onopen = () => {
      const snapshot: FullStateMessage = {
        type: 'full_state',
        liveTranscript: liveTranscriptRef.current,
        inputDraft: inputDraftRef.current,
        outputDraft: outputDraftRef.current,
        elapsedTime: elapsedTimeRef.current,
        status: statusRef.current,
        minutes: minutesRef.current,
        hqSegments: hqSegmentsRef.current,
        fullTranslatedTranscript: fullTranslatedTranscriptRef.current,
        translationEnabled: translationEnabledRef.current,
      };
      dc.send(JSON.stringify(snapshot));
      setViewerCount(c => c + 1);
    };

    dc.onclose = () => {
      peersRef.current.delete(peerId);
      setViewerCount(c => Math.max(0, c - 1));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.addIceCandidate(currentRoomId, peerId, event.candidate.toJSON(), 'host');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(peerId);
        setViewerCount(c => Math.max(0, c - 1));
        pc.close();
      }
    };

    try {
      const offer: RTCSessionDescriptionInit = JSON.parse(offerSdp);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await signalingService.writePeerAnswer(currentRoomId, peerId, answer);

      signalingService.onIceCandidates(currentRoomId, peerId, 'viewer', (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });

      peersRef.current.set(peerId, { pc, dc });
    } catch {
      pc.close();
    }
  }, []);

  const startSharing = useCallback(async () => {
    if (!user || isSharing) return;

    const newRoomId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    await signalingService.createRoom(newRoomId, user.uid, user.name);

    const unsub = signalingService.onNewPeers(newRoomId, (peers) => {
      peers.forEach(peer => {
        handleNewPeer(peer.id, peer.sdp, newRoomId);
      });
    });

    unsubPeersRef.current = unsub;
    setRoomId(newRoomId);
    setIsSharing(true);
    lastSentIndexRef.current = 0;
    broadcastedTextsRef.current.clear();
  }, [user, isSharing, handleNewPeer]);

  const stopSharing = useCallback(() => {
    // Clean up listeners
    unsubPeersRef.current?.();
    unsubPeersRef.current = null;

    // Close all peer connections
    peersRef.current.forEach(peer => {
      peer.dc.close();
      peer.pc.close();
    });
    peersRef.current.clear();

    // Update room status
    if (roomId) {
      signalingService.updateRoomStatus(roomId, 'completed').catch(() => {});
    }

    setIsSharing(false);
    setRoomId(null);
    setViewerCount(0);
    lastSentIndexRef.current = 0;
    broadcastedTextsRef.current.clear();
  }, [roomId]);

  // Broadcast new transcript lines immediately and record their texts
  useEffect(() => {
    if (!isSharing) return;
    const newLines = liveTranscript.slice(lastSentIndexRef.current);
    if (newLines.length > 0) {
      broadcast({ type: 'transcript_append', lines: newLines });
      // Record the text we actually sent, so the update interval has correct baseline
      newLines.forEach(line => {
        broadcastedTextsRef.current.set(line.id, line.text);
      });
      lastSentIndexRef.current = liveTranscript.length;
    }
  }, [liveTranscript, isSharing, broadcast]);

  // Periodic sync: detect updates to existing lines (translation text filled in)
  // Compares current text with what was last broadcast per line ID
  useEffect(() => {
    if (!isSharing) return;
    const interval = setInterval(() => {
      const current = liveTranscriptRef.current;
      const texts = broadcastedTextsRef.current;
      const updatedLines: TranscriptLine[] = [];

      for (const line of current) {
        const lastSentText = texts.get(line.id);
        // Only detect changes for lines we've previously broadcast
        if (lastSentText !== undefined && lastSentText !== line.text) {
          updatedLines.push(line);
          texts.set(line.id, line.text);
        }
      }

      if (updatedLines.length > 0) {
        broadcast({ type: 'transcript_update', lines: updatedLines });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isSharing, broadcast]);

  // Broadcast inputDraft on change
  useEffect(() => {
    if (!isSharing) return;
    broadcast({ type: 'input_draft', text: inputDraft });
  }, [inputDraft, isSharing, broadcast]);

  // Broadcast outputDraft on change
  useEffect(() => {
    if (!isSharing) return;
    broadcast({ type: 'output_draft', text: outputDraft });
  }, [outputDraft, isSharing, broadcast]);

  // Broadcast elapsed time
  useEffect(() => {
    if (!isSharing) return;
    broadcast({ type: 'elapsed_time', seconds: elapsedTime });
  }, [elapsedTime, isSharing, broadcast]);

  // Broadcast status changes
  useEffect(() => {
    if (!isSharing) return;
    broadcast({ type: 'status_change', status });
  }, [status, isSharing, broadcast]);

  // Broadcast minutes
  useEffect(() => {
    if (!isSharing || !minutes) return;
    broadcast({ type: 'minutes', minutes });
  }, [minutes, isSharing, broadcast]);

  // Broadcast hqSegments
  useEffect(() => {
    if (!isSharing || hqSegments.length === 0) return;
    const lastIndex = hqSegments.length - 1;
    broadcast({ type: 'hq_segment', index: lastIndex, text: hqSegments[lastIndex] });
  }, [hqSegments.length, isSharing, broadcast]);

  // Broadcast translated transcript
  useEffect(() => {
    if (!isSharing || !fullTranslatedTranscript) return;
    broadcast({ type: 'translated_transcript', text: fullTranslatedTranscript });
  }, [fullTranslatedTranscript, isSharing, broadcast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubPeersRef.current?.();
      peersRef.current.forEach(peer => {
        peer.dc.close();
        peer.pc.close();
      });
    };
  }, []);

  const shareLink = roomId ? `${window.location.origin}/view/${roomId}` : null;

  return { isSharing, shareLink, viewerCount, startSharing, stopSharing };
}
