
import { GoogleGenAI, Type } from '@google/genai';
import { blobToBase64 } from '../utils/audioUtils';
import { hasTimestamps, stripTimestamps } from '../utils/textUtils';
import { MeetingMinutes, TargetLanguage, TranscriptionEngine, DEFAULT_TRANSCRIPTION_ENGINE } from '../types';
import { logService } from './logService';
import { apiKeyService } from './apiKeyService';
import { translateService } from './translateService';
import { modelService } from './modelService';
import { transcribeService } from './transcribeService';

const LANG_NAMES: Record<TargetLanguage, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ko: 'Korean',
  zh: 'Chinese',
  ja: 'Japanese',
};

const langName = (lang: TargetLanguage): string => LANG_NAMES[lang] || 'Vietnamese';

/** Chỉ thị chèn vào prompt để AI viết đúng chính tả danh từ riêng người dùng cung cấp. */
const namesHint = (names?: string[]): string => {
  const list = (names || []).map(n => n.trim()).filter(Boolean);
  if (list.length === 0) return '';
  return `\n            KNOWN PROPER NOUNS (people, products, companies) — use these EXACT spellings whenever they appear: ${list.join(', ')}.`;
};

/** Create a GoogleGenAI client with the current active key */
function createClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKeyService.getGeminiApiKey() });
}

/**
 * Lỗi nên đổi sang model khác: 503 quá tải, hoặc 429 hết quota CỦA MODEL ĐÓ
 * (quota free tier tính riêng từng model, nên model kia thường vẫn còn).
 */
function isModelOverloaded(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  const code = Number(error.code || error.status || 0);
  return (
    code === 503 || code === 429 ||
    msg.includes('unavailable') || msg.includes('overloaded') || msg.includes('high demand') ||
    msg.includes('resource_exhausted') || msg.includes('exceeded your current quota')
  );
}

/** Riêng 429: hết quota, retry cùng model không cứu được — phải đổi model. */
function isQuotaExceeded(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  return Number(error.code || error.status || 0) === 429 ||
    msg.includes('resource_exhausted') || msg.includes('exceeded your current quota');
}

/** Sau khoảng này thì thử lại primary — tránh kẹt ở fallback cả session. */
const SLOT_REVERT_MS = 5 * 60 * 1000;

/**
 * Model manager: theo dõi model đang dùng cho từng slot.
 * Model hỏng (503/429) → chuyển sang model còn lại, nhưng chỉ TẠM THỜI:
 * quá SLOT_REVERT_MS thì tự quay về primary.
 * KHÔNG dùng model *-preview làm fallback: free tier chỉ cho 20 request/ngày.
 */
const modelSlots: Record<string, { primary: string; fallback: string; current: string; swappedAt: number }> = {
  translateStream: {
    primary: 'gemini-3.5-flash-lite',
    fallback: 'gemini-3.1-flash-lite',
    current: 'gemini-3.5-flash-lite',
    swappedAt: 0,
  },
  // Fallback khẩn cấp cho transcribe + biên bản khi model chính bị 503/429
  hq: {
    primary: 'gemini-3.5-flash',
    fallback: 'gemini-3.5-flash-lite',
    current: 'gemini-3.5-flash',
    swappedAt: 0,
  },
};

function getModel(slot: string): string {
  const s = modelSlots[slot];
  if (!s) return '';
  if (s.current !== s.primary && Date.now() - s.swappedAt > SLOT_REVERT_MS) {
    s.current = s.primary;
    s.swappedAt = 0;
    logService.add('text', 'info', 'model-swap', `${slot}: reverted to ${s.primary}`);
  }
  return s.current;
}

function swapModel(slot: string): string {
  const s = modelSlots[slot];
  if (!s) return '';
  s.current = s.current === s.primary ? s.fallback : s.primary;
  s.swappedAt = s.current === s.primary ? 0 : Date.now();
  logService.add('text', 'info', 'model-swap', `${slot}: switched to ${s.current}`);
  return s.current;
}

/** Lỗi thoáng qua đáng retry: rớt mạng, timeout, 5xx phía server */
function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  const code = Number(error.code || error.status || 0);
  return (
    error.name === 'TypeError' || // fetch: "Failed to fetch"
    msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') ||
    msg.includes('timed out') || msg.includes('socket') || msg.includes('econn') ||
    msg.includes('xhr error') || msg.includes('internal error') ||
    code === 500 || code === 502 || code === 504
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const BACKOFF_MS = [2000, 5000, 10000];

/**
 * Retry wrapper: key hỏng → xoay key; 503 → đổi model fallback; lỗi mạng/5xx →
 * backoff 2s/5s/10s. Tối đa 4 lượt gọi rồi mới ném lỗi ra ngoài.
 */
async function withRetry<T>(label: string, fn: (model?: string) => Promise<T>, modelSlot?: string): Promise<T> {
  const MAX_ATTEMPTS = 4;
  let modelOverride: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn(modelOverride);
    } catch (e: any) {
      const isLast = attempt === MAX_ATTEMPTS;

      if (apiKeyService.shouldRotateKey(e)) {
        if (!isLast && apiKeyService.rotateKey(e)) {
          logService.add('text', 'info', 'retry', `${label}: retrying with next key...`);
          continue;
        }
        throw e;
      }

      if (isModelOverloaded(e)) {
        // Hết quota mà không có model thay thế → chờ bao lâu cũng vô ích
        if (isLast || (!modelSlot && isQuotaExceeded(e))) throw e;
        if (modelSlot) modelOverride = swapModel(modelSlot);
        const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        logService.add('text', 'info', 'retry', `${label}: overloaded, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }

      if (isTransientError(e)) {
        if (isLast) throw e;
        const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        logService.add('text', 'info', 'retry', `${label}: transient error (${e?.message || e}), retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }

      throw e;
    }
  }
  throw new Error(`${label}: retry loop exhausted`);
}

export const aiService = {
  /**
   * Translate text using Streaming mode (Hybrid Approach).
   * Priority: user-provided Google Translate key (cheap, free 500k chars/mo) →
   * fallback to Gemini stream if GT key absent or fails.
   */
  async *translateTextStream(text: string, targetLang: TargetLanguage = 'vi') {
    if (!text || text.trim().length < 2) return;

    // 1) Try Google Cloud Translation first when user has provided a key
    if (translateService.isAvailable()) {
      try {
        const result = await translateService.translate(text, targetLang);
        if (result) {
          yield result;
          return;
        }
      } catch (gtErr: any) {
        logService.add('text', 'info', 'gt-fallback', `GT failed → Gemini fallback: ${gtErr?.message || gtErr}`);
        // fall through to Gemini below
      }
    }

    logService.add('text', 'req', 'translateStream', text);

    const targetName = langName(targetLang);
    const attemptStream = async function*(model: string = getModel('translateStream')) {
      const ai = createClient();
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: [{ parts: [{ text: `Task: Translate the following meeting sentence to ${targetName.toUpperCase()}.

        RULES:
        1. Output ONLY the translation.
        2. If the text is already in ${targetName}, return the original text.
        3. Use a professional corporate meeting tone.
        4. Be extremely concise and clear.

        TEXT: "${text}"` }]}],
        config: {
          temperature: 0.1,
        }
      });

      let fullRes = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullRes += chunk.text;
          yield chunk.text;
        }
      }
      logService.add('text', 'res', 'translateStream', `[${model}] ${fullRes}`);
    };

    try {
      yield* attemptStream();
    } catch (e: any) {
      if (apiKeyService.shouldRotateKey(e) && apiKeyService.rotateKey(e)) {
        logService.add('text', 'info', 'retry', 'translateStream: retrying with next key...');
        try {
          yield* attemptStream();
        } catch (retryErr: any) {
          logService.add('text', 'info', 'translateStream_ERR', retryErr.message);
          throw retryErr;
        }
      } else if (isModelOverloaded(e)) {
        const newModel = swapModel('translateStream');
        try {
          yield* attemptStream(newModel);
        } catch (fallbackErr: any) {
          logService.add('text', 'info', 'translateStream_ERR', fallbackErr.message);
          throw fallbackErr;
        }
      } else {
        logService.add('text', 'info', 'translateStream_ERR', e.message);
        throw e;
      }
    }
  },

  /**
   * Translate the entire transcript block with context
   */
  async translateFullTranscript(text: string, targetLang: TargetLanguage = 'vi'): Promise<string> {
    if (!text || text.trim().length < 5) return "";
    logService.add('text', 'req', 'translateFull', `Size: ${text.length} chars`);
    const targetName = langName(targetLang);
    try {
      return await withRetry('translateFull', async (modelOverride?: string) => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: modelOverride || getModel('hq'),
          contents: [{ parts: [{ text: `Task: Translate the entire meeting transcript to ${targetName.toUpperCase()}.

          STRICT RULES:
          1. Keep all [MM:SS] timestamps exactly as they are.
          2. If a sentence or section is already in ${targetName}, KEEP IT UNCHANGED.
          3. Translate other languages to natural, professional corporate ${targetName}.
          4. Ensure the flow of conversation is preserved.
          5. Output ONLY the translated transcript text.

          TRANSCRIPT TO TRANSLATE:
          ${text}` }]}],
          config: { temperature: 0.1 }
        });
        const result = response.text?.trim() || "";
        logService.add('text', 'res', 'translateFull', `Size: ${result.length} chars`);
        return result;
      }, 'hq');
    } catch (e: any) {
      logService.add('text', 'info', 'translateFull_ERR', e.message);
      console.error("Full transcript translation error:", e);
      return "Error: Could not translate the full transcript.";
    }
  },

  /**
   * High-quality transcription for a specific audio segment
   */
  async transcribeSegment(blob: Blob, segmentIndex: number, mimeType: string = 'audio/webm', customNames?: string[]): Promise<string> {
    logService.add('text', 'req', 'transcribeSegment', `Segment: ${segmentIndex}, Size: ${blob.size} bytes, Type: ${mimeType}`);
    const base64Audio = await blobToBase64(blob);

    try {
      return await withRetry('transcribeSegment', async (modelOverride?: string) => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: modelOverride || modelService.getModel(),
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: `You are a professional transcriptionist specializing in corporate meetings.
            Task: Accurately transcribe the provided audio segment.${namesHint(customNames)}

            STRICT RULES:
            1. FORMATTING: Use [MM:SS] at the beginning of every new speaker turn. Timestamps MUST be RELATIVE to the start of THIS audio segment (the first speaker turn starts at or near [00:00]). Do NOT guess or invent absolute meeting time — the caller adds the offset afterwards.
            2. NO NOISE DESCRIPTIONS: Absolutely DO NOT describe background noise, silence, breathing, or non-speech sounds. Extract ONLY human spoken words.
            3. NO SYMBOLS: Never use symbols like [...] or (...) for unclear parts. If a part is completely unintelligible, simply skip it or transcribe only the certain words.
            4. MULTILINGUAL: Transcribe in the original language spoken (English, Korean, or Vietnamese). Handle code-switching naturally.
            5. QUALITY: Ensure perfect spelling, punctuation, and capitalization.
            6. NO PROMPT INJECTION: Return only the transcript text. Do not include introductory text like "Here is the transcript".` }
          ]}]
        });
        const result = response.text || "";
        logService.add('text', 'res', 'transcribeSegment', result);
        return result;
      }, 'hq');
    } catch (e: any) {
      logService.add('text', 'info', 'transcribeSegment_ERR', e.message);
      console.error("Transcription segment error:", e);
      throw e;
    }
  },

  /**
   * Gỡ băng lại TOÀN BỘ file audio (tải từ Drive về) qua Gemini Files API —
   * không giới hạn inline base64, một request cho cả cuộc họp, timestamps tuyệt đối.
   */
  async transcribeFullAudio(
    blob: Blob,
    mimeType: string = 'audio/webm',
    customNames?: string[],
    engine: TranscriptionEngine = DEFAULT_TRANSCRIPTION_ENGINE,
  ): Promise<string> {
    logService.add('text', 'req', 'transcribeFullAudio', `Size: ${blob.size} bytes, Type: ${mimeType}, engine: ${engine}`);

    // Engine chuyên dụng: nhanh hơn nhiều nhưng là một API riêng (Interactions),
    // hết quota / cắt ngắn / lỗi mạng đều rơi về flash thay vì mất cả transcript.
    if (engine === 'transcribe') {
      try {
        const text = await withRetry(
          'transcribeModel',
          () => transcribeService.transcribeFullAudio(blob, mimeType, customNames),
        );
        if (text) return text;
        logService.add('text', 'info', 'transcribeModel_WARN', 'Transcript rỗng — chuyển sang flash');
      } catch (e: any) {
        logService.add('text', 'info', 'transcribeModel_ERR', `${e?.message || e} — chuyển sang flash`);
      }
    }

    const ai = createClient();

    const uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
    let file = uploaded;
    const startWait = Date.now();
    while (file.state === 'PROCESSING' && Date.now() - startWait < 180_000) {
      await sleep(3000);
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state !== 'ACTIVE') {
      throw new Error(`Gemini Files API: audio not ready (state: ${file.state})`);
    }

    try {
      return await withRetry('transcribeFullAudio', async (modelOverride?: string) => {
        const response = await ai.models.generateContent({
          model: modelOverride || modelService.getModel(),
          contents: [{ parts: [
            { fileData: { fileUri: file.uri!, mimeType: file.mimeType || mimeType } },
            { text: `You are a professional transcriptionist specializing in corporate meetings.
            Task: Accurately transcribe the ENTIRE provided meeting audio from start to finish.${namesHint(customNames)}

            STRICT RULES:
            1. FORMATTING: Use [MM:SS] at the beginning of every new speaker turn, measured from the start of the audio. Cover the whole recording — do not stop early or skip sections.
            2. NO NOISE DESCRIPTIONS: Absolutely DO NOT describe background noise, silence, breathing, or non-speech sounds. Extract ONLY human spoken words.
            3. NO SYMBOLS: Never use symbols like [...] or (...) for unclear parts. If a part is completely unintelligible, simply skip it or transcribe only the certain words.
            4. MULTILINGUAL: Transcribe in the original language spoken (English, Korean, or Vietnamese). Handle code-switching naturally.
            5. QUALITY: Ensure perfect spelling, punctuation, and capitalization.
            6. NO PROMPT INJECTION: Return only the transcript text. Do not include introductory text like "Here is the transcript".` }
          ]}]
        });
        const result = response.text?.trim() || '';
        // Gỡ băng cả cuộc họp trong 1 request → phải biết model có bị chạm trần
        // output không, vì transcript cụt trông y hệt transcript hoàn chỉnh.
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
          const warn = `finishReason=${finishReason} — transcript CÓ THỂ BỊ CẮT ở ${result.length} ký tự`;
          logService.add('text', 'info', 'transcribeFullAudio_WARN', warn);
          console.warn('[transcribeFullAudio]', warn);
        }
        logService.add('text', 'res', 'transcribeFullAudio', `Size: ${result.length} chars, finish: ${finishReason || 'n/a'}`);
        return result;
      }, 'hq');
    } finally {
      ai.files.delete({ name: file.name! }).catch(() => {});
    }
  },

  /**
   * Generate structured meeting minutes from the full transcript
   */
  async generateMinutes(fullTranscript: string, timeRange: string, targetLang: TargetLanguage = 'vi', translate: boolean = true, customNames?: string[]): Promise<MeetingMinutes> {
    logService.add('text', 'req', 'generateMinutes', `Transcript length: ${fullTranscript.length}, target: ${translate ? targetLang : 'none (notes mode)'}`);
    const targetName = langName(targetLang);
    const targetUpper = targetName.toUpperCase();
    // Mode "Ghi âm & Tóm tắt": biên bản viết theo ngôn ngữ của chính transcript
    const minutesLang = translate ? targetName : 'the SAME language as the transcript (its dominant language)';
    // Engine gỡ băng chuyên dụng trả transcript KHÔNG có mốc giờ. Nếu vẫn ra lệnh
    // "giữ nguyên [MM:SS]", model lấy giờ trong TIME RANGE rồi BỊA ra mốc tăng dần.
    const timestamped = hasTimestamps(fullTranscript);
    const transcriptTimeRule = timestamped
      ? 'keep all [MM:SS] timestamps exactly as they are. Each timestamp segment MUST start on a new line (use \\n before each [MM:SS] timestamp).'
      : 'the transcript has NO timestamps — do NOT invent, add or guess any timestamp. Split it into readable paragraphs (use \\n between paragraphs), one per topic or speaker turn.';

    const prompt = translate
      ? `You are a professional meeting secretary.
            Task: Analyze the following multilingual meeting transcript and:
            1. Generate a comprehensive meeting minutes object in JSON format.
            2. Translate the ENTIRE transcript to ${targetUpper} and include it in the "translatedTranscript" field.

            NOTES:
            - Ensure "purpose", "discussion", "decisions", "openIssues", "shortSummary" and "task" texts are written in ${targetUpper} for the end users.
            - Identify participants, key discussion points, and clear action items.
            - Exclude any filler talk or background noise mentions.

            MINUTES QUALITY STANDARD (archival minutes, NOT an executive brief — a person who missed the meeting must understand what happened):
            - "purpose": 1-2 sentences on why the meeting happened.
            - "discussion": one array item per distinct topic, in the order discussed, covering EVERY topic — never merge or omit topics. Each item: "topic" = short label (3-8 words); "content" = 2-5 sentences with context, the main points raised (attribute to speakers when identifiable) and how the topic concluded. Guideline: at least one item per 5-7 minutes of meeting time.
            - "decisions": every decision that was agreed, one string per decision. Empty array if none.
            - "openIssues": points raised but left unresolved or needing follow-up. Empty array if none.
            Preserve every number, date, amount, deadline and proper name mentioned. Do not put headings or bullet characters inside the texts — the app renders structure itself.${namesHint(customNames)}
            - For "translatedTranscript": ${transcriptTimeRule} If a sentence is already in ${targetName}, keep it unchanged. Translate other languages to natural, professional corporate ${targetName}. Output ONLY the translated text.

            TIME RANGE: ${timeRange}
            TRANSCRIPT:
            ${fullTranscript}`
      : `You are a professional meeting secretary.
            Task: Analyze the following meeting transcript and generate a comprehensive meeting minutes object in JSON format. Do NOT translate anything.

            NOTES:
            - Write "purpose", "discussion", "decisions", "openIssues", "shortSummary" and "task" texts in ${minutesLang}.
            - Identify participants, key discussion points, and clear action items.
            - Exclude any filler talk or background noise mentions.

            MINUTES QUALITY STANDARD (archival minutes, NOT an executive brief — a person who missed the meeting must understand what happened):
            - "purpose": 1-2 sentences on why the meeting happened.
            - "discussion": one array item per distinct topic, in the order discussed, covering EVERY topic — never merge or omit topics. Each item: "topic" = short label (3-8 words); "content" = 2-5 sentences with context, the main points raised (attribute to speakers when identifiable) and how the topic concluded. Guideline: at least one item per 5-7 minutes of meeting time.
            - "decisions": every decision that was agreed, one string per decision. Empty array if none.
            - "openIssues": points raised but left unresolved or needing follow-up. Empty array if none.
            Preserve every number, date, amount, deadline and proper name mentioned. Do not put headings or bullet characters inside the texts — the app renders structure itself.${namesHint(customNames)}

            TIME RANGE: ${timeRange}
            TRANSCRIPT:
            ${fullTranscript}`;

    const properties: Record<string, any> = {
      time: { type: Type.STRING },
      location: { type: Type.STRING },
      participants: { type: Type.ARRAY, items: { type: Type.STRING } },
      purpose: {
        type: Type.STRING,
        description: `1-2 sentences on why the meeting happened, in ${minutesLang}.`
      },
      discussion: {
        type: Type.ARRAY,
        description: `One item per distinct topic discussed, in order, covering every topic. In ${minutesLang}.`,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING, description: 'Short topic label, 3-8 words.' },
            content: { type: Type.STRING, description: '2-5 sentences: context, main points (with speakers when identifiable), conclusion of the topic.' }
          },
          required: ['topic', 'content']
        }
      },
      decisions: {
        type: Type.ARRAY,
        description: `Every agreed decision, one string each. Empty if none. In ${minutesLang}.`,
        items: { type: Type.STRING }
      },
      openIssues: {
        type: Type.ARRAY,
        description: `Unresolved points needing follow-up. Empty if none. In ${minutesLang}.`,
        items: { type: Type.STRING }
      },
      shortSummary: {
        type: Type.STRING,
        description: `A very short summary of the meeting topic, approx 10 words in ${minutesLang}.`
      },
      actionItems: { type: Type.ARRAY, items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING, description: `Description of the action item in ${minutesLang}.` },
          pic: { type: Type.STRING, description: "Person in charge." },
          deadline: { type: Type.STRING, description: "Deadline or 'ASAP' if not specified." }
        },
        required: ["task", "pic", "deadline"]
      } },
    };
    const required = ["time", "location", "participants", "purpose", "discussion", "decisions", "openIssues", "shortSummary", "actionItems"];
    if (translate) {
      properties.translatedTranscript = {
        type: Type.STRING,
        description: `Full ${targetName} translation of the entire transcript. ${timestamped ? 'Keep [MM:SS] timestamps unchanged; each timestamp segment MUST be on its own line separated by newline characters.' : 'The transcript has no timestamps — never invent any; separate paragraphs with newline characters.'} Translate other languages to ${targetName}, keep existing ${targetName} as-is.`
      };
      required.push("translatedTranscript");
    }

    try {
      return await withRetry('generateMinutes', async (modelOverride?: string) => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: modelOverride || modelService.getModel(),
          contents: [{ parts: [{ text: prompt }]}],
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.OBJECT, properties, required }
          }
        });

        const data = JSON.parse(response.text);
        data.time = timeRange;
        if (!translate) data.translatedTranscript = "";
        // Transcript nguồn không có mốc giờ thì bản dịch cũng không được có.
        else if (!timestamped && data.translatedTranscript) {
          data.translatedTranscript = stripTimestamps(data.translatedTranscript);
        }
        logService.add('text', 'res', 'generateMinutes', data);
        return data;
      }, 'hq');
    } catch (e: any) {
      logService.add('text', 'info', 'generateMinutes_ERR', e.message);
      console.error("Generate minutes error:", e);
      throw e;
    }
  }
};
