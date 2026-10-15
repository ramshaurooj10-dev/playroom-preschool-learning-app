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
import { SchoolLicense, SchoolRenewalRequest } from '../../types/payment';
import { soundManager } from '../../utils/audio';
import {
  resolveExpiryDeadline,
  calculateDurationDaysBetween,
  computeExpiryDateFromDuration,
} from '../../utils/licenseService';

interface AdminRegisteredSchoolsProps {
  registeredSchools: SchoolLicense[];
  renewalRequests?: SchoolRenewalRequest[];
  onGenerateKeyForSchool: (
    school: SchoolLicense,
    customKey?: string,
    options?: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => Promise<void>;
  onSaveLicenseConfig?: (
    school: SchoolLicense,
    options: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => Promise<void>;
  onRenewLicense: (school: SchoolLicense) => Promise<void>;
  onRevokeAccess: (school: SchoolLicense) => Promise<void>;
  onDeleteSchool: (school: SchoolLicense) => Promise<void>;
  onDeleteMultipleSchools?: (schools: SchoolLicense[]) => Promise<void>;
  onOpenAddSchoolModal: () => void;
  copyToClipboard: (text: string, label?: string) => void;
  copiedText: string | null;
}

interface SchoolCardItemProps {
  school: SchoolLicense;
  details: {
    badgeText: string;
    badgeClass: string;
    isRevoked: boolean;
    isActive: boolean;
    isPending: boolean;
    isExpired: boolean;
    daysRemaining: number;
  };
  isSelected: boolean;
  isProcessing: boolean;
  copiedText: string | null;
  onToggleSelect: (id: string) => void;
  onGenerateKey: (
    school: SchoolLicense,
    options?: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => Promise<void>;
  onOpenCustomKeyModal: (school: SchoolLicense) => void;
  onSaveLicenseConfig?: (
    school: SchoolLicense,
    options: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => Promise<void>;
  onDeleteSchool: (school: SchoolLicense) => void;
  copyToClipboard: (text: string, label?: string) => void;
}

const SchoolCardItem: React.FC<SchoolCardItemProps> = ({
  school,
  details,
  isSelected,
  isProcessing,
  copiedText,
  onToggleSelect,
  onGenerateKey,
  onOpenCustomKeyModal,
  onSaveLicenseConfig,
  onDeleteSchool,
  copyToClipboard,
}) => {
  const hasKey = Boolean(school.licenseKey && school.licenseKey.trim());
  const todayStr = new Date().toISOString().split('T')[0];

  const toDateInputStr = (val?: string | null): string => {
    if (!val) return '';
    try {
      if (val.includes('T')) {
        const d = new Date(val);
        if (isNaN(d.getTime())) return '';
        if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
          const prev = new Date(d.getTime() - 1000);
          return prev.toISOString().split('T')[0];
        }
        return d.toISOString().split('T')[0];
      }
      return val.split('T')[0];
    } catch {
      return '';
    }
  };

  const initialStart =
    toDateInputStr(school.configuredStartDate) ||
    toDateInputStr(school.startDate) ||
    toDateInputStr(school.validFrom) ||
    todayStr;
  const initialDuration = Number(school.configuredDurationDays || school.durationDays) || 21;
  const initialExpiry =
    toDateInputStr(school.configuredExpiryDate) ||
    toDateInputStr(school.expiryDate) ||
    toDateInputStr(school.validUntil) ||
    computeExpiryDateFromDuration(initialStart, initialDuration);

  const [startDate, setStartDate] = useState<string>(initialStart);
  const [durationDays, setDurationDays] = useState<number>(initialDuration);
  const [expiryDate, setExpiryDate] = useState<string>(initialExpiry);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    const s =
      toDateInputStr(school.configuredStartDate) ||
      toDateInputStr(school.startDate) ||
      toDateInputStr(school.validFrom) ||
      todayStr;
    const dur = Number(school.configuredDurationDays || school.durationDays) || 21;
    const exp =
      toDateInputStr(school.configuredExpiryDate) ||
      toDateInputStr(school.expiryDate) ||
      toDateInputStr(school.validUntil) ||
      computeExpiryDateFromDuration(s, dur);
    setStartDate(s);
    setDurationDays(dur);
    setExpiryDate(exp);
  }, [
    school.configuredStartDate,
    school.configuredExpiryDate,
    school.configuredDurationDays,
    school.startDate,
    school.expiryDate,
    school.validUntil,
    school.durationDays,
  ]);

  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (newStart && durationDays > 0) {
      const newExp = computeExpiryDateFromDuration(newStart, durationDays);
      setExpiryDate(newExp);
    }
    setSavedSuccess(false);
  };

  const handleDurationChange = (newDays: number) => {
    const validDays = Math.max(1, newDays || 1);
    setDurationDays(validDays);
    if (startDate) {
      const newExp = computeExpiryDateFromDuration(startDate, validDays);
      setExpiryDate(newExp);
    }
    setSavedSuccess(false);
  };

  const handleExpiryDateChange = (newExp: string) => {
    setExpiryDate(newExp);
    if (startDate && newExp) {
      const calculatedDays = calculateDurationDaysBetween(startDate, newExp);
      setDurationDays(calculatedDays);
    }
    setSavedSuccess(false);
  };

  const handleSaveConfig = async () => {
    if (!onSaveLicenseConfig) return;
    setIsSaving(true);
    try {
      const resolvedExpiry = resolveExpiryDeadline(expiryDate);
      await onSaveLicenseConfig(school, {
        startDate,
        durationDays,
        expiryDate: resolvedExpiry,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateClick = async () => {
    const resolvedExpiry = resolveExpiryDeadline(expiryDate);
    await onGenerateKey(school, {
      startDate,
      durationDays,
      expiryDate: resolvedExpiry,
    });
  };

  const quickDurationPresets = [7, 14, 21, 30, 60, 90];

  return (
    <div
      className={`bg-white rounded-2xl border shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between relative ${
        isSelected
          ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/15'
          : 'border-slate-200/80'
      }`}
    >
      <div>
        {/* School Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(school.id)}
              className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
              aria-label={`Select ${school.schoolName}`}
            />
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

        {/* License Key Box */}
        <div className="pt-3 pb-1">
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
                    onClick={handleGenerateClick}
                    disabled={isProcessing}
                    title="Regenerate key using current configured dates"
                    className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-amber-50 cursor-pointer"
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
                    onClick={() => onOpenCustomKeyModal(school)}
                    disabled={isProcessing}
                    title="Set or customize license key manually"
                    className="text-slate-600 hover:text-slate-800 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-slate-100 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3 text-slate-500" />
                    <span>Edit</span>
                  </button>
                  <button
                    id={`copy-key-btn-${school.id}`}
                    onClick={() => copyToClipboard(school.licenseKey!, `License for ${school.schoolName}`)}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-indigo-50 cursor-pointer"
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
                    onClick={handleGenerateClick}
                    disabled={isProcessing}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate
                  </button>
                  <button
                    onClick={() => onOpenCustomKeyModal(school)}
                    disabled={isProcessing}
                    className="text-slate-600 hover:text-slate-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
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
        </div>

        {/* ========================================================================= */}
        {/* LICENSE START DATE, LICENSE DURATION, AND EXPIRY DATE SECTION             */}
        {/* ========================================================================= */}
        <div className="mt-3 p-3.5 bg-indigo-50/40 border border-indigo-200/80 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-2">
            <span className="text-[11px] font-black text-indigo-950 uppercase tracking-tight flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>License Period & Time Limit</span>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${details.badgeClass}`}>
              {details.badgeText}
            </span>
          </div>

          {/* Date Pickers & Duration Input */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Start Date */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                disabled={isSaving || isProcessing}
                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
              />
            </div>

            {/* Duration */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                <span>Duration</span>
                <span className="text-indigo-600 font-extrabold">{durationDays}d</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="1825"
                  value={durationDays}
                  onChange={(e) => handleDurationChange(parseInt(e.target.value, 10))}
                  disabled={isSaving || isProcessing}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-center"
                />
                <span className="text-[10px] text-slate-500 font-bold pr-0.5">Days</span>
              </div>
            </div>

            {/* Expiry Date */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Expiry Date
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => handleExpiryDateChange(e.target.value)}
                disabled={isSaving || isProcessing}
                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
              />
            </div>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span className="text-[10px] font-bold text-slate-500 mr-1">Presets:</span>
            {quickDurationPresets.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handleDurationChange(days)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  durationDays === days
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white hover:bg-indigo-100 text-slate-700 border border-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          {/* Save Period Button & Clarification */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-indigo-100/80">
            <span className="text-[10px] text-slate-500">
              {savedSuccess ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                  Period saved!
                </span>
              ) : (
                'Deadline: 12:00 AM after chosen date'
              )}
            </span>
            {onSaveLicenseConfig && (
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving || isProcessing}
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>Save Period</span>
              </button>
            )}
          </div>

          {/* Status & Timing Banner */}
          {details.isPending && (
            <div className="p-2 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-950 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-900">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Not Activated — Countdown has NOT started</span>
              </div>
              <p className="text-[10px] text-amber-800 font-semibold mt-0.5 leading-snug">
                Countdown of {durationDays} days begins automatically only when school enters key.
              </p>
            </div>
          )}

          {details.isActive && (
            <div className="p-2 bg-emerald-50/90 border border-emerald-200 rounded-xl text-emerald-950 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-[11px] text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                  <span>Active — Countdown In Progress</span>
                </span>
                <span className="px-1.5 py-0.2 bg-emerald-200/70 text-emerald-900 rounded font-black text-[10px]">
                  {details.daysRemaining} {details.daysRemaining === 1 ? 'day' : 'days'} left
                </span>
              </div>
              <div className="text-[10px] text-emerald-800 font-semibold space-y-0.5">
                <div>
                  Activated:{' '}
                  <strong className="text-emerald-950">
                    {school.activatedAt || school.startDate || school.validFrom
                      ? new Date(school.activatedAt || school.startDate || school.validFrom!).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'N/A'}
                  </strong>
                </div>
                <div>
                  Expires:{' '}
                  <strong className="text-emerald-950">
                    {school.validUntil || school.expiryDate
                      ? new Date(school.validUntil || school.expiryDate!).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {details.isExpired && (
            <div className="p-2 bg-rose-50/90 border border-rose-200 rounded-xl text-rose-950 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-rose-900">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Expired — App Protected Access Locked</span>
              </div>
              <p className="text-[10px] text-rose-800 font-bold leading-snug">
                Your school license has expired. Please contact the administrator to renew your access.
              </p>
            </div>
          )}

          {details.isRevoked && (
            <div className="p-2 bg-slate-100 border border-slate-300 rounded-xl text-slate-800 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-800">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Locked — School access revoked</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2 mt-3">
        {!hasKey ? (
          <button
            id={`generate-key-btn-${school.id}`}
            onClick={handleGenerateClick}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            <span>Generate License Key ({durationDays}d)</span>
          </button>
        ) : (
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              onClick={() => onDeleteSchool(school)}
              disabled={isProcessing}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 rounded-xl border border-rose-200 hover:border-rose-600 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              title="Delete school record completely"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete School</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminRegisteredSchools: React.FC<AdminRegisteredSchoolsProps> = ({
  registeredSchools,
  renewalRequests = [],
  onGenerateKeyForSchool,
  onSaveLicenseConfig,
  onRenewLicense,
  onRevokeAccess,
  onDeleteSchool,
  onDeleteMultipleSchools,
  onOpenAddSchoolModal,
  copyToClipboard,
  copiedText,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'REVOKED'>('ALL');
  const [schoolToDelete, setSchoolToDelete] = useState<SchoolLicense | null>(null);
  const [customKeySchool, setCustomKeySchool] = useState<SchoolLicense | null>(null);
  const [customKeyValue, setCustomKeyValue] = useState('');
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  // Multi-select state
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);

  const now = new Date().getTime();

  // Helper to compute status and days remaining
  const getLicenseDetails = (school: SchoolLicense) => {
    const rawStatus = (school.status || 'PENDING').toUpperCase();

    if (rawStatus === 'REVOKED') {
      return {
        badgeText: 'Locked',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-black',
        isRevoked: true,
        isActive: false,
        isPending: false,
        isExpired: false,
        daysRemaining: 0,
      };
    }

    if (rawStatus === 'EXPIRED') {
      return {
        badgeText: 'Expired',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
        isRevoked: false,
        isActive: false,
        isPending: false,
        isExpired: true,
        daysRemaining: 0,
      };
    }

    const expStr = school.validUntil || school.expiryDate;

    if (rawStatus === 'ACTIVE') {
      if (expStr) {
        const expTime = new Date(expStr).getTime();
        const diffDays = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          return {
            badgeText: 'Expired',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
            isRevoked: false,
            isActive: false,
            isPending: false,
            isExpired: true,
            daysRemaining: 0,
          };
        }

        return {
          badgeText: 'Active',
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
        badgeText: 'Active',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
        isRevoked: false,
        isActive: true,
        isPending: false,
        isExpired: false,
        daysRemaining: 30,
      };
    }

    return {
      badgeText: 'Not Activated',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
      isRevoked: false,
      isActive: false,
      isPending: true,
      isExpired: false,
      daysRemaining: school.configuredDurationDays || school.durationDays || 30,
    };
  };

  const counts = {
    ALL: registeredSchools.length,
    ACTIVE: registeredSchools.filter((s) => getLicenseDetails(s).isActive).length,
    PENDING: registeredSchools.filter((s) => getLicenseDetails(s).isPending).length,
    EXPIRED: registeredSchools.filter((s) => getLicenseDetails(s).isExpired).length,
    REVOKED: registeredSchools.filter((s) => getLicenseDetails(s).isRevoked).length,
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

  const handleGenerateKey = async (
    school: SchoolLicense,
    options?: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => {
    if (isProcessingId) return;
    setIsProcessingId(school.id);
    try {
      await onGenerateKeyForSchool(school, undefined, options);
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

  const handleConfirmDelete = async () => {
    if (!schoolToDelete || isProcessingId) return;
    setIsProcessingId(schoolToDelete.id);
    try {
      await onDeleteSchool(schoolToDelete);
      setSelectedSchoolIds((prev) => prev.filter((id) => id !== schoolToDelete.id));
      setSchoolToDelete(null);
    } finally {
      setIsProcessingId(null);
    }
  };

  // Multi-Select Handlers
  const handleToggleSelectSchool = (schoolId: string) => {
    soundManager.playPop();
    setSelectedSchoolIds((prev) =>
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : [...prev, schoolId]
    );
  };

  const handleSelectAll = () => {
    soundManager.playPop();
    if (selectedSchoolIds.length === filteredSchools.length && filteredSchools.length > 0) {
      setSelectedSchoolIds([]);
    } else {
      setSelectedSchoolIds(filteredSchools.map((s) => s.id));
    }
  };

  const handleConfirmMultiDelete = async () => {
    if (selectedSchoolIds.length === 0 || isDeletingMultiple) return;
    setIsDeletingMultiple(true);
    soundManager.playPop();
    const selectedObjects = registeredSchools.filter((s) => selectedSchoolIds.includes(s.id));
    try {
      if (onDeleteMultipleSchools) {
        await onDeleteMultipleSchools(selectedObjects);
      } else {
        for (const s of selectedObjects) {
          await onDeleteSchool(s);
        }
      }
      setSelectedSchoolIds([]);
      setShowMultiDeleteModal(false);
    } finally {
      setIsDeletingMultiple(false);
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
              Manage partner institutions, review licenses, monitor 1-calendar-month access, and manage school records.
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

        {/* Bottom row: Search, Filter Tabs & Select All */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Search & Select All */}
          <div className="flex items-center gap-3 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search schools, keys, emails, cities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* Select All Checkbox */}
            {filteredSchools.length > 0 && (
              <label
                className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold cursor-pointer transition-colors whitespace-nowrap select-none ${
                  selectedSchoolIds.length > 0
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
                title="Select or deselect all visible schools"
              >
                <input
                  type="checkbox"
                  checked={selectedSchoolIds.length > 0 && selectedSchoolIds.length === filteredSchools.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span>
                  {selectedSchoolIds.length > 0 && selectedSchoolIds.length === filteredSchools.length
                    ? 'All Selected'
                    : `Select All (${filteredSchools.length})`}
                </span>
              </label>
            )}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600 overflow-x-auto">
            {(['ALL', 'ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED'] as const).map((f) => {
              const count = counts[f] || 0;
              const label = f === 'PENDING' ? 'Not Activated' : f === 'REVOKED' ? 'Locked' : f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase();
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === f
                      ? f === 'ACTIVE'
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : f === 'PENDING'
                        ? 'bg-amber-500 text-white font-bold shadow-xs'
                        : f === 'EXPIRED'
                        ? 'bg-rose-600 text-white font-bold shadow-xs'
                        : 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      statusFilter === f
                        ? 'bg-black/20 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multi-Select Floating / Sticky Top Action Bar */}
      {selectedSchoolIds.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl shadow-xl border-2 border-indigo-500 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-500/30 text-indigo-300 font-black text-sm flex items-center justify-center border border-indigo-400/40">
              {selectedSchoolIds.length}
            </span>
            <div>
              <div className="text-sm font-bold text-white">
                {selectedSchoolIds.length} {selectedSchoolIds.length === 1 ? 'School Selected' : 'Schools Selected'}
              </div>
              <div className="text-xs text-indigo-200">
                You can delete all selected school records and licenses in 1-click.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedSchoolIds([])}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setShowMultiDeleteModal(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedSchoolIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Schools Cards List */}
      {filteredSchools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
          <Building2 className="w-14 h-14 mb-3 text-slate-300" />
          <p className="text-base font-bold text-slate-800">
            {statusFilter === 'PENDING' && counts.ACTIVE > 0
              ? 'No schools waiting for activation!'
              : 'No registered schools found'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchTerm ? (
              'No schools match your search query. Try clearing the filter.'
            ) : statusFilter === 'PENDING' && counts.ACTIVE > 0 ? (
              `Great news! All registered schools have entered their license keys and are currently ACTIVE (${counts.ACTIVE} Active).`
            ) : (
              'Add schools manually or approve incoming partner requests.'
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => setStatusFilter('ALL')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                View All Schools ({counts.ALL})
              </button>
            )}
            {statusFilter !== 'ACTIVE' && counts.ACTIVE > 0 && (
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                View Active Schools ({counts.ACTIVE})
              </button>
            )}
            <button
              onClick={onOpenAddSchoolModal}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add New School
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSchools.map((school) => {
            const details = getLicenseDetails(school);
            const isProcessing = isProcessingId === school.id;
            const isSelected = selectedSchoolIds.includes(school.id);

            return (
              <SchoolCardItem
                key={school.id || school.licenseKey}
                school={school}
                details={details}
                isSelected={isSelected}
                isProcessing={isProcessing}
                copiedText={copiedText}
                onToggleSelect={handleToggleSelectSchool}
                onGenerateKey={handleGenerateKey}
                onOpenCustomKeyModal={handleOpenCustomKeyModal}
                onSaveLicenseConfig={onSaveLicenseConfig}
                onDeleteSchool={setSchoolToDelete}
                copyToClipboard={copyToClipboard}
              />
            );
          })}
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

      {/* Multi-Delete Confirmation Dialog */}
      {showMultiDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Delete {selectedSchoolIds.length} Selected Schools?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 font-semibold">{selectedSchoolIds.length} selected schools</strong> and all their associated license keys?
            </p>
            <p className="text-xs text-rose-800 font-medium mt-2 bg-rose-50 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
              ⚠️ This action cannot be undone. All license records, institution accounts, and access permissions for the selected schools will be removed from the database.
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
                <span>Delete {selectedSchoolIds.length} Schools</span>
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

