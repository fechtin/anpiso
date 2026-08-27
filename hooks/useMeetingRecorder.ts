
import { useState, useRef, useCallback, useEffect } from 'react';
import { RecordingStatus, MeetingMinutes, AudioSource, TargetLanguage } from '../types';
import { fixWebmDuration } from '../utils/audioUtils';
import { formatDateTimeRange } from '../utils/textUtils';
import { aiService } from '../services/aiService';
import { logService } from '../services/logService';

/** Detect best supported audio mimeType for MediaRecorder */
const getSupportedMimeType = (): string => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) {
      return mt;
    }
  }
  return ''; // browser default
};

export const useMeetingRecorder = (
  connectAI: (stream: MediaStream) => Promise<void>,
  cleanupAI: () => void,
  targetLang: TargetLanguage = 'vi',
  translationEnabled: boolean = true,
  getLiveTranscriptText?: () => string,
  onAudioReady?: (blob: Blob) => void,
  customNames: string[] = []
) => {
  // Live transcript làm nguồn dự phòng khi gỡ băng HQ thất bại toàn bộ
  const getLiveTextRef = useRef(getLiveTranscriptText);
  getLiveTextRef.current = getLiveTranscriptText;
  const onAudioReadyRef = useRef(onAudioReady);
  onAudioReadyRef.current = onAudioReady;
  const lastSegmentErrorRef = useRef<string | null>(null);

  const targetLangRef = useRef(targetLang);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  const translationEnabledRef = useRef(translationEnabled);
  useEffect(() => { translationEnabledRef.current = translationEnabled; }, [translationEnabled]);

  const customNamesRef = useRef(customNames);
  useEffect(() => { customNamesRef.current = customNames; }, [customNames]);

  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.IDLE);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingSegment, setIsProcessingSegment] = useState(false);
  const [hqSegments, setHqSegments] = useState<string[]>([]);
  const [fullTranslatedTranscript, setFullTranslatedTranscript] = useState<string>("");
  const isTranslatingFull = false;
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  // Mute micro giữa phiên: chỉ tắt track mic, tab audio vẫn thu bình thường
  const micTracksRef = useRef<MediaStreamTrack[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  // Khi generateMinutes fail: giữ nguyên transcript/audio để "Thử lại" chỉ chạy lại bước tóm tắt
  const pendingMinutesRef = useRef<{ fullHqText: string; timeRange: string } | null>(null);
  const [hasPendingMinutes, setHasPendingMinutes] = useState(false);
  const [transcriptSource, setTranscriptSource] = useState<'hq' | 'live'>('hq');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const startTimeRef = useRef<number>(0);
  const startClockTimeRef = useRef<Date | null>(null);
  
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('');

  // Transcript giữ trong ref để đọc đồng bộ trong onstop (setState là bất đồng bộ)
  const hqSegmentsRef = useRef<string[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let interval: number;
    if (status === RecordingStatus.RECORDING) {
      interval = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else if (status === RecordingStatus.IDLE) {
      setElapsedTime(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status]);

  /**
   * Gỡ băng TOÀN BỘ file audio trong MỘT request qua Files API.
   * Không cắt segment: mọi cách ghép lại các khúc byte của một luồng WebM đều
   * sai (khúc sau không có header, cluster mang mốc giờ tuyệt đối), và ghép
   * bằng cách dán chunk đầu vào trước sẽ khiến 10 phút đầu bị gỡ lại ở mọi
   * segment rồi bị dời mốc giờ. File nguyên vẹn không có vấn đề nào trong số đó.
   */
  const transcribeWholeRecording = async (blob: Blob, mimeType: string): Promise<string> => {
    setIsProcessingSegment(true);
    try {
      const text = await aiService.transcribeFullAudio(blob, mimeType, customNamesRef.current);
      return text?.trim() || '';
    } catch (err: any) {
      console.error('Full-audio transcription failed:', err);
      lastSegmentErrorRef.current = err?.message || String(err);
      return '';
    } finally {
      setIsProcessingSegment(false);
    }
  };

  /** Chạy bước tóm tắt từ dữ liệu đã ghim; thành công thì hoàn tất phiên. */
  const generateAndFinish = async () => {
    const p = pendingMinutesRef.current;
    if (!p) throw new Error('Không còn dữ liệu cuộc họp để tạo biên bản.');

    const result = await aiService.generateMinutes(p.fullHqText, p.timeRange, targetLangRef.current, translationEnabledRef.current);
    setMinutes(result);
    setFullTranslatedTranscript(result.translatedTranscript || "");

    // recordedBlob đã được set ngay ở onstop — không dựng lại blob ở đây nữa
    pendingMinutesRef.current = null;
    setHasPendingMinutes(false);
    setStatus(RecordingStatus.COMPLETED);
  };

  /** "Thử lại" sau lỗi tóm tắt: không đụng transcript/audio, chỉ gọi lại AI. */
  const retryMinutes = async () => {
    if (!pendingMinutesRef.current) return;
    setErrorMessage(null);
    setStatus(RecordingStatus.PROCESSING);
    try {
      await generateAndFinish();
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatus(RecordingStatus.ERROR);
    }
  };

  const startRecording = async (audioSourceType: AudioSource) => {
    try {
      cancelledRef.current = false;
      lastSegmentErrorRef.current = null;
      setTranscriptSource('hq');
      pendingMinutesRef.current = null;
      setHasPendingMinutes(false);
      micTracksRef.current = [];
      setMicMuted(false);
      setMicAvailable(false);
      setHqSegments([]);
      hqSegmentsRef.current = [];
      setFullTranslatedTranscript("");
      setErrorMessage(null);
      setElapsedTime(0);
      
      let stream: MediaStream;
      if (audioSourceType === AudioSource.SYSTEM_AND_MIC) {
        let sys: MediaStream;
        try {
          sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true } as any);
        } catch (err: any) {
          // Người dùng bấm Cancel ở picker chọn cửa sổ — không phải lỗi, quay về idle
          if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
            reset();
            return;
          }
          throw err;
        }

        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const originalTracks: MediaStreamTrack[] = [...sys.getTracks()];

        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx.createMediaStreamSource(mic).connect(dest);
        originalTracks.push(...mic.getTracks());
        micTracksRef.current = mic.getAudioTracks();
        if (sys.getAudioTracks().length > 0) ctx.createMediaStreamSource(sys).connect(dest);

        stream = dest.stream;
        (stream as any).originalTracks = originalTracks;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micTracksRef.current = stream.getAudioTracks();
      }
      setMicMuted(false);
      setMicAvailable(micTracksRef.current.length > 0);

      mixedStreamRef.current = stream;
      
      const detectedMime = getSupportedMimeType();
      mimeTypeRef.current = detectedMime;
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
      if (detectedMime) recorderOptions.mimeType = detectedMime;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => { 
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data); 
        }
      };
      
      recorder.onstop = async () => {
        // Stop media tracks AFTER recorder has flushed all data
        const tracks = (mixedStreamRef.current as any)?.originalTracks || mixedStreamRef.current?.getTracks();
        tracks?.forEach((t: MediaStreamTrack) => t.stop());

        // If cancelled, skip all processing and reset immediately
        if (cancelledRef.current) {
          cancelledRef.current = false;
          reset();
          return;
        }

        const stopTime = performance.now();
        const durationMs = stopTime - startTimeRef.current;
        const stopClockTime = new Date();

        // Dựng file audio hoàn chỉnh MỘT lần, dùng chung cho cả Drive, gỡ băng và nút tải về
        const blobType = mimeTypeRef.current.split(';')[0] || 'audio/webm';
        const rawBlob = new Blob(audioChunksRef.current, { type: blobType });
        let preparedBlob = rawBlob;
        if (blobType.includes('webm')) {
          logService.add('audio', 'info', 'recorder', 'Fixing WebM metadata...');
          preparedBlob = await fixWebmDuration(rawBlob, durationMs).catch(() => rawBlob);
        }
        setRecordedBlob(preparedBlob);

        // Audio đã hoàn chỉnh ngay lúc dừng → đẩy đi upload sớm, không đợi gỡ băng/tóm tắt
        if (audioChunksRef.current.length > 0) onAudioReadyRef.current?.(preparedBlob);

        try {
          // Gỡ băng cả cuộc họp trong một request trên file nguyên vẹn
          let fullHqText = await transcribeWholeRecording(preparedBlob, blobType);
          if (fullHqText) {
            hqSegmentsRef.current = [fullHqText];
            setHqSegments([fullHqText]);
          }

          // Gỡ băng HQ trống → dùng live transcript làm nguồn dự phòng thay vì vứt cả cuộc họp
          if (!fullHqText) {
            const liveText = getLiveTextRef.current?.() || '';
            if (liveText.trim()) {
              logService.add('text', 'info', 'fallback', 'Gỡ băng HQ thất bại — dùng live transcript làm nguồn biên bản');
              setTranscriptSource('live');
              fullHqText = liveText;
              hqSegmentsRef.current = [liveText];
              setHqSegments([liveText]);
            } else {
              // Thật sự không có gì — báo kèm nguyên nhân gỡ băng nếu có, tránh chẩn đoán nhầm
              const reason = lastSegmentErrorRef.current
                ? ` Nguyên nhân từ bước gỡ băng: ${lastSegmentErrorRef.current}`
                : '';
              throw new Error(`Không có nội dung âm thanh nào được nhận diện. Vui lòng kiểm tra lại Microphone hoặc quyền truy cập âm thanh.${reason}`);
            }
          }

          const timeRange = formatDateTimeRange(startClockTimeRef.current || new Date(), stopClockTime);

          // Ghim dữ liệu trước khi gọi AI — fail thì còn nguyên để retry
          pendingMinutesRef.current = { fullHqText, timeRange };
          setHasPendingMinutes(true);

          await generateAndFinish();

        } catch (err: any) {
          setErrorMessage(err.message);
          setStatus(RecordingStatus.ERROR);
        }
      };

      startTimeRef.current = performance.now();
      startClockTimeRef.current = new Date();
      
      recorder.start(); 
      setStatus(RecordingStatus.RECORDING);
      
      await connectAI(stream);
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatus(RecordingStatus.ERROR);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    setStatus(RecordingStatus.PROCESSING);
    cleanupAI();

    // stop() automatically flushes remaining data via ondataavailable then fires onstop.
    // IMPORTANT: Do NOT stop media tracks before stop() — iOS Safari drops audio data
    // if the stream is killed before the recorder finishes flushing.
    // Tracks are stopped inside the onstop handler instead.
    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    cleanupAI();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // triggers onstop which will check cancelledRef and reset
    } else {
      cancelledRef.current = false;
      reset();
    }
  };

  const toggleMic = useCallback(() => {
    setMicMuted(prev => {
      const next = !prev;
      micTracksRef.current.forEach(t => { t.enabled = !next; });
      return next;
    });
  }, []);

  const reset = () => {
    setStatus(RecordingStatus.IDLE);
    pendingMinutesRef.current = null;
    setHasPendingMinutes(false);
    micTracksRef.current = [];
    setMicMuted(false);
    setMicAvailable(false);
    setMinutes(null);
    setHqSegments([]);
    hqSegmentsRef.current = [];
    setFullTranslatedTranscript("");
    setRecordedBlob(null);
    setErrorMessage(null);
    setElapsedTime(0);
    audioChunksRef.current = [];
    startClockTimeRef.current = null;
  };

  return {
    status, minutes, setMinutes, errorMessage, isProcessingSegment, hqSegments,
    fullTranslatedTranscript, setFullTranslatedTranscript, isTranslatingFull, recordedBlob, elapsedTime,
    micMuted, micAvailable, toggleMic,
    hasPendingMinutes, retryMinutes, transcriptSource,
    startRecording, stopRecording, cancelRecording, reset
  };
};
