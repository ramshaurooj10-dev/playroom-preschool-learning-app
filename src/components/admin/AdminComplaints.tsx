import React, { useState } from 'react';
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Mail,
  Phone,
  Paperclip,
  ExternalLink,
  MessageSquare,
  Building,
  User,
  Check,
  Copy,
  FileText,
  X,
  Eye,
  Send,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { SchoolComplaint } from '../../types/payment';

interface AdminComplaintsProps {
  complaints: SchoolComplaint[];
  onUpdateStatus: (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', adminNotes?: string) => Promise<void>;
  onDeleteComplaint: (id: string) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminComplaints: React.FC<AdminComplaintsProps> = ({
  complaints,
  onUpdateStatus,
  onDeleteComplaint,
  showToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Attachment Modal Preview
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name: string;
    type?: string;
  } | null>(null);

  // Status updating state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    soundManager.playPop();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedId(text);
      showToast(`${label} copied to clipboard!`, 'success');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      showToast(`Failed to copy`, 'error');
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    soundManager.playPop();
    setUpdatingId(id);
    try {
      await onUpdateStatus(id, newStatus);
      showToast(`Complaint status updated to ${newStatus.replace('_', ' ')}`, 'success');
    } catch {
      showToast('Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string, schoolName: string) => {
    if (!window.confirm(`Are you sure you want to delete the complaint from "${schoolName}"?`)) {
      return;
    }
    soundManager.playPop();
    setDeletingId(id);
    try {
      await onDeleteComplaint(id);
      showToast('Complaint removed successfully', 'info');
    } catch {
      showToast('Failed to delete complaint', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEmailReply = (cmp: SchoolComplaint) => {
    soundManager.playPop();
    const subject = encodeURIComponent(`Regarding your Playroom Complaint: ${cmp.subject} [Ref: ${cmp.id}]`);
    const body = encodeURIComponent(
      `Dear ${cmp.contactName || 'Educator'},\n\nThank you for reaching out regarding "${cmp.subject}" for ${cmp.schoolName}.\n\n` +
      `We have reviewed your complaint:\n"${cmp.complaintText}"\n\n` +
      `[Type your answer / resolution steps here...]\n\n` +
      `Best regards,\nAdministrator Support Team\nPlayroom App`
    );
    window.location.href = `mailto:${cmp.contactEmail}?subject=${subject}&body=${body}`;
  };

  const filtered = complaints.filter((c) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (c.schoolName || '').toLowerCase().includes(term) ||
      (c.contactName || '').toLowerCase().includes(term) ||
      (c.contactEmail || '').toLowerCase().includes(term) ||
      (c.subject || '').toLowerCase().includes(term) ||
      (c.complaintText || '').toLowerCase().includes(term) ||
      (c.id || '').toLowerCase().includes(term);

    const matchesStatus =
      statusFilter === 'ALL' || (c.status || 'OPEN').toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const openCount = complaints.filter((c) => (c.status || 'OPEN').toUpperCase() === 'OPEN').length;
  const inProgressCount = complaints.filter((c) => (c.status || '').toUpperCase() === 'IN_PROGRESS').length;
  const resolvedCount = complaints.filter((c) => (c.status || '').toUpperCase() === 'RESOLVED').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                School Complaints & Issues
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Received complaints, bug reports, and screenshots from preschool educator partners. Click "Reply via Email" to respond directly.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              {openCount} Open Issues
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by school, email, subject, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 placeholder:text-slate-400 font-medium"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600 overflow-x-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 font-bold shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              All ({complaints.length})
            </button>
            <button
              onClick={() => setStatusFilter('OPEN')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'OPEN'
                  ? 'bg-rose-500 text-white font-bold shadow-xs'
                  : 'hover:text-rose-600'
              }`}
            >
              Open ({openCount})
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'hover:text-blue-600'
              }`}
            >
              In Progress ({inProgressCount})
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'hover:text-emerald-600'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Complaints List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className="text-base font-bold text-slate-800">No Complaints Found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchTerm
              ? 'No complaints match your search query.'
              : 'All partner school inquiries and bug reports are currently clear!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((cmp) => {
            const isResolved = cmp.status === 'RESOLVED';
            const isInProgress = cmp.status === 'IN_PROGRESS';
            const isUpdating = updatingId === cmp.id;
            const isDeleting = deletingId === cmp.id;

            return (
              <div
                key={cmp.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs space-y-4 ${
                  isResolved
                    ? 'border-emerald-200/80 bg-emerald-50/20'
                    : isInProgress
                    ? 'border-blue-200 bg-blue-50/20'
                    : 'border-rose-200/90 hover:border-rose-300'
                }`}
              >
                {/* Top Row: School Info, Status & Delete */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        isResolved
                          ? 'bg-emerald-100 text-emerald-700'
                          : isInProgress
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      <Building className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{cmp.schoolName}</h3>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {cmp.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{cmp.contactName}</span>
                        <span className="text-slate-300">•</span>
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(cmp.submittedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Status Badges & Delete */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        isResolved
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : isInProgress
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {cmp.status || 'OPEN'}
                    </span>

                    <button
                      onClick={() => handleDelete(cmp.id, cmp.schoolName)}
                      disabled={isDeleting}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Complaint"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Complaint Category & Subject */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded-md">
                      {(cmp.category || 'Issue').replace('_', ' ')}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">{cmp.subject}</h4>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                    {cmp.complaintText}
                  </div>
                </div>

                {/* Screenshot / File Attachment Box (if present) */}
                {cmp.attachmentDataUrl && (
                  <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {cmp.attachmentType?.startsWith('image/') || cmp.attachmentDataUrl.startsWith('data:image') ? (
                        <div
                          onClick={() =>
                            setPreviewAttachment({
                              url: cmp.attachmentDataUrl!,
                              name: cmp.attachmentName || 'Screenshot',
                              type: cmp.attachmentType,
                            })
                          }
                          className="relative group cursor-pointer shrink-0"
                        >
                          <img
                            src={cmp.attachmentDataUrl}
                            alt="Screenshot"
                            className="w-16 h-16 object-cover rounded-lg border border-slate-300 bg-white"
                          />
                          <div className="absolute inset-0 bg-slate-900/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-5 h-5" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-indigo-600" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {cmp.attachmentName || 'Attached Screenshot'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {cmp.attachmentSize || 'Image Attachment'}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewAttachment({
                              url: cmp.attachmentDataUrl!,
                              name: cmp.attachmentName || 'Screenshot',
                              type: cmp.attachmentType,
                            })
                          }
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-0.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Full Screenshot</span>
                        </button>
                      </div>
                    </div>

                    <a
                      href={cmp.attachmentDataUrl}
                      download={cmp.attachmentName || 'screenshot.png'}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-2xs transition-colors shrink-0"
                    >
                      Download
                    </a>
                  </div>
                )}

                {/* Footer Controls: Contact Info, Reply via Email, and Status Toggles */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                  {/* Contact Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(cmp.contactEmail, 'Email')}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors cursor-pointer"
                      title="Click to copy email"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>{cmp.contactEmail}</span>
                      {copiedId === cmp.contactEmail ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>

                    {cmp.phoneNumber && (
                      <a
                        href={`https://wa.me/${cmp.phoneNumber.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{cmp.phoneNumber}</span>
                      </a>
                    )}
                  </div>

                  {/* Actions: Direct Email Reply & Status Selector */}
                  <div className="flex items-center gap-2">
                    {/* Primary Reply Button */}
                    <button
                      onClick={() => handleEmailReply(cmp)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Reply via Email</span>
                    </button>

                    {/* Status Toggle Dropdown / Buttons */}
                    {!isResolved ? (
                      <button
                        onClick={() => handleStatusChange(cmp.id, 'RESOLVED')}
                        disabled={isUpdating}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Resolved</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(cmp.id, 'OPEN')}
                        disabled={isUpdating}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Attachment Fullscreen Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs">
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700">
              <span className="font-bold text-sm truncate">{previewAttachment.name}</span>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/40 overflow-auto flex-1">
              <img
                src={previewAttachment.url}
                alt="Full attachment preview"
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
