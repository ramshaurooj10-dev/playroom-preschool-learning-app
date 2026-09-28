import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RotateCcw,
  X,
  Building2,
  KeyRound,
  Mail,
  Phone,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { SchoolRenewalRequest } from '../../types/payment';
import { saveSchoolRenewal } from '../../services/cloudSchoolSync';

interface SchoolRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseKey: string;
  schoolName?: string;
  schoolId?: string;
  contactEmail?: string;
  previousExpiryDate?: string;
  onSubmitted: (message: string) => void;
}

export const SchoolRenewalModal: React.FC<SchoolRenewalModalProps> = ({
  isOpen,
  onClose,
  licenseKey,
  schoolName = 'Partner School',
  schoolId = 'school_id',
  contactEmail = 'school@partner.edu',
  previousExpiryDate,
  onSubmitted,
}) => {
  const [formData, setFormData] = useState({
    schoolName: schoolName || 'Partner School',
    contactEmail: contactEmail || 'school@partner.edu',
    phoneNumber: '',
    city: 'Karachi',
    notes: 'Please renew our 30-day institutional license for educational activities.',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    soundManager.playPop();
    setIsSubmitting(true);
    setErrorMessage('');

    const cleanKey = (licenseKey || '').trim().toUpperCase();
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const renewalDoc: SchoolRenewalRequest = {
      id: reqId,
      licenseKey: cleanKey,
      schoolId: schoolId || 'school_id',
      schoolName: formData.schoolName.trim() || schoolName,
      contactEmail: formData.contactEmail.trim() || contactEmail,
      phoneNumber: formData.phoneNumber.trim(),
      city: formData.city.trim() || 'Karachi',
      previousExpiryDate: previousExpiryDate || nowIso,
      status: 'PENDING',
      requestedAt: nowIso,
      adminNotes: formData.notes.trim() || 'Renewal requested from public app form.',
    };

    console.log('[RENEWAL] SUBMITTED');

    try {
      // 1. Direct Server API call with deduplication check
      const apiRes = await fetch('/api/license/renew-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renewalDoc),
      });

      const data = await apiRes.json().catch(() => null);

      // 2. Direct client-side cloud sync save (with deduplication)
      if (!data?.alreadyPending) {
        await saveSchoolRenewal(renewalDoc);
        console.log('[RENEWAL] DATABASE INSERT SUCCESS');
      }

      const returnMsg =
        data?.message ||
        (data?.alreadyPending
          ? 'Your renewal request is already pending.'
          : 'Your renewal request has been submitted successfully.');

      soundManager.playSuccess();
      onSubmitted(returnMsg);
      onClose();
    } catch (err: any) {
      console.warn('Renewal request submit error:', err);
      // Fallback save
      try {
        await saveSchoolRenewal(renewalDoc);
        console.log('[RENEWAL] DATABASE INSERT SUCCESS (FALLBACK)');
        soundManager.playSuccess();
        onSubmitted('Your renewal request has been submitted successfully.');
        onClose();
      } catch (fallbackErr: any) {
        setErrorMessage(fallbackErr?.message || 'Failed to submit renewal request. Please try again.');
        setIsSubmitting(false);
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm select-none animate-in fade-in duration-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border-4 border-indigo-500 shadow-2xl overflow-hidden w-full max-w-lg text-slate-800 my-auto"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 p-5 sm:p-6 text-white text-center relative border-b-4 border-indigo-500">
            <button
              type="button"
              onClick={() => {
                if (!isSubmitting) {
                  soundManager.playPop();
                  onClose();
                }
              }}
              disabled={isSubmitting}
              className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 bg-white/10 border-2 border-indigo-400/40 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2 shadow-inner">
              <RotateCcw className="w-6 h-6 text-amber-300" />
            </div>
            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
              Request License Renewal
            </h3>
            <p className="text-xs text-indigo-200 mt-0.5">
              Submit an extension request to the Playroom administration.
            </p>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs font-semibold">
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-300 text-rose-700 rounded-xl text-xs font-bold">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* School & License Info */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">License Key</span>
                <code className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-mono font-black text-xs border border-indigo-200">
                  {licenseKey || 'SCH-KEY'}
                </code>
              </div>
              {schoolId && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">School ID:</span>
                  <span className="text-slate-800 font-mono font-bold">{schoolId}</span>
                </div>
              )}
            </div>

            {/* School Name */}
            <div className="space-y-1 text-left">
              <label className="text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>School Name</span>
              </label>
              <input
                type="text"
                required
                value={formData.schoolName}
                onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold"
                placeholder="Enter authorized school name"
              />
            </div>

            {/* Contact Email */}
            <div className="space-y-1 text-left">
              <label className="text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-600" />
                <span>Admin / Principal Email</span>
              </label>
              <input
                type="email"
                required
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-medium"
                placeholder="school_admin@partner.edu"
              />
            </div>

            {/* Phone Number & City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="space-y-1">
                <label className="text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Phone Number</span>
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  placeholder="+92 300 1234567"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 font-bold text-[11px]">City / Branch</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  placeholder="Karachi"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1 text-left">
              <label className="text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Renewal Notes / Reason</span>
              </label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 text-xs resize-none"
                placeholder="Brief reason for renewal extension..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  soundManager.playPop();
                  onClose();
                }}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit Renewal Request</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
