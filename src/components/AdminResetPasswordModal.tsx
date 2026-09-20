import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ArrowRight, X } from 'lucide-react';
import { soundManager } from '../utils/audio';
import { updateAdminPassword } from '../utils/userAuthService';
import { getSupabaseClient } from '../utils/supabaseClient';

interface AdminResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordResetSuccess: () => void;
  onRequestNewLink?: () => void;
}

export const AdminResetPasswordModal: React.FC<AdminResetPasswordModalProps> = ({
  isOpen,
  onClose,
  onPasswordResetSuccess,
  onRequestNewLink,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    soundManager.playPop();
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage('');
    setSuccessMessage('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newPassword) {
      setErrorMessage('Please enter your new password.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (!confirmPassword) {
      setErrorMessage('Please confirm your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    soundManager.playPop();

    try {
      const res = await updateAdminPassword(newPassword);
      setIsLoading(false);

      if (!res.success) {
        soundManager.playPop();
        setErrorMessage(res.error || 'Unable to update password. Please try again.');
        return;
      }

      soundManager.playSuccess();
      soundManager.speak('Password reset successfully.');
      setSuccessMessage('Password reset successfully.');

      // Clean up recovery tokens from URL if present
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {
          // ignore
        }
      }

      // Automatically complete flow after brief confirmation
      setTimeout(async () => {
        try {
          const supabase = getSupabaseClient();
          if (supabase) {
            await supabase.auth.signOut();
          }
        } catch {
          // ignore
        }
        onPasswordResetSuccess();
      }, 1800);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Unable to update password. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      <div
        id="admin-reset-password-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto select-none"
      >
        <motion.div
          id="admin-reset-password-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-white border-4 border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto text-slate-800"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white text-center relative border-b-4 border-slate-800">
            <button
              id="admin-reset-password-close-btn"
              onClick={handleClose}
              type="button"
              className="absolute top-3.5 right-3.5 bg-white/10 hover:bg-white/20 text-white rounded-full p-1.5 transition-colors cursor-pointer"
              title="Close Dialog"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div className="inline-flex items-center justify-center w-13 h-13 bg-indigo-500 border-3 border-white rounded-2xl mb-2.5 shadow-md text-white">
              <KeyRound className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div className="inline-block bg-indigo-400/20 text-indigo-200 font-black text-[10px] px-3 py-0.5 rounded-full uppercase tracking-wider mb-1 border border-indigo-400/30">
              Supabase Auth Recovery
            </div>

            <h2 className="text-xl font-black uppercase tracking-tight text-white drop-shadow-sm">
              Reset Password
            </h2>
            <p className="text-xs font-medium text-slate-300 mt-0.5">
              Enter your new administrator password below
            </p>
          </div>

          {/* Form Body */}
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-600 font-medium">
                Choose a strong new password with at least 6 characters for your administrator account.
              </p>
            </div>

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="leading-snug block">{errorMessage}</span>
                  {onRequestNewLink && errorMessage.toLowerCase().includes('session') && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClose();
                        onRequestNewLink();
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-indigo-900 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-lg border border-rose-300 underline cursor-pointer"
                    >
                      <span>Send fresh reset link to my email</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-emerald-50 border-2 border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-extrabold block">{successMessage}</span>
                  <span className="text-[11px] font-medium text-emerald-700 block mt-0.5">
                    Redirecting to Admin Login...
                  </span>
                </div>
              </motion.div>
            )}

            {!successMessage ? (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* New Password */}
                <div>
                  <label
                    htmlFor="admin-new-password-input"
                    className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="admin-new-password-input"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="••••••••••••"
                      disabled={isLoading}
                      className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-bold text-slate-800 outline-none transition-colors disabled:opacity-60"
                    />
                    <button
                      type="button"
                      id="admin-toggle-new-password-visibility-btn"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none p-1 transition-colors cursor-pointer"
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label
                    htmlFor="admin-confirm-password-input"
                    className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="admin-confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="••••••••••••"
                      disabled={isLoading}
                      className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-bold text-slate-800 outline-none transition-colors disabled:opacity-60"
                    />
                    <button
                      type="button"
                      id="admin-toggle-confirm-password-visibility-btn"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none p-1 transition-colors cursor-pointer"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl border border-slate-300 active:translate-y-0.5 text-xs uppercase tracking-wide transition-all cursor-pointer disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    id="admin-save-new-password-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl border-b-4 border-indigo-900 active:border-b-0 active:translate-y-0.5 shadow-md text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  id="admin-return-login-success-btn"
                  onClick={async () => {
                    try {
                      const supabase = getSupabaseClient();
                      if (supabase) {
                        await supabase.auth.signOut();
                      }
                    } catch {
                      // ignore
                    }
                    onPasswordResetSuccess();
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl border-b-4 border-emerald-900 shadow-md text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Return to Admin Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
