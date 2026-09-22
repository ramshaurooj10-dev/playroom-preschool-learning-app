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
  ExternalLink,
  KeyRound,
  ShieldAlert,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import { UserAccount } from '../components/PremiumAuthModal';
import {
  signInAdminWithSupabase,
  checkCurrentAdminSession,
  signInWithGoogle,
  sendAdminPasswordResetEmail,
  PRIMARY_ADMIN_EMAIL,
  isAdminAccount,
  getAdminAccountLocal,
  saveAdminAccountLocal,
  clearAdminSessionLocal,
  normalizeEmail,
  isAuthorizedAdminEmail,
} from '../utils/userAuthService';
import { getSupabaseClient } from '../utils/supabaseClient';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { AdminResetPasswordModal } from '../components/AdminResetPasswordModal';

export const AdminApp: React.FC = () => {
  const [adminAccount, setAdminAccount] = useState<UserAccount | null>(() => {
    return getAdminAccountLocal();
  });
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(true);

  const [email, setEmail] = useState<string>(PRIMARY_ADMIN_EMAIL);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'google' | 'password'>('google');

  // Verify active Supabase session and enforce administrator role validation on mount
  useEffect(() => {
    let isMounted = true;

    const verifyAdmin = async () => {
      try {
        setIsVerifyingSession(true);
        const sessionResult = await checkCurrentAdminSession();
        if (!isMounted) return;

        if (sessionResult.isAdmin && sessionResult.account) {
          setAdminAccount(sessionResult.account);
          saveAdminAccountLocal(sessionResult.account);
          setUnauthorizedEmail(null);
        } else {
          // If a user is logged into Supabase Auth with Google but NOT an admin in profiles/metadata:
          const supabase = getSupabaseClient();
          if (supabase) {
            const { data } = await supabase.auth.getSession();
            const sessionUser = data?.session?.user;
            if (sessionUser) {
              const userEmail = sessionUser.email || '';
              console.warn('[Admin Security] Unauthorized user logged in via OAuth:', userEmail);
              await supabase.auth.signOut();
              await clearAdminSessionLocal();
              setAdminAccount(null);
              setUnauthorizedEmail(userEmail);
              setErrorMessage(
                `Access Denied: The Google account (${userEmail}) is not authorized as a Playroom Administrator.`
              );
              return;
            }
          }

          const local = getAdminAccountLocal();
          if (local && isAdminAccount(local)) {
            setAdminAccount(local);
          } else {
            setAdminAccount(null);
          }
        }
      } catch (err) {
        console.warn('[AdminApp] Session verify note:', err);
      } finally {
        if (isMounted) {
          setIsVerifyingSession(false);
        }
      }
    };

    verifyAdmin();

    // Listen to Supabase auth changes (e.g. after Google OAuth callback redirect)
    const supabase = getSupabaseClient();
    let authListener: any = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            verifyAdmin();
          }
        } else if (event === 'SIGNED_OUT') {
          setAdminAccount(null);
        }
      });
      authListener = data?.subscription;
    }

    const handleAdminAuthChange = () => {
      if (isMounted) {
        setAdminAccount(getAdminAccountLocal());
      }
    };

    window.addEventListener('playroom_admin_auth_change', handleAdminAuthChange);

    return () => {
      isMounted = false;
      if (authListener) authListener.unsubscribe();
      window.removeEventListener('playroom_admin_auth_change', handleAdminAuthChange);
    };
  }, []);

  const handleAdminLogout = async () => {
    setIsLoading(true);
    try {
      await clearAdminSessionLocal();
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (_) {}
    setAdminAccount(null);
    setUnauthorizedEmail(null);
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(false);
  };

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setUnauthorizedEmail(null);
    soundManager.playPop();

    try {
      const res = await signInWithGoogle();
      if (res?.error) {
        setIsLoading(false);
        soundManager.playPop();
        setErrorMessage(res.error.message || 'Google sign-in could not be initiated.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Google sign-in encountered an error.');
    }
  };

  // Admin Password Sign-In Handler (Fallback)
  const handlePasswordLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setUnauthorizedEmail(null);

    const cleanEmail = normalizeEmail(email);
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
        setErrorMessage(res.error || 'Authentication failed. Please verify credentials.');
        return;
      }

      soundManager.playSuccess();
      setSuccessMessage('Access granted. Initializing Admin System...');

      setTimeout(() => {
        setIsLoading(false);
        if (res.account) {
          setAdminAccount(res.account);
        }
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Login error occurred. Please try again.');
    }
  };

  // If loading session verification, show sleek loader
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-14 h-14 bg-amber-400 text-slate-950 rounded-2xl flex items-center justify-center font-black shadow-xl animate-pulse">
            <ShieldCheck className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Verifying Administrator Privileges...</span>
          </div>
        </div>
      </div>
    );
  }

  // If authorized, render the full professional Admin Dashboard
  if (adminAccount && isAdminAccount(adminAccount)) {
    return (
      <AdminDashboard
        userAccount={adminAccount}
        onLogout={handleAdminLogout}
        onNavigateHome={() => {
          if (typeof window !== 'undefined') {
            window.location.href = 'https://playroom-preschool-learning-app.vercel.app/';
          }
        }}
      />
    );
  }

  // Otherwise render the secure Admin Sign-In screen
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950 font-sans p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-3 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 text-slate-950 rounded-2xl flex items-center justify-center font-black shadow-md border-2 border-white">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black uppercase text-white tracking-tight flex items-center gap-2">
              <span>PLAYROOM</span>
              <span className="text-amber-400 text-xs px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30">
                School Licensing Admin
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Authoritative Institutional Control</p>
          </div>
        </div>

        <a
          href="https://playroom-preschool-learning-app.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Public Learning App</span>
          <span className="sm:hidden">Public App</span>
        </a>
      </header>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
        >
          {/* Header Icon */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-amber-500/15 border-2 border-amber-500/30 rounded-3xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
              <Lock className="w-8 h-8 stroke-[2.2]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
              Administrator Login
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Sign in with your authorized Google account or admin credentials to manage school licenses and activations.
            </p>
          </div>

          {/* Feedback Alert Messages */}
          {unauthorizedEmail && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-rose-950/80 border-2 border-rose-600 rounded-2xl space-y-2 text-xs text-rose-200"
            >
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Access Denied – Unauthorized Account</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-300">
                The account <strong className="text-white underline">{unauthorizedEmail}</strong> is not configured as an administrator in the Supabase authorization database.
              </p>
            </motion.div>
          )}

          {errorMessage && !unauthorizedEmail && (
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

          {/* Primary Action: Google Sign-In */}
          <div className="space-y-3">
            <button
              id="admin-google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-extrabold text-sm rounded-2xl border-2 border-slate-300 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
              <span>{isLoading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                Or Admin Credentials
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Alternative: Admin Password Form */}
            {authMode === 'google' ? (
              <button
                type="button"
                onClick={() => setAuthMode('password')}
                className="w-full py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border border-slate-700/60"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Use Administrator Password</span>
              </button>
            ) : (
              <form onSubmit={handlePasswordLoginSubmit} className="space-y-4 pt-1">
                {/* Email Field */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>Administrator Email</span>
                  </label>
                  <input
                    id="admin-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@playroom.app"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-950 border-2 border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Password</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsResetPasswordOpen(true)}
                      className="text-[11px] text-amber-400 hover:underline font-bold cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="admin-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border-2 border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('google')}
                    className="w-1/3 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    id="admin-submit-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign In</span>}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Security Notice Footer */}
          <div className="pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Strictly restricted to authorized Playroom administrators. Unauthorized access attempts are monitored and recorded.
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center py-3 text-xs text-slate-500 font-medium">
        Playroom Early Learning © {new Date().getFullYear()} • Authoritative Licensing Infrastructure
      </footer>

      {/* Password Reset Modal */}
      <AdminResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => setIsResetPasswordOpen(false)}
        onPasswordResetSuccess={() => {
          setIsResetPasswordOpen(false);
          setSuccessMessage('Password reset successfully. You may now sign in with your new credentials.');
        }}
      />
    </div>
  );
};
