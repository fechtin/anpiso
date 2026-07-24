
import React from 'react';
import { MeetingMinutes, DiscussionTopic } from '../types';
import { hasStructuredMinutes } from '../utils/minutesFormat';
import { useLocale } from '../i18n';

interface Props {
  minutes: MeetingMinutes;
  isEditing: boolean;
  onChange: (patch: Partial<MeetingMinutes>) => void;
}

const SectionHead: React.FC<{ label: string }> = ({ label }) => (
  <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.25em] mb-4 flex items-center">
    <span className="w-8 h-[1px] bg-slate-200 mr-3"></span>
    {label}
  </h3>
);

/** Textarea nhiều dòng ↔ mảng string (mỗi dòng một mục) cho chế độ sửa. */
const linesToArray = (v: string): string[] => v.split('\n').map(l => l.trim()).filter(Boolean);

const MinutesSections: React.FC<Props> = ({ minutes, isEditing, onChange }) => {
  const { t } = useLocale();

  // ===== Legacy: meeting cũ chỉ có chuỗi summary =====
  if (!hasStructuredMinutes(minutes)) {
    return (
      <section>
        <SectionHead label={t.summarySection} />
        {isEditing ? (
          <textarea
            value={minutes.summary || ''}
            onChange={(e) => onChange({ summary: e.target.value })}
            className="w-full text-slate-700 text-sm sm:text-base leading-relaxed bg-slate-50/50 p-6 rounded-2xl border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-50 min-h-[300px] resize-none transition-all"
            placeholder={t.enterSummary}
          />
        ) : (
          <div className="text-slate-700 text-sm sm:text-base leading-loose whitespace-pre-wrap bg-slate-50/50 p-6 sm:p-8 rounded-[2rem] border border-slate-100/80 font-medium">
            {minutes.summary}
          </div>
        )}
      </section>
    );
  }

  const updateTopic = (index: number, field: keyof DiscussionTopic, value: string) => {
    const updated = [...(minutes.discussion || [])];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ discussion: updated });
  };

  const emptyNote = <p className="text-slate-400 text-xs italic">{t.minutesNone}</p>;

  return (
    <div className="space-y-10">
      {/* Mục đích */}
      {(minutes.purpose || isEditing) && (
        <section>
          <SectionHead label={t.minutesPurpose} />
          {isEditing ? (
            <textarea
              value={minutes.purpose || ''}
              onChange={(e) => onChange({ purpose: e.target.value })}
              rows={2}
              className="w-full text-slate-700 text-sm leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-50 resize-none transition-all"
            />
          ) : (
            <p className="text-slate-700 text-sm sm:text-base leading-relaxed font-medium">{minutes.purpose}</p>
          )}
        </section>
      )}

      {/* Thảo luận theo chủ đề */}
      <section>
        <SectionHead label={t.minutesDiscussion} />
        <div className="bg-slate-50/50 rounded-[2rem] border border-slate-100/80 p-5 sm:p-7 space-y-5">
          {(minutes.discussion || []).map((d, i) => (
            <div key={i}>
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    value={d.topic}
                    onChange={(e) => updateTopic(i, 'topic', e.target.value)}
                    className="w-full font-bold text-slate-800 text-sm bg-white px-3 py-2 rounded-xl border border-indigo-100 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                  />
                  <textarea
                    value={d.content}
                    onChange={(e) => updateTopic(i, 'content', e.target.value)}
                    rows={3}
                    className="w-full text-slate-600 text-sm leading-relaxed bg-white px-3 py-2 rounded-xl border border-indigo-100 focus:outline-none focus:ring-1 focus:ring-indigo-200 resize-none"
                  />
                </div>
              ) : (
                <>
                  <p className="font-bold text-slate-800 text-sm sm:text-[15px] mb-1">{d.topic}</p>
                  <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">{d.content}</p>
                </>
              )}
            </div>
          ))}
          {!minutes.discussion?.length && emptyNote}
        </div>
      </section>

      {/* Quyết định */}
      <section>
        <SectionHead label={t.minutesDecisions} />
        {isEditing ? (
          <textarea
            value={(minutes.decisions || []).join('\n')}
            onChange={(e) => onChange({ decisions: linesToArray(e.target.value) })}
            rows={Math.max(2, (minutes.decisions || []).length + 1)}
            placeholder={t.minutesOnePerLine}
            className="w-full text-slate-700 text-sm leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-50 resize-none transition-all"
          />
        ) : minutes.decisions?.length ? (
          <ul className="space-y-2">
            {minutes.decisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm sm:text-[15px] text-slate-700 font-medium">
                <i className="fas fa-check text-emerald-500 text-xs mt-1 shrink-0"></i>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        ) : emptyNote}
      </section>

      {/* Tồn đọng */}
      <section>
        <SectionHead label={t.minutesOpenIssues} />
        {isEditing ? (
          <textarea
            value={(minutes.openIssues || []).join('\n')}
            onChange={(e) => onChange({ openIssues: linesToArray(e.target.value) })}
            rows={Math.max(2, (minutes.openIssues || []).length + 1)}
            placeholder={t.minutesOnePerLine}
            className="w-full text-slate-700 text-sm leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-50 resize-none transition-all"
          />
        ) : minutes.openIssues?.length ? (
          <ul className="space-y-2">
            {minutes.openIssues.map((d, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm sm:text-[15px] text-slate-700 font-medium">
                <i className="fas fa-circle-exclamation text-amber-500 text-xs mt-1 shrink-0"></i>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        ) : emptyNote}
      </section>
    </div>
  );
};

export default MinutesSections;
