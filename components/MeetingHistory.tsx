
import React, { useState, useMemo, useRef, useCallback } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useLocale } from '../i18n';
import type { LocaleContextValue } from '../i18n';

type TimeFilterValue = 'all' | 'today' | '7d' | '30d';

function getTimeFilterDates(value: TimeFilterValue): { startDate?: Date; endDate?: Date } {
  if (value === 'all') return {};
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === 'today') return { startDate: start };
  if (value === '7d') { start.setDate(start.getDate() - 6); return { startDate: start }; }
  start.setDate(start.getDate() - 29);
  return { startDate: start };
}

const SWIPE_THRESHOLD = 80;

const SwipeableCard: React.FC<{
  meeting: any;
  onSelect: (meeting: any) => void;
  onRequestDelete: (id: string) => void;
  t: LocaleContextValue['t'];
}> = ({ meeting, onSelect, onRequestDelete, t }) => {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Only swipe horizontally if movement is more horizontal than vertical
    if (!swiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
    }
    if (swiping.current) {
      // Only allow swipe left (negative), clamp to -120
      setOffsetX(Math.max(-120, Math.min(0, dx)));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (offsetX < -SWIPE_THRESHOLD) {
      setOffsetX(-120); // Snap open
    } else {
      setOffsetX(0); // Snap closed
    }
    swiping.current = false;
  }, [offsetX]);

  const handleClick = () => {
    if (offsetX < -10) {
      setOffsetX(0); // Close if swiped
    } else if (!meeting.locked) {
      onSelect(meeting);
    }
  };

  const m = meeting.minutes;
  const participantList = m?.participants || [];
  const shownParticipants = participantList.slice(0, 3);
  const extraCount = participantList.length - 3;
  const actionCount = m?.actionItems?.length || 0;
  // Nháp chưa có biên bản → tiêu đề tạm từ những từ đầu của transcript (không tốn AI)
  const draftTitle = (() => {
    const raw = (meeting.transcriptText || '').replace(/\[\d{1,2}:\d{2}\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return t.draftMeeting;
    const words = raw.split(' ').slice(0, 10).join(' ');
    return words.length < raw.length ? `${words}…` : words;
  })();
  const draftDate = meeting.createdAt?.toDate ? meeting.createdAt.toDate().toLocaleString() : '';
  const title = meeting.locked ? t.lockedMeeting : meeting.draft ? draftTitle : (m?.shortSummary || t.meetingMinutes);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Delete button behind - only visible when swiped */}
      <div className={`absolute inset-y-0 right-0 w-[120px] flex items-center justify-center bg-red-500 rounded-2xl transition-opacity duration-150 ${offsetX < 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={() => onRequestDelete(meeting.id)}
          className="flex flex-col items-center gap-1 text-white"
        >
          <i className="fas fa-trash-alt text-base"></i>
          <span className="text-[10px] font-bold">{t.delete}</span>
        </button>
      </div>

      {/* Card content */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
        className="relative group flex items-start gap-4 p-4 bg-white hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 cursor-pointer transition-transform duration-200 ease-out rounded-2xl"
        style={{ transform: `translateX(${offsetX}px)` }}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${meeting.locked ? 'bg-slate-100' : meeting.draft ? 'bg-amber-100' : 'bg-indigo-100 group-hover:bg-indigo-200'}`}>
          <i className={`text-sm ${meeting.locked ? 'fas fa-lock text-slate-400' : meeting.draft ? 'fas fa-file-pen text-amber-500' : 'fas fa-file-lines text-indigo-600'}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate transition-colors ${meeting.locked ? 'text-slate-400' : 'text-slate-700 group-hover:text-indigo-600'}`}>
            {title}
          </p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            {meeting.locked ? t.lockedMeetingHint : meeting.draft ? `${draftDate ? draftDate + ' · ' : ''}${t.draftMeetingHint}` : (m?.time || '')}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {shownParticipants.map((p: string, i: number) => (
              <span key={i} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                {p}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="text-[10px] font-bold text-slate-400">+{extraCount}</span>
            )}
            {actionCount > 0 && (
              <span className="text-[10px] font-bold text-slate-400 ml-auto">
                <i className="fas fa-check-circle mr-1 text-emerald-400"></i>{actionCount} {t.tasks}
              </span>
            )}
          </div>
        </div>
        {/* Desktop hover delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRequestDelete(meeting.id); }}
          className="absolute top-3 right-3 w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hidden sm:flex"
        >
          <i className="fas fa-trash-alt text-xs"></i>
        </button>
      </div>
    </div>
  );
};

interface Props {
  meetings: any[];
  onSelect: (meeting: any) => void;
  onDelete: (meetingId: string) => void;
  onDeleteAll: () => void;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  onTimeFilterChange: (startDate?: Date, endDate?: Date) => void;
}

const MeetingHistory: React.FC<Props> = ({
  meetings, onSelect, onDelete, onDeleteAll,
  isLoading, hasMore, onLoadMore, isLoadingMore, onTimeFilterChange,
}) => {
  const { t } = useLocale();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>('all');

  const TIME_FILTERS = useMemo(() => [
    { label: t.filterAll, value: 'all' as TimeFilterValue },
    { label: t.filterToday, value: 'today' as TimeFilterValue },
    { label: t.filter7d, value: '7d' as TimeFilterValue },
    { label: t.filter30d, value: '30d' as TimeFilterValue },
  ], [t]);

  const handleTimeFilterChange = (value: TimeFilterValue) => {
    setTimeFilter(value);
    setSearchQuery('');
    const { startDate, endDate } = getTimeFilterDates(value);
    onTimeFilterChange(startDate, endDate);
  };

  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetings;
    const q = searchQuery.toLowerCase();
    return meetings.filter((meeting: any) => {
      const title = (meeting.minutes?.shortSummary || '').toLowerCase();
      const participants = (meeting.minutes?.participants || []).join(' ').toLowerCase();
      return title.includes(q) || participants.includes(q);
    });
  }, [meetings, searchQuery]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse"></div>
          <div className="h-3 w-32 bg-slate-100 rounded animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-[2rem] p-5 sm:p-6 border border-slate-100 shadow-sm overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
            <i className="fas fa-clock-rotate-left text-indigo-500 text-xs"></i>
          </div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{t.recentMeetings}</h3>
          {meetings.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-all"
            >
              <i className="fas fa-trash-alt mr-1"></i>{t.deleteAll}
            </button>
          )}
        </div>

        {/* Search + Time Filter */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-100 rounded-lg focus:outline-none focus:border-indigo-300 focus:bg-white transition-all"
            />
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {TIME_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => handleTimeFilterChange(f.value)}
                className={`text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  timeFilter === f.value
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredMeetings.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-folder-open text-slate-200 text-3xl mb-2"></i>
            <p className="text-sm text-slate-400">
              {searchQuery ? t.noMatchingMeetings : t.noMeetingsYet}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMeetings.map((meeting: any) => (
              <SwipeableCard
                key={meeting.id}
                meeting={meeting}
                onSelect={onSelect}
                onRequestDelete={setDeleteId}
                t={t}
              />
            ))}

            {/* Load More */}
            {hasMore && !searchQuery && (
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="w-full py-2.5 text-xs font-semibold text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t.loading}</>
                ) : (
                  <><i className="fas fa-chevron-down mr-1.5"></i>{t.loadMore}</>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          isOpen={true}
          type="danger"
          title={t.deleteMeeting}
          message={t.deleteMeetingMsg}
          confirmLabel={t.delete}
          onConfirm={() => { onDelete(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          isOpen={true}
          type="danger"
          title={t.deleteAllMeetings}
          message={t.deleteAllMeetingsMsg(meetings.length)}
          confirmLabel={t.deleteAll}
          onConfirm={() => { onDeleteAll(); setShowDeleteAll(false); }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </>
  );
};

export default MeetingHistory;
