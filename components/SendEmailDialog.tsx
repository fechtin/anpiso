
import React, { useState, useEffect, useRef } from 'react';
import { MeetingMinutes, Contact } from '../types';
import { gmailService } from '../services/gmailService';
import { contactService } from '../services/contactService';
import { useLocale } from '../i18n';

interface Props {
  isOpen: boolean;
  minutes: MeetingMinutes;
  subject: string;
  htmlBody: string;
  textBody: string;
  userUid: string;
  userEmail: string;
  onClose: () => void;
}

type SendState = 'idle' | 'sending' | 'success' | 'error';

// Gửi trực tiếp qua Gmail API cần Google verify scope gmail.send (restricted).
// Khi flag tắt: fallback mở mail client của user qua mailto (không cần scope nào).
const GMAIL_DIRECT = import.meta.env.VITE_FEATURE_GMAIL_SEND === 'true';

const SendEmailDialog: React.FC<Props> = ({
  isOpen,
  minutes,
  subject,
  htmlBody,
  textBody,
  userUid,
  userEmail,
  onClose,
}) => {
  const { t } = useLocale();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [extraEmail, setExtraEmail] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const isAddingRef = useRef(false);

  // Load contacts when dialog opens
  useEffect(() => {
    if (!isOpen || !userUid) return;
    setIsLoadingContacts(true);
    contactService.getContacts(userUid)
      .then(data => {
        setContacts(data);
        // Auto-select all contacts
        setSelectedEmails(new Set(data.map(c => c.email)));
      })
      .catch(err => console.error('Failed to load contacts:', err))
      .finally(() => setIsLoadingContacts(false));
  }, [isOpen, userUid]);

  if (!isOpen) return null;

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

    // Check if already exists in contacts
    if (contacts.some(c => c.email === email)) {
      setSelectedEmails(prev => new Set(prev).add(email));
      isAddingRef.current = false;
      return;
    }

    try {
      const newContact = await contactService.addContact(userUid, email);
      setContacts(prev => [...prev, newContact]);
      setSelectedEmails(prev => new Set(prev).add(email));
    } catch (err) {
      console.error('Failed to save contact:', err);
    } finally {
      isAddingRef.current = false;
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!contact.id) return;
    try {
      await contactService.deleteContact(contact.id);
      setContacts(prev => prev.filter(c => c.id !== contact.id));
      setSelectedEmails(prev => {
        const next = new Set(prev);
        next.delete(contact.email);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete contact:', err);
    }
  };

  const handleSend = async () => {
    const recipients: string[] = [...selectedEmails];
    if (recipients.length === 0) return;

    if (!GMAIL_DIRECT) {
      // Gmail compose URL chỉ nhận plain text → luôn đi đường clipboard:
      // copy biên bản dạng HTML (dán ra giữ nguyên định dạng) + plain dự phòng,
      // mở compose sẵn người nhận + tiêu đề, hướng dẫn user Ctrl+V
      try {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([htmlBody], { type: 'text/html' }),
              'text/plain': new Blob([textBody], { type: 'text/plain' }),
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(textBody);
        }
      } catch {
        await navigator.clipboard.writeText(textBody).catch(() => {});
      }
      const params = new URLSearchParams({ view: 'cm', fs: '1', to: recipients.join(','), su: subject, authuser: userEmail });
      window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank', 'noopener');
      handleClose();
      return;
    }

    setSendState('sending');
    setErrorMsg('');

    try {
      let token = await gmailService.getSendToken();

      try {
        await gmailService.sendEmail(token, recipients, subject, htmlBody);
      } catch (err: any) {
        if (err.message === 'TOKEN_EXPIRED') {
          gmailService.clearSendToken();
          token = await gmailService.getSendToken();
          await gmailService.sendEmail(token, recipients, subject, htmlBody);
        } else {
          throw err;
        }
      }

      setSendState('success');
    } catch (err: any) {
      setSendState('error');
      setErrorMsg(err.message || t.cannotSendEmail);
    }
  };

  const handleClose = () => {
    setSendState('idle');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-8 animate-in zoom-in-95 duration-300">

        {sendState === 'success' ? (
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
              <i className="fas fa-check text-emerald-500 text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.sentSuccess}</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">
              {t.sentTo(selectedEmails.size)}
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
            >
              {t.close}
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <i className="far fa-envelope text-indigo-500 text-2xl"></i>
              </div>
              <h3 className="text-xl font-black text-slate-800">{t.sendMinutes}</h3>
              <p className="text-slate-400 text-sm font-medium mt-1">{t.selectRecipients}</p>
            </div>

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {isLoadingContacts ? (
                // Skeleton loading
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 animate-pulse">
                    <div className="w-4 h-4 rounded bg-slate-200"></div>
                    <div className="h-4 bg-slate-200 rounded-lg flex-1"></div>
                  </div>
                ))
              ) : contacts.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <i className="far fa-address-book text-2xl mb-2 block"></i>
                  <p className="text-xs font-bold">{t.noContacts}</p>
                  <p className="text-[10px] mt-1">{t.addEmailToContacts}</p>
                </div>
              ) : (
                contacts.map(contact => (
                  <div
                    key={contact.id}
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
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label
                      onClick={() => toggleEmail(contact.email)}
                      className="flex-1 text-sm font-medium text-slate-700 cursor-pointer truncate"
                    >
                      {contact.name ? `${contact.name} (${contact.email})` : contact.email}
                    </label>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact); }}
                      className="text-slate-300 hover:text-red-400 transition-colors p-1"
                      title={t.deleteFromContacts}
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 mb-6">
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

            {errorMsg && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-100 mb-4">
                <p className="text-red-600 text-xs font-bold">
                  <i className="fas fa-exclamation-circle mr-2"></i>{errorMsg}
                </p>
              </div>
            )}

            {!GMAIL_DIRECT && (
              <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 mb-4">
                <p className="text-indigo-600 text-[11px] font-semibold leading-relaxed">
                  <i className="fas fa-clipboard-check mr-1.5"></i>{t.gmailPasteHint}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSend}
                disabled={selectedEmails.size === 0 || sendState === 'sending'}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendState === 'sending' ? (
                  <><i className="fas fa-spinner fa-spin"></i> {t.sending}</>
                ) : GMAIL_DIRECT ? (
                  <><i className="far fa-paper-plane"></i> {t.sendEmail(selectedEmails.size)}</>
                ) : (
                  <><i className="fas fa-arrow-up-right-from-square"></i> {t.openMailApp(selectedEmails.size)}</>
                )}
              </button>
              <button
                onClick={handleClose}
                disabled={sendState === 'sending'}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-50 transition-colors"
              >
                {t.cancel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SendEmailDialog;
