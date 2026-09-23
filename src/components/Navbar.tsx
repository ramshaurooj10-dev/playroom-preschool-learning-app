import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Volume2,
  VolumeX,
  Star,
  Sparkles,
  ArrowDownToLine,
  User,
  Lock,
  Search,
  X,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  Mic,
  Check,
  Play,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActivityId } from '../types';
import { soundManager, VOICE_PERSONAS, VoicePersonaId, VoicePersona } from '../utils/audio';
import { usePwaInstall } from '../usePwaInstall';
import { UserAccount } from './PremiumAuthModal';
import { LEARNING_ITEMS, LearningItem } from '../data/learningItems';
import { useDeveloperMode } from '../utils/devMode';
import { checkActivityAccess } from '../utils/licenseService';
import { isAdminAccount } from '../utils/userAuthService';
import { VoiceSelectorModal } from './common/VoiceSelectorModal';

interface NavbarProps {
  currentActivity: ActivityId;
  onNavigateHome: () => void;
  onSelectActivity?: (id: ActivityId) => void;
  starsCount: number;
  activityTitle?: string;
  activityEmoji?: string;
  onOpenPremiumModal?: (title?: string, level?: number, activityId?: string) => void;
  userAccount?: UserAccount | null;
  onOpenEducatorHub?: () => void;
  onOpenAdminConsole?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentActivity,
  onNavigateHome,
  onSelectActivity,
  starsCount,
  activityTitle,
  activityEmoji,
  onOpenPremiumModal,
  userAccount,
  onOpenEducatorHub,
  onOpenAdminConsole,
  onLogout,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.enabled);
  const { isDeveloperMode: isDev } = useDeveloperMode();
  const { isInstallable, installApp } = usePwaInstall();
  const [installToast, setInstallToast] = useState(false);

  // Consolidated Quick Controls Bar State
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const controlsContainerRef = useRef<HTMLDivElement>(null);

  const isSchoolActive = Boolean(
    typeof window !== 'undefined' && (() => {
      try {
        const raw = localStorage.getItem('playroom_active_school_license');
        if (!raw) return false;
        const lic = JSON.parse(raw);
        return lic && lic.status === 'ACTIVE' && lic.expiryDate && new Date(lic.expiryDate).getTime() > Date.now();
      } catch {
        return false;
      }
    })()
  );
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [activeVoicePersona, setActiveVoicePersona] = useState<VoicePersona>(() => soundManager.getActivePersona());

  useEffect(() => {
    const onVoiceChange = () => {
      setActiveVoicePersona(soundManager.getActivePersona());
    };
    window.addEventListener('playroom_voice_changed', onVoiceChange);
    return () => {
      window.removeEventListener('playroom_voice_changed', onVoiceChange);
    };
  }, []);

  // Search State inside Controls Bar
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchCategory, setSelectedSearchCategory] = useState<string>('All');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleSound = () => {
    const newStatus = !soundEnabled;
    soundManager.enabled = newStatus;
    setSoundEnabled(newStatus);
    if (newStatus) {
      soundManager.startBackgroundMusic();
      soundManager.playPop();
    } else {
      soundManager.stopSpeech();
      soundManager.stopBackgroundMusic();
    }
  };

  const handleHomeClick = () => {
    soundManager.playPop();
    setIsControlsOpen(false);
    onNavigateHome();
  };

  const handleInstallClick = () => {
    soundManager.playPop();
    if (isInstallable) {
      installApp();
    } else {
      soundManager.speak("To install Playroom, tap your browser menu and select Add to Home Screen!");
      setInstallToast(true);
      setTimeout(() => setInstallToast(false), 4000);
    }
  };

  const handleSelectPersonaDirect = (persona: VoicePersona) => {
    soundManager.playPop();
    soundManager.setVoicePersona(persona.id, true);
    setActiveVoicePersona(soundManager.getActivePersona());
  };

  // Close controls bar when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isControlsOpen &&
        controlsContainerRef.current &&
        !controlsContainerRef.current.contains(e.target as Node)
      ) {
        const toggleBtn = document.getElementById('quick-controls-toggle-btn');
        if (toggleBtn && toggleBtn.contains(e.target as Node)) return;
        setIsControlsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isControlsOpen) {
        setIsControlsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isControlsOpen]);

  // Filtered search results
  const searchResults = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return LEARNING_ITEMS.filter((item) => {
      const matchesCategory =
        selectedSearchCategory === 'All' ||
        item.learningArea.toLowerCase().includes(selectedSearchCategory.toLowerCase()) ||
        (selectedSearchCategory === 'Free' && item.isFree) ||
        (selectedSearchCategory === 'Premium' && !item.isFree);

      if (!matchesCategory) return false;
      if (!query) return true;

      return (
        item.title.toLowerCase().includes(query) ||
        item.subtitle.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.learningArea.toLowerCase().includes(query) ||
        item.keywords.some((k) => k.toLowerCase().includes(query))
      );
    });
  }, [searchQuery, selectedSearchCategory]);

  const handleSelectSearchResult = (item: LearningItem) => {
    soundManager.playPop();
    soundManager.speak(item.title);
    setIsControlsOpen(false);
    setSearchQuery('');

    const levelNum = typeof item.level === 'number' ? item.level : parseInt(String(item.level), 10) || 1;
    const access = checkActivityAccess(item.id, levelNum, userAccount?.email, false);
    const hasAccess = (item.isFree && levelNum === 1) || access.hasAccess;

    if (hasAccess) {
      if (onSelectActivity) {
        onSelectActivity(item.id);
      }
    } else if (onOpenPremiumModal) {
      onOpenPremiumModal(item.title, item.level, item.id);
    }
  };

  const searchCategories = [
    { label: 'All', icon: '✨' },
    { label: 'Literacy', icon: '🔤' },
    { label: 'Math', icon: '🔢' },
    { label: 'Colors & Shapes', icon: '🎨' },
    { label: 'Logic', icon: '🧩' },
    { label: 'Observation', icon: '🔍' },
    { label: 'Motor', icon: '✍️' },
    { label: 'Free', icon: '⭐' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#FDE047] border-b-6 sm:border-b-8 border-[#EAB308] shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        {/* Left: Home Button or Playroom Logo */}
        {currentActivity !== 'home' && currentActivity !== 'welcome' ? (
          <button
            id="home-btn-nav"
            type="button"
            onClick={handleHomeClick}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#6BCB77] hover:bg-[#58B368] text-white font-black px-3.5 sm:px-5 py-1.5 sm:py-2.5 rounded-2xl border-b-4 border-[#16A34A] active:border-b-0 active:translate-y-1 shadow-md transition-all cursor-pointer text-sm sm:text-lg tracking-wide uppercase shrink-0"
          >
            <Home className="w-4 h-4 sm:w-6 sm:h-6 stroke-[3]" />
            <span>HOME</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-white border-3 sm:border-4 border-amber-400 flex items-center justify-center text-lg sm:text-2xl shadow-inner">
              🧸
            </div>
            <span className="text-lg sm:text-3xl font-black text-[#1D4ED8] tracking-tight uppercase drop-shadow-xs">
              PLAYROOM
            </span>
          </div>
        )}

        {/* Center: Current Activity Indicator if inside an activity */}
        {currentActivity !== 'home' && currentActivity !== 'welcome' && activityTitle && (
          <div className="hidden md:flex items-center gap-2 bg-white/95 text-blue-900 px-4 py-1.5 rounded-full border-2 border-white shadow-xs font-black text-xs sm:text-sm uppercase max-w-[240px] lg:max-w-xs truncate">
            <span className="text-base">{activityEmoji}</span>
            <span className="truncate">{activityTitle}</span>
          </div>
        )}

        {/* Right Primary Controls: Only Stars Reward + Preschool Educator Hub + Consolidated Menu Bar Button */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* 1. STARS COUNTER - Child Progress Reward (VISIBLE THROUGHOUT ALL APP) */}
          <div
            id="star-counter"
            className="flex items-center gap-1 sm:gap-1.5 bg-white text-amber-950 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl border-2 sm:border-3 border-amber-300 shadow-xs font-black text-xs sm:text-base select-none"
            title="Stars collected (Child's Learning Progress)"
          >
            <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-400 text-amber-500 animate-pulse shrink-0" />
            <span className="leading-none">{starsCount}</span>
            <Sparkles className="w-3 h-3 text-amber-500 hidden sm:inline shrink-0" />
          </div>

          {/* 2. PRESCHOOL EDUCATORS HUB (Page 2 Navigation) */}
          {currentActivity !== 'welcome' && onOpenEducatorHub && (
            <button
              id="educators-hub-nav-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                setIsControlsOpen(false);
                onOpenEducatorHub();
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-indigo-50 text-indigo-900 border-2 sm:border-3 border-indigo-400 font-black text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer uppercase tracking-tight active:translate-y-0.5"
              title="Open Preschool Educators Hub (Page 2)"
            >
              <span className="text-sm sm:text-base">👩‍🏫</span>
              <span className="hidden sm:inline">PRESCHOOL EDUCATORS HUB</span>
              <span className="sm:hidden">EDUCATORS</span>
            </button>
          )}

          {/* 3. CONSOLIDATED QUICK CONTROLS BAR TOGGLE (Houses Voice, Sound, Premium, Search, Install) */}
          <button
            id="quick-controls-toggle-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setIsControlsOpen((prev) => !prev);
            }}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl font-black text-xs border-2 sm:border-3 transition-all cursor-pointer uppercase tracking-tight active:translate-y-0.5 shadow-xs ${
              isControlsOpen
                ? 'bg-indigo-900 text-white border-indigo-950 shadow-inner'
                : 'bg-white hover:bg-amber-100 text-slate-800 border-amber-400 hover:border-amber-500'
            }`}
            title="Open Quick Settings & Voice Bar"
            aria-label="App Controls & Settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">{isControlsOpen ? 'CLOSE' : 'OPTIONS'}</span>
          </button>
        </div>
      </div>

      {/* PWA Install Notification Toast */}
      {installToast && (
        <div className="max-w-md mx-auto mt-2 bg-amber-100 border-2 border-amber-400 text-amber-950 font-black text-xs px-4 py-2 rounded-2xl text-center shadow-md animate-fade-in">
          📱 To install Playroom on your device, tap your browser menu and select "Add to Home Screen" or "Install App"!
        </div>
      )}

      {/* CONSOLIDATED QUICK CONTROLS BAR (VOICE SELECT, SOUND, PREMIUM, SEARCH, INSTALL, ADMIN) */}
      <AnimatePresence>
        {isControlsOpen && (
          <motion.div
            ref={controlsContainerRef}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="max-w-4xl mx-auto mt-3 bg-white/98 backdrop-blur-md rounded-3xl border-4 border-amber-400 shadow-2xl p-4 sm:p-5 text-slate-800 space-y-4"
          >
            {/* Top Bar of Quick Menu */}
            <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <h3 className="text-sm sm:text-base font-black uppercase text-indigo-950 tracking-tight">
                  App Options & Quick Controls
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsControlsOpen(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl cursor-pointer transition-colors"
                title="Close controls bar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Grid of Main Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
              {/* 1. NARRATOR VOICE SELECTOR */}
              <div className="bg-purple-50/70 border-2 border-purple-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-purple-700 stroke-[2.5]" />
                    <span className="text-xs font-black uppercase text-purple-950">Narrator Voice</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playPop();
                      setIsVoiceModalOpen(true);
                    }}
                    className="text-[11px] font-black uppercase text-purple-700 hover:text-purple-900 underline cursor-pointer"
                  >
                    Test & Settings
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {VOICE_PERSONAS.slice(0, 3).map((persona) => {
                    const isActive = activeVoicePersona.id === persona.id;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => handleSelectPersonaDirect(persona)}
                        className={`p-2 rounded-xl text-center transition-all cursor-pointer border-2 flex flex-col items-center justify-center gap-1 ${
                          isActive
                            ? 'bg-purple-600 text-white border-purple-700 shadow-sm font-black'
                            : 'bg-white hover:bg-purple-100 text-slate-700 border-purple-200 font-bold'
                        }`}
                      >
                        <span className="text-xl leading-none">{persona.avatar}</span>
                        <span className="text-[11px] leading-tight truncate w-full">{persona.shortName}</span>
                        {isActive && <Check className="w-3 h-3 text-amber-300 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. SOUND & MUSIC TOGGLE */}
              <div className="bg-sky-50/70 border-2 border-sky-200 rounded-2xl p-3.5 space-y-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🔊</span>
                    <span className="text-xs font-black uppercase text-sky-950">Audio & Music</span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      soundEnabled
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {soundEnabled ? 'Active' : 'Muted'}
                  </span>
                </div>

                <button
                  type="button"
                  id="sound-toggle-btn"
                  onClick={toggleSound}
                  className={`w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer border-2 shadow-xs ${
                    soundEnabled
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 active:translate-y-0.5'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300 active:translate-y-0.5'
                  }`}
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Sound Effects ON (Tap to Mute)</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 stroke-[2.5]" />
                      <span>Muted (Tap to Unmute Sounds)</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3. ACCESS & MEMBERSHIP (PREMIUM / SCHOOL KEY) */}
              <div className="bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-3.5 space-y-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">👑</span>
                    <span className="text-xs font-black uppercase text-amber-950">App Membership</span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      isSchoolActive
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : userAccount?.isLoggedIn
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                  >
                    {isSchoolActive ? 'School License' : userAccount?.isLoggedIn ? 'Parent Member' : 'Free Mode'}
                  </span>
                </div>

                {onOpenPremiumModal && (
                  <button
                    type="button"
                    id="parent-account-btn"
                    onClick={() => {
                      soundManager.playPop();
                      setIsControlsOpen(false);
                      onOpenPremiumModal();
                    }}
                    className="w-full py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-amber-950 border-2 border-amber-500 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:translate-y-0.5"
                  >
                    {isSchoolActive || userAccount?.isLoggedIn ? (
                      <>
                        <User className="w-4 h-4 stroke-[2.5]" />
                        <span>Manage Account & License</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 stroke-[2.5]" />
                        <span>Unlock Premium / Enter School Key</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* 4. APP INSTALL & OFFLINE PLAY */}
              <div className="bg-pink-50/70 border-2 border-pink-200 rounded-2xl p-3.5 space-y-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📱</span>
                    <span className="text-xs font-black uppercase text-pink-950">Offline Play</span>
                  </div>
                  <span className="text-[10px] font-bold text-pink-700 bg-pink-100 border border-pink-200 px-2 py-0.5 rounded-full">
                    PWA Ready
                  </span>
                </div>

                <button
                  type="button"
                  id="pwa-install-btn"
                  onClick={handleInstallClick}
                  className="w-full py-2.5 px-3 bg-pink-500 hover:bg-pink-600 text-white border-2 border-pink-600 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:translate-y-0.5"
                >
                  <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                  <span>Install Playroom to Device</span>
                </button>
              </div>
            </div>

            {/* Search Activities Section inside Controls */}
            <div className="pt-2 border-t-2 border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-blue-600 stroke-[2.5]" />
                  <span className="text-xs font-black uppercase text-slate-800">
                    Find Games & Learning Activities
                  </span>
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Clear Search
                  </button>
                )}
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  id="activity-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search games, rhymes, letters, numbers, colors..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border-2 border-slate-200 focus:border-blue-500 rounded-2xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none transition shadow-inner"
                />
              </div>

              {/* Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {searchCategories.map((cat) => {
                  const isActive = selectedSearchCategory === cat.label;
                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => {
                        soundManager.playPop();
                        setSelectedSearchCategory(cat.label);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1 whitespace-nowrap transition cursor-pointer border ${
                        isActive
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Results List if search query or specific category is selected */}
              {(searchQuery || selectedSearchCategory !== 'All') && (
                <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5 pt-1">
                  {searchResults.length > 0 ? (
                    searchResults.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(item)}
                        className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xl flex-shrink-0">{item.emoji}</span>
                          <div className="min-w-0">
                            <span className="font-black text-slate-800 text-xs group-hover:text-blue-700 truncate block">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate block">
                              {item.learningArea}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-0.5">
                          Play <ChevronRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs font-bold text-slate-400">
                      No activities match your search.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Narrator Full Settings Modal */}
      <VoiceSelectorModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
      />
    </header>
  );
};
