import { MeetingMinutes } from '../types';
import type { TranslationKeys } from '../i18n/vi';

/** Meeting mới có dữ liệu cấu trúc; meeting cũ chỉ có chuỗi summary (legacy). */
export const hasStructuredMinutes = (m: MeetingMinutes): boolean =>
  !!(m.purpose || m.discussion?.length || m.decisions?.length || m.openIssues?.length);

/** Bản plain text — dùng cho mailto và file tải về. */
export function minutesBodyText(m: MeetingMinutes, t: TranslationKeys): string {
  if (!hasStructuredMinutes(m)) return m.summary || '';

  const lines: string[] = [];
  if (m.purpose) {
    lines.push(`${t.minutesPurpose}:`, m.purpose, '');
  }
  if (m.discussion?.length) {
    lines.push(`${t.minutesDiscussion}:`);
    m.discussion.forEach(d => lines.push(`- ${d.topic}: ${d.content}`));
    lines.push('');
  }
  lines.push(`${t.minutesDecisions}:`);
  if (m.decisions?.length) m.decisions.forEach(d => lines.push(`- ${d}`));
  else lines.push(`- ${t.minutesNone}`);
  lines.push('');
  lines.push(`${t.minutesOpenIssues}:`);
  if (m.openIssues?.length) m.openIssues.forEach(d => lines.push(`- ${d}`));
  else lines.push(`- ${t.minutesNone}`);
  return lines.join('\n');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bản HTML inline-style — dùng cho email (Gmail không nhận class). */
export function minutesBodyHTML(m: MeetingMinutes, t: TranslationKeys): string {
  const box = (inner: string) =>
    `<div style="background-color:#f8fafc; padding:28px 32px; border-radius:24px; border:1px solid #f1f5f9; color:#475569; font-size:14px; line-height:1.7; font-weight:500;">${inner}</div>`;

  if (!hasStructuredMinutes(m)) {
    return box(`<div style="white-space:pre-wrap;">${esc(m.summary || '')}</div>`);
  }

  const heading = (label: string) =>
    `<p style="margin:18px 0 8px 0; font-size:10px; font-weight:900; color:#94a3b8; text-transform:uppercase; letter-spacing:0.2em;">${esc(label)}</p>`;
  const bullets = (items: string[] | undefined) =>
    items?.length
      ? `<ul style="margin:0; padding-left:18px;">${items.map(i => `<li style="margin-bottom:6px;">${esc(i)}</li>`).join('')}</ul>`
      : `<p style="margin:0; font-style:italic; color:#94a3b8;">${esc(t.minutesNone)}</p>`;

  let html = '';
  if (m.purpose) {
    html += heading(t.minutesPurpose).replace('margin:18px', 'margin:0px');
    html += `<p style="margin:0;">${esc(m.purpose)}</p>`;
  }
  if (m.discussion?.length) {
    html += heading(t.minutesDiscussion);
    html += m.discussion
      .map(d => `<p style="margin:0 0 10px 0;"><strong style="color:#1e293b;">${esc(d.topic)}:</strong> ${esc(d.content)}</p>`)
      .join('');
  }
  html += heading(t.minutesDecisions) + bullets(m.decisions);
  html += heading(t.minutesOpenIssues) + bullets(m.openIssues);
  return box(html);
}
