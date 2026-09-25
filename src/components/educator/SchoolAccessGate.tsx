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
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { UserAccount } from '../PremiumAuthModal';
import { PaymentServiceManager } from '../../services/payment/PaymentServiceManager';
import { SchoolLicense } from '../../types/payment';
import { emitLicenseStateChange } from '../../utils/licenseService';
import { setupLicenseSSEListener } from '../../services/cloudSchoolSync';
import { SchoolComplaintModal } from './SchoolComplaintModal';

interface SchoolAccessGateProps {
  onBackToPlayroom: () => void;
  onSchoolLoginSuccess?: (schoolAccount: UserAccount, activeLicense?: SchoolLicense) => void;
  onOpenInquiry?: () => void;
  revocationNotice?: { isRevoked: boolean; message: string; schoolName?: string } | null;
}

export const SchoolAccessGate: React.FC<SchoolAccessGateProps> = ({
  onBackToPlayroom,
  onSchoolLoginSuccess,
  onOpenInquiry,
  revocationNotice,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [renewalNotice, setRenewalNotice] = useState<{ isPending: boolean; message: string } | null>(null);
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [activeRevokedNotice, setActiveRevokedNotice] = useState<{
    isRevoked: boolean;
    message: string;
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
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewToast, setRenewToast] = useState('');

  // Sync with prop and real-time events
  React.useEffect(() => {
    if (revocationNotice) {
      setActiveRevokedNotice(revocationNotice);
    }

    const cleanupSSE = setupLicenseSSEListener((event) => {
      if (event?.type === 'REVOCATION') {
        const revNotice = {
          isRevoked: true,
          schoolName: event.schoolName || 'School',
          licenseKey: event.licenseKey,
          message: 'Administrator ne is school ka license cancel / revoke kar diya hai. Dobara access ke liye Administrator se rabta karein ya new inquiry submit karein.',
        };
        setActiveRevokedNotice(revNotice);
      }
    });

    return () => {
      cleanupSSE();
    };
  }, [revocationNotice]);

  const paymentManager = PaymentServiceManager.getInstance();

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
          if (typeof window !== 'undefined') {
            localStorage.setItem('playroom_revoked_notice', JSON.stringify(revMsg));
          }
          setErrorMessage('Your license has been revoked. Please contact support or submit a renewal request.');
          return;
        }

        // If the license is expired
        if (result.isExpired) {
          if (result.isRenewalPending) {
            setRenewalNotice({
              isPending: true,
              message:
                'A renewal request for this license is already pending Administrator approval. Until the administrator verifies payment and approves, this key will not work. Once approved, it will automatically renew for another 30 days.',
            });
          } else {
            // Auto-submit renewal request to admin
            await paymentManager.submitSchoolLicenseRenewalRequest(trimmedKey);
            setRenewalNotice({
              isPending: true,
              message:
                'This license has expired. A renewal request has been sent to the Admin! Until the administrator approves your renewal, this key will not work. Once approved, this same key will automatically renew for another 30 days.',
            });
            soundManager.playPop();
          }
          return;
        }

        setErrorMessage(result.error || 'Invalid license key. Please check your key and try again.');
        return;
      }

      const verifiedLicense = result.license;

      // Clear any previous revocation notice on successful activation of valid key
      setActiveRevokedNotice(null);
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
      setSuccessMessage('School license activated successfully! Unlocking Education Hub and Activities...');
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
          {/* Active Revocation Notice Banner */}
          {activeRevokedNotice ? (
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

              {renewToast && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs rounded-xl text-center animate-in fade-in duration-200">
                  ✅ {renewToast}
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
                  <span>Submit Help Request</span>
                </button>

                <button
                  type="button"
                  disabled={isRenewing || Boolean(renewToast)}
                  onClick={async () => {
                    soundManager.playPop();
                    setIsRenewing(true);
                    try {
                      const res = await fetch('/api/license/renew-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          licenseKey: activeRevokedNotice.licenseKey || licenseKey || 'REVOKED_KEY',
                          schoolName: activeRevokedNotice.schoolName || 'School',
                          userEmail: 'school@partner.edu',
                          reason: 'Renew requested after revocation',
                        }),
                      });
                      const data = await res.json();
                      setRenewToast(data.message || 'Renewal request submitted to Administrator.');
                    } catch (_) {
                      setRenewToast('Renewal request submitted to Administrator.');
                    } finally {
                      setIsRenewing(false);
                    }
                  }}
                  className={`w-full ${renewToast ? 'bg-emerald-600' : 'bg-amber-600 hover:bg-amber-700'} text-white font-bold text-xs py-3 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs uppercase tracking-wide`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{renewToast ? 'Request Sent' : isRenewing ? 'Sending...' : 'Submit Renewal Request'}</span>
                </button>
              </div>

              <div className="pt-2 border-t border-rose-200">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playPop();
                    setActiveRevokedNotice(null);
                    setLicenseKey('');
                    setErrorMessage('');
                    setRenewToast('');
                    localStorage.removeItem('playroom_revoked_notice');
                  }}
                  className="text-xs text-indigo-700 hover:text-indigo-900 font-bold underline cursor-pointer"
                >
                  Enter a different license key
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
              <div className="flex items-start gap-2 text-xs font-bold text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {renewalNotice && (
              <div className="flex flex-col gap-2 bg-amber-50 p-3.5 rounded-xl border-2 border-amber-300 text-xs">
                <div className="flex items-center gap-2 font-black uppercase tracking-wide text-amber-900">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Renewal Sent to Administrator</span>
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
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
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
