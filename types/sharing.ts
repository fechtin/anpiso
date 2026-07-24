import { TranscriptLine, MeetingMinutes, RecordingStatus } from '../types';

/** Messages sent from host to viewers via DataChannel */
export type HostMessage =
  | FullStateMessage
  | TranscriptAppendMessage
  | TranscriptUpdateMessage
  | InputDraftMessage
  | OutputDraftMessage
  | ElapsedTimeMessage
  | StatusChangeMessage
  | MinutesMessage
  | HqSegmentMessage
  | TranslatedTranscriptMessage;

export interface FullStateMessage {
  type: 'full_state';
  liveTranscript: TranscriptLine[];
  inputDraft: string;
  outputDraft: string;
  elapsedTime: number;
  status: RecordingStatus;
  minutes: MeetingMinutes | null;
  hqSegments: string[];
  fullTranslatedTranscript: string;
  // Host cũ có thể không gửi field này → viewer mặc định true
  translationEnabled?: boolean;
}

export interface TranscriptAppendMessage {
  type: 'transcript_append';
  lines: TranscriptLine[];
}

export interface TranscriptUpdateMessage {
  type: 'transcript_update';
  lines: TranscriptLine[];
}

export interface InputDraftMessage {
  type: 'input_draft';
  text: string;
}

export interface OutputDraftMessage {
  type: 'output_draft';
  text: string;
}

export interface ElapsedTimeMessage {
  type: 'elapsed_time';
  seconds: number;
}

export interface StatusChangeMessage {
  type: 'status_change';
  status: RecordingStatus;
}

export interface MinutesMessage {
  type: 'minutes';
  minutes: MeetingMinutes;
}

export interface HqSegmentMessage {
  type: 'hq_segment';
  index: number;
  text: string;
}

export interface TranslatedTranscriptMessage {
  type: 'translated_transcript';
  text: string;
}
