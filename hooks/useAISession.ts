
import { useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { encodeAudio } from '../utils/audioUtils';
import { isMeaningfulText } from '../utils/textUtils';
import { logService } from '../services/logService';
import { apiKeyService } from '../services/apiKeyService';
import { useTranslationQueue } from './useTranslationQueue';
import { TargetLanguage } from '../types';

export const useAISession = (rpmLimit: number = 6, targetLang: TargetLanguage = 'vi', translationEnabled: boolean = true, customNames: string[] = []) => {
  const {
    liveTranscript, setLiveTranscript,
    inputDraft, setInputDraft, outputDraft,
    inputDraftRef, inputFinalizeTimer, rafIdRef, pendingDraftRef,
    finalizeSentence, cleanupQueue,
  } = useTranslationQueue(rpmLimit, targetLang, translationEnabled);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const activeSessionRef = useRef<any>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const isDesiredActiveRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const audioBufferQueueRef = useRef<Int16Array[]>([]);
  const lastTranscriptTimeRef = useRef<number>(0);

  // Watchdog state: reconnect only when sends actually fail (dead socket).
  const consecutiveSendFailuresRef = useRef<number>(0);

  const triggerReconnectRef = useRef<() => void>(() => {});

  // Ref để reconnect luôn dùng danh sách tên mới nhất mà không phải tạo lại connect()
  const customNamesRef = useRef(customNames);
  customNamesRef.current = customNames;

  const internalCleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
    if (activeSessionRef.current) {
      try { activeSessionRef.current.close(); } catch (e) {}
    }
    activeSessionRef.current = null;
    sessionPromiseRef.current = null;
    isConnectingRef.current = false;
    consecutiveSendFailuresRef.current = 0;
  }, []);

  const connect = useCallback(async (stream: MediaStream) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    isDesiredActiveRef.current = true;
    streamRef.current = stream;

    logService.add('audio', 'info', 'connect', 'Starting Gemini Session...');

    try {
      if (!inputCtxRef.current) {
        inputCtxRef.current = new AudioContext({ sampleRate: 16000 });
        const source = inputCtxRef.current.createMediaStreamSource(stream);

        await inputCtxRef.current.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(inputCtxRef.current, 'pcm-processor');
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (!isDesiredActiveRef.current) return;

          const int16 = new Int16Array(e.data);
          const session = activeSessionRef.current;

          if (session) {
            let dataToSend: Int16Array;
            if (audioBufferQueueRef.current.length > 0) {
              const totalLength = audioBufferQueueRef.current.reduce((acc, curr) => acc + curr.length, 0) + int16.length;
              dataToSend = new Int16Array(totalLength);
              let offset = 0;
              audioBufferQueueRef.current.forEach(buf => {
                dataToSend.set(buf, offset);
                offset += buf.length;
              });
              dataToSend.set(int16, offset);
              audioBufferQueueRef.current = [];
            } else {
              dataToSend = int16;
            }

            const pcmData = encodeAudio(new Uint8Array(dataToSend.buffer));
            try {
              session.sendRealtimeInput({
                audio: { data: pcmData, mimeType: 'audio/pcm;rate=16000' }
              });
              consecutiveSendFailuresRef.current = 0;
            } catch (err) {
              audioBufferQueueRef.current.push(int16);
              consecutiveSendFailuresRef.current++;
              if (consecutiveSendFailuresRef.current > 2) triggerReconnectRef.current();
            }
          } else {
            audioBufferQueueRef.current.push(int16);
            if (audioBufferQueueRef.current.length > 500) audioBufferQueueRef.current.shift();
          }
        };

        source.connect(workletNode);
        workletNode.connect(inputCtxRef.current.destination);
      }

      const baseSystemInstruction = "SYSTEM: SILENT TRANSCRIPTIONIST. DO NOT SPEAK. TRANSCRIPTION ONLY. SUPPORT KO, EN, VI.";
      const names = customNamesRef.current;
      const systemInstruction = names && names.length > 0
        ? `${baseSystemInstruction} KNOWN PROPER NOUNS (people/products/companies) — when you hear them, transcribe with this EXACT spelling: ${names.join(', ')}.`
        : baseSystemInstruction;

      const ai = new GoogleGenAI({ apiKey: apiKeyService.getGeminiApiKey() });
      const sessionPromise = ai.live.connect({
        model: 'gemini-3.5-transcribe-live',
        callbacks: {
          onopen: () => {
            logService.add('audio', 'res', 'onopen', 'Live API Connected Successfully');
            isConnectingRef.current = false;
            consecutiveSendFailuresRef.current = 0;
            sessionPromise.then(s => { activeSessionRef.current = s; });
          },
          onmessage: async (msg: LiveServerMessage) => {
            // gemini-3.5-transcribe-live: interimInputTranscription là ảnh chụp TÍCH LUỸ
            // của cả lượt nói (thay thế, KHÔNG nối chuỗi); inputTranscription là bản chốt của lượt đó.
            const interim = msg.serverContent?.interimInputTranscription?.text;
            if (interim) {
              const now = performance.now();
              const interval = lastTranscriptTimeRef.current > 0
                ? Math.round(now - lastTranscriptTimeRef.current)
                : 0;
              lastTranscriptTimeRef.current = now;
              logService.add('audio', 'res', 'interim', `+${interval}ms | "${interim.substring(0, 60)}"`);

              if (!isMeaningfulText(interim)) return;
              inputDraftRef.current = interim;
              pendingDraftRef.current = interim;
              if (!rafIdRef.current) {
                rafIdRef.current = requestAnimationFrame(() => {
                  if (pendingDraftRef.current !== null) {
                    setInputDraft(pendingDraftRef.current);
                    pendingDraftRef.current = null;
                  }
                  rafIdRef.current = null;
                });
              }
              // Lưới an toàn: nếu bản chốt không về (mất kết nối giữa lượt) vẫn chốt câu.
              if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
              inputFinalizeTimer.current = window.setTimeout(() => {
                inputDraftRef.current = "";
                setInputDraft("");
                finalizeSentence(interim);
              }, 3000);
              return;
            }

            const finalT = msg.serverContent?.inputTranscription?.text;
            if (finalT) {
              logService.add('audio', 'res', 'transcript', `final | "${finalT.substring(0, 60)}"`);
              if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
              lastTranscriptTimeRef.current = 0;
              pendingDraftRef.current = null;
              inputDraftRef.current = "";
              setInputDraft("");
              finalizeSentence(finalT);
            }
          },
          onerror: (err: any) => {
            logService.add('audio', 'info', 'onerror', `Error: ${err.message || 'Unknown'}`);
            if (apiKeyService.shouldRotateKey(err)) {
              apiKeyService.rotateKey(err);
            }
            if (isDesiredActiveRef.current) triggerReconnectRef.current();
          },
          onclose: (event: any) => {
            const reason = event.reason || "No reason";
            logService.add('audio', 'info', 'onclose', `Session Closed. Reason: ${reason}`);
            activeSessionRef.current = null;
            sessionPromiseRef.current = null;
            isConnectingRef.current = false;
            const closeError = { message: reason };
            if (apiKeyService.shouldRotateKey(closeError)) {
              apiKeyService.rotateKey(closeError);
            }
            if (isDesiredActiveRef.current) triggerReconnectRef.current();
          }
        },
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction,
          // adaptationPhrases là kênh bias tên riêng thật sự của model transcribe;
          // systemInstruction MỘT MÌNH không sửa được chính tả tên (đã đo).
          inputAudioTranscription: names && names.length > 0
            ? { adaptationPhrases: names }
            : {},
        }
      });
      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      logService.add('audio', 'info', 'error', `Connect Error: ${err.message}`);
      isConnectingRef.current = false;
      if (apiKeyService.shouldRotateKey(err)) {
        const rotated = apiKeyService.rotateKey(err);
        logService.add('audio', 'info', 'key-rotate', rotated ? 'Retrying with next key...' : 'No more keys to try');
      }
      if (isDesiredActiveRef.current) setTimeout(() => streamRef.current && connect(streamRef.current), 3000);
    }
  }, [finalizeSentence, setInputDraft, inputDraftRef, inputFinalizeTimer, rafIdRef, pendingDraftRef]);

  const triggerReconnect = useCallback(() => {
    if (!isDesiredActiveRef.current || isConnectingRef.current) return;
    logService.add('audio', 'info', 'watchdog', 'Stuck session detected. Reconnecting...');
    internalCleanup();
    if (streamRef.current) {
      setTimeout(() => {
        if (streamRef.current && isDesiredActiveRef.current) {
          connect(streamRef.current);
        }
      }, 100);
    }
  }, [internalCleanup, connect]);

  triggerReconnectRef.current = triggerReconnect;

  /**
   * Tab bị ẩn (màn tắt, chuyển app) → trình duyệt suspend AudioContext và thường giết
   * luôn WebSocket. Khi quay lại phải tự gỡ suspend + nối lại phiên, nếu không live
   * transcript đứng im tới hết cuộc họp mà không báo lỗi gì.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const ctx = inputCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        logService.add('audio', 'info', 'visibility', 'Resumed input AudioContext');
      }
      if (isDesiredActiveRef.current && !activeSessionRef.current && !isConnectingRef.current) {
        logService.add('audio', 'info', 'visibility', 'Live session died while hidden — reconnecting');
        triggerReconnectRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const cleanup = useCallback(() => {
    isDesiredActiveRef.current = false;
    internalCleanup();
    if (workletNodeRef.current) workletNodeRef.current.disconnect();
    if (inputCtxRef.current) inputCtxRef.current.close().catch(() => {});
    cleanupQueue();

    workletNodeRef.current = null;
    inputCtxRef.current = null;
    audioBufferQueueRef.current = [];
  }, [internalCleanup, cleanupQueue]);

  return { connect, cleanup, liveTranscript, setLiveTranscript, inputDraft, outputDraft };
};
