
export interface ActionItem {
  task: string;
  pic: string;
  deadline: string;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  picture: string;
  accessToken?: string;
  driveAccessToken?: string;
}

export interface UserSettings {
  driveEnabled: boolean;
  driveFolderId?: string;
  updatedAt?: any;
}

export interface DriveLinks {
  audioFileId?: string;
  audioWebViewLink?: string;
  folderWebViewLink?: string;
}

export interface Contact {
  id?: string;
  email: string;
  name: string;
  ownerUid: string;
}

export interface DiscussionTopic {
  topic: string;
  content: string;
}

export interface MeetingMinutes {
  time: string;
  location: string;
  participants: string[];
  // Biên bản có cấu trúc — app tự render heading/bullet, không nhờ AI format chuỗi
  purpose?: string;
  discussion?: DiscussionTopic[];
  decisions?: string[];
  openIssues?: string[];
  /** Legacy: meeting lưu trước refactor chỉ có chuỗi summary */
  summary?: string;
  shortSummary: string; // Tóm tắt ngắn gọn khoảng 10 từ
  actionItems: ActionItem[];
  translatedTranscript: string;
}

export enum RecordingStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum AudioSource {
  MICROPHONE = 'MICROPHONE',
  SYSTEM_AND_MIC = 'SYSTEM_AND_MIC'
}

export enum SttEngine {
  GEMINI = 'GEMINI',
  WEB_SPEECH = 'WEB_SPEECH'
}

export type WebSpeechLang = 'en-US' | 'ko-KR' | 'vi-VN' | 'ja-JP' | 'zh-CN';

export type TargetLanguage = 'vi' | 'en' | 'ko' | 'zh' | 'ja';

// interpret: dịch trực tiếp song song (mặc định) | notes: chỉ ghi âm & tóm tắt, không dịch
export type AppMode = 'interpret' | 'notes';

export interface TranscriptLine {
  id: string;
  text: string;
  type: 'input' | 'output'; // input: người nói, output: AI dịch
  timestamp: number; // Thời gian thực (epoch ms)
}

export interface LogEntry {
  id: string;
  timestamp: number;
  category: 'audio' | 'text';
  direction: 'req' | 'res' | 'info';
  label: string;
  message: string;
}
