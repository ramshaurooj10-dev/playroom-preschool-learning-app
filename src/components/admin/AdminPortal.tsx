import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  Gamepad2,
  KeyRound,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { UserAccount } from '../PremiumAuthModal';
import {
  signInAdminWithSupabase,
  checkCurrentAdminSession,
  signInWithGoogle,
  sendAdminPasswordResetEmail,
  PRIMARY_ADMIN_EMAIL,
  isAdminAccount,
} from '../../utils/userAuthService';
import { AdminDashboard } from './AdminDashboard';
import { AdminResetPasswordModal } from '../AdminResetPasswordModal';

interface AdminPortalProps {
  userAccount: UserAccount | null;
  onAdminLoginSuccess: (account: UserAccount) => void;
  onLogout: () => void;
  onNavigateHome: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  userAccount,
  onAdminLoginSuccess,
  onLogout,
  onNavigateHome,
}) => {
  const isAuthorizedAdmin = isAdminAccount(userAccount);

  const [email, setEmail] = useState<string>(PRIMARY_ADMIN_EMAIL);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState<boolean>(false);

  // If already authorized, render the AdminDashboard directly!
  if (isAuthorizedAdmin) {
    return (
      <AdminDashboard
        userAccount={userAccount}
        onLogout={onLogout}
        onNavigateHome={onNavigateHome}
      />
    );
  }

  // Handle Admin Sign In
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid administrator email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your administrator password.');
      return;
    }

    setIsLoading(true);
    soundManager.playPop();

    try {
      const res = await signInAdminWithSupabase(cleanEmail, password);

      if (!res.success) {
        setIsLoading(false);
        soundManager.playPop();
        setErrorMessage(
          res.error || 'Authentication failed. Please verify credentials.'
        );
        return;
      }

      soundManager.playSuccess();
      setSuccessMessage('Access granted. Initializing Admin Console...');

      setTimeout(() => {
        setIsLoading(false);
        if (res.account) {
          onAdminLoginSuccess(res.account);
        }
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Login error occurred. Please try again.');
    }
  };

  // Handle Google Admin Sign-In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    soundManager.playPop();

    try {
      const res = await signInWithGoogle();
      if (res?.error) {
        setIsLoading(false);
        setErrorMessage(res.error.message || 'Google sign-in failed. Please try again.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Google sign-in failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950 font-sans p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 text-slate-950 rounded-2xl flex items-center justify-center font-black shadow-md border-2 border-white">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
              PLAYROOM System Portal
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Authoritative Administration</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateHome}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
        >
          <Gamepad2 className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Go to Kids Playroom</span>
          <span className="sm:hidden">Playroom</span>
        </button>
      </header>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border-4 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
        >
          {/* Card Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-amber-500/15 border-2 border-amber-500/30 rounded-3xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
              <Lock className="w-8 h-8 stroke-[2.2]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
              Administrator Login
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Sign in to manage school licenses, review inquiries, and monitor real-time activations.
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3.5 bg-rose-950/80 border-2 border-rose-600/70 rounded-2xl flex items-start gap-3 text-xs text-rose-200"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="font-semibold">{errorMessage}</div>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3.5 bg-emerald-950/80 border-2 border-emerald-600/70 rounded-2xl flex items-start gap-3 text-xs text-emerald-200"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="font-semibold">{successMessage}</div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@playroom.edu"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setIsResetPasswordOpen(true)}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-lg border-b-4 border-amber-600 active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In as Admin</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] font-bold text-slate-500 uppercase">
              OR
            </span>
            <div className="border-t border-slate-800 w-full" />
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto text-center text-slate-500 text-[11px]">
        <p>Protected by Playroom Role-Based Access Control • Karachi, Pakistan</p>
      </footer>

      {/* Reset Password Modal */}
      <AdminResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => setIsResetPasswordOpen(false)}
        onPasswordResetSuccess={() => {
          setIsResetPasswordOpen(false);
          soundManager.playSuccess();
        }}
      />
    </div>
  );
};
