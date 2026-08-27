import { GoogleGenAI } from '@google/genai';
import { logService } from './logService';
import { apiKeyService } from './apiKeyService';

/**
 * Gỡ băng bằng model chuyên dụng gemini-3.5-transcribe.
 *
 * Model này KHÔNG chạy qua generateContent (trả về rỗng) — nó chỉ nhận request
 * qua Interactions API, và không nhận prompt text: mọi tuỳ chọn đều nằm trong
 * `transcription_config`. SDK @google/genai 2.10 chưa có type cho config này
 * nên ở đây gọi thẳng REST.
 *
 * Chọn chế độ verbatim TRẦN (không diarization, không timestamp) vì đã đo:
 * - bật diarization + timestamp mức từ → 14.5 phút audio bị cắt còn ~60%,
 *   API trả `status: "incomplete"` mà không báo lỗi;
 * - `timestamp_granularities: ["segment"]` → chạy xong nhưng trả 0 annotation;
 * - chỉ verbatim trần mới dùng được `custom_vocabulary` (API từ chối khi bật
 *   kèm timestamps hoặc diarization), và đó là kênh duy nhất giữ đúng chính tả
 *   tên riêng của người dùng.
 * Đánh đổi: transcript không có mốc [MM:SS].
 */
const MODEL = 'gemini-3.5-transcribe';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Giới hạn của API: 1.000 từ, tài liệu khuyến nghị ~100 để không loãng. */
const MAX_VOCABULARY = 100;

export const transcribeService = {
  async transcribeFullAudio(blob: Blob, mimeType: string, customNames?: string[]): Promise<string> {
    logService.add('text', 'req', 'transcribeModel', `Size: ${blob.size} bytes, Type: ${mimeType}`);
    const apiKey = apiKeyService.getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
    let file = uploaded;
    const startWait = Date.now();
    while (file.state === 'PROCESSING' && Date.now() - startWait < 180_000) {
      await new Promise(r => setTimeout(r, 3000));
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state !== 'ACTIVE') {
      throw new Error(`Gemini Files API: audio not ready (state: ${file.state})`);
    }

    try {
      const vocabulary = (customNames || []).map(n => n.trim()).filter(Boolean).slice(0, MAX_VOCABULARY);
      const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          input: [{ type: 'audio', uri: file.uri, mime_type: file.mimeType || mimeType }],
          generation_config: {
            transcription_config: {
              language_codes: [],           // rỗng = tự nhận diện ngôn ngữ
              ...(vocabulary.length > 0 ? { custom_vocabulary: vocabulary } : {}),
              mode: { type: 'verbatim' },
            },
          },
        }),
      });

      const json: any = await response.json();
      if (json?.error) {
        // Giữ nguyên code để withRetry ở aiService phân loại được (429/5xx/key hỏng).
        const err: any = new Error(json.error.message || 'Interactions API error');
        err.code = response.status;
        throw err;
      }
      // Cắt ngắn thì API vẫn trả 200 kèm status khác "completed" — phải tự bắt,
      // vì transcript cụt trông y hệt transcript hoàn chỉnh.
      if (json?.status !== 'completed') {
        throw new Error(`transcribe: status=${json?.status} — transcript có thể bị cắt`);
      }

      const text = (json?.steps?.[0]?.content?.[0]?.text || '').trim();
      logService.add('text', 'res', 'transcribeModel', `Size: ${text.length} chars, status: ${json.status}`);
      return text;
    } finally {
      ai.files.delete({ name: file.name! }).catch(() => {});
    }
  },
};
