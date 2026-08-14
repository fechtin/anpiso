import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Contact } from '../types';
import { contactService } from '../services/contactService';
import { shareService, ShareDoc } from '../services/shareService';
import { useLocale } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userUid: string;
  /** Link hiện có của cuộc họp (null = chưa chia sẻ bao giờ). */
  share: ShareDoc | null;
  hasAudio: boolean;
  /** Khoá của link — chỉ có khi vừa tạo xong hoặc mở được từ keyWrapped. */
  shareKeyRaw: string | null;
  isBusy: boolean;
  errorMsg: string;
  onCreate: (emails: string[], includeAudio: boolean) => void;
  onUpdate: (emails: string[], includeAudio: boolean) => void;
  onRevoke: () => void;
}

const ShareMeetingDialog: React.FC<Props> = ({
  isOpen, onClose, userUid, share, hasAudio, shareKeyRaw, isBusy, errorMsg,
  onCreate, onUpdate, onRevoke,
}) => {
  const { t } = useLocale();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [includeAudio, setIncludeAudio] = useState(false);
  const [search, setSearch] = useState('');
  const [extraEmail, setExtraEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const isAddingRef = useRef(false);

  const shareLink = share && shareKeyRaw
    ? `${window.location.origin}/s/${share.id}#k=${shareKeyRaw}`
    : null;

  // Danh bạ chỉ tải lại khi mở dialog — đừng gọi Firestore mỗi lần share đổi
  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setCopied(false);
    setIsLoadingContacts(true);
    contactService.getContacts(userUid)
      .then(setContacts)
      .catch(err => console.error('Failed to load contacts:', err))
      .finally(() => setIsLoadingContacts(false));
  }, [isOpen, userUid]);

  // Đồng bộ lựa chọn theo link hiện có (kể cả link vừa tạo xong)
  useEffect(() => {
    if (!isOpen) return;
    setSelectedEmails(new Set(share?.allowedEmails || []));
    setIncludeAudio(hasAudio && !!share?.includeAudio);
  }, [isOpen, share, hasAudio]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => c.email.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q));
  }, [contacts, search]);

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const addAndSaveContact = async () => {
    if (isAddingRef.current) return;
    const email = extraEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    isAddingRef.current = true;
    setExtraEmail('');
    if (contacts.some(c => c.email === email)) {
      setSelectedEmails(prev => new Set(prev).add(email));
      isAddingRef.current = false;
      return;
    }
    try {
      const created = await contactService.addContact(userUid, email);
      setContacts(prev => [...prev, created]);
      setSelectedEmails(prev => new Set(prev).add(email));
    } catch (err) {
      console.error('Failed to save contact:', err);
    } finally {
      isAddingRef.current = false;
    }
  };

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      const input = document.createElement('textarea');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const emails = [...selectedEmails];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <i className="fas fa-user-group text-indigo-500 text-2xl"></i>
          </div>
          <h3 className="text-xl font-black text-slate-800">{t.shareMeetingTitle}</h3>
          <p className="text-slate-400 text-sm font-medium mt-1">{t.shareMeetingDesc}</p>
        </div>

        {/* Link đã tạo — hiện ngay đầu để copy nhanh */}
        {share && (
          shareLink ? (
            <div className="mb-5 p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-indigo-500 uppercase tracking-wider">{t.shareLinkLabel}</span>
                <button onClick={copyLink} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                  <i className={`fas ${copied ? 'fa-check' : 'fa-link'} mr-1.5`}></i>
                  {copied ? t.copied : t.copyLink}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 font-mono break-all leading-relaxed">{shareLink}</p>
              <p className="text-[10px] text-indigo-400 font-semibold mt-2 leading-snug">
                <i className="fas fa-key mr-1"></i>{t.shareLinkKeyNote}
              </p>
            </div>
          ) : (
            <div className="mb-5 p-3.5 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                <i className="fas fa-triangle-exclamation mr-1.5"></i>{t.shareStaleWarning}
              </p>
            </div>
          )
        )}

        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">{t.shareRecipients}</p>

        {!isLoadingContacts && contacts.length > 0 && (
          <div className="relative mb-3">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.searchEmailPlaceholder}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
        )}

        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
          {isLoadingContacts ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 animate-pulse">
                <div className="w-4 h-4 rounded bg-slate-200"></div>
                <div className="h-4 bg-slate-200 rounded-lg flex-1"></div>
              </div>
            ))
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-5 text-slate-400">
              <i className="far fa-address-book text-2xl mb-2 block"></i>
              <p className="text-xs font-bold">{contacts.length === 0 ? t.noContacts : t.noSearchMatch}</p>
            </div>
          ) : (
            filteredContacts.map(contact => (
              <div
                key={contact.id}
                onClick={() => toggleEmail(contact.email)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                  selectedEmails.has(contact.email)
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.has(contact.email)}
                  onChange={() => toggleEmail(contact.email)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                  {contact.name ? `${contact.name} (${contact.email})` : contact.email}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="email"
            value={extraEmail}
            onChange={e => setExtraEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAndSaveContact()}
            placeholder={t.addEmailPlaceholder}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition-colors"
          />
          <button
            onClick={addAndSaveContact}
            disabled={!extraEmail.trim()}
            className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <i className="fas fa-plus"></i>
          </button>
        </div>

        <label className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${hasAudio ? 'bg-slate-50 cursor-pointer' : 'bg-slate-50/60'}`}>
          <input
            type="checkbox"
            checked={includeAudio}
            disabled={!hasAudio}
            onChange={e => setIncludeAudio(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
          />
          <span className={`text-sm font-medium ${hasAudio ? 'text-slate-700' : 'text-slate-400'}`}>
            {hasAudio ? t.shareIncludeAudio : t.shareIncludeAudioNone}
          </span>
        </label>

        {errorMsg && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-100 mb-4">
            <p className="text-red-600 text-xs font-bold"><i className="fas fa-exclamation-circle mr-2"></i>{errorMsg}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => (share ? onUpdate(emails, includeAudio) : onCreate(emails, includeAudio))}
            disabled={emails.length === 0 || isBusy}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isBusy
              ? <><i className="fas fa-spinner fa-spin"></i> {t.sending}</>
              : <><i className="fas fa-link"></i> {share ? t.shareUpdate : t.shareCreate}</>}
          </button>
          {share && (
            <button
              onClick={() => { if (window.confirm(t.shareRevokeConfirm)) onRevoke(); }}
              disabled={isBusy}
              className="w-full py-3 rounded-xl font-bold text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <i className="fas fa-link-slash mr-2"></i>{t.shareRevoke}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isBusy}
            className="w-full py-3 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-50 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareMeetingDialog;
