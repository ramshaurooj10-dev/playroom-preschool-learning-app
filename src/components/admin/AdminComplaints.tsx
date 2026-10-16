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
  CheckSquare,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { SchoolComplaint } from '../../types/payment';

interface AdminComplaintsProps {
  complaints: SchoolComplaint[];
  onUpdateStatus: (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', adminNotes?: string) => Promise<void>;
  onDeleteComplaint: (id: string) => Promise<void>;
  onDeleteMultipleComplaints?: (ids: string[]) => Promise<void>;
  onDeleteAllComplaints?: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminComplaints: React.FC<AdminComplaintsProps> = ({
  complaints,
  onUpdateStatus,
  onDeleteComplaint,
  onDeleteMultipleComplaints,
  onDeleteAllComplaints,
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

  // Deletion modals state
  const [complaintToDelete, setComplaintToDelete] = useState<SchoolComplaint | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  const [selectedComplaintIds, setSelectedComplaintIds] = useState<string[]>([]);
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);

  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

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

  const handleConfirmSingleDelete = async () => {
    if (!complaintToDelete || isDeletingSingle) return;
    setIsDeletingSingle(true);
    soundManager.playPop();
    try {
      await onDeleteComplaint(complaintToDelete.id);
      setSelectedComplaintIds((prev) => prev.filter((id) => id !== complaintToDelete.id));
      setComplaintToDelete(null);
    } catch {
      // Toast handled in parent
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleConfirmMultiDelete = async () => {
    if (selectedComplaintIds.length === 0 || isDeletingMultiple) return;
    setIsDeletingMultiple(true);
    soundManager.playPop();
    try {
      if (onDeleteMultipleComplaints) {
        await onDeleteMultipleComplaints(selectedComplaintIds);
      } else {
        for (const id of selectedComplaintIds) {
          await onDeleteComplaint(id);
        }
      }
      setSelectedComplaintIds([]);
      setShowMultiDeleteModal(false);
    } catch {
      // Toast handled by parent
    } finally {
      setIsDeletingMultiple(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllComplaints || isDeletingAll) return;
    setIsDeletingAll(true);
    soundManager.playPop();
    try {
      await onDeleteAllComplaints();
      setSelectedComplaintIds([]);
      setShowDeleteAllModal(false);
    } catch {
      // Toast handled by parent or showToast
    } finally {
      setIsDeletingAll(false);
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

  const handleToggleSelectComplaint = (id: string) => {
    soundManager.playPop();
    setSelectedComplaintIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllVisible = () => {
    soundManager.playPop();
    const visibleIds = filtered.map((c) => c.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedComplaintIds.includes(id));
    if (allSelected) {
      setSelectedComplaintIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedComplaintIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const openCount = complaints.filter((c) => (c.status || 'OPEN').toUpperCase() === 'OPEN').length;
  const inProgressCount = complaints.filter((c) => (c.status || '').toUpperCase() === 'IN_PROGRESS').length;
  const resolvedCount = complaints.filter((c) => (c.status || '').toUpperCase() === 'RESOLVED').length;

  const areAllVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selectedComplaintIds.includes(c.id));

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

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              {openCount} Open Issues
            </span>

            {/* Prominent Delete All Button in Top Header */}
            {complaints.length > 0 && onDeleteAllComplaints && (
              <button
                id="admin-delete-all-complaints-btn"
                type="button"
                onClick={() => {
                  soundManager.playPop();
                  setShowDeleteAllModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-300 rounded-xl transition-all shrink-0 cursor-pointer shadow-xs hover:shadow-sm"
                title="Delete all complaints permanently"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Delete All ({complaints.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Search, Select All, and Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2.5 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by school, email, subject, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* Select All Checkbox for Batch Operations */}
            {filtered.length > 0 && (
              <label
                className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold cursor-pointer transition-colors whitespace-nowrap select-none ${
                  selectedComplaintIds.length > 0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
                title="Select or deselect visible complaints"
              >
                <input
                  type="checkbox"
                  checked={areAllVisibleSelected}
                  onChange={handleToggleSelectAllVisible}
                  className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                />
                <span>
                  {areAllVisibleSelected ? 'All Selected' : `Select All (${filtered.length})`}
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* Floating / Sticky Batch Action Bar when Complaints are Selected */}
      {selectedComplaintIds.length > 0 && (
        <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs">
              {selectedComplaintIds.length}
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {selectedComplaintIds.length} complaint{selectedComplaintIds.length > 1 ? 's' : ''} selected
              </div>
              <div className="text-xs text-slate-300">
                You can delete selected complaints or clear selection.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setSelectedComplaintIds([])}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              id="admin-delete-selected-complaints-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                setShowMultiDeleteModal(true);
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedComplaintIds.length})</span>
            </button>
          </div>
        </div>
      )}

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
            const isSelected = selectedComplaintIds.includes(cmp.id);

            return (
              <div
                key={cmp.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs space-y-4 ${
                  isSelected
                    ? 'ring-2 ring-rose-500 border-rose-300 bg-rose-50/10'
                    : isResolved
                    ? 'border-emerald-200/80 bg-emerald-50/20'
                    : isInProgress
                    ? 'border-blue-200 bg-blue-50/20'
                    : 'border-rose-200/90 hover:border-rose-300'
                }`}
              >
                {/* Top Row: Select Checkbox, School Info, Status & Delete */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    {/* Checkbox for Multi-Select */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectComplaint(cmp.id)}
                      className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                      title="Select complaint"
                    />

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

                  {/* Status Badges & Delete Button */}
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
                      onClick={() => {
                        soundManager.playPop();
                        setComplaintToDelete(cmp);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Complaint"
                    >
                      <Trash2 className="w-4 h-4" />
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
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                        {cmp.attachmentType?.startsWith('image/') || cmp.attachmentDataUrl.startsWith('data:image') ? (
                          <img
                            src={cmp.attachmentDataUrl}
                            alt="Attachment preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileText className="w-5 h-5 text-indigo-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {cmp.attachmentName || 'Screenshot / Error Report'}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          <span>Attached by educator</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          setPreviewAttachment({
                            url: cmp.attachmentDataUrl!,
                            name: cmp.attachmentName || 'Attached Screenshot',
                            type: cmp.attachmentType,
                          })
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Preview</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Row: Contact Info & Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => copyToClipboard(cmp.contactEmail, 'Email')}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium transition-colors cursor-pointer"
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

      {/* Delete Single Complaint Confirmation Dialog */}
      {complaintToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete School Complaint?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete the complaint from{' '}
              <strong className="text-slate-900 font-semibold">{complaintToDelete.schoolName}</strong>?
            </p>
            <p className="text-xs text-slate-500 mt-1 italic line-clamp-2">
              "{complaintToDelete.subject}"
            </p>
            <p className="text-xs text-rose-700 font-medium mt-3 bg-rose-50 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
              This will permanently delete this complaint ticket and screenshot from the database.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setComplaintToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                disabled={isDeletingSingle}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-complaint-btn"
                type="button"
                onClick={handleConfirmSingleDelete}
                disabled={isDeletingSingle}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeletingSingle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Delete Confirmation Dialog */}
      {showMultiDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Delete {selectedComplaintIds.length} Selected Complaints?
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 font-semibold">{selectedComplaintIds.length} selected complaints</strong>{' '}
              and all their attached screenshots from the database?
            </p>
            <p className="text-xs text-rose-800 font-medium mt-2 bg-rose-50 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
              This action cannot be undone and will purge these educator records completely.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowMultiDeleteModal(false)}
                disabled={isDeletingMultiple}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-selected-complaints-btn"
                type="button"
                onClick={handleConfirmMultiDelete}
                disabled={isDeletingMultiple}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingMultiple ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete {selectedComplaintIds.length} Complaints</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Complaints Confirmation Dialog */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete All School Complaints?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete all{' '}
              <strong className="text-slate-900 font-semibold">{complaints.length}</strong> complaints, bug reports, and screenshot attachments from the database?
            </p>
            <p className="text-xs text-rose-600 font-medium mt-2 bg-rose-50 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
              This action cannot be undone and will permanently remove all educator complaints and their history.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-all-complaints-btn"
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete All Complaints</span>
              </button>
            </div>
          </div>
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
