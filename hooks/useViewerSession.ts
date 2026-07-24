import { useEffect, useRef, useState } from 'react';
import { TranscriptLine, MeetingMinutes, RecordingStatus } from '../types';
import { HostMessage } from '../types/sharing';
import { signalingService } from '../services/signalingService';
import { RTC_CONFIG } from '../config/webrtc';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'room_not_found' | 'room_ended';

export interface UseViewerSessionReturn {
  connectionState: ConnectionState;
  hostName: string;
  liveTranscript: TranscriptLine[];
  inputDraft: string;
  outputDraft: string;
  elapsedTime: number;
  status: RecordingStatus;
  minutes: MeetingMinutes | null;
  hqSegments: string[];
  fullTranslatedTranscript: string;
  translationEnabled: boolean;
}

export function useViewerSession(roomId: string): UseViewerSessionReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [hostName, setHostName] = useState('');
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[]>([]);
  const [inputDraft, setInputDraft] = useState('');
  const [outputDraft, setOutputDraft] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.RECORDING);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [hqSegments, setHqSegments] = useState<string[]>([]);
  const [fullTranslatedTranscript, setFullTranslatedTranscript] = useState('');
  const [translationEnabled, setTranslationEnabled] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const retriesRef = useRef(0);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg: HostMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'full_state':
          setLiveTranscript(msg.liveTranscript);
          setInputDraft(msg.inputDraft);
          setOutputDraft(msg.outputDraft);
          setElapsedTime(msg.elapsedTime);
          setStatus(msg.status);
          setMinutes(msg.minutes);
          setHqSegments(msg.hqSegments);
          setFullTranslatedTranscript(msg.fullTranslatedTranscript);
          setTranslationEnabled(msg.translationEnabled ?? true);
          break;
        case 'transcript_append':
          setLiveTranscript(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const newLines = msg.lines.filter((l: TranscriptLine) => !existingIds.has(l.id));
            return newLines.length > 0 ? [...prev, ...newLines] : prev;
          });
          break;
        case 'transcript_update':
          setLiveTranscript(prev => prev.map(t => {
            const updated = msg.lines.find((l: TranscriptLine) => l.id === t.id);
            return updated ? updated : t;
          }));
          break;
        case 'input_draft':
          setInputDraft(msg.text);
          break;
        case 'output_draft':
          setOutputDraft(msg.text);
          break;
        case 'elapsed_time':
          setElapsedTime(msg.seconds);
          break;
        case 'status_change':
          setStatus(msg.status);
          break;
        case 'minutes':
          setMinutes(msg.minutes);
          break;
        case 'hq_segment':
          setHqSegments(prev => {
            const updated = [...prev];
            updated[msg.index] = msg.text;
            return updated;
          });
          break;
        case 'translated_transcript':
          setFullTranslatedTranscript(msg.text);
          break;
      }
    } catch {
      // ignore parse errors
    }
  };

  const connect = async () => {
    const room = await signalingService.getRoom(roomId);
    if (!room) {
      setConnectionState('room_not_found');
      return;
    }
    if (room.status === 'completed') {
      setConnectionState('room_ended');
      return;
    }
    setHostName(room.hostName || '');

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    const peerId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.onmessage = handleMessage;
      dc.onopen = () => {
        setConnectionState('connected');
        retriesRef.current = 0;
      };
      dc.onclose = () => {
        setConnectionState('disconnected');
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.addIceCandidate(roomId, peerId, event.candidate.toJSON(), 'viewer');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        if (retriesRef.current < 3) {
          retriesRef.current++;
          setTimeout(() => connect(), 2000);
        } else {
          setConnectionState('error');
        }
      }
    };

    pc.createDataChannel('_init');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await signalingService.writePeerOffer(roomId, peerId, offer);

    const unsubAnswer = signalingService.onPeerAnswer(roomId, peerId, async (sdpStr) => {
      try {
        const answer: RTCSessionDescriptionInit = JSON.parse(sdpStr);
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch {
        // ignore
      }
    });

    const unsubCandidates = signalingService.onIceCandidates(roomId, peerId, 'host', (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    });

    cleanupFnsRef.current.push(unsubAnswer, unsubCandidates);
  };

  useEffect(() => {
    connect();

    return () => {
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [roomId]);

  return {
    connectionState,
    hostName,
    liveTranscript,
    inputDraft,
    outputDraft,
    elapsedTime,
    status,
    minutes,
    hqSegments,
    fullTranslatedTranscript,
    translationEnabled,
  };
}
