
import React, { useState, useEffect } from 'react';
import { MeetingMinutes, TranscriptLine, ActionItem } from '../types';
import { useLocale } from '../i18n';
import MinutesSections from './MinutesSections';
import { speakerToken, renameSpeakerInMinutes } from '../utils/renameSpeaker';

interface Props {
  minutes: MeetingMinutes;
  onSendEmail: (updatedMinutes: MeetingMinutes) => void;
  onSave?: (updatedMinutes: MeetingMinutes) => void;
  onReset: () => void;
  transcriptText: string;
  onViewTranscript: () => void;
  liveTranscript: TranscriptLine[];
  translatedTranscript: string;
  isTranslating: boolean;
  readOnly?: boolean;
  /** Đổi tên speaker cũng lan sang bản dịch transcript (được lưu tách khỏi minutes). */
  onRenameTranscript?: (token: string, to: string) => void;
}

const MinutesDisplay: React.FC<Props> = ({
  minutes: initialMinutes,
  onSendEmail,
  onSave,
  onReset,
  transcriptText,
  onViewTranscript,
  translatedTranscript,
  isTranslating,
  readOnly,
  onRenameTranscript
}) => {
  const { t } = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [localMinutes, setLocalMinutes] = useState<MeetingMinutes>(initialMinutes);
  const [newParticipant, setNewParticipant] = useState("");
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const DEFAULT_TASK = t.newTask;
  const DEFAULT_PIC = "PIC";
  const DEFAULT_DEADLINE = "ASAP";

  useEffect(() => {
    setLocalMinutes(initialMinutes);
  }, [initialMinutes]);

  const toggleEdit = () => {
    if (isEditing && onSave) {
      onSave(localMinutes);
    }
    setIsEditing(!isEditing);
  };

  const updateField = (field: keyof MeetingMinutes, value: any) => {
    setLocalMinutes(prev => ({ ...prev, [field]: value }));
  };

  const updateActionItem = (index: number, field: keyof ActionItem, value: string) => {
    const updatedItems = [...localMinutes.actionItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    updateField('actionItems', updatedItems);
  };

  const handleInputFocus = (index: number, field: keyof ActionItem, currentValue: string) => {
    const defaults = {
      task: DEFAULT_TASK,
      pic: DEFAULT_PIC,
      deadline: DEFAULT_DEADLINE
    };
    if (currentValue === defaults[field]) {
      updateActionItem(index, field, "");
    }
  };

  const addActionItem = () => {
    const newItem: ActionItem = { task: DEFAULT_TASK, pic: DEFAULT_PIC, deadline: DEFAULT_DEADLINE };
    updateField('actionItems', [...localMinutes.actionItems, newItem]);
  };

  const removeActionItem = (index: number) => {
    updateField('actionItems', localMinutes.actionItems.filter((_, i) => i !== index));
  };

  const addParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (newParticipant.trim()) {
      updateField('participants', [...localMinutes.participants, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const removeParticipant = (index: number) => {
    updateField('participants', localMinutes.participants.filter((_, i) => i !== index));
  };

  const startRename = (index: number) => {
    setRenamingIdx(index);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingIdx(null);
    setRenameValue("");
  };

  // Đổi tên speaker → thay token ở TOÀN BỘ biên bản + lan sang bản dịch transcript.
  const commitRename = (index: number) => {
    const token = speakerToken(localMinutes.participants[index] || "");
    const to = renameValue.trim();
    if (token && to && token !== to) {
      const next = renameSpeakerInMinutes(localMinutes, token, to);
      setLocalMinutes(next);
      onSave?.(next);
      onRenameTranscript?.(token, to);
    }
    cancelRename();
  };


  const downloadTranscript = () => {
    if (!transcriptText) return;
    const translationReady = translatedTranscript && translatedTranscript.length > 0;
    // Mode "Ghi âm & Tóm tắt" không có bản dịch → bỏ hẳn section bản dịch
    const translationSection = (translationReady || isTranslating)
      ? `\n\n==================================================\n` +
        `${t.translatedTranscriptHeader}\n` +
        `==================================================\n\n` +
        (translationReady ? translatedTranscript : t.translationProcessing)
      : '';
    const header = `${t.detailedMinutesHeader}\n` +
                   `${t.timeLabel}: ${localMinutes.time}\n` +
                   `${t.locationLabel}: ${localMinutes.location}\n` +
                   `${t.participantsSection}: ${localMinutes.participants.join(', ')}\n\n` +
                   `==================================================\n` +
                   `${t.originalTranscriptHeader}\n` +
                   `==================================================\n\n` +
                   transcriptText +
                   translationSection;
    
    const blob = new Blob([header], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_Transcript_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDisplayTitle = () => {
    const summary = localMinutes.shortSummary || "";
    if (!summary) return t.meetingMinutes;
    let s = summary.trim();
    // Loại bỏ tất cả dấu chấm ở cuối chuỗi
    while (s.endsWith('.')) {
      s = s.slice(0, -1).trim();
    }
    // Viết hoa chữ cái đầu, giới hạn 15 từ — không thêm prefix "Họp/Meeting"
    const capFirst = s.charAt(0).toUpperCase() + s.slice(1);
    return capFirst.split(/\s+/).slice(0, 15).join(' ');
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="bg-white p-5 sm:p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100">
        
        {/* Header - Title & Time/Location */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-10">
          <div className="space-y-4">
            <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">{getDisplayTitle()}</h2>
            
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-8 text-slate-500">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                  <i className="far fa-calendar-alt text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.timeLabel}</p>
                  {isEditing ? (
                    <input 
                      value={localMinutes.time}
                      onChange={(e) => updateField('time', e.target.value)}
                      className="text-sm font-semibold text-slate-700 bg-slate-50 border-none rounded focus:ring-1 focus:ring-indigo-300 px-1 mt-0.5"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-700">{localMinutes.time}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                  <i className="fas fa-map-marker-alt text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.locationLabel}</p>
                  {isEditing ? (
                    <input 
                      value={localMinutes.location}
                      onChange={(e) => updateField('location', e.target.value)}
                      className="text-sm font-semibold text-slate-700 bg-slate-50 border-none rounded focus:ring-1 focus:ring-indigo-300 px-1 mt-0.5"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-700">{localMinutes.location}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-12">
          <div className="lg:col-span-2 space-y-10">
            {/* Participants Section */}
            <section>
              <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.25em] mb-4 flex items-center">
                <span className="w-8 h-[1px] bg-slate-200 mr-3"></span>
                {t.participantsSection}
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {localMinutes.participants.map((p, idx) => (
                  <div key={idx} className="group relative">
                    {isEditing && renamingIdx === idx ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); commitRename(idx); }}
                        className="flex items-center gap-1 px-2 py-1 bg-white rounded-xl border border-indigo-300"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') cancelRename(); }}
                          placeholder={speakerToken(p) || t.renamePlaceholder}
                          className="px-2 py-1 bg-transparent border-none text-xs sm:text-sm font-bold text-indigo-700 focus:outline-none w-36 placeholder:text-indigo-300 placeholder:font-normal"
                        />
                        <button type="submit" className="text-emerald-600 hover:text-emerald-700 px-1" title={t.save}>
                          <i className="fas fa-check text-xs"></i>
                        </button>
                        <button type="button" onClick={cancelRename} className="text-slate-400 hover:text-slate-600 px-1">
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      </form>
                    ) : (
                      <span className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs sm:text-sm font-bold border border-indigo-100/50 flex items-center">
                        {p}
                        {isEditing && (
                          <>
                            <button
                              onClick={() => startRename(idx)}
                              className="ml-2 text-indigo-300 hover:text-indigo-600 transition-colors"
                              title={t.renameParticipant}
                            >
                              <i className="fas fa-pen text-[10px]"></i>
                            </button>
                            <button
                              onClick={() => removeParticipant(idx)}
                              className="ml-1.5 hover:text-red-500 transition-colors"
                            >
                              <i className="fas fa-times-circle"></i>
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                ))}
                {isEditing && (
                  <form onSubmit={addParticipant} className="flex">
                    <input 
                      value={newParticipant}
                      onChange={(e) => setNewParticipant(e.target.value)}
                      placeholder={t.addPerson}
                      className="px-3 py-1.5 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-indigo-400 w-32 transition-all"
                    />
                  </form>
                )}
              </div>
            </section>

            {/* Nội dung biên bản: cấu trúc mới hoặc summary legacy */}
            <MinutesSections
              minutes={localMinutes}
              isEditing={isEditing}
              onChange={(patch) => setLocalMinutes(prev => ({ ...prev, ...patch }))}
            />
          </div>

          {/* Action Items Column */}
          <div className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.25em] flex items-center">
                  <span className="w-8 h-[1px] bg-slate-200 mr-3"></span>
                  {t.actionItemsSection}
                </h3>
                {isEditing && (
                  <button onClick={addActionItem} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-600 flex items-center">
                    <i className="fas fa-plus-circle mr-1.5"></i> {t.addItem}
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {localMinutes.actionItems.map((item, idx) => (
                  <div key={idx} className="p-5 bg-white rounded-2xl border border-slate-100 relative shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all group overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 rounded-l-2xl opacity-70 group-hover:opacity-100 transition-all"></div>
                    
                    {isEditing && (
                      <button 
                        onClick={() => removeActionItem(idx)}
                        className="absolute top-3 right-3 text-slate-300 hover:text-red-400 transition-colors z-10"
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    )}

                    {isEditing ? (
                      <div className="mb-4 bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                         <textarea 
                          value={item.task}
                          onChange={(e) => updateActionItem(idx, 'task', e.target.value)}
                          onFocus={() => handleInputFocus(idx, 'task', item.task)}
                          className="w-full font-bold text-slate-800 text-sm bg-transparent border-none focus:ring-0 resize-none placeholder:text-slate-300"
                          rows={2}
                          placeholder={t.taskDesc}
                        />
                      </div>
                    ) : (
                      <p className="font-bold text-slate-800 text-sm leading-snug mb-5 pr-4">{item.task}</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100/50">
                        <i className="far fa-user mr-2 opacity-70"></i>
                        {isEditing ? (
                          <input 
                            value={item.pic}
                            onChange={(e) => updateActionItem(idx, 'pic', e.target.value)}
                            onFocus={() => handleInputFocus(idx, 'pic', item.pic)}
                            className="bg-transparent border-none focus:outline-none w-20 placeholder:text-indigo-300"
                            placeholder={t.whoDoesIt}
                          />
                        ) : item.pic}
                      </div>
                      <div className="flex items-center text-[11px] font-bold text-slate-400 ml-auto">
                        <i className="far fa-clock mr-2 opacity-70"></i>
                        {isEditing ? (
                          <input
                            type="date"
                            value={(() => {
                              // Try to parse existing value to date format (YYYY-MM-DD)
                              const d = item.deadline;
                              if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
                              const parsed = new Date(d);
                              if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
                              return '';
                            })()}
                            onChange={(e) => {
                              if (e.target.value) {
                                const [y, m, d] = e.target.value.split('-');
                                updateActionItem(idx, 'deadline', `${d}/${m}/${y}`);
                              }
                            }}
                            className="bg-transparent border-none focus:outline-none w-28 text-right text-[11px] placeholder:text-slate-200"
                          />
                        ) : item.deadline}
                      </div>
                    </div>
                  </div>
                ))}
                {localMinutes.actionItems.length === 0 && (
                  <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400 text-xs italic">{t.noActionsRecorded}</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Footer Actions */}
        {!readOnly && (
          <div className="mt-12 pt-8 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-3">
              {/* Row 1 on mobile: Edit, Review, Transcript */}
              <div className="grid grid-cols-3 sm:contents gap-2">
                <button
                  onClick={toggleEdit}
                  className={`px-3 py-2.5 rounded-xl transition-all text-xs font-bold flex items-center justify-center shadow-sm ${isEditing ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <i className={`fas ${isEditing ? 'fa-check' : 'fa-edit'} mr-1.5`}></i> {isEditing ? t.save : t.edit}
                </button>
                <button
                  onClick={onViewTranscript}
                  className="px-3 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold flex items-center justify-center"
                >
                  <i className="fas fa-history mr-1.5"></i> {t.review}
                </button>
                <button
                  onClick={downloadTranscript}
                  disabled={!transcriptText}
                  className={`px-3 py-2.5 rounded-xl transition-all text-xs font-bold flex items-center justify-center disabled:opacity-50 ${isTranslating ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {isTranslating ? (
                    <><i className="fas fa-spinner fa-spin mr-1.5"></i> ...</>
                  ) : (
                    <><i className="fas fa-file-lines mr-1.5"></i> {t.transcript}</>
                  )}
                </button>
              </div>
              {/* Row 2 on mobile: Send, New */}
              <div className="grid grid-cols-2 sm:contents gap-2">
                <button
                  onClick={() => onSendEmail(localMinutes)}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-600 transition-all text-xs font-bold shadow-lg shadow-indigo-100 flex items-center justify-center"
                >
                  <i className="far fa-envelope mr-1.5"></i> {t.send}
                </button>
                <button
                  onClick={onReset}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold flex items-center justify-center"
                >
                  {t.newMeeting}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MinutesDisplay;
