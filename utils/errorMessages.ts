export type ErrorTitleKey =
  | 'errorQuotaTitle'
  | 'errorAuthTitle'
  | 'errorPermissionTitle'
  | 'errorOverloadTitle'
  | 'errorNetworkTitle'
  | 'errorNoAudioTitle'
  | 'errorGenericTitle';

export type ErrorDescKey =
  | 'errorQuotaDesc'
  | 'errorAuthDesc'
  | 'errorPermissionDesc'
  | 'errorOverloadDesc'
  | 'errorNetworkDesc'
  | 'errorNoAudioDesc'
  | 'errorGenericDesc';

export interface FriendlyError {
  titleKey: ErrorTitleKey;
  descKey: ErrorDescKey;
  technicalDetails: string;
  retryDelaySeconds?: number;
  helpUrl?: string;
}

const QUOTA_HELP = 'https://ai.google.dev/gemini-api/docs/rate-limits';

/**
 * Map a raw Gemini / network error string to a friendly title + description.
 * Also tries to extract a "retry after N seconds" hint from the body.
 */
export function parseError(rawMessage: string | null | undefined): FriendlyError {
  const raw = (rawMessage ?? 'Unknown error').toString();
  const msg = raw.toLowerCase();

  // Gemini errors are often a JSON blob embedded in err.message
  let parsed: any = null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { parsed = JSON.parse(jsonMatch[0]); } catch { /* not JSON */ }
  }
  const apiCode = Number(parsed?.error?.code) || 0;
  const apiStatus = (parsed?.error?.status || '').toString().toUpperCase();

  // Retry hint: "Please retry in 50.7s" or `"retryDelay":"50s"`
  let retryDelaySeconds: number | undefined;
  const retryMatch =
    raw.match(/retry in (\d+(?:\.\d+)?)s/i) ||
    raw.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryMatch) retryDelaySeconds = Math.ceil(Number(retryMatch[1]));

  // 429 / quota
  if (
    apiCode === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    /\b429\b/.test(msg)
  ) {
    return {
      titleKey: 'errorQuotaTitle',
      descKey: 'errorQuotaDesc',
      technicalDetails: raw,
      retryDelaySeconds,
      helpUrl: QUOTA_HELP,
    };
  }

  // Already-friendly "no audio detected" thrown from useMeetingRecorder
  if (
    msg.includes('không có nội dung âm thanh') ||
    msg.includes('no audio') ||
    msg.includes('no speech')
  ) {
    return { titleKey: 'errorNoAudioTitle', descKey: 'errorNoAudioDesc', technicalDetails: raw };
  }

  // 401 / invalid key
  if (
    apiCode === 401 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('unauthorized') ||
    /\b401\b/.test(msg)
  ) {
    return { titleKey: 'errorAuthTitle', descKey: 'errorAuthDesc', technicalDetails: raw };
  }

  // 403 / permission / billing / API not enabled
  if (
    apiCode === 403 ||
    msg.includes('permission_denied') ||
    msg.includes('billing') ||
    msg.includes('api_not_enabled') ||
    msg.includes('forbidden') ||
    /\b403\b/.test(msg)
  ) {
    return { titleKey: 'errorPermissionTitle', descKey: 'errorPermissionDesc', technicalDetails: raw };
  }

  // 503 / overloaded
  if (
    apiCode === 503 ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    /\b503\b/.test(msg)
  ) {
    return { titleKey: 'errorOverloadTitle', descKey: 'errorOverloadDesc', technicalDetails: raw };
  }

  // Network
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  ) {
    return { titleKey: 'errorNetworkTitle', descKey: 'errorNetworkDesc', technicalDetails: raw };
  }

  return { titleKey: 'errorGenericTitle', descKey: 'errorGenericDesc', technicalDetails: raw };
}
