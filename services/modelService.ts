/**
 * Model cho gỡ băng & biên bản. Không cho user chọn — aiService tự fallback
 * qua slot 'hq' (gemini-3.5-flash ⇄ gemini-3.5-flash-lite) khi 503/429.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash';

export const modelService = {
  getModel(): string {
    return DEFAULT_MODEL;
  },
};
