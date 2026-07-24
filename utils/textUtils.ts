
import { TargetLanguage } from '../types';

/**
 * Text processing utilities for multilingual meeting minutes
 */

// --- Formatting Utils ---

export const formatTime = (ts: number): string => {
  const date = new Date(ts);
  return date.toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Shift every [MM:SS] timestamp in a transcript by an offset in minutes.
 * Used to convert segment-relative timestamps (always starting at [00:00])
 * into absolute meeting timestamps after each 10-min chunk is transcribed.
 */
export const shiftTranscriptTimestamps = (text: string, offsetMinutes: number): string => {
  if (!text || offsetMinutes <= 0) return text;
  return text.replace(/\[(\d{1,3}):(\d{2})\]/g, (_match, mm, ss) => {
    const shiftedMin = parseInt(mm, 10) + offsetMinutes;
    return `[${shiftedMin.toString().padStart(2, '0')}:${ss}]`;
  });
};

export const formatDateTimeRange = (start: Date, end: Date): string => {
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  
  const startTime = start.toLocaleTimeString('vi-VN', timeOptions);
  const endTime = end.toLocaleTimeString('vi-VN', timeOptions);
  const dateStr = start.toLocaleDateString('vi-VN', dateOptions);
  
  // Định dạng mới: Giờ bắt đầu - Giờ kết thúc Ngày/Tháng/Năm
  return `${startTime} - ${endTime} ${dateStr}`;
};

// --- Language Detection ---

export const containsKorean = (text: string): boolean => 
  /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);

export const hasVietnameseAccent = (text: string): boolean => 
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);

const containsHiraganaKatakana = (text: string): boolean =>
  /[぀-ゟ゠-ヿ]/.test(text);

const containsHan = (text: string): boolean =>
  /[一-鿿]/.test(text);

/**
 * Heuristic: does the text appear to already be in the target language?
 * Used to skip the translation API call when input language matches target.
 * Conservative — when in doubt, returns false so we still translate.
 */
export const isLikelyTargetLanguage = (text: string, target: TargetLanguage): boolean => {
  const hasKorean = containsKorean(text);
  const hasVi = hasVietnameseAccent(text);
  const hasJp = containsHiraganaKatakana(text);
  const hasZh = containsHan(text);

  switch (target) {
    case 'vi': return hasVi && !hasKorean && !hasJp && !hasZh;
    case 'ko': return hasKorean;
    case 'ja': return hasJp;
    case 'zh': return hasZh && !hasJp;
    case 'en': return !hasVi && !hasKorean && !hasJp && !hasZh;
    default: return false;
  }
};

export const isMeaningfulText = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length === 0) return false;
  // Check if it contains at least one character from supported languages or numbers
  return /[a-zA-Z0-9\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318FàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(trimmed);
};

// --- Text Cleaning ---

export const fixEnglishSplits = (text: string): string => {
  if (!text) return "";
  let fixed = text;
  const suffixes = 's|ion|sion|ment|ing|ed|ly|est|ity|able|ness|ful|er|or|ive|al';
  fixed = fixed.replace(new RegExp(`(\\w+)\\s+(${suffixes})\\b`, 'gi'), '$1$2');
  return fixed.replace(/\s+/g, ' ').trim();
};

export const fixVietnameseSplits = (text: string): string => {
  if (!text) return "";
  // Vietnamese is written with a space between EVERY syllable, and modern STT
  // (Gemini) already emits correctly-spaced output. We must NOT glue syllables
  // together: the previous heuristic used ASCII \b/\w regexes, but Vietnamese
  // accented vowels (ó, í, ộ, …) are non-\w, so \b falsely fires between a
  // consonant and its vowel and corrupts correct text — e.g. "thì nó" → "thìnó",
  // "với các" → "vớicác", "là một" → "làmột". Cross-delta syllable splits are
  // instead prevented upstream by preserving Gemini's own spacing during merge
  // (see mergeSmartWordLevel). Here we only normalize whitespace + punctuation.
  return text
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

export const cleanMultilingualSplits = (text: string): string => {
  if (!text) return "";
  let cleaned = text.trim().replace(/\s+([.,!?;:])/g, '$1').replace(/\s+/g, ' ');
  if (hasVietnameseAccent(cleaned)) return fixVietnameseSplits(cleaned);
  return fixEnglishSplits(cleaned);
};

// --- Streaming Transcript Logic ---

export const normalizeWord = (word: string) => {
  return word.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
};

export const mergeSmartWordLevel = (oldText: string, newText: string): string => {
  if (!oldText) return newText.replace(/^\s+/, "");
  if (!newText) return oldText;
  const oldWords = oldText.trim().split(/\s+/);
  const newWords = newText.trim().split(/\s+/);
  const searchLimit = Math.min(oldWords.length, newWords.length, 15);

  // Pre-normalize once to avoid repeated slice+map+join per iteration
  const normalizedOld = oldWords.map(normalizeWord);
  const normalizedNew = newWords.map(normalizeWord);

  let maxOverlap = 0;
  for (let i = 1; i <= searchLimit; i++) {
    let match = true;
    for (let j = 0; j < i; j++) {
      if (normalizedOld[normalizedOld.length - i + j] !== normalizedNew[j]) {
        match = false;
        break;
      }
    }
    if (match) maxOverlap = i;
  }

  // Overlapping / cumulative resend: the new fragment restates the tail of the
  // old text, so drop the overlapped words and re-join with single spaces.
  if (maxOverlap > 0) {
    return oldText.trim() + " " + newWords.slice(maxOverlap).join(" ");
  }

  // Pure incremental fragment: preserve Gemini's OWN spacing via raw
  // concatenation. Gemini's inputTranscription deltas carry a leading space at
  // real word boundaries and omit it when continuing a syllable, so raw concat
  // re-joins a syllable split across two deltas ("…tí" + "ch hợp" → "…tích hợp")
  // while keeping genuine word gaps ("thì" + " nó" → "thì nó"). Forcing a space
  // here is what previously produced broken syllables that then had to be
  // (over-)repaired downstream.
  return oldText + newText;
};

export const isEndOfSentence = (text: string) => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) || trimmed.length > 120;
};
