import React, { useState, useRef, useEffect } from 'react';
import { Bell, ExternalLink, LogOut, Shield, CheckCheck, Trash2, X } from 'lucide-react';
import { AdminNotificationItem } from '../../services/cloudSchoolSync';

interface AdminHeaderProps {
  notifications: AdminNotificationItem[];
  unreadNotifsCount: number;
  onMarkAllRead: () => void;
  onDeleteNotif: (id: string, e: React.MouseEvent) => void;
  onNavigateHome: () => void;
  onLogout: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  notifications,
  unreadNotifsCount,
  onMarkAllRead,
  onDeleteNotif,
  onNavigateHome,
  onLogout,
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotifOpen]);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">PLAYROOM ADMIN</span>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
                  Licensing
                </span>
              </div>
              <p className="text-xs text-slate-400">School Licensing & Management</p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Notifications Bell */}
            <div className="relative" ref={popoverRef}>
              <button
                id="admin-header-notifications-btn"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                aria-label="View notifications"
                className={`relative p-2.5 rounded-xl border transition-colors ${
                  isNotifOpen
                    ? 'bg-slate-800 text-white border-slate-700'
                    : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Bell className="w-5 h-5" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse shadow-sm shadow-rose-500/50">
                    {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {isNotifOpen && (
                <div
                  id="admin-notifications-popover"
                  className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-2 z-50 overflow-hidden text-slate-200"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">Notifications</span>
                      {unreadNotifsCount > 0 && (
                        <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 text-xs font-medium rounded-full border border-rose-500/30">
                          {unreadNotifsCount} new
                        </span>
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <button
                        onClick={onMarkAllRead}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.slice(0, 15).map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 hover:bg-slate-800/50 transition-colors flex items-start gap-3 ${
                            !n.isRead ? 'bg-indigo-950/20' : ''
                          }`}
                        >
                          <div
                            className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                              !n.isRead ? 'bg-indigo-400 ring-4 ring-indigo-500/20' : 'bg-slate-600'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-semibold text-slate-100 truncate">{n.title}</h4>
                              <button
                                onClick={(e) => onDeleteNotif(n.id, e)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                                title="Dismiss notification"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                              {n.message}
                            </p>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              {new Date(n.timestamp).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* View Learning App */}
            <button
              id="admin-header-view-app-btn"
              onClick={onNavigateHome}
              className="flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-colors shadow-sm"
              title="Open Learning App"
            >
              <span>🎮 View App</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Logout Button */}
            <button
              id="admin-header-logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors shadow-sm"
              title="Sign out of Admin Dashboard"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 text-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Sign Out of Admin</h3>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Are you sure you want to log out of the PLAYROOM School Licensing Admin panel?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md shadow-rose-600/30 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
