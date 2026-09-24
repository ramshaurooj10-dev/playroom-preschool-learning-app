import React, { useState } from 'react';
import {
  Building2,
  Search,
  KeyRound,
  Copy,
  Check,
  Calendar,
  Clock,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Plus,
  Mail,
  Phone,
  MapPin,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
  Trash2,
  Edit3,
} from 'lucide-react';
import { SchoolLicense } from '../../types/payment';

interface AdminRegisteredSchoolsProps {
  registeredSchools: SchoolLicense[];
  onGenerateKeyForSchool: (school: SchoolLicense, customKey?: string) => Promise<void>;
  onRenewLicense: (school: SchoolLicense) => Promise<void>;
  onRevokeAccess: (school: SchoolLicense) => Promise<void>;
  onDeleteSchool: (school: SchoolLicense) => Promise<void>;
  onOpenAddSchoolModal: () => void;
  copyToClipboard: (text: string, label?: string) => void;
  copiedText: string | null;
}

export const AdminRegisteredSchools: React.FC<AdminRegisteredSchoolsProps> = ({
  registeredSchools,
  onGenerateKeyForSchool,
  onRenewLicense,
  onRevokeAccess,
  onDeleteSchool,
  onOpenAddSchoolModal,
  copyToClipboard,
  copiedText,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'REVOKED'>('ALL');
  const [schoolToRevoke, setSchoolToRevoke] = useState<SchoolLicense | null>(null);
  const [schoolToDelete, setSchoolToDelete] = useState<SchoolLicense | null>(null);
  const [customKeySchool, setCustomKeySchool] = useState<SchoolLicense | null>(null);
  const [customKeyValue, setCustomKeyValue] = useState('');
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  const now = new Date().getTime();

  // Helper to compute status and days remaining
  const getLicenseDetails = (school: SchoolLicense) => {
    const rawStatus = (school.status || 'PENDING').toUpperCase();

    if (rawStatus === 'REVOKED') {
      return {
        badgeText: 'REVOKED',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        isRevoked: true,
        isActive: false,
        isPending: false,
        isExpired: false,
        daysRemaining: 0,
      };
    }

    const expStr = school.validUntil || school.expiryDate;
    const hasActivation = Boolean(school.startDate || school.validFrom || rawStatus === 'ACTIVE');

    if (hasActivation) {
      if (expStr) {
        const expTime = new Date(expStr).getTime();
        const diffDays = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          return {
            badgeText: 'EXPIRED',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            isRevoked: false,
            isActive: false,
            isPending: false,
            isExpired: true,
            daysRemaining: 0,
          };
        }

        return {
          badgeText: 'ACTIVE',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
          isRevoked: false,
          isActive: true,
          isPending: false,
          isExpired: false,
          daysRemaining: diffDays,
        };
      }

      // If active without explicit expiry date, calculate standard 30-day countdown
      return {
        badgeText: 'ACTIVE',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
        isRevoked: false,
        isActive: true,
        isPending: false,
        isExpired: false,
        daysRemaining: 30,
      };
    }

    return {
      badgeText: 'WAITING ACTIVATION',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      isRevoked: false,
      isActive: false,
      isPending: true,
      isExpired: false,
      daysRemaining: 30,
    };
  };

  // Filter list
  const filteredSchools = registeredSchools.filter((school) => {
    const details = getLicenseDetails(school);

    const matchesSearch =
      school.schoolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (school.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (school.schoolAdminName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (school.contactEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (school.licenseKey || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (school.city || '').toLowerCase().includes(searchTerm.toLowerCase());

    let matchesFilter = true;
    if (statusFilter === 'ACTIVE') matchesFilter = details.isActive;
    else if (statusFilter === 'PENDING') matchesFilter = details.isPending;
    else if (statusFilter === 'EXPIRED') matchesFilter = details.isExpired;
    else if (statusFilter === 'REVOKED') matchesFilter = details.isRevoked;

    return matchesSearch && matchesFilter;
  });

  const handleGenerateKey = async (school: SchoolLicense) => {
    if (isProcessingId) return;
    setIsProcessingId(school.id);
    try {
      await onGenerateKeyForSchool(school);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleOpenCustomKeyModal = (school: SchoolLicense) => {
    setCustomKeySchool(school);
    setCustomKeyValue(school.licenseKey || '');
  };

  const handleSaveCustomKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customKeySchool || isProcessingId) return;
    const cleanKey = customKeyValue.trim().toUpperCase();
    if (!cleanKey) return;
    setIsProcessingId(customKeySchool.id);
    try {
      await onGenerateKeyForSchool(customKeySchool, cleanKey);
      setCustomKeySchool(null);
      setCustomKeyValue('');
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleRenew = async (school: SchoolLicense) => {
    if (isProcessingId) return;
    setIsProcessingId(school.id);
    try {
      await onRenewLicense(school);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!schoolToRevoke || isProcessingId) return;
    setIsProcessingId(schoolToRevoke.id);
    try {
      await onRevokeAccess(schoolToRevoke);
      setSchoolToRevoke(null);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!schoolToDelete || isProcessingId) return;
    setIsProcessingId(schoolToDelete.id);
    try {
      await onDeleteSchool(schoolToDelete);
      setSchoolToDelete(null);
    } finally {
      setIsProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        {/* Top row: Title and Prominent Action Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Registered Schools</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage partner institutions, generate licenses, monitor 30-day access, and renew, revoke, or delete schools.
            </p>
          </div>

          {/* Prominent Add School Button */}
          <button
            id="admin-add-school-btn"
            onClick={onOpenAddSchoolModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add School Manually
          </button>
        </div>

        {/* Bottom row: Search & Filter Tabs */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search schools, keys, emails, cities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600 overflow-x-auto">
            {(['ALL', 'ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg transition-colors capitalize whitespace-nowrap ${
                  statusFilter === f
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                {f === 'PENDING' ? 'Not Activated' : f.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schools Cards List */}
      {filteredSchools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
          <Building2 className="w-14 h-14 mb-3 text-slate-300" />
          <p className="text-base font-bold text-slate-800">No registered schools found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchTerm
              ? 'No schools match your search query. Try clearing the filter.'
              : 'Add schools manually or approve incoming partner requests.'}
          </p>
          <button
            onClick={onOpenAddSchoolModal}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add First School
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSchools.map((school) => {
            const details = getLicenseDetails(school);
            const isProcessing = isProcessingId === school.id;
            const hasKey = Boolean(school.licenseKey && school.licenseKey.trim());

            return (
              <div
                key={school.id || school.licenseKey}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
              >
                {/* School Header */}
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base tracking-tight line-clamp-1">
                        {school.schoolName}
                      </h3>
                      <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>
                          {school.country || 'Pakistan'} • {school.city || 'Karachi'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${details.badgeClass}`}
                    >
                      {details.badgeText}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="py-3.5 space-y-1.5 text-xs text-slate-600 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium w-16">Contact:</span>
                      <span className="font-semibold text-slate-800 truncate">
                        {school.contactName || school.schoolAdminName || 'Administrator'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium w-16">Email:</span>
                      <span className="text-slate-700 truncate font-mono text-[11px]">
                        {school.contactEmail || 'N/A'}
                      </span>
                    </div>
                    {(school.contactPhone || school.phoneNumber) && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium w-16">Phone:</span>
                        <span className="text-slate-700 font-mono text-[11px]">
                          {school.contactPhone || school.phoneNumber}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* License Section */}
                  <div className="py-3.5 space-y-2.5">
                    {/* License Key Box */}
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span className="flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                          License Key
                        </span>
                        {hasKey ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              id={`regenerate-key-btn-${school.id}`}
                              onClick={() => handleGenerateKey(school)}
                              disabled={isProcessing}
                              title="Regenerate a new License Key for this school"
                              className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-amber-50"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>Regenerate</span>
                            </button>
                            <button
                              id={`edit-key-btn-${school.id}`}
                              onClick={() => handleOpenCustomKeyModal(school)}
                              disabled={isProcessing}
                              title="Set or customize license key manually"
                              className="text-slate-600 hover:text-slate-800 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-slate-100"
                            >
                              <Edit3 className="w-3 h-3 text-slate-500" />
                              <span>Edit</span>
                            </button>
                            <button
                              id={`copy-key-btn-${school.id}`}
                              onClick={() => copyToClipboard(school.licenseKey!, `License for ${school.schoolName}`)}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-indigo-50"
                            >
                              {copiedText === school.licenseKey ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              {copiedText === school.licenseKey ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleGenerateKey(school)}
                              disabled={isProcessing}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              Generate
                            </button>
                            <button
                              onClick={() => handleOpenCustomKeyModal(school)}
                              disabled={isProcessing}
                              className="text-slate-600 hover:text-slate-800 font-semibold text-[11px] flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              Set Key
                            </button>
                          </div>
                        )}
                      </div>

                      {hasKey ? (
                        <div className="font-mono text-sm font-bold text-slate-900 tracking-wider select-all">
                          {school.licenseKey}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 italic">No license key generated yet</div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-slate-50/60 border border-slate-100 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Activation Date
                        </span>
                        <span className="font-semibold text-slate-800 mt-0.5 block text-[11px]">
                          {school.startDate || school.validFrom
                            ? new Date(school.startDate || school.validFrom!).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '— (On Entry)'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-50/60 border border-slate-100 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Expiration Date
                        </span>
                        <span className="font-semibold text-slate-800 mt-0.5 block text-[11px]">
                          {school.expiryDate || school.validUntil
                            ? new Date(school.expiryDate || school.validUntil!).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '— (30 Days)'}
                        </span>
                      </div>
                    </div>

                    {/* Days Remaining Banner for Active */}
                    {details.isActive && (
                      <div className="p-2 bg-emerald-50/80 border border-emerald-200/80 rounded-lg text-emerald-800 text-xs font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          Access Remaining
                        </span>
                        <span>{details.daysRemaining} days</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  {!hasKey ? (
                    <button
                      id={`generate-key-btn-${school.id}`}
                      onClick={() => handleGenerateKey(school)}
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      Generate License Key
                    </button>
                  ) : (
                    <>
                      {/* Renew License Button */}
                      {!details.isRevoked && (
                        <button
                          id={`renew-license-btn-${school.id}`}
                          onClick={() => handleRenew(school)}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
                          title="Extend license for 30 days"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Renew
                        </button>
                      )}

                      {/* Revoke Access Button */}
                      {!details.isRevoked ? (
                        <button
                          id={`revoke-access-btn-${school.id}`}
                          onClick={() => setSchoolToRevoke(school)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs rounded-xl border border-amber-200 transition-colors disabled:opacity-50"
                          title="Revoke active school license"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRenew(school)}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          Re-activate
                        </button>
                      )}

                      {/* Delete School Button */}
                      <button
                        onClick={() => setSchoolToDelete(school)}
                        disabled={isProcessing}
                        className="flex items-center justify-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 hover:border-rose-200 transition-colors disabled:opacity-50"
                        title="Delete school record completely"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revoke Access Confirmation Dialog */}
      {schoolToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Revoke School Access?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to revoke access for{' '}
              <strong className="text-slate-900 font-semibold">{schoolToRevoke.schoolName}</strong>?
            </p>
            <p className="text-xs text-amber-800 font-medium mt-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
              This will immediately invalidate license key <span className="font-mono font-bold">{schoolToRevoke.licenseKey}</span> and lock the school&apos;s Education Hub across all devices.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setSchoolToRevoke(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={Boolean(isProcessingId)}
              >
                Cancel
              </button>
              <button
                id="confirm-revoke-access-btn"
                onClick={handleConfirmRevoke}
                disabled={Boolean(isProcessingId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-amber-600/30 transition-colors disabled:opacity-50"
              >
                {isProcessingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete School Confirmation Dialog */}
      {schoolToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete School Record?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 font-semibold">{schoolToDelete.schoolName}</strong>?
            </p>
            <p className="text-xs text-rose-700 font-medium mt-2 bg-rose-50 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
              This will permanently delete this institution and license key <span className="font-mono font-bold">{schoolToDelete.licenseKey}</span> from the database.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setSchoolToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={Boolean(isProcessingId)}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-school-btn"
                onClick={handleConfirmDelete}
                disabled={Boolean(isProcessingId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 transition-colors disabled:opacity-50"
              >
                {isProcessingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Set Custom Key Modal */}
      {customKeySchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Set Custom License Key</h3>
              </div>
              <button
                onClick={() => setCustomKeySchool(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomKey} className="space-y-4 mt-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Assign or customize the license key for{' '}
                <strong className="text-slate-900 font-semibold">{customKeySchool.schoolName}</strong>. This key will be saved directly into the school database and activated when entered.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                  License Key
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SCH-ABCD-1234-EFGH or custom key"
                  value={customKeyValue}
                  onChange={(e) => setCustomKeyValue(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomKeySchool(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  disabled={Boolean(isProcessingId)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(isProcessingId) || !customKeyValue.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/30 transition-colors disabled:opacity-50"
                >
                  {isProcessingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

