import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building,
  School,
  Plus,
  Key,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  Lock,
  AlertCircle,
  Search,
  Copy,
  Check,
  X,
  Calendar,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  User,
  Sparkles,
  LogOut,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  AlertTriangle,
  FileCheck,
  RotateCcw,
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  Filter,
  KeyRound,
  ShieldAlert,
  Sliders,
  Send,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest } from '../../types/payment';
import { PaymentServiceManager } from '../../services/payment/PaymentServiceManager';
import {
  fetchAllSchoolLicenses,
  fetchAllSchoolRequests,
  fetchAllSchoolRenewals,
  saveSchoolLicense,
  deleteSchoolLicense,
  generateUniqueLicenseKey,
  saveSchoolRequest,
  saveSchoolRenewal,
  fetchAllAdminNotifications,
  markAllAdminNotificationsRead,
  markAdminNotificationRead,
  deleteAdminNotification,
  createAdminNotification,
  AdminNotificationItem,
} from '../../services/cloudSchoolSync';
import { UserAccount } from '../PremiumAuthModal';
import { isAdminAccount } from '../../utils/userAuthService';

interface AdminDashboardProps {
  userAccount?: UserAccount | null;
  onLogout: () => void;
  onNavigateHome: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  userAccount,
  onLogout,
  onNavigateHome,
}) => {
  const isAuthorizedAdmin = isAdminAccount(userAccount);
  const paymentManager = PaymentServiceManager.getInstance();

  // Navigation tabs inside admin dashboard
  const [activeTab, setActiveTab] = useState<
    'registered_schools' | 'pending_requests' | 'renewal_requests' | 'notifications' | 'key_generator'
  >('registered_schools');

  // Core Data States
  const [registeredSchools, setRegisteredSchools] = useState<SchoolLicense[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SchoolPaymentRequest[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<SchoolRenewalRequest[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Notification UI States
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState<boolean>(false);
  const [notifFilter, setNotifFilter] = useState<'ALL' | 'inquiry' | 'activation' | 'renewal_request' | 'revocation'>('ALL');
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'EXPIRED'>('ALL');

  // UI Modals & Actions
  const [isAddSchoolModalOpen, setIsAddSchoolModalOpen] = useState<boolean>(false);
  const [isQuickKeyGenModalOpen, setIsQuickKeyGenModalOpen] = useState<boolean>(false);
  const [schoolToDelete, setSchoolToDelete] = useState<SchoolLicense | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [renewingLicenseId, setRenewingLicenseId] = useState<string | null>(null);

  // Quick Notification Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Add School Form State
  const [newSchoolName, setNewSchoolName] = useState<string>('');
  const [newContactPerson, setNewContactPerson] = useState<string>('');
  const [newContactEmail, setNewContactEmail] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [newCity, setNewCity] = useState<string>('Karachi');
  const [newGeneratedKey, setNewGeneratedKey] = useState<string>('');
  const [newIsSubmitting, setNewIsSubmitting] = useState<boolean>(false);

  // Standalone Key Generator Tab State
  const [genSchoolName, setGenSchoolName] = useState<string>('');
  const [genCity, setGenCity] = useState<string>('Karachi');
  const [genDays, setGenDays] = useState<number>(30);
  const [genResultKey, setGenResultKey] = useState<string>('');
  const [genIsCreating, setGenIsCreating] = useState<boolean>(false);

  // Quick Key Generator State
  const [quickKeyGenerated, setQuickKeyGenerated] = useState<string>('');
  const [quickKeyLabel, setQuickKeyLabel] = useState<string>('');

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const copyToClipboard = (key: string, label: string = 'License Key') => {
    soundManager.playPop();
    navigator.clipboard.writeText(key.trim()).then(() => {
      setCopiedKey(key);
      showToast(`${label} copied to clipboard!`, 'success');
      setTimeout(() => setCopiedKey(null), 3000);
    }).catch(() => {
      showToast(`Key: ${key}`, 'info');
    });
  };

  // Close notification popover when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setIsNotifDropdownOpen(false);
      }
    };
    if (isNotifDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotifDropdownOpen]);

  // Load all school licenses, pending requests, renewals, and notifications
  const loadAllData = useCallback(async (showIndicator = false) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const [licenses, requests, renewals, notifs] = await Promise.all([
        fetchAllSchoolLicenses(),
        fetchAllSchoolRequests(),
        fetchAllSchoolRenewals(),
        fetchAllAdminNotifications(),
      ]);

      setRegisteredSchools(licenses);
      setPendingRequests(requests);
      setRenewalRequests(renewals);
      setNotifications(notifs);
    } catch (err) {
      console.warn('Error loading admin school data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllData(false);

    // Real-time listener for license or request updates across tabs
    const handleUpdate = () => {
      loadAllData(false);
    };

    window.addEventListener('playroom_license_update', handleUpdate);
    window.addEventListener('playroom_school_request_update', handleUpdate);
    window.addEventListener('playroom_renewal_update', handleUpdate);
    window.addEventListener('playroom_admin_notification_update', handleUpdate);

    // Heartbeat sync every 8 seconds
    const interval = setInterval(() => {
      loadAllData(false);
    }, 8000);

    return () => {
      window.removeEventListener('playroom_license_update', handleUpdate);
      window.removeEventListener('playroom_school_request_update', handleUpdate);
      window.removeEventListener('playroom_renewal_update', handleUpdate);
      window.removeEventListener('playroom_admin_notification_update', handleUpdate);
      clearInterval(interval);
    };
  }, [loadAllData]);

  // Handle Mark All Notifications as Read
  const handleMarkAllNotifsRead = async () => {
    soundManager.playPop();
    await markAllAdminNotificationsRead();
    loadAllData(false);
    showToast('All notifications marked as read', 'info');
  };

  // Handle Delete Notification
  const handleDeleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundManager.playPop();
    await deleteAdminNotification(id);
    loadAllData(false);
  };

  // Open Add School Modal & pre-generate key
  const handleOpenAddSchool = () => {
    soundManager.playPop();
    const key = generateUniqueLicenseKey();
    setNewGeneratedKey(key);
    setNewSchoolName('');
    setNewContactPerson('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewCity('Karachi');
    setIsAddSchoolModalOpen(true);
  };

  // Handle Add School Submission
  const handleCreateSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) {
      showToast('Please enter the school name.', 'error');
      return;
    }

    setNewIsSubmitting(true);
    soundManager.playPop();

    try {
      const uniqueKey = newGeneratedKey.trim() || generateUniqueLicenseKey();
      const schoolId = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      const newLicense: SchoolLicense = {
        id: `lic_${Date.now()}`,
        licenseKey: uniqueKey,
        schoolId: schoolId,
        schoolName: newSchoolName.trim(),
        schoolAdminName: newContactPerson.trim() || 'Principal / Administrator',
        contactName: newContactPerson.trim() || 'Principal / Administrator',
        contactEmail: newContactEmail.trim() || (userAccount?.email || 'admin@playroom.edu'),
        country: 'Pakistan',
        city: newCity.trim() || 'Karachi',
        price: 5000,
        currency: 'PKR',
        allowedDevices: 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: 'PENDING', // Will start 30-day countdown the moment entered on device
        durationMonths: 1,
        durationDays: 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Registered by Admin (${userAccount?.email || 'Owner'}). Phone: ${newContactPhone.trim() || 'N/A'}. 30-day countdown starts on key entry.`,
      };

      await saveSchoolLicense(newLicense);
      soundManager.playSuccess();
      showToast(`School "${newLicense.schoolName}" registered successfully with key ${uniqueKey}!`, 'success');
      setIsAddSchoolModalOpen(false);
      loadAllData(false);
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to register school.', 'error');
    } finally {
      setNewIsSubmitting(false);
    }
  };

  // Handle Standalone Key Generator Tab Submission
  const handleGenerateKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genSchoolName.trim()) {
      showToast('Please enter the school or organization name.', 'error');
      return;
    }

    setGenIsCreating(true);
    soundManager.playPop();

    try {
      const uniqueKey = generateUniqueLicenseKey();
      const schoolId = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      const newLicense: SchoolLicense = {
        id: `lic_${Date.now()}`,
        licenseKey: uniqueKey,
        schoolId: schoolId,
        schoolName: genSchoolName.trim(),
        schoolAdminName: 'School Administrator',
        contactName: 'School Administrator',
        contactEmail: userAccount?.email || 'admin@playroom.edu',
        country: 'Pakistan',
        city: genCity.trim() || 'Karachi',
        price: 5000,
        currency: 'PKR',
        allowedDevices: 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: 'PENDING',
        durationMonths: 1,
        durationDays: genDays || 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Generated via Admin License Generator tool by ${userAccount?.email || 'Admin'}.`,
      };

      await saveSchoolLicense(newLicense);
      setGenResultKey(uniqueKey);
      soundManager.playSuccess();
      copyToClipboard(uniqueKey, `License Key for ${genSchoolName}`);
      showToast(`License Key ${uniqueKey} created and copied!`, 'success');
      loadAllData(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to create license key.', 'error');
    } finally {
      setGenIsCreating(false);
    }
  };

  // Handle Approve Pending Request
  const handleApprovePendingRequest = async (req: SchoolPaymentRequest) => {
    soundManager.playPop();
    try {
      const generatedKey = generateUniqueLicenseKey();
      const schoolId = req.schoolId || `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newLicense: SchoolLicense = {
        id: `lic_${Date.now()}`,
        licenseKey: generatedKey,
        schoolId: schoolId,
        schoolName: req.schoolName,
        schoolAdminName: req.schoolAdminName || req.contactName || 'School Admin',
        contactName: req.contactName || req.schoolAdminName || 'School Admin',
        contactEmail: req.contactEmail,
        country: req.country || 'Pakistan',
        city: req.city || 'Pakistan',
        price: req.amount || 5000,
        currency: req.currency || 'PKR',
        allowedDevices: req.allowedDevices || 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: 'PENDING', // Activates 30 days upon key entry
        durationMonths: req.durationMonths || 1,
        durationDays: 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Approved from payment request #${req.id}. Phone: ${req.contactPhone || req.phoneNumber || 'N/A'}. Key: ${generatedKey}`,
      };

      await saveSchoolLicense(newLicense);

      // Update request status to APPROVED
      const updatedReq: SchoolPaymentRequest = {
        ...req,
        status: 'APPROVED',
        reviewedAt: new Date().toISOString(),
        reviewedBy: userAccount?.email || 'Admin',
        adminNotes: `License Key: ${generatedKey}`,
      };
      await saveSchoolRequest(updatedReq);

      soundManager.playSuccess();
      copyToClipboard(generatedKey, `License Key for ${req.schoolName}`);
      showToast(`Approved! Key ${generatedKey} generated and copied. School is now in Registered Schools.`, 'success');
      loadAllData(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve request.', 'error');
    }
  };

  // Handle Renew School License (Extend for 30 Days)
  const handleRenewSchoolLicense = async (school: SchoolLicense) => {
    soundManager.playPop();
    setRenewingLicenseId(school.id);
    try {
      const now = new Date();
      let newValidUntil: Date;

      if (school.status === 'ACTIVE' && (school.validUntil || school.expiryDate)) {
        const currentExp = new Date(school.validUntil || school.expiryDate!).getTime();
        if (currentExp > now.getTime()) {
          // If still active, add 30 days to existing expiry
          newValidUntil = new Date(currentExp + 30 * 24 * 60 * 60 * 1000);
        } else {
          // If expired, add 30 days from now
          newValidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
      } else {
        // If pending, start 30 days from now
        newValidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      const updatedLicense: SchoolLicense = {
        ...school,
        status: 'ACTIVE',
        startDate: school.startDate || now.toISOString(),
        validFrom: school.validFrom || now.toISOString(),
        expiryDate: newValidUntil.toISOString(),
        validUntil: newValidUntil.toISOString(),
        durationDays: 30,
        durationMonths: 1,
        adminNotes: `Renewed for 30 days on ${now.toLocaleDateString()} by ${userAccount?.email || 'Admin'}`,
      };

      await saveSchoolLicense(updatedLicense);

      // If there was a pending renewal request for this key, mark it APPROVED
      const pendingRen = renewalRequests.find(
        (r) => r.licenseKey.toUpperCase() === school.licenseKey.toUpperCase() && r.status === 'PENDING'
      );
      if (pendingRen) {
        await saveSchoolRenewal({
          ...pendingRen,
          status: 'APPROVED',
          approvedAt: now.toISOString(),
          approvedBy: userAccount?.email || 'Admin',
        });
      }

      soundManager.playSuccess();
      showToast(`License for "${school.schoolName}" renewed successfully for 30 Days!`, 'success');
      loadAllData(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to renew license.', 'error');
    } finally {
      setRenewingLicenseId(null);
    }
  };

  // Handle Delete School & Revoke Key (Strict Immediate Lockdown)
  const handleConfirmDeleteSchool = async () => {
    if (!schoolToDelete) return;
    setIsDeleting(true);
    soundManager.playPop();

    try {
      const targetId = schoolToDelete.id;
      const targetKey = schoolToDelete.licenseKey;

      // 1. Delete license from Supabase and LocalStorage
      await deleteSchoolLicense(targetId);
      if (targetKey) {
        await deleteSchoolLicense(targetKey);
      }

      // 2. Clear from PaymentServiceManager
      await paymentManager.deleteSchoolLicense(targetId);

      // 3. If currently logged in or active session uses this key, purge it immediately
      if (typeof window !== 'undefined') {
        const activeRaw = localStorage.getItem('playroom_active_school_license');
        if (activeRaw) {
          try {
            const activeLic = JSON.parse(activeRaw);
            if (
              activeLic.id === targetId ||
              activeLic.licenseKey?.toUpperCase() === targetKey?.toUpperCase() ||
              activeLic.schoolId === schoolToDelete.schoolId
            ) {
              localStorage.removeItem('playroom_active_school_license');
              window.dispatchEvent(new CustomEvent('playroom_license_update'));
            }
          } catch (_) {}
        }
      }

      soundManager.playSuccess();
      showToast(`School "${schoolToDelete.schoolName}" deleted. License key revoked and app locked immediately!`, 'success');
      setSchoolToDelete(null);
      loadAllData(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete school.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered registered schools
  const filteredSchools = registeredSchools.filter((sch) => {
    const matchSearch =
      !searchQuery.trim() ||
      sch.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sch.licenseKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sch.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sch.contactEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sch.city?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return sch.status === 'ACTIVE';
    if (statusFilter === 'PENDING') return sch.status === 'PENDING';
    if (statusFilter === 'EXPIRED') return sch.status === 'EXPIRED';

    return true;
  });

  // Filtered notifications
  const filteredNotifications = notifications.filter((n) => {
    if (notifFilter === 'ALL') return true;
    return n.type === notifFilter;
  });

  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;
  const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length;
  const renewalCount = renewalRequests.filter((r) => r.status === 'PENDING').length;
  const activeSchoolsCount = registeredSchools.filter((s) => s.status === 'ACTIVE').length;

  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  return (
    <div id="admin-dashboard-root" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-950 font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-4 right-4 z-[99999] px-4 py-3 rounded-2xl shadow-2xl border-2 flex items-center gap-3 text-xs sm:text-sm font-bold ${
              toastMessage.type === 'error'
                ? 'bg-rose-950 border-rose-500 text-rose-200'
                : toastMessage.type === 'info'
                ? 'bg-indigo-950 border-indigo-500 text-indigo-200'
                : 'bg-emerald-950 border-emerald-500 text-emerald-200'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white ml-2 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header / Navigation Bar */}
      <header className="w-full bg-slate-950 border-b-2 border-slate-800 px-4 sm:px-8 py-4 shrink-0 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Brand & Identity */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-tr from-amber-500 to-amber-300 rounded-2xl flex items-center justify-center border-2 border-white shadow-md text-slate-950">
                <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
                    PLAYROOM System Administration
                  </h1>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-amber-400/30">
                    Administrator
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {userAccount?.email || 'Authorized Administrator'} • School Licensing & Activation
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => {
                  soundManager.playPop();
                  setIsNotifDropdownOpen(!isNotifDropdownOpen);
                }}
                className="relative p-2.5 bg-slate-800 text-slate-300 rounded-xl"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-pulse">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleOpenAddSchool}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1.5"
                title="Add School Manually"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 p-2.5 rounded-xl font-black text-xs uppercase"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3 shrink-0 relative">
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                id="admin-notif-bell-btn"
                type="button"
                onClick={() => {
                  soundManager.playPop();
                  setIsNotifDropdownOpen(!isNotifDropdownOpen);
                }}
                className="relative px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                title="Admin Notifications"
              >
                <Bell className={`w-4 h-4 ${unreadNotifsCount > 0 ? 'text-amber-400' : ''}`} />
                <span>Notifications</span>
                {unreadNotifsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              <AnimatePresence>
                {isNotifDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-96 bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl p-4 z-50 text-slate-100 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <BellRing className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-black uppercase text-white">Live Activity Alerts</h4>
                        {unreadNotifsCount > 0 && (
                          <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                            {unreadNotifsCount} new
                          </span>
                        )}
                      </div>
                      {unreadNotifsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllNotifsRead}
                          className="text-[10px] font-bold text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <CheckCheck className="w-3 h-3" />
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {notifications.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 text-xs">
                          <Inbox className="w-6 h-6 mx-auto mb-1 opacity-50" />
                          No notifications yet
                        </div>
                      ) : (
                        notifications.slice(0, 5).map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markAdminNotificationRead(n.id);
                              loadAllData(false);
                              if (n.type === 'inquiry') setActiveTab('pending_requests');
                              else if (n.type === 'renewal_request') setActiveTab('renewal_requests');
                              else setActiveTab('registered_schools');
                              setIsNotifDropdownOpen(false);
                            }}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                              !n.isRead
                                ? 'bg-slate-800/90 border-amber-500/50 hover:bg-slate-800'
                                : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold text-white mb-0.5">
                              <span className="truncate">{n.title}</span>
                              <span className="text-[10px] text-slate-400 shrink-0">{formatTimeAgo(n.timestamp)}</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="border-t border-slate-800 pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('notifications');
                          setIsNotifDropdownOpen(false);
                        }}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                      >
                        View All ({notifications.length}) →
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNotifDropdownOpen(false)}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Refresh Data Button */}
            <button
              id="admin-refresh-data-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                loadAllData(true);
              }}
              disabled={isRefreshing}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
              title="Refresh School Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            {/* View Child App / Home */}
            <button
              id="admin-view-app-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                onNavigateHome();
              }}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 rounded-xl border border-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>View Learning App</span>
            </button>

            {/* + Add School Manually (Top Right Dedicated Button) */}
            <button
              id="admin-add-school-top-btn"
              type="button"
              onClick={handleOpenAddSchool}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg hover:shadow-emerald-500/20 active:translate-y-0.5 border-b-4 border-emerald-800 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add School Manually</span>
            </button>

            {/* Logout Button */}
            <button
              id="admin-top-logout-btn"
              type="button"
              onClick={() => {
                soundManager.playPop();
                onLogout();
              }}
              className="px-4 py-2.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white rounded-xl border border-rose-800/80 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* KPI / Status Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div
            onClick={() => setActiveTab('registered_schools')}
            className={`cursor-pointer transition-all border-2 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-md ${
              activeTab === 'registered_schools'
                ? 'bg-slate-800 border-amber-400'
                : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Registered Schools
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {registeredSchools.length}
                </span>
                <span className="text-xs font-semibold text-emerald-400">
                  ({activeSchoolsCount} Active)
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-indigo-950/80 border border-indigo-500/40 rounded-2xl flex items-center justify-center text-indigo-400">
              <School className="w-6 h-6" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('pending_requests')}
            className={`cursor-pointer transition-all border-2 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-md ${
              pendingCount > 0
                ? 'bg-amber-950/40 border-amber-500/80 hover:bg-amber-950/60'
                : activeTab === 'pending_requests'
                ? 'bg-slate-800 border-amber-400'
                : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Inquiry Requests
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black ${pendingCount > 0 ? 'text-amber-400' : 'text-white'}`}>
                  {pendingCount}
                </span>
                {pendingCount > 0 && (
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
                    Action Needed
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 bg-amber-950/80 border border-amber-500/40 rounded-2xl flex items-center justify-center text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('renewal_requests')}
            className={`cursor-pointer transition-all border-2 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-md ${
              renewalCount > 0
                ? 'bg-purple-950/40 border-purple-500/80 hover:bg-purple-950/60'
                : activeTab === 'renewal_requests'
                ? 'bg-slate-800 border-purple-400'
                : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Renewal Inquiries
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black ${renewalCount > 0 ? 'text-purple-300' : 'text-white'}`}>
                  {renewalCount}
                </span>
                {renewalCount > 0 && (
                  <span className="text-[11px] font-bold text-purple-200 bg-purple-500/20 px-2 py-0.5 rounded-full animate-pulse">
                    Pending
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 bg-purple-950/80 border border-purple-500/40 rounded-2xl flex items-center justify-center text-purple-400">
              <RotateCcw className="w-6 h-6" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('notifications')}
            className={`cursor-pointer transition-all border-2 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-md ${
              unreadNotifsCount > 0
                ? 'bg-sky-950/40 border-sky-500/80 hover:bg-sky-950/60'
                : activeTab === 'notifications'
                ? 'bg-slate-800 border-sky-400'
                : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Live Audit Alerts
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black ${unreadNotifsCount > 0 ? 'text-sky-300' : 'text-white'}`}>
                  {notifications.length}
                </span>
                {unreadNotifsCount > 0 && (
                  <span className="text-[11px] font-bold text-sky-200 bg-sky-500/20 px-2 py-0.5 rounded-full animate-pulse">
                    {unreadNotifsCount} unread
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 bg-sky-950/80 border border-sky-500/40 rounded-2xl flex items-center justify-center text-sky-400">
              <Bell className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b-2 border-slate-800 pb-3 overflow-x-auto">
          <button
            id="tab-registered-schools-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setActiveTab('registered_schools');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'registered_schools'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <School className="w-4 h-4" />
            <span>Registered Schools ({registeredSchools.length})</span>
          </button>

          <button
            id="tab-pending-requests-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setActiveTab('pending_requests');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 relative ${
              activeTab === 'pending_requests'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Inquiry Requests</span>
            {pendingCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            id="tab-renewal-requests-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setActiveTab('renewal_requests');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 relative ${
              activeTab === 'renewal_requests'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Renewals ({renewalRequests.length})</span>
            {renewalCount > 0 && (
              <span className="bg-purple-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {renewalCount}
              </span>
            )}
          </button>

          <button
            id="tab-notifications-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setActiveTab('notifications');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 relative ${
              activeTab === 'notifications'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Live Alerts ({notifications.length})</span>
            {unreadNotifsCount > 0 && (
              <span className="bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          <button
            id="tab-key-generator-btn"
            type="button"
            onClick={() => {
              soundManager.playPop();
              setActiveTab('key_generator');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'key_generator'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>License Generator</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: REGISTERED SCHOOLS LIST */}
        {/* ========================================================================= */}
        {activeTab === 'registered_schools' && (
          <div className="space-y-4">
            {/* Search and Filters Bar */}
            <div className="bg-slate-800/90 border-2 border-slate-700 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search school name, key, city..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto">
                <span className="text-xs font-bold text-slate-400 mr-1 hidden sm:inline">Status:</span>
                {(['ALL', 'ACTIVE', 'PENDING', 'EXPIRED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      soundManager.playPop();
                      setStatusFilter(st);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer shrink-0 ${
                      statusFilter === st
                        ? 'bg-amber-400 text-slate-950 font-black'
                        : 'bg-slate-900 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* School Cards / Table */}
            {isLoading ? (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-400 mb-3" />
                <p className="text-sm font-bold">Loading registered schools from database...</p>
              </div>
            ) : filteredSchools.length === 0 ? (
              <div className="bg-slate-800/60 border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-500 border border-slate-700">
                  <School className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase">No Schools Found</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    {searchQuery
                      ? 'No registered schools matched your search criteria.'
                      : 'No schools registered yet. Click "Add School Manually" to create the first authorized school license.'}
                  </p>
                </div>
                <button
                  onClick={handleOpenAddSchool}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First School</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredSchools.map((school) => {
                  const isPending =
                    school.status === 'PENDING' ||
                    (!school.validFrom && !school.startDate && !school.validUntil && !school.expiryDate);

                  const startIso = school.validFrom || school.startDate;
                  const expiryIso = school.validUntil || school.expiryDate;

                  let isExpired = false;
                  let daysLeft = 30;

                  if (expiryIso && !isPending) {
                    const diffMs = new Date(expiryIso).getTime() - new Date().getTime();
                    daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    isExpired = diffMs <= 0 || school.status === 'EXPIRED';
                  }

                  const formatDateTime = (iso?: string | null) => {
                    if (!iso) return 'Pending (on key entry)';
                    try {
                      return new Date(iso).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    } catch {
                      return iso;
                    }
                  };

                  return (
                    <div
                      key={school.id || school.licenseKey}
                      className="bg-slate-800/90 hover:bg-slate-800 border-2 border-slate-700/80 hover:border-slate-600 rounded-2xl p-4 sm:p-5 transition-all shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Left: School Information */}
                      <div className="space-y-2.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                            {school.schoolName}
                          </h3>
                          {/* Status Badge */}
                          {isPending ? (
                            <span className="bg-amber-500/20 text-amber-300 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Key Issued • Awaiting Entry</span>
                            </span>
                          ) : isExpired ? (
                            <span className="bg-rose-500/20 text-rose-300 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border border-rose-500/40 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>Expired</span>
                            </span>
                          ) : (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active • {daysLeft} Days Left</span>
                            </span>
                          )}
                        </div>

                        {/* Metadata Details */}
                        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-300 font-medium">
                          {school.contactName && (
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{school.contactName}</span>
                            </span>
                          )}
                          {school.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>{school.city}, {school.country || 'Pakistan'}</span>
                            </span>
                          )}
                          {school.contactEmail && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-400">{school.contactEmail}</span>
                            </span>
                          )}
                        </div>

                        {/* License Key Box */}
                        <div className="flex items-center gap-2 pt-1">
                          <div className="bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono font-black text-amber-300 tracking-wider select-all">
                            <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{school.licenseKey}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(school.licenseKey, `License Key for ${school.schoolName}`)}
                            className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                            title="Copy License Key"
                          >
                            {copiedKey === school.licenseKey ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden sm:inline">Copy</span>
                          </button>
                        </div>
                      </div>

                      {/* Middle: Timing Details */}
                      <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-xs space-y-1.5 min-w-[200px]">
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Activation Date:</span>
                          <span className="font-bold text-slate-200">{formatDateTime(startIso)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Expiry Date:</span>
                          <span className={`font-bold ${isExpired ? 'text-rose-400' : 'text-amber-300'}`}>
                            {formatDateTime(expiryIso)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Validity Period:</span>
                          <span className="font-bold text-slate-300">30 Days (1 Month)</span>
                        </div>
                      </div>

                      {/* Right: Actions (Renew Key & Delete School) */}
                      <div className="flex items-center gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-700">
                        {/* Renew Key Button */}
                        <button
                          type="button"
                          onClick={() => handleRenewSchoolLicense(school)}
                          disabled={renewingLicenseId === school.id}
                          className="flex-1 lg:flex-none px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:translate-y-0.5"
                          title="Extend / Renew License for 30 Days"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${renewingLicenseId === school.id ? 'animate-spin' : ''}`} />
                          <span>{renewingLicenseId === school.id ? 'Renewing...' : 'Renew (30 Days)'}</span>
                        </button>

                        {/* Delete School Button */}
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playPop();
                            setSchoolToDelete(school);
                          }}
                          className="flex-1 lg:flex-none px-3.5 py-2.5 bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:translate-y-0.5"
                          title="Delete School and Revoke Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete School</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PENDING SCHOOL PAYMENT REQUESTS */}
        {/* ========================================================================= */}
        {activeTab === 'pending_requests' && (
          <div className="space-y-4">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white uppercase">Incoming School Requests</h3>
                <p className="text-xs text-slate-400">
                  Schools that submitted registration requests after payment. Approve to assign key and add to Registered Schools.
                </p>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">No pending requests</p>
                <p className="text-xs text-slate-400 mt-1">All incoming school requests have been processed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-black text-white">{req.schoolName}</h4>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-300">
                        <span>Contact: {req.contactName || req.schoolAdminName || 'Administrator'}</span>
                        <span>Email: {req.contactEmail}</span>
                        {(req.contactPhone || req.phoneNumber) && (
                          <span>Phone: {req.contactPhone || req.phoneNumber}</span>
                        )}
                        {req.city && <span>City: {req.city}</span>}
                        <span>Amount: {req.amount} {req.currency}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'PENDING' ? (
                        <button
                          type="button"
                          onClick={() => handleApprovePendingRequest(req)}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve & Issue Key</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approved</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SCHOOL RENEWAL REQUESTS */}
        {/* ========================================================================= */}
        {activeTab === 'renewal_requests' && (
          <div className="space-y-4">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white uppercase">License Renewal Inquiries</h3>
                <p className="text-xs text-slate-400">
                  Requests submitted by schools whose 30-day license expired and want to renew.
                </p>
              </div>
            </div>

            {renewalRequests.length === 0 ? (
              <div className="bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-purple-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">No renewal requests</p>
                <p className="text-xs text-slate-400 mt-1">There are no pending school renewal requests.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {renewalRequests.map((ren) => (
                  <div
                    key={ren.id}
                    className="bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-black text-white">{ren.schoolName || 'School Partner'}</h4>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            ren.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          }`}
                        >
                          {ren.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        License Key: <code className="font-mono text-amber-300 font-bold">{ren.licenseKey}</code>
                      </div>
                      <div className="text-xs text-slate-400">
                        Requested at: {new Date(ren.requestedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ren.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => {
                            const foundLic = registeredSchools.find(
                              (s) => s.licenseKey.toUpperCase() === ren.licenseKey.toUpperCase()
                            );
                            if (foundLic) {
                              handleRenewSchoolLicense(foundLic);
                            } else {
                              showToast('School license not found in list.', 'error');
                            }
                          }}
                          className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Approve & Renew (30 Days)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: LIVE NOTIFICATIONS & AUDIT CENTER */}
        {/* ========================================================================= */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white uppercase flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-sky-400" />
                  <span>Real-Time School Activity Alerts</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Authoritative notifications for school key activations, new inquiries, and renewal requests.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {unreadNotifsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllNotifsRead}
                    className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs uppercase rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CheckCheck className="w-4 h-4 text-emerald-400" />
                    <span>Mark all as read</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  { key: 'ALL', label: 'ALL' },
                  { key: 'activation', label: 'ACTIVATIONS' },
                  { key: 'inquiry', label: 'INQUIRIES' },
                  { key: 'renewal_request', label: 'RENEWALS' },
                  { key: 'revocation', label: 'REVOCATIONS' },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    soundManager.playPop();
                    setNotifFilter(filter.key);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer shrink-0 ${
                    notifFilter === filter.key
                      ? 'bg-sky-400 text-slate-950 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredNotifications.length === 0 ? (
              <div className="bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                <Inbox className="w-10 h-10 text-sky-400 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-bold text-white">No notifications matching filter</p>
                <p className="text-xs text-slate-400 mt-1">
                  New school activations and requests will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`border-2 rounded-2xl p-4 transition-all shadow-md flex items-start justify-between gap-4 ${
                      !notif.isRead
                        ? 'bg-slate-800/95 border-sky-500/60'
                        : 'bg-slate-800/60 border-slate-700/80 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          notif.type === 'activation'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : notif.type === 'inquiry'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : notif.type === 'renewal_request'
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                            : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        }`}
                      >
                        {notif.type === 'activation' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : notif.type === 'inquiry' ? (
                          <School className="w-5 h-5" />
                        ) : notif.type === 'renewal_request' ? (
                          <RotateCcw className="w-5 h-5" />
                        ) : (
                          <ShieldAlert className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-white">{notif.title}</h4>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              notif.type === 'activation'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : notif.type === 'inquiry'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : notif.type === 'renewal_request'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {notif.type.replace('_', ' ')}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                          )}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{notif.message}</p>
                        <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                          <span>{new Date(notif.timestamp).toLocaleString()}</span>
                          {notif.metadata?.schoolName && <span>School: {notif.metadata.schoolName}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!notif.isRead && (
                        <button
                          type="button"
                          onClick={() => {
                            markAdminNotificationRead(notif.id);
                            loadAllData(false);
                          }}
                          className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotif(notif.id, e)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-all"
                        title="Delete notification"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: LICENSE KEY GENERATOR */}
        {/* ========================================================================= */}
        {activeTab === 'key_generator' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-800/80 border-2 border-slate-700 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
                <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/40">
                  <KeyRound className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase text-white tracking-tight">
                    Dedicated School License Generator
                  </h3>
                  <p className="text-xs text-slate-400">
                    Instantly issue an official 30-day Playroom School Key for any institute
                  </p>
                </div>
              </div>

              <form onSubmit={handleGenerateKeySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    School / Institute Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={genSchoolName}
                    onChange={(e) => setGenSchoolName(e.target.value)}
                    placeholder="e.g. Army Public School / The City School"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      value={genCity}
                      onChange={(e) => setGenCity(e.target.value)}
                      placeholder="Karachi, Lahore..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                      Validity (Days)
                    </label>
                    <select
                      value={genDays}
                      onChange={(e) => setGenDays(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value={30}>30 Days (Standard 1 Month)</option>
                      <option value={60}>60 Days (2 Months)</option>
                      <option value={90}>90 Days (Quarterly)</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={genIsCreating}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg border-b-4 border-amber-600 active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-5 h-5 text-slate-950" />
                  <span>{genIsCreating ? 'Generating & Registering...' : 'Generate & Authorize Key'}</span>
                </button>
              </form>

              {genResultKey && (
                <div className="bg-slate-950 border-2 border-amber-500/50 rounded-2xl p-5 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      Authorized School Key Generated
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                      Saved to Cloud
                    </span>
                  </div>

                  <div className="font-mono text-xl sm:text-2xl font-black text-amber-300 tracking-wider select-all bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                    <span>{genResultKey}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(genResultKey, 'Generated License Key')}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === genResultKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>Copy</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">
                    Give this key to the school. As soon as they enter it on any device, the 30-day timer will begin and activate the Educator Hub.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* RIGHT DOWN SIDE: FLOATING QUICK LICENSE KEY GENERATOR BUTTON */}
      {/* ========================================================================= */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          id="admin-floating-gen-key-btn"
          type="button"
          onClick={() => {
            soundManager.playPop();
            const k = generateUniqueLicenseKey();
            setQuickKeyGenerated(k);
            setQuickKeyLabel('');
            setIsQuickKeyGenModalOpen(true);
          }}
          className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-white ring-4 ring-amber-400/30 flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
          title="Quick Generate License Key"
        >
          <Key className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          <span>Generate License Key</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD SCHOOL MANUALLY */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAddSchoolModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-slate-900 border-4 border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl text-slate-100 space-y-5"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/30">
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase text-white tracking-tight">
                      Add School Manually
                    </h3>
                    <p className="text-xs text-slate-400">Register partner school and generate 30-day key</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddSchoolModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleCreateSchoolSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                    School Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    placeholder="e.g. Beaconhouse Preschool / The City School"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={newContactPerson}
                      onChange={(e) => setNewContactPerson(e.target.value)}
                      placeholder="Principal / Coordinator"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="Karachi, Lahore, Islamabad..."
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      placeholder="school@domain.com"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      placeholder="+92 300 1234567"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Auto Generated Key Preview */}
                <div className="bg-slate-950 border border-slate-700 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">Assigned License Key:</span>
                    <button
                      type="button"
                      onClick={() => setNewGeneratedKey(generateUniqueLicenseKey())}
                      className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Regenerate Key</span>
                    </button>
                  </div>
                  <div className="font-mono text-sm sm:text-base font-black text-amber-300 tracking-wider">
                    {newGeneratedKey}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Key status will be <span className="text-amber-300 font-bold">Pending Activation</span>. The 30-day countdown begins the moment the school enters this key.
                  </p>
                </div>

                {/* Submit Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddSchoolModalOpen(false)}
                    className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={newIsSubmitting}
                    className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-lg border-b-4 border-emerald-800 active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{newIsSubmitting ? 'Registering School...' : 'Register School'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK KEY GENERATOR */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isQuickKeyGenModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border-4 border-amber-500/60 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-amber-400 text-slate-950 rounded-xl flex items-center justify-center font-black shadow-md">
                    <Key className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
                      Quick License Generator
                    </h3>
                    <p className="text-xs text-slate-400">Generate a 30-day school activation key</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsQuickKeyGenModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">
                    School Name / Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={quickKeyLabel}
                    onChange={(e) => setQuickKeyLabel(e.target.value)}
                    placeholder="e.g. Generation's School (Clifton)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="bg-slate-950 border-2 border-amber-500/40 rounded-2xl p-4 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Generated License Key
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-black text-amber-300 tracking-wider select-all">
                    {quickKeyGenerated}
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setQuickKeyGenerated(generateUniqueLicenseKey())}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>New Key</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(quickKeyGenerated, 'License Key')}
                      className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg text-xs font-black flex items-center gap-1 shadow-md cursor-pointer"
                    >
                      {copiedKey === quickKeyGenerated ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === quickKeyGenerated ? 'Copied!' : 'Copy Key'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickKeyGenModalOpen(false)}
                  className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    soundManager.playPop();
                    try {
                      const newLic: SchoolLicense = {
                        id: `lic_${Date.now()}`,
                        licenseKey: quickKeyGenerated,
                        schoolId: `sch_${Date.now()}`,
                        schoolName: quickKeyLabel.trim() || 'Partner School',
                        schoolAdminName: 'Principal',
                        contactName: 'Principal',
                        contactEmail: userAccount?.email || 'admin@playroom.edu',
                        country: 'Pakistan',
                        city: 'Karachi',
                        price: 5000,
                        currency: 'PKR',
                        allowedDevices: 999999,
                        page1Access: true,
                        page2Access: true,
                        startDate: null,
                        expiryDate: null,
                        validFrom: null,
                        validUntil: null,
                        status: 'PENDING',
                        durationMonths: 1,
                        durationDays: 30,
                        createdAt: new Date().toISOString(),
                        adminNotes: `Quick generated key by Admin (${userAccount?.email || 'Owner'}).`,
                      };
                      await saveSchoolLicense(newLic);
                      soundManager.playSuccess();
                      showToast(`Key ${quickKeyGenerated} saved to Registered Schools list!`, 'success');
                      setIsQuickKeyGenModalOpen(false);
                      loadAllData(false);
                    } catch (err: any) {
                      showToast(err?.message || 'Failed to save key.', 'error');
                    }
                  }}
                  className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg border-b-4 border-emerald-800 active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Save to Registered Schools</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE SCHOOL & REVOKE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {schoolToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border-4 border-rose-600 rounded-3xl p-6 sm:p-7 shadow-2xl text-slate-100 space-y-4 text-center"
            >
              <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border-2 border-rose-500/40">
                <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase text-white tracking-tight">
                  Delete School & Revoke License?
                </h3>
                <p className="text-xs text-rose-300 font-bold">
                  "{schoolToDelete.schoolName}"
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 text-left space-y-1">
                <div>• Key <span className="font-mono text-amber-300 font-bold">{schoolToDelete.licenseKey}</span> will be permanently revoked.</div>
                <div>• All active devices registered to this school will be locked immediately.</div>
                <div>• The school will be removed from the registered schools list.</div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSchoolToDelete(null)}
                  className="w-1/2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteSchool}
                  className="w-1/2 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-lg border-b-4 border-rose-800 active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
