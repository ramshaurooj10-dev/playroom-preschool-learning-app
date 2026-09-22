import React, { useState } from 'react';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  Mail,
  Phone,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { SchoolRenewalRequest } from '../../types/payment';

interface AdminRenewalRequestsProps {
  renewalRequests: SchoolRenewalRequest[];
  onApproveRenewal: (req: SchoolRenewalRequest) => Promise<void>;
  onRejectRenewal: (req: SchoolRenewalRequest) => Promise<void>;
  copyToClipboard: (text: string, label?: string) => void;
  copiedText: string | null;
}

export const AdminRenewalRequests: React.FC<AdminRenewalRequestsProps> = ({
  renewalRequests,
  onApproveRenewal,
  onRejectRenewal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const filteredRequests = renewalRequests.filter((req) => {
    const matchesSearch =
      req.schoolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.licenseKey.toLowerCase().includes(searchTerm.toLowerCase());

    const reqStatus = (req.status || 'PENDING').toUpperCase();
    const matchesStatus = statusFilter === 'ALL' || reqStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (req: SchoolRenewalRequest) => {
    if (processingId) return;
    setProcessingId(req.id);
    try {
      await onApproveRenewal(req);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: SchoolRenewalRequest) => {
    if (processingId) return;
    setProcessingId(req.id);
    try {
      await onRejectRenewal(req);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Renewal Requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review 30-day extension and renewal requests submitted by partner schools.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by school or key..."
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
        </div>
      </div>

      {/* Renewals Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RotateCcw className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No renewal requests found</p>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm ? 'Try adjusting your search criteria.' : 'Extension requests submitted by schools will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-4">School & Key</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Previous Expiry</th>
                  <th className="py-3.5 px-4">Request Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredRequests.map((req) => {
                  const isProcessing = processingId === req.id;
                  const reqStatus = (req.status || 'PENDING').toUpperCase();

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{req.schoolName}</div>
                        <div className="font-mono text-[11px] text-indigo-600 font-semibold mt-0.5">
                          {req.licenseKey}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-600">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {req.contactEmail}
                        </div>
                        {req.phoneNumber && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {req.phoneNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {req.previousExpiryDate
                          ? new Date(req.previousExpiryDate).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-4 px-4 text-slate-600 whitespace-nowrap">
                        {new Date(req.requestedAt || Date.now()).toLocaleDateString(undefined, {
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
                      <td className="py-4 px-4 text-right">
                        {reqStatus === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReject(req)}
                              disabled={isProcessing}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg border border-rose-200 transition-colors disabled:opacity-50 text-xs"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleApprove(req)}
                              disabled={isProcessing}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 text-xs"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              Approve Renewal
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic font-medium">Processed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
