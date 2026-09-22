import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, Wifi, AlertTriangle } from 'lucide-react';
import { soundManager } from '../../utils/audio';

interface OfflineLockScreenProps {
  children: React.ReactNode;
}

export const OfflineLockScreen: React.FC<OfflineLockScreenProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [lastCheckFailed, setLastCheckFailed] = useState<boolean>(false);

  // Active verification of real internet connectivity
  const verifyInternetConnection = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }
    // If navigator reports online or undefined, perform a safe health check
    try {
      const response = await fetch(`/?_health=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      // If HEAD fails due to network error, check navigator.onLine as backup
      return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    }
  }, []);

  const handleRetry = async () => {
    soundManager.playPop();
    setIsChecking(true);
    setLastCheckFailed(false);
    
    const online = await verifyInternetConnection();
    setIsChecking(false);
    if (online) {
      setIsOnline(true);
      setLastCheckFailed(false);
    } else {
      setIsOnline(false);
      setLastCheckFailed(true);
    }
  };

  const stopAudio = () => {
    try {
      soundManager.stopSpeech();
      soundManager.stopBackgroundMusic();
      soundManager.stopNurserySong();
    } catch (_) {
      // Ignore sound errors
    }
  };

  useEffect(() => {
    const handleOnline = async () => {
      const realOnline = await verifyInternetConnection();
      setIsOnline(realOnline);
      if (!realOnline) {
        setLastCheckFailed(true);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      stopAudio();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount
    verifyInternetConnection().then((status) => {
      if (!status) {
        setIsOnline(false);
        stopAudio();
      }
    });

    // Periodic heartbeat check every 15 seconds
    const interval = setInterval(async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const active = await verifyInternetConnection();
      if (!active) {
        setIsOnline(false);
        stopAudio();
      } else {
        setIsOnline(true);
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [verifyInternetConnection]);

  if (!isOnline) {
    return (
      <div
        id="offline-lock-overlay"
        className="fixed inset-0 z-[999999] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 select-none"
      >
        <div className="w-full max-w-md bg-white rounded-3xl border-4 border-amber-400 shadow-2xl p-6 sm:p-8 text-center flex flex-col items-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          {/* Top Offline Illustration */}
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-rose-100 rounded-full flex items-center justify-center border-4 border-rose-300 text-rose-600 shadow-inner">
              <WifiOff className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2.5] animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-amber-400 text-amber-950 p-1.5 rounded-full border-2 border-white shadow-md">
              <AlertTriangle className="w-4 h-4 stroke-[3]" />
            </div>
          </div>

          {/* Heading & Notice */}
          <div className="space-y-2">
            <div className="inline-block bg-rose-100 text-rose-800 text-[11px] font-black uppercase px-3 py-1 rounded-full border border-rose-300 tracking-wider">
              No Internet Connection
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
              Internet Required
            </h2>
            <p className="text-sm font-semibold text-slate-600 leading-relaxed max-w-xs mx-auto">
              Playroom requires an active internet connection to load activities, audio, and verify progress.
            </p>
          </div>

          {/* Guidelines Box */}
          <div className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 text-left text-xs font-bold text-slate-700 space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-950 font-black">
              <span>📶</span>
              <span>How to reconnect:</span>
            </div>
            <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1 text-[11px]">
              <li>Turn on your Wi-Fi or Mobile Data</li>
              <li>Make sure Airplane Mode is turned OFF</li>
              <li>Tap the button below to retry</li>
            </ul>
          </div>

          {lastCheckFailed && (
            <div className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
              Still unable to reach the internet. Please check your Wi-Fi/Data.
            </div>
          )}

          {/* Retry Button */}
          <button
            id="retry-internet-connection-btn"
            type="button"
            onClick={handleRetry}
            disabled={isChecking}
            className="w-full py-3.5 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-400 text-white font-black text-sm sm:text-base uppercase rounded-2xl border-b-4 border-[#1E40AF] active:border-b-0 active:translate-y-1 shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-5 h-5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking Connection...' : 'Check Connection & Resume'}</span>
          </button>

          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Playroom Preschool Learning
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
