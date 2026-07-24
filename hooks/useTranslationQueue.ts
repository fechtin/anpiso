
import { useRef, useCallback, useState, useEffect } from 'react';
import {
  cleanMultilingualSplits,
  isMeaningfulText,
  isLikelyTargetLanguage
} from '../utils/textUtils';
import { TranscriptLine, TargetLanguage } from '../types';
import { aiService } from '../services/aiService';
import { logService } from '../services/logService';

const cleanText = (text: string): string => cleanMultilingualSplits(text.trim());

export const useTranslationQueue = (rpmLimit: number = 6, targetLang: TargetLanguage = 'vi', translationEnabled: boolean = true) => {
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[]>([]);
  const [inputDraft, setInputDraft] = useState<string>("");
  const [outputDraft, setOutputDraft] = useState<string>("");

  const rpmLimitRef = useRef(rpmLimit);
  useEffect(() => { rpmLimitRef.current = rpmLimit; }, [rpmLimit]);

  const targetLangRef = useRef(targetLang);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  const translationEnabledRef = useRef(translationEnabled);
  useEffect(() => { translationEnabledRef.current = translationEnabled; }, [translationEnabled]);

  const inputFinalizeTimer = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<string | null>(null);

  // Rate Limiting & Batching Refs
  const translationQueueRef = useRef<{text: string, id: string}[]>([]);
  const requestTimestampsRef = useRef<number[]>([]);
  const queueTimeoutRef = useRef<number | null>(null);

  const inputDraftRef = useRef<string>("");

  /**
   * Thực hiện dịch thuật cho một nhóm các câu (Batch)
   */
  const performTranslationBatch = useCallback(async (batch: {text: string, id: string}[]) => {
    if (batch.length === 0) return;

    const combinedText = batch.map(item => cleanText(item.text)).join('\n\n');
    const lastId = batch[batch.length - 1].id;
    const otherIds = batch.slice(0, -1).map(b => b.id);

    if (otherIds.length > 0) {
      setLiveTranscript(prev => prev.map(t =>
        otherIds.includes(t.id) ? { ...t, text: "..." } : t
      ));
    }

    try {
      let fullTranslation = "";
      for await (const chunk of aiService.translateTextStream(combinedText, targetLangRef.current)) {
        fullTranslation += chunk;
        setLiveTranscript(prev => prev.map(t =>
          t.id === lastId ? { ...t, text: fullTranslation } : t
        ));
      }
    } catch (e: any) {
      console.error('[Translation] Batch translation failed:', e?.message || e);
      setLiveTranscript(prev => prev.map(t =>
        batch.some(b => b.id === t.id) ? { ...t, text: "[Lỗi dịch thuật - Quá tải]" } : t
      ));
    }
  }, []);

  /**
   * Điều phối hàng đợi dịch thuật dựa trên hạn mức RPM
   */
  const processTranslationQueue = useCallback(() => {
    const now = Date.now();
    requestTimestampsRef.current = requestTimestampsRef.current.filter(ts => now - ts < 60000);

    if (translationQueueRef.current.length > 0 && requestTimestampsRef.current.length < rpmLimitRef.current) {
      const batch = [...translationQueueRef.current];
      translationQueueRef.current = [];

      requestTimestampsRef.current.push(now);
      performTranslationBatch(batch);
    }
    else if (translationQueueRef.current.length > 0) {
      const queuedIds = translationQueueRef.current.map(item => item.id);
      setLiveTranscript(prev => prev.map(t =>
        queuedIds.includes(t.id) && !t.text ? { ...t, text: "..." } : t
      ));
      if (queueTimeoutRef.current) window.clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = window.setTimeout(processTranslationQueue, 3000);
      logService.add('text', 'info', 'rate-limit', `Đã đạt giới hạn ${rpmLimitRef.current} RPM. Đang đưa vào hàng đợi...`);
    }
  }, [performTranslationBatch]);

  const finalizeSentence = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!isMeaningfulText(trimmed)) {
      inputDraftRef.current = "";
      setInputDraft("");
      if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
      return;
    }

    const fixedText = cleanMultilingualSplits(trimmed);
    logService.add('text', 'info', 'finalize', `"${fixedText.substring(0, 80)}"`);
    const timestamp = Date.now();
    const suffix = Math.random().toString(36).substr(2, 5);
    const inputId = 'in-' + timestamp + suffix;
    const outputId = 'out-' + timestamp + suffix;

    // Mode "Ghi âm & Tóm tắt": chỉ ghi transcript gốc, không tạo dòng dịch
    if (!translationEnabledRef.current) {
      setLiveTranscript(prev => [...prev, { id: inputId, text: fixedText, type: 'input', timestamp }]);
      inputDraftRef.current = "";
      setInputDraft("");
      if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
      return;
    }

    const needsAI = !isLikelyTargetLanguage(fixedText, targetLangRef.current);

    setLiveTranscript(prev => {
      const newLine: TranscriptLine = { id: inputId, text: fixedText, type: 'input', timestamp };
      const translationLine: TranscriptLine = {
        id: outputId,
        text: needsAI ? "" : fixedText,
        type: 'output',
        timestamp
      };
      return [...prev, newLine, translationLine];
    });

    if (needsAI) {
      translationQueueRef.current.push({ text: fixedText, id: outputId });
      processTranslationQueue();
    }

    inputDraftRef.current = "";
    setInputDraft("");
    if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
  }, [processTranslationQueue]);

  const cleanupQueue = useCallback(() => {
    if (inputFinalizeTimer.current) window.clearTimeout(inputFinalizeTimer.current);
    if (queueTimeoutRef.current) window.clearTimeout(queueTimeoutRef.current);
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    pendingDraftRef.current = null;
  }, []);

  return {
    liveTranscript, setLiveTranscript,
    inputDraft, setInputDraft, outputDraft,
    inputDraftRef, inputFinalizeTimer, rafIdRef, pendingDraftRef,
    finalizeSentence, cleanupQueue,
  };
};
