import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  School,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  Lock,
  AlertCircle,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Paperclip,
  RefreshCw,
  X,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { UserAccount } from '../PremiumAuthModal';
import { PaymentServiceManager } from '../../services/payment/PaymentServiceManager';
import { SchoolLicense, SchoolRenewalRequest } from '../../types/payment';
import { emitLicenseStateChange, formatExpiryDate } from '../../utils/licenseService';
import { setupLicenseSSEListener, saveSchoolRenewal, checkSchoolLicenseStatusServer } from '../../services/cloudSchoolSync';
import { SchoolComplaintModal } from './SchoolComplaintModal';
import { SchoolRenewalModal } from './SchoolRenewalModal';

interface SchoolAccessGateProps {
  onBackToPlayroom: () => void;
  onSchoolLoginSuccess?: (schoolAccount: UserAccount, activeLicense?: SchoolLicense) => void;
  onOpenInquiry?: () => void;
  revocationNotice?: { isRevoked: boolean; message?: string; schoolName?: string; licenseKey?: string } | null;
  expiredNotice?: { isExpired: boolean; message?: string; schoolName?: string; licenseKey?: string } | null;
}

export const SchoolAccessGate: React.FC<SchoolAccessGateProps> = ({
  onBackToPlayroom,
  onSchoolLoginSuccess,
  onOpenInquiry,
  revocationNotice,
  expiredNotice,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [renewalNotice, setRenewalNotice] = useState<{ isPending: boolean; message: string } | null>(null);
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [activeRevokedNotice, setActiveRevokedNotice] = useState<{
    isRevoked: boolean;
    message?: string;
    schoolName?: string;
    licenseKey?: string;
  } | null>(() => {
    if (revocationNotice) return revocationNotice;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('playroom_revoked_notice');
        if (raw) return JSON.parse(raw);
      } catch (_) {}
    }
    return null;
  });
  const [activeExpiredNotice, setActiveExpiredNotice] = useState<{
    isExpired: boolean;
    message?: string;
    schoolName?: string;
    licenseKey?: string;
  } | null>(() => expiredNotice || null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewToast, setRenewToast] = useState('');
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [isPendingRenewal, setIsPendingRenewal] = useState(false);

  // School request tracking state (Pending, Approved, Rejected)
  const [requestStatus, setRequestStatus] = useState<{
    id: string;
    schoolName: string;
    status: string;
    licenseKey?: string;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('playroom_last_school_request');
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            id: parsed.id,
            schoolName: parsed.schoolName || 'Partner School',
            status: (parsed.status || 'pending').toLowerCase(),
            licenseKey: parsed.schoolLicenseId || parsed.generated_license_key,
          };
        }
      } catch (_) {}
    }
    return null;
  });

  // Poll request status so school can track admin approval without reload
  React.useEffect(() => {
    let reqId = '';
    if (typeof window !== 'undefined') {
      reqId = localStorage.getItem('playroom_school_request_id') || requestStatus?.id || '';
    }
    if (!reqId) return;

    const checkReqStatus = async () => {
      try {
        const res = await fetch(`/api/payment/school-request/status?requestId=${encodeURIComponent(reqId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.request) {
            const req = data.request;
            const updated = {
              id: req.id,
              schoolName: req.schoolName || 'Partner School',
              status: (req.status || 'pending').toLowerCase(),
              licenseKey: req.generated_license_key || req.licenseKey || req.schoolLicenseId,
            };
            setRequestStatus(updated);
            if (typeof window !== 'undefined') {
              localStorage.setItem('playroom_last_school_request', JSON.stringify(req));
            }
          }
        }
      } catch (_) {}
    };

    checkReqStatus();
    const interval = setInterval(checkReqStatus, 2500);
    return () => clearInterval(interval);
  }, [requestStatus?.id]);

  const paymentManager = PaymentServiceManager.getInstance();

  const handleActivationEvent = (actLic: SchoolLicense) => {
    if (!actLic) return;
    setActiveRevokedNotice(null);
    setActiveExpiredNotice(null);
    setIsPendingRenewal(false);
    setRenewToast('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('playroom_revoked_notice');
      if (actLic.licenseKey) {
        localStorage.removeItem(`playroom_pending_renewal_${actLic.licenseKey.trim().toUpperCase()}`);
        localStorage.setItem('playroom_saved_school_key', actLic.licenseKey.trim().toUpperCase());
      }
      localStorage.setItem('playroom_last_school_license', JSON.stringify(actLic));
    }
    const schoolAccount: UserAccount = {
      id: actLic.schoolId || 'school_' + Date.now(),
      email: actLic.contactEmail || 'school_admin@partner.edu',
      isLoggedIn: true,
      role: 'school_admin',
      hasPage1Access: true,
      hasPage2SchoolAccess: true,
      schoolName: actLic.schoolName || 'Authorized School Partner',
      licenseKey: actLic.licenseKey,
    };
    paymentManager.saveActiveSchoolLicense(actLic);
    localStorage.setItem('playroom_user', JSON.stringify(schoolAccount));
    if (onSchoolLoginSuccess) {
      onSchoolLoginSuccess(schoolAccount, actLic);
    }
  };

  // Sync with prop and real-time events
  React.useEffect(() => {
    // Check if there is an active pending renewal request stored locally
    const rawLic = typeof window !== 'undefined' ? localStorage.getItem('playroom_active_school_license') : null;
    let k = '';
    try { if (rawLic) k = JSON.parse(rawLic)?.licenseKey || ''; } catch (_) {}
    const curKey = (activeExpiredNotice?.licenseKey || activeRevokedNotice?.licenseKey || k || licenseKey || '').trim().toUpperCase();
    if (curKey && typeof window !== 'undefined' && localStorage.getItem(`playroom_pending_renewal_${curKey}`)) {
      setIsPendingRenewal(true);
    }
  }, [activeExpiredNotice, activeRevokedNotice, licenseKey]);

  React.useEffect(() => {
    if (revocationNotice) {
      setActiveRevokedNotice(revocationNotice);
      setActiveExpiredNotice(null);
    }
    if (expiredNotice) {
      setActiveExpiredNotice(expiredNotice);
      setActiveRevokedNotice(null);
    }

    const handleCustomEvent = (e: any) => {
      const lic = e?.detail;
      if (lic && (lic.status === 'ACTIVE' || lic.validUntil)) {
        handleActivationEvent(lic);
      }
    };

    window.addEventListener('playroom_license_reactivated', handleCustomEvent);
    window.addEventListener('playroom_license_update', handleCustomEvent);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('playroom_sync_channel');
        bc.onmessage = (event) => {
          if ((event.data?.type === 'ACTIVATION' || event.data?.type === 'REACTIVATION' || event.data?.status === 'ACTIVE') && event.data?.license) {
            handleActivationEvent(event.data.license);
          }
        };
      } catch (_) {}
    }

    const cleanupSSE = setupLicenseSSEListener((event) => {
      if (event?.type === 'REVOCATION') {
        const revNotice = {
          isRevoked: true,
          schoolName: event.schoolName || 'School',
          licenseKey: event.licenseKey,
          message: 'Your license has been revoked. Please contact support or submit a renewal request.',
        };
        setActiveRevokedNotice(revNotice);
        setActiveExpiredNotice(null);
      } else if (event?.type === 'EXPIRY') {
        const expNotice = {
          isExpired: true,
          schoolName: event.schoolName || 'School',
          licenseKey: event.licenseKey,
          message: 'Your license has expired. Please submit a renewal request.',
        };
        setActiveExpiredNotice(expNotice);
        setActiveRevokedNotice(null);
      } else if ((event?.type === 'ACTIVATION' || event?.type === 'REACTIVATION') && event.license) {
        handleActivationEvent(event.license);
      }
    });

    // Real-time authoritative poller: automatically detects Admin renewal and unlocks Educator Hub immediately
    const pollRenewalStatus = async () => {
      let targetKey = (
        activeExpiredNotice?.licenseKey ||
        activeRevokedNotice?.licenseKey ||
        licenseKey ||
        ''
      ).trim().toUpperCase();

      if (!targetKey && typeof window !== 'undefined') {
        const rawAct = localStorage.getItem('playroom_active_school_license');
        if (rawAct) {
          try { targetKey = (JSON.parse(rawAct).licenseKey || '').trim().toUpperCase(); } catch (_) {}
        }
        if (!targetKey) {
          const rawLast = localStorage.getItem('playroom_last_school_license');
          if (rawLast) {
            try { targetKey = (JSON.parse(rawLast).licenseKey || '').trim().toUpperCase(); } catch (_) {}
          }
        }
        if (!targetKey) {
          targetKey = (localStorage.getItem('playroom_saved_school_key') || '').trim().toUpperCase();
        }
      }

      if (!targetKey) return;

      try {
        const res = await checkSchoolLicenseStatusServer(targetKey);
        if (res && (res.status === 'ACTIVE' || res.isValid) && res.license) {
          if (activeRevokedNotice || activeExpiredNotice || isPendingRenewal) {
            handleActivationEvent(res.license);
          }
        }
      } catch (_) {}
    };

    pollRenewalStatus();
    const pollInterval = setInterval(pollRenewalStatus, 1200);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('playroom_license_reactivated', handleCustomEvent);
      window.removeEventListener('playroom_license_update', handleCustomEvent);
      if (bc) {
        try { bc.close(); } catch (_) {}
      }
      cleanupSSE();
    };
  }, [revocationNotice, expiredNotice, onSchoolLoginSuccess, licenseKey]);

  const handleQuickRenew = async () => {
    if (isRenewing || isPendingRenewal) return;
    soundManager.playPop();
    setIsRenewing(true);

    const storedLicRaw = typeof window !== 'undefined' ? localStorage.getItem('playroom_active_school_license') : null;
    let storedKey = '';
    let storedSchool = '';
    let storedSchoolId = '';
    let storedEmail = '';
    let storedValidUntil = '';
    try {
      if (storedLicRaw) {
        const parsed = JSON.parse(storedLicRaw);
        storedKey = parsed?.licenseKey || '';
        storedSchool = parsed?.schoolName || '';
        storedSchoolId = parsed?.schoolId || '';
        storedEmail = parsed?.contactEmail || '';
        storedValidUntil = parsed?.validUntil || parsed?.expiryDate || '';
      }
    } catch (_) {}

    const targetKey = (
      activeExpiredNotice?.licenseKey ||
      activeRevokedNotice?.licenseKey ||
      storedKey ||
      licenseKey ||
      'SCH-KEY'
    ).trim().toUpperCase();

    const targetSchool =
      activeExpiredNotice?.schoolName ||
      activeRevokedNotice?.schoolName ||
      storedSchool ||
      'Partner School';

    const renewalDoc: SchoolRenewalRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      licenseKey: targetKey,
      schoolId: (activeExpiredNotice as any)?.schoolId || (activeRevokedNotice as any)?.schoolId || storedSchoolId || 'school_id',
      schoolName: targetSchool,
      contactEmail: (activeExpiredNotice as any)?.contactEmail || (activeRevokedNotice as any)?.contactEmail || storedEmail || 'school@partner.edu',
      phoneNumber: '',
      city: 'Karachi',
      previousExpiryDate: (activeExpiredNotice as any)?.validUntil || storedValidUntil || new Date().toISOString(),
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
      adminNotes: '1-Click Renewal requested from School Access Gate.',
    };

    try {
      await fetch('/api/license/renew-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renewalDoc),
      });
      await saveSchoolRenewal(renewalDoc);
      console.log('[RENEWAL] SUBMITTED');
      console.log('[RENEWAL] DATABASE INSERT SUCCESS');
      soundManager.playSuccess();
      setRenewToast('Your renewal request has been submitted to Admin! Please wait for approval.');
      setIsPendingRenewal(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`playroom_pending_renewal_${targetKey}`, 'true');
      }
    } catch (_) {
      await saveSchoolRenewal(renewalDoc);
      console.log('[RENEWAL] DATABASE INSERT SUCCESS (FALLBACK)');
      soundManager.playSuccess();
      setRenewToast('Your renewal request has been submitted to Admin! Please wait for approval.');
      setIsPendingRenewal(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`playroom_pending_renewal_${targetKey}`, 'true');
      }
    } finally {
      setIsRenewing(false);
    }
  };

  const handleCheckApprovalStatus = async () => {
    soundManager.playPop();
    const storedLicRaw = typeof window !== 'undefined' ? localStorage.getItem('playroom_active_school_license') : null;
    let storedKey = '';
    try { if (storedLicRaw) storedKey = JSON.parse(storedLicRaw)?.licenseKey || ''; } catch (_) {}
    const targetKey = (
      activeExpiredNotice?.licenseKey ||
      activeRevokedNotice?.licenseKey ||
      storedKey ||
      licenseKey ||
      ''
    ).trim().toUpperCase();

    if (!targetKey) return;
    try {
      const res = await checkSchoolLicenseStatusServer(targetKey);
      if (res && res.status === 'ACTIVE' && res.license) {
        handleActivationEvent(res.license);
      }
    } catch (_) {}
  };

  const handleReturnHome = () => {
    soundManager.playPop();
    onBackToPlayroom();
  };

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setRenewalNotice(null);

    const trimmedKey = licenseKey.trim();

    if (!trimmedKey) {
      setErrorMessage('Please enter your valid 30-day school license key.');
      return;
    }

    setIsVerifying(true);
    try {
      // Query and verify key strictly against Supabase `school_licenses` table and cloud sync
      const result = await paymentManager.validateSchoolLicenseKey(trimmedKey);
      setIsVerifying(false);

      if (!result.success || !result.license) {
        // If revoked
        if (
          result.isRevoked ||
          result.error?.toLowerCase().includes('revoked') ||
          result.error?.toLowerCase().includes('cancel') ||
          (result.license && result.license.status === 'REVOKED')
        ) {
          const revMsg = {
            isRevoked: true,
            schoolName: result.schoolName || 'School',
            licenseKey: trimmedKey,
            message: 'Your license has been revoked. Please contact support or submit a renewal request.',
          };
          setActiveRevokedNotice(revMsg);
          setActiveExpiredNotice(null);
          if (typeof window !== 'undefined') {
            localStorage.setItem('playroom_revoked_notice', JSON.stringify(revMsg));
          }
          setErrorMessage('Your license has been revoked. Please contact support or submit a renewal request.');
          return;
        }

        // If the license is expired
        if (result.isExpired || (result.license && result.license.status === 'EXPIRED')) {
          const expMsg = {
            isExpired: true,
            schoolName: result.schoolName || 'Partner School',
            licenseKey: trimmedKey,
            message: 'Your school license has expired. Please contact the administrator to renew your access.',
          };
          setActiveExpiredNotice(expMsg);
          setActiveRevokedNotice(null);
          setErrorMessage('Your school license has expired. Please contact the administrator to renew your access.');
          return;
        }

        setErrorMessage(result.error || 'Invalid license key. Please check your key and try again.');
        return;
      }

      const verifiedLicense = result.license;

      // Clear any previous revocation notice on successful activation of valid key
      setActiveRevokedNotice(null);
      setActiveExpiredNotice(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('playroom_revoked_notice');
      }

      const schoolAccount: UserAccount = {
        id: verifiedLicense.schoolId || 'school_' + Date.now(),
        email: verifiedLicense.contactEmail || 'school_admin@partner.edu',
        isLoggedIn: true,
        role: 'school_admin',
        hasPage1Access: true,
        hasPage2SchoolAccess: true,
        schoolName: verifiedLicense.schoolName || 'Authorized School Partner',
        licenseKey: verifiedLicense.licenseKey || trimmedKey.toUpperCase(),
      };

      // Save active school license and user session
      paymentManager.saveActiveSchoolLicense(verifiedLicense);
      localStorage.setItem('playroom_user', JSON.stringify(schoolAccount));
      soundManager.playSuccess();
      setSuccessMessage('Your license is activated');
      emitLicenseStateChange();

      setTimeout(() => {
        if (onSchoolLoginSuccess) {
          onSchoolLoginSuccess(schoolAccount, verifiedLicense);
        } else {
          window.location.reload();
        }
      }, 750);
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMessage(err?.message || 'Invalid license key. Please check your key and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/40 backdrop-blur-xs overflow-y-auto select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-lg bg-white border-4 border-indigo-300 rounded-3xl shadow-2xl overflow-hidden text-slate-800 my-auto"
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 p-5 sm:p-6 text-white text-center border-b-4 border-indigo-500 relative">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/10 border-2 border-indigo-300/40 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl mx-auto mb-2.5 shadow-inner">
            🏫
          </div>
          <div className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full mb-2">
            <Lock className="w-3.5 h-3.5" />
            <span>School Administration Access</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight text-white drop-shadow-sm">
            ACCESS ONLY FOR SCHOOL ADMINISTRATION
          </h1>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-7 space-y-5">
          {/* Active Expired Notice Banner */}
          {activeExpiredNotice ? (
            <div className="bg-amber-50 border-2 border-amber-500 rounded-3xl p-5 sm:p-6 text-amber-950 space-y-4 shadow-md animate-in fade-in duration-200 text-center">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto border-2 border-amber-300 shadow-inner">
                <Clock className="w-8 h-8 shrink-0" />
              </div>

              <div className="space-y-1.5">
                <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-black uppercase tracking-wider">
                  License Expired
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  School License Expired
                </h2>
                <p className="text-xs sm:text-sm font-bold text-amber-900 leading-relaxed bg-white/90 p-3.5 rounded-2xl border border-amber-200">
                  Your school license has expired. Please contact the administrator to renew your access.
                </p>
              </div>

              {activeExpiredNotice.schoolName && (
                <div className="text-xs text-slate-700 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-left space-y-0.5">
                  <div>School: <strong className="text-slate-900">{activeExpiredNotice.schoolName}</strong></div>
                  {activeExpiredNotice.licenseKey && (
                    <div>Key: <code className="font-mono text-slate-800 font-bold">{activeExpiredNotice.licenseKey}</code></div>
                  )}
                  <div className="text-[11px] text-rose-700 font-bold mt-1">
                    ⚠️ Expired licenses cannot be renewed, reused, or reactivated.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setIsComplaintModalOpen(true);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs uppercase tracking-wide border border-slate-300"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Contact Admin</span>
                </button>

                {onOpenInquiry && (
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playPop();
                      setActiveExpiredNotice(null);
                      onOpenInquiry();
                    }}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs py-3 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md uppercase tracking-wide cursor-pointer"
                  >
                    <School className="w-4 h-4 stroke-[2.5]" />
                    <span>Submit New Request</span>
                  </button>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end border-t border-amber-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setActiveExpiredNotice(null);
                    setLicenseKey('');
                    setErrorMessage('');
                  }}
                  className="text-slate-500 hover:text-slate-800 font-medium underline cursor-pointer"
                >
                  Enter Different Key
                </button>
              </div>
            </div>
          ) : activeRevokedNotice ? (
            <div className="bg-rose-50 border-2 border-rose-500 rounded-3xl p-5 sm:p-6 text-rose-950 space-y-4 shadow-md animate-in fade-in duration-200 text-center">
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto border-2 border-rose-300 shadow-inner">
                <AlertCircle className="w-8 h-8 shrink-0" />
              </div>

              <div className="space-y-1.5">
                <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black uppercase tracking-wider">
                  Access Revoked
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  License Access Terminated
                </h2>
                <p className="text-xs sm:text-sm font-bold text-rose-800 leading-relaxed bg-white/90 p-3 rounded-2xl border border-rose-200">
                  Your license has been revoked. Please contact support or submit a renewal request.
                </p>
              </div>

              {activeRevokedNotice.schoolName && (
                <div className="text-xs text-slate-700 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-left space-y-0.5">
                  <div>School: <strong className="text-slate-900">{activeRevokedNotice.schoolName}</strong></div>
                  {activeRevokedNotice.licenseKey && (
                    <div>Key: <code className="font-mono text-slate-800 font-bold">{activeRevokedNotice.licenseKey}</code></div>
                  )}
                </div>
              )}

              {(isPendingRenewal || renewToast) && (
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 text-center space-y-2.5 animate-in fade-in duration-200">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Status: PENDING ADMIN APPROVAL</span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Renewal Request Received by Administration
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Your renewal request has been transmitted to the Admin Panel. When the admin clicks Approve, your access will be restored automatically without page reload.
                  </p>
                  <div className="pt-1 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleCheckApprovalStatus}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Check Approval Status</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setIsComplaintModalOpen(true);
                  }}
                  className="w-full bg-indigo-900 hover:bg-indigo-950 text-white font-bold text-xs py-3 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs uppercase tracking-wide"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Contact Admin</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickRenew}
                  disabled={isRenewing || isPendingRenewal}
                  className={`w-full ${(isPendingRenewal || renewToast) ? 'bg-emerald-600 cursor-default' : 'bg-amber-600 hover:bg-amber-700 cursor-pointer'} text-white font-bold text-xs py-3 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs uppercase tracking-wide disabled:opacity-60`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{isRenewing ? 'Submitting...' : (isPendingRenewal || renewToast) ? '✅ Request Sent' : 'Renew License (1-Click)'}</span>
                </button>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-rose-200 text-xs">
                {!isPendingRenewal && !renewToast ? (
                  <button
                    type="button"
                    onClick={() => setIsRenewalModalOpen(true)}
                    className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  >
                    Edit Renewal Details
                  </button>
                ) : (
                  <span className="text-slate-500 font-medium">Awaiting admin review</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setActiveRevokedNotice(null);
                    setLicenseKey('');
                    setErrorMessage('');
                    setRenewToast('');
                    setIsPendingRenewal(false);
                    localStorage.removeItem('playroom_revoked_notice');
                  }}
                  className="text-slate-500 hover:text-slate-800 font-medium underline cursor-pointer"
                >
                  Different Key
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-indigo-50/90 border-2 border-indigo-100 rounded-2xl p-4 text-center">
                <p className="text-xs sm:text-sm font-bold text-indigo-950 leading-relaxed">
                  Preschool Educator Hub is reserved for authorized school administration accounts.
                </p>
                <p className="text-[11px] sm:text-xs text-slate-600 font-medium mt-1.5 leading-relaxed">
                  Includes classroom curriculum tools, teacher assessments, lesson planners, visual activity guides, and printable worksheets.
                </p>
              </div>

              {/* Real-time School Request Status Display (Pending, Approved, Rejected) */}
              {requestStatus && (
                <div
                  className={`rounded-2xl p-4 border-2 transition-all animate-in fade-in duration-200 ${
                    requestStatus.status === 'approved'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                      : requestStatus.status === 'rejected'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/10">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        requestStatus.status === 'approved'
                          ? 'bg-emerald-600 text-white'
                          : requestStatus.status === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-400 text-slate-950 animate-pulse'
                      }`}
                    >
                      Request Status: {requestStatus.status.toUpperCase()}
                    </span>
                    <span className="text-xs font-bold truncate max-w-[180px]">
                      {requestStatus.schoolName}
                    </span>
                  </div>

                  {requestStatus.status === 'approved' ? (
                    <div className="mt-2.5 space-y-2">
                      <p className="text-xs font-medium text-emerald-900 leading-relaxed">
                        🎉 Great news! Your license request has been approved. Use your generated license key below to activate:
                      </p>
                      {requestStatus.licenseKey && (
                        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-emerald-300">
                          <code className="font-mono font-black text-xs sm:text-sm text-indigo-900 flex-1 truncate select-all">
                            {requestStatus.licenseKey}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              soundManager.playPop();
                              setLicenseKey(requestStatus.licenseKey || '');
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            Use Key
                          </button>
                        </div>
                      )}
                    </div>
                  ) : requestStatus.status === 'rejected' ? (
                    <div className="mt-2 text-xs font-medium text-rose-800 leading-relaxed">
                      Your school license inquiry was not approved by the administrator. Please contact support or submit a new inquiry with updated school credentials.
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-medium text-amber-900 leading-relaxed flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-700 shrink-0 animate-spin" />
                      <span>
                        Your request has been submitted to the Admin Panel. Once approved, your unique 1-month license key will be displayed here automatically.
                      </span>
                    </div>
                  )}
                </div>
              )}

          {/* License Key Activation Form */}
          <form onSubmit={handleActivateLicense} className="space-y-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <label htmlFor="license-key-input" className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wide">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>License Key</span>
              </label>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded-md">
                30-Day School License
              </span>
            </div>

            <div>
              <input
                id="license-key-input"
                type="text"
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Enter your 30-day school license key..."
                className="w-full p-3 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:font-normal focus:border-indigo-600 focus:outline-hidden shadow-xs"
                autoComplete="off"
                spellCheck={false}
                disabled={isVerifying}
              />
            </div>

            {errorMessage && (
              <div className="flex items-start justify-between gap-2 text-xs font-bold text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200 leading-relaxed">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="p-0.5 text-rose-400 hover:text-rose-700 rounded-md hover:bg-rose-100 transition-colors"
                  title="Cut / Dismiss error"
                  aria-label="Close error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {renewalNotice && (
              <div className="flex flex-col gap-2 bg-amber-50 p-3.5 rounded-xl border-2 border-amber-300 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black uppercase tracking-wide text-amber-900">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Renewal Sent to Administrator</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRenewalNotice(null)}
                    className="p-0.5 text-amber-500 hover:text-amber-800 rounded-md hover:bg-amber-100 transition-colors"
                    title="Cut / Dismiss notice"
                    aria-label="Close notice"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-amber-800 font-semibold leading-relaxed">
                  {renewalNotice.message}
                </p>
                <div className="bg-white/80 p-2 rounded-lg border border-amber-200 text-[11px] text-slate-700 font-medium">
                  <strong>Notice:</strong> Only the administrator can renew licenses. Please contact your administrator to verify your monthly payment.
                </div>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage('')}
                  className="p-0.5 text-emerald-500 hover:text-emerald-800 rounded-md hover:bg-emerald-100 transition-colors"
                  title="Cut / Dismiss message"
                  aria-label="Close message"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              id="activate-license-btn"
              type="submit"
              disabled={isVerifying}
              className="w-full bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 active:scale-[0.99] text-white font-black text-xs sm:text-sm tracking-wide py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <KeyRound className="w-4 h-4 stroke-[2.5]" />
              <span>{isVerifying ? 'Verifying...' : 'Activate License'}</span>
            </button>
          </form>
          </>
          )}

          {/* Alternative Actions: Submit Inquiry, Submit Complaint & Return to Playroom */}
          <div className="space-y-2 pt-1">
            {onOpenInquiry && (
              <button
                id="gate-submit-inquiry-btn"
                type="button"
                onClick={() => {
                  soundManager.playPop();
                  onOpenInquiry();
                }}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider py-2.5 px-4 rounded-xl border-b-3 border-amber-800 active:border-b-0 active:translate-y-0.5 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <School className="w-4 h-4 stroke-[2.5]" />
                <span>Don't have a license? Submit Inquiry</span>
              </button>
            )}

            {/* Option to Submit Complaint */}
            <button
              id="gate-submit-complaint-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                setIsComplaintModalOpen(true);
              }}
              className="w-full bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider py-2.5 px-4 rounded-xl border-b-3 border-rose-900 active:border-b-0 active:translate-y-0.5 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 text-amber-300 stroke-[2.5]" />
              <span>Submit Complaint</span>
            </button>

            <button
              id="return-to-playroom-gate-btn"
              type="button"
              onClick={handleReturnHome}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider py-2 px-4 rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Playroom</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Complaint Submission Modal */}
      <SchoolComplaintModal
        isOpen={isComplaintModalOpen}
        onClose={() => setIsComplaintModalOpen(false)}
        defaultSchoolName={activeRevokedNotice?.schoolName || ''}
      />
    </div>
  );
};
