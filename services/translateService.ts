import { TargetLanguage } from '../types';
import { translateKeyService } from './translateKeyService';
import { logService } from './logService';

const GT_LANG: Record<TargetLanguage, string> = {
  vi: 'vi',
  en: 'en',
  ko: 'ko',
  zh: 'zh-CN',
  ja: 'ja',
};

const GT_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

function classifyError(code: number, msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('referer') || m.includes('referrer'))
    return 'Key bị chặn bởi HTTP referrer restriction';
  if (m.includes('not been used') || m.includes('not enabled') || m.includes('disabled'))
    return 'Cloud Translation API chưa bật trên project';
  if (m.includes('api key not valid') || m.includes('api_key_invalid') || m.includes('invalid api key'))
    return 'Key không hợp lệ';
  if (code === 429 || m.includes('quota') || m.includes('rate limit'))
    return 'Hết quota Cloud Translation';
  if (code === 401 || m.includes('unauthorized'))
    return 'Key không xác thực';
  if (code === 403)
    return 'Key thiếu quyền (kiểm tra API/referrer restriction)';
  if (code === 400)
    return 'Yêu cầu không hợp lệ';
  return `Lỗi GT (${code})`;
}

export const translateService = {
  isAvailable(): boolean {
    return translateKeyService.hasKey();
  },

  async translate(text: string, targetLang: TargetLanguage): Promise<string> {
    const key = translateKeyService.getKey();
    if (!key) throw new Error('No Google Translate API key configured');

    const target = GT_LANG[targetLang] || 'vi';
    logService.add('text', 'req', 'gtTranslate', `[${target}] ${text.substring(0, 80)}`);

    const url = `${GT_ENDPOINT}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target, format: 'text' }),
    });

    if (!res.ok) {
      const body = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch { /* not JSON */ }
      const apiCode = Number(parsed?.error?.code) || res.status;
      const apiMsg = parsed?.error?.message || body || `HTTP ${res.status}`;
      translateKeyService.recordError(classifyError(apiCode, apiMsg));
      logService.add('text', 'info', 'gtTranslate_ERR', `${apiCode}: ${apiMsg}`);
      throw new Error(apiMsg);
    }

    const data = await res.json();
    const result = data?.data?.translations?.[0]?.translatedText || '';
    translateKeyService.clearError();
    logService.add('text', 'res', 'gtTranslate', result);
    return result;
  },
};
