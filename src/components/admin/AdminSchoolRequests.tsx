import React, { useState } from 'react';
import {
  Inbox,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  X,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Copy,
  Check,
  FileText,
  Sparkles,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { SchoolPaymentRequest } from '../../types/payment';

interface AdminSchoolRequestsProps {
  pendingRequests: SchoolPaymentRequest[];
  onApproveRequest: (req: SchoolPaymentRequest) => Promise<void>;
  onRejectRequest: (req: SchoolPaymentRequest) => Promise<void>;
  onDeleteRequest: (req: SchoolPaymentRequest) => Promise<void>;
  onDeleteAllRequests?: () => Promise<void>;
  selectedRequest: SchoolPaymentRequest | null;
  onSelectRequest: (req: SchoolPaymentRequest | null) => void;
  copyToClipboard: (text: string, label?: string) => void;
  copiedText: string | null;
}

export const AdminSchoolRequests: React.FC<AdminSchoolRequestsProps> = ({
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
  onDeleteRequest,
  onDeleteAllRequests,
  selectedRequest,
  onSelectRequest,
  copyToClipboard,
  copiedText,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<SchoolPaymentRequest | null>(null);

  // Filter requests
  const filteredRequests = pendingRequests.filter((req) => {
    const matchesSearch =
      (req.schoolName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.schoolAdminName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.contactEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.country || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.schoolMessage || req.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

    const reqStatus = (req.status || 'PENDING').toUpperCase();
    const matchesStatus = statusFilter === 'ALL' || reqStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleApprove = async () => {
    if (!selectedRequest || isApproving || isRejecting || isDeleting) return;
    setIsApproving(true);
    try {
      await onApproveRequest(selectedRequest);
      onSelectRequest(null);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || isApproving || isRejecting || isDeleting) return;
    setIsRejecting(true);
    try {
      await onRejectRequest(selectedRequest);
      onSelectRequest(null);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!requestToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteRequest(requestToDelete);
      if (selectedRequest && selectedRequest.id === requestToDelete.id) {
        onSelectRequest(null);
      }
      setRequestToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllRequests || isDeletingAll) return;
    setIsDeletingAll(true);
    try {
      await onDeleteAllRequests();
      onSelectRequest(null);
      setShowDeleteAllModal(false);
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Filter Controls */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">School Requests</h2>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {pendingRequests.length} total
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review inbound inquiries, approve schools, and generate verified licenses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by school, contact, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg transition-colors capitalize ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                {st.toLowerCase()}
              </button>
            ))}
          </div>

          {/* Delete All Requests Button */}
          {pendingRequests.length > 0 && onDeleteAllRequests && (
            <button
              id="admin-delete-all-requests-btn"
              onClick={() => setShowDeleteAllModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors shrink-0 cursor-pointer shadow-2xs"
              title="Delete all school inquiries"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete All</span>
            </button>
          )}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No school inquiries found</p>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm ? 'Try adjusting your search or filter.' : 'Inquiries submitted by schools will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-4">School Name</th>
                  <th className="py-3.5 px-4">Contact Person</th>
                  <th className="py-3.5 px-4">Country & City</th>
                  <th className="py-3.5 px-4">Submitted Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredRequests.map((req) => {
                  const reqStatus = (req.status || 'PENDING').toUpperCase();
                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                      onClick={() => onSelectRequest(req)}
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{req.schoolName}</div>
                        <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {req.contactEmail}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-medium text-slate-800">
                          {req.contactName || req.schoolAdminName || 'School Administrator'}
                        </div>
                        {(req.contactPhone || req.phoneNumber) && (
                          <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {req.contactPhone || req.phoneNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-600">
                        <div className="flex items-center gap-1 font-medium">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {req.country || 'Pakistan'}
                        </div>
                        <div className="text-slate-500 text-[11px]">{req.city || 'Karachi'}</div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {new Date(req.submittedAt || Date.now()).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            reqStatus === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : reqStatus === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {reqStatus}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectRequest(req)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs"
                            title="View inquiry details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => setRequestToDelete(req)}
                            className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-colors"
                            title="Delete this request permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inquiry Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-base text-white">{selectedRequest.schoolName}</h3>
                  <p className="text-xs text-slate-300">School Inquiry & Licensing Details</p>
                </div>
              </div>
              <button
                onClick={() => onSelectRequest(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Inquiry Status
                  </span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {(selectedRequest.status || 'PENDING').toUpperCase()}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Submission Date
                  </span>
                  <div className="text-xs font-medium text-slate-700 mt-0.5">
                    {new Date(selectedRequest.submittedAt || Date.now()).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Contact Person / Administrator
                  </span>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    {selectedRequest.contactName || selectedRequest.schoolAdminName || 'Administrator'}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Contact Email
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {selectedRequest.contactEmail}
                    </p>
                    <button
                      onClick={() => copyToClipboard(selectedRequest.contactEmail, 'Email')}
                      className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Copy email"
                    >
                      {copiedText === selectedRequest.contactEmail ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Phone / WhatsApp Number
                  </span>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    {selectedRequest.contactPhone || selectedRequest.phoneNumber || 'Not provided'}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Location (Country & City)
                  </span>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    {selectedRequest.country || 'Pakistan'} • {selectedRequest.city || 'Karachi'}
                  </p>
                </div>
              </div>

              {/* Message / Requirements */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  School Message & Requirements
                </span>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedRequest.message ||
                    (selectedRequest as any).schoolMessage ||
                    'No additional notes provided in this inquiry.'}
                </p>
              </div>

              {/* Admin Note regarding activation */}
              <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">30-Day Activation Policy</p>
                  <p className="text-indigo-700 text-[11px] mt-0.5">
                    Approving this school registers the institution and generates a verified license key.
                    The 30-day access countdown begins strictly when the school enters the key on their device.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectRequest(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                  disabled={isApproving || isRejecting || isDeleting}
                >
                  Close
                </button>
                <button
                  onClick={() => setRequestToDelete(selectedRequest)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-xl border border-rose-200 transition-colors"
                  disabled={isApproving || isRejecting || isDeleting}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>

              <div className="flex items-center gap-2">
                {(selectedRequest.status || 'PENDING').toUpperCase() !== 'REJECTED' && (
                  <button
                    id="admin-inquiry-reject-btn"
                    onClick={handleReject}
                    disabled={isApproving || isRejecting || isDeleting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-xl border border-rose-200 transition-colors disabled:opacity-50"
                  >
                    {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Reject
                  </button>
                )}

                {(selectedRequest.status || 'PENDING').toUpperCase() !== 'APPROVED' && (
                  <button
                    id="admin-inquiry-approve-btn"
                    onClick={handleApprove}
                    disabled={isApproving || isRejecting || isDeleting}
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/30 transition-colors disabled:opacity-50"
                  >
                    {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve School
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Request Confirmation Dialog */}
      {requestToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete School Inquiry?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete the inquiry from{' '}
              <strong className="text-slate-900 font-semibold">{requestToDelete.schoolName}</strong>?
            </p>
            <p className="text-xs text-slate-500 mt-1">
              This will remove this record completely from the database and inquiries list.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setRequestToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-request-btn"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Requests Confirmation Dialog */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete All School Inquiries?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete all <strong className="text-slate-900 font-semibold">{pendingRequests.length}</strong> inquiries from the database?
            </p>
            <p className="text-xs text-rose-600 font-medium mt-1">
              This action cannot be undone and will remove all inbound school requests.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={isDeletingAll}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-all-requests-btn"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50"
              >
                {isDeletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete All Inquiries
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

