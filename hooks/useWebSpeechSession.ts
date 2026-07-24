
import { useRef, useCallback } from 'react';
import { WebSpeechLang, TargetLanguage } from '../types';
import { logService } from '../services/logService';
import { useTranslationQueue } from './useTranslationQueue';

export const useWebSpeechSession = (rpmLimit: number = 6, lang: WebSpeechLang = 'en-US', targetLang: TargetLanguage = 'vi', translationEnabled: boolean = true) => {
  const {
    liveTranscript, setLiveTranscript,
    inputDraft, setInputDraft, outputDraft,
    inputDraftRef,
    finalizeSentence, cleanupQueue,
  } = useTranslationQueue(rpmLimit, targetLang, translationEnabled);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isDesiredActiveRef = useRef<boolean>(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  const startRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      logService.add('audio', 'info', 'webSpeech', 'Web Speech API not supported in this browser');
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langRef.current;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      logService.add('audio', 'res', 'webSpeech', `Started (lang: ${langRef.current})`);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          logService.add('audio', 'res', 'webSpeech-final', `"${transcript.substring(0, 80)}"`);
          inputDraftRef.current = "";
          setInputDraft("");
          finalizeSentence(transcript);
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        inputDraftRef.current = interimTranscript;
        setInputDraft(interimTranscript);
      }
    };

    recognition.onend = () => {
      logService.add('audio', 'info', 'webSpeech', 'Session ended');
      recognitionRef.current = null;
      if (isDesiredActiveRef.current) {
        // Auto-restart with small delay to avoid rapid restart loops
        setTimeout(() => {
          if (isDesiredActiveRef.current) {
            logService.add('audio', 'info', 'webSpeech', 'Auto-restarting...');
            startRecognition();
          }
        }, 100);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are normal, don't log as errors
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      logService.add('audio', 'info', 'webSpeech-err', `Error: ${event.error}`);
      // Will auto-restart via onend
    };

    try {
      recognition.start();
    } catch (e) {
      logService.add('audio', 'info', 'webSpeech-err', `Start failed: ${e}`);
    }
  }, [finalizeSentence, setInputDraft, inputDraftRef]);

  const connect = useCallback(async (_stream: MediaStream) => {
    isDesiredActiveRef.current = true;
    logService.add('audio', 'info', 'webSpeech', `Connecting Web Speech API (lang: ${langRef.current})...`);
    startRecognition();
  }, [startRecognition]);

  const cleanup = useCallback(() => {
    isDesiredActiveRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    cleanupQueue();
  }, [cleanupQueue]);

  return { connect, cleanup, liveTranscript, setLiveTranscript, inputDraft, outputDraft };
};
