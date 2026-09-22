import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Inbox,
  Building2,
  RotateCcw,
  Plus,
  KeyRound,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { UserAccount } from '../PremiumAuthModal';
import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest } from '../../types/payment';
import {
  fetchAllSchoolLicenses,
  fetchAllSchoolRequests,
  fetchAllSchoolRenewals,
  fetchAllAdminNotifications,
  saveSchoolLicense,
  saveSchoolRequest,
  saveSchoolRenewal,
  deleteSchoolLicense,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  generateUniqueLicenseKey,
  createAdminNotification,
  AdminNotificationItem,
} from '../../services/cloudSchoolSync';

import { AdminHeader } from './AdminHeader';
import { AdminDashboardOverview } from './AdminDashboardOverview';
import { AdminSchoolRequests } from './AdminSchoolRequests';
import { AdminRegisteredSchools } from './AdminRegisteredSchools';
import { AdminRenewalRequests } from './AdminRenewalRequests';

interface AdminDashboardProps {
  userAccount?: UserAccount | null;
  onLogout?: () => void;
  onNavigateHome: () => void;
}

export type AdminTab = 'dashboard' | 'school_requests' | 'registered_schools' | 'renewal_requests';

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  userAccount,
  onLogout: propOnLogout,
  onNavigateHome,
}) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Real Data State from Cloud / Supabase
  const [registeredSchools, setRegisteredSchools] = useState<SchoolLicense[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SchoolPaymentRequest[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<SchoolRenewalRequest[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Selected Request for Detail Modal
  const [selectedRequest, setSelectedRequest] = useState<SchoolPaymentRequest | null>(null);

  // Add School Manually Modal State
  const [isAddSchoolOpen, setIsAddSchoolOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newCity, setNewCity] = useState('Karachi');
  const [newCountry, setNewCountry] = useState('Pakistan');
  const [newGeneratedKey, setNewGeneratedKey] = useState('');
  const [isAddingSchool, setIsAddingSchool] = useState(false);

  // Copy Clipboard State
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Toast Notifications State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const copyToClipboard = (text: string, label: string = 'Text') => {
    soundManager.playPop();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedText(text);
      showToast(`${label} copied to clipboard!`, 'success');
      setTimeout(() => setCopiedText(null), 2500);
    } catch {
      showToast(`Failed to copy to clipboard`, 'error');
    }
  };

  // Load All Data from Supabase / Cloud
  const loadAllData = useCallback(async () => {
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
      console.warn('[AdminDashboard] Data fetch warning:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();

    // Event listeners for real-time updates across components & tabs
    const handleUpdate = () => {
      loadAllData();
    };

    window.addEventListener('playroom_license_update', handleUpdate);
    window.addEventListener('playroom_school_request_update', handleUpdate);
    window.addEventListener('playroom_renewal_request_update', handleUpdate);
    window.addEventListener('playroom_admin_notification_update', handleUpdate);
    window.addEventListener('playroom_admin_notifications_update', handleUpdate);

    // Heartbeat sync every 8 seconds for live activations
    const interval = setInterval(() => {
      loadAllData();
    }, 8000);

    return () => {
      window.removeEventListener('playroom_license_update', handleUpdate);
      window.removeEventListener('playroom_school_request_update', handleUpdate);
      window.removeEventListener('playroom_renewal_request_update', handleUpdate);
      window.removeEventListener('playroom_admin_notification_update', handleUpdate);
      window.removeEventListener('playroom_admin_notifications_update', handleUpdate);
      clearInterval(interval);
    };
  }, [loadAllData]);

  // Unread notifications count
  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  // Mark all notifications as read
  const handleMarkAllNotifsRead = async () => {
    soundManager.playPop();
    await markAllAdminNotificationsRead();
    loadAllData();
    showToast('All notifications marked as read', 'info');
  };

  // Delete single notification
  const handleDeleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundManager.playPop();
    await deleteAdminNotification(id);
    loadAllData();
  };

  // Logout Handler
  const handleLogout = () => {
    soundManager.playPop();
    if (propOnLogout) {
      propOnLogout();
    } else {
      window.location.hash = '';
      window.location.reload();
    }
  };

  // ---------------------------------------------------------------------------
  // 1. APPROVE SCHOOL REQUEST
  // ---------------------------------------------------------------------------
  const handleApproveSchoolRequest = async (req: SchoolPaymentRequest) => {
    soundManager.playPop();
    try {
      const uniqueKey = generateUniqueLicenseKey();
      const schoolId = req.schoolId || `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Try Backend API first
      try {
        await fetch('/api/payment/school-request/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: req.id,
            adminEmail: userAccount?.email || 'admin@playroom.app',
            licenseKey: uniqueKey,
            adminNotes: `Approved from inquiry #${req.id}`,
          }),
        });
      } catch (apiErr) {
        console.warn('Backend approve endpoint notice:', apiErr);
      }

      // 2. Save new school license record in PENDING activation state
      const newLicense: SchoolLicense = {
        id: `lic_${Date.now()}`,
        licenseKey: uniqueKey,
        schoolId: schoolId,
        schoolName: req.schoolName,
        schoolAdminName: req.contactName || req.schoolAdminName || 'School Administrator',
        contactName: req.contactName || req.schoolAdminName || 'School Administrator',
        contactEmail: req.contactEmail,
        contactPhone: req.contactPhone || req.phoneNumber || '',
        phoneNumber: req.phoneNumber || req.contactPhone || '',
        country: req.country || 'Pakistan',
        city: req.city || 'Karachi',
        price: req.amount || 5000,
        currency: req.currency || 'PKR',
        allowedDevices: req.allowedDevices || 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: 'PENDING', // Countdown begins on key entry!
        durationMonths: req.durationMonths || 1,
        durationDays: 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Approved inquiry #${req.id}. 30-day access starts on key entry.`,
      };

      await saveSchoolLicense(newLicense);

      // 3. Mark request as APPROVED
      const updatedReq: SchoolPaymentRequest = {
        ...req,
        status: 'APPROVED',
        reviewedAt: new Date().toISOString(),
        reviewedBy: userAccount?.email || 'Admin',
        adminNotes: `Approved. Generated key: ${uniqueKey}`,
      };
      await saveSchoolRequest(updatedReq);

      // 4. Create Admin Notification
      await createAdminNotification(
        'inquiry',
        `School Approved: ${req.schoolName}`,
        `${req.schoolName} has been approved and moved to Registered Schools. License Key: ${uniqueKey}. 30-day countdown begins when entered.`,
        { licenseKey: uniqueKey, schoolName: req.schoolName, approvedAt: new Date().toISOString() }
      );

      soundManager.playSuccess();
      copyToClipboard(uniqueKey, `License Key for ${req.schoolName}`);
      showToast(`Approved! License key ${uniqueKey} generated and copied. School registered.`, 'success');
      loadAllData();
      setActiveTab('registered_schools');
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to approve school request.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 2. REJECT SCHOOL REQUEST
  // ---------------------------------------------------------------------------
  const handleRejectSchoolRequest = async (req: SchoolPaymentRequest) => {
    soundManager.playPop();
    try {
      try {
        await fetch('/api/payment/school-request/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: req.id,
            adminEmail: userAccount?.email || 'admin@playroom.app',
            adminNotes: 'Inquiry rejected by Administrator',
          }),
        });
      } catch (apiErr) {
        console.warn('Backend reject endpoint notice:', apiErr);
      }

      const updatedReq: SchoolPaymentRequest = {
        ...req,
        status: 'REJECTED',
        reviewedAt: new Date().toISOString(),
        reviewedBy: userAccount?.email || 'Admin',
      };
      await saveSchoolRequest(updatedReq);

      soundManager.playPop();
      showToast(`Inquiry for "${req.schoolName}" rejected.`, 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject request.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 3. GENERATE KEY FOR REGISTERED SCHOOL
  // ---------------------------------------------------------------------------
  const handleGenerateKeyForSchool = async (school: SchoolLicense) => {
    soundManager.playPop();
    try {
      const uniqueKey = generateUniqueLicenseKey();
      const updatedLicense: SchoolLicense = {
        ...school,
        licenseKey: uniqueKey,
        status: 'PENDING',
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        adminNotes: `License key generated by ${userAccount?.email || 'Admin'} on ${new Date().toLocaleDateString()}`,
      };

      await saveSchoolLicense(updatedLicense);
      soundManager.playSuccess();
      copyToClipboard(uniqueKey, `License Key for ${school.schoolName}`);
      showToast(`Generated license key ${uniqueKey} for ${school.schoolName}!`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate license key.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 4. RENEW SCHOOL LICENSE (EXTEND 30 DAYS)
  // ---------------------------------------------------------------------------
  const handleRenewSchoolLicense = async (school: SchoolLicense) => {
    soundManager.playPop();
    try {
      // 1. Try Backend API
      try {
        await fetch('/api/payment/school-license/renew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseId: school.id,
            licenseKey: school.licenseKey,
            adminEmail: userAccount?.email || 'admin@playroom.app',
          }),
        });
      } catch (apiErr) {
        console.warn('Backend renew endpoint notice:', apiErr);
      }

      const now = new Date();
      let newValidUntil: Date;

      if (school.status === 'ACTIVE' && (school.validUntil || school.expiryDate)) {
        const currentExp = new Date(school.validUntil || school.expiryDate!).getTime();
        if (currentExp > now.getTime()) {
          newValidUntil = new Date(currentExp + 30 * 24 * 60 * 60 * 1000);
        } else {
          newValidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
      } else {
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
        adminNotes: `Renewed for 30 days by ${userAccount?.email || 'Admin'} on ${now.toLocaleDateString()}`,
      };

      await saveSchoolLicense(updatedLicense);

      // If pending renewal exists for this key, mark approved
      const pendingRen = renewalRequests.find(
        (r) =>
          school.licenseKey &&
          r.licenseKey.toUpperCase().trim() === school.licenseKey.toUpperCase().trim() &&
          r.status === 'PENDING'
      );
      if (pendingRen) {
        await saveSchoolRenewal({
          ...pendingRen,
          status: 'APPROVED',
          approvedAt: now.toISOString(),
          approvedBy: userAccount?.email || 'Admin',
        });
      }

      // Notification
      await createAdminNotification(
        'renewal_request',
        `License Renewed: ${school.schoolName}`,
        `License for ${school.schoolName} (${school.licenseKey}) extended for 30 days. Valid until ${newValidUntil.toLocaleDateString()}.`,
        { licenseKey: school.licenseKey, schoolName: school.schoolName, validUntil: newValidUntil.toISOString() }
      );

      soundManager.playSuccess();
      showToast(`License for "${school.schoolName}" renewed successfully for 30 Days!`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to renew license.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 5. REVOKE SCHOOL ACCESS (LOCKS KEY & ACCESS)
  // ---------------------------------------------------------------------------
  const handleRevokeSchoolAccess = async (school: SchoolLicense) => {
    soundManager.playPop();
    try {
      const targetId = school.id;
      const targetKey = school.licenseKey;

      // 1. Delete/Revoke in DB & backend
      await deleteSchoolLicense(targetId);
      if (targetKey) {
        await deleteSchoolLicense(targetKey);
      }

      // 2. Clear from active local storage session
      if (typeof window !== 'undefined') {
        const activeRaw = localStorage.getItem('playroom_active_school_license');
        if (activeRaw) {
          try {
            const activeLic = JSON.parse(activeRaw);
            if (
              activeLic.id === targetId ||
              (targetKey && activeLic.licenseKey?.toUpperCase() === targetKey.toUpperCase()) ||
              activeLic.schoolId === school.schoolId
            ) {
              localStorage.removeItem('playroom_active_school_license');
              window.dispatchEvent(new CustomEvent('playroom_license_update'));
            }
          } catch (_) {}
        }
      }

      soundManager.playPop();
      showToast(`Access revoked for "${school.schoolName}". License invalidated immediately.`, 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to revoke school access.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 6. RENEWAL REQUEST TAB ACTIONS
  // ---------------------------------------------------------------------------
  const handleApproveRenewalRequest = async (req: SchoolRenewalRequest) => {
    soundManager.playPop();
    try {
      const matchingSchool = registeredSchools.find(
        (s) => s.licenseKey && s.licenseKey.toUpperCase().trim() === req.licenseKey.toUpperCase().trim()
      );

      if (matchingSchool) {
        await handleRenewSchoolLicense(matchingSchool);
      } else {
        // Direct renewal update
        const updatedRen: SchoolRenewalRequest = {
          ...req,
          status: 'APPROVED',
          approvedAt: new Date().toISOString(),
          approvedBy: userAccount?.email || 'Admin',
        };
        await saveSchoolRenewal(updatedRen);
        showToast(`Renewal approved for ${req.schoolName}.`, 'success');
        loadAllData();
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve renewal.', 'error');
    }
  };

  const handleRejectRenewalRequest = async (req: SchoolRenewalRequest) => {
    soundManager.playPop();
    try {
      const updatedRen: SchoolRenewalRequest = {
        ...req,
        status: 'REJECTED',
        reviewedAt: new Date().toISOString(),
        reviewedBy: userAccount?.email || 'Admin',
      };
      await saveSchoolRenewal(updatedRen);
      showToast(`Renewal request for ${req.schoolName} rejected.`, 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject renewal.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 7. ADD SCHOOL MANUALLY MODAL
  // ---------------------------------------------------------------------------
  const handleOpenAddSchoolModal = () => {
    soundManager.playPop();
    const key = generateUniqueLicenseKey();
    setNewGeneratedKey(key);
    setNewSchoolName('');
    setNewContactPerson('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewCity('Karachi');
    setNewCountry('Pakistan');
    setIsAddSchoolOpen(true);
  };

  const handleAddSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) {
      showToast('Please enter the school name.', 'error');
      return;
    }

    setIsAddingSchool(true);
    soundManager.playPop();

    try {
      const key = newGeneratedKey.trim() || generateUniqueLicenseKey();
      const schoolId = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newLicense: SchoolLicense = {
        id: `lic_${Date.now()}`,
        licenseKey: key,
        schoolId: schoolId,
        schoolName: newSchoolName.trim(),
        schoolAdminName: newContactPerson.trim() || 'Principal / Administrator',
        contactName: newContactPerson.trim() || 'Principal / Administrator',
        contactEmail: newContactEmail.trim() || userAccount?.email || 'admin@playroom.app',
        contactPhone: newContactPhone.trim() || '',
        phoneNumber: newContactPhone.trim() || '',
        country: newCountry.trim() || 'Pakistan',
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
        status: 'PENDING', // Starts 30-day countdown on key entry
        durationMonths: 1,
        durationDays: 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Registered manually by ${userAccount?.email || 'Admin'}. 30-day access starts on key entry.`,
      };

      await saveSchoolLicense(newLicense);
      soundManager.playSuccess();
      copyToClipboard(key, `License Key for ${newLicense.schoolName}`);
      showToast(`School "${newLicense.schoolName}" registered with key ${key}!`, 'success');
      setIsAddSchoolOpen(false);
      loadAllData();
      setActiveTab('registered_schools');
    } catch (err: any) {
      showToast(err?.message || 'Failed to register school.', 'error');
    } finally {
      setIsAddingSchool(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* 1. Header */}
      <AdminHeader
        notifications={notifications}
        unreadNotifsCount={unreadNotifsCount}
        onMarkAllRead={handleMarkAllNotifsRead}
        onDeleteNotif={handleDeleteNotif}
        onNavigateHome={onNavigateHome}
        onLogout={handleLogout}
      />

      {/* 2. Main Navigation Bar (Clean 4 Sections) */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 no-scrollbar">
            {/* Tab 1: Dashboard */}
            <button
              id="admin-nav-dashboard"
              onClick={() => {
                soundManager.playPop();
                setActiveTab('dashboard');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            {/* Tab 2: School Requests */}
            <button
              id="admin-nav-school-requests"
              onClick={() => {
                soundManager.playPop();
                setActiveTab('school_requests');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap relative ${
                activeTab === 'school_requests'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>School Requests</span>
              {pendingRequests.filter((r) => (r.status || 'PENDING').toUpperCase() === 'PENDING').length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'school_requests'
                      ? 'bg-white text-indigo-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {pendingRequests.filter((r) => (r.status || 'PENDING').toUpperCase() === 'PENDING').length}
                </span>
              )}
            </button>

            {/* Tab 3: Registered Schools */}
            <button
              id="admin-nav-registered-schools"
              onClick={() => {
                soundManager.playPop();
                setActiveTab('registered_schools');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'registered_schools'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Registered Schools</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'registered_schools'
                    ? 'bg-white text-indigo-700'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {registeredSchools.filter((s) => s.status !== 'REVOKED').length}
              </span>
            </button>

            {/* Tab 4: Renewal Requests */}
            <button
              id="admin-nav-renewal-requests"
              onClick={() => {
                soundManager.playPop();
                setActiveTab('renewal_requests');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap relative ${
                activeTab === 'renewal_requests'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Renewal Requests</span>
              {renewalRequests.filter((r) => (r.status || 'PENDING').toUpperCase() === 'PENDING').length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'renewal_requests'
                      ? 'bg-white text-indigo-700'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {renewalRequests.filter((r) => (r.status || 'PENDING').toUpperCase() === 'PENDING').length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="py-24 text-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
            <p className="text-sm font-semibold">Connecting to School Licensing System...</p>
          </div>
        ) : (
          <>
            {/* View 1: Dashboard Overview */}
            {activeTab === 'dashboard' && (
              <AdminDashboardOverview
                registeredSchools={registeredSchools}
                pendingRequests={pendingRequests}
                renewalRequests={renewalRequests}
                notifications={notifications}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onViewRequest={(req) => {
                  setSelectedRequest(req);
                  setActiveTab('school_requests');
                }}
              />
            )}

            {/* View 2: School Requests */}
            {activeTab === 'school_requests' && (
              <AdminSchoolRequests
                pendingRequests={pendingRequests}
                onApproveRequest={handleApproveSchoolRequest}
                onRejectRequest={handleRejectSchoolRequest}
                selectedRequest={selectedRequest}
                onSelectRequest={setSelectedRequest}
                copyToClipboard={copyToClipboard}
                copiedText={copiedText}
              />
            )}

            {/* View 3: Registered Schools */}
            {activeTab === 'registered_schools' && (
              <AdminRegisteredSchools
                registeredSchools={registeredSchools}
                onGenerateKeyForSchool={handleGenerateKeyForSchool}
                onRenewLicense={handleRenewSchoolLicense}
                onRevokeAccess={handleRevokeSchoolAccess}
                onOpenAddSchoolModal={handleOpenAddSchoolModal}
                copyToClipboard={copyToClipboard}
                copiedText={copiedText}
              />
            )}

            {/* View 4: Renewal Requests */}
            {activeTab === 'renewal_requests' && (
              <AdminRenewalRequests
                renewalRequests={renewalRequests}
                onApproveRenewal={handleApproveRenewalRequest}
                onRejectRenewal={handleRejectRenewalRequest}
                copyToClipboard={copyToClipboard}
                copiedText={copiedText}
              />
            )}
          </>
        )}
      </main>

      {/* Add School Manually Modal */}
      {isAddSchoolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-lg text-slate-900">Register Partner School</h3>
              </div>
              <button
                onClick={() => setIsAddSchoolOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSchoolSubmit} className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                  School / Institution Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beaconhouse Pre-School"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                    Contact / Admin Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Principal Ahmed"
                    value={newContactPerson}
                    onChange={(e) => setNewContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="admin@school.edu.pk"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+92 300 1234567"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    placeholder="Pakistan"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="Karachi"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Pre-generated License Key Box */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl">
                <div className="flex items-center justify-between text-xs text-indigo-900 font-semibold mb-1">
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                    Pre-generated License Key
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewGeneratedKey(generateUniqueLicenseKey())}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-medium"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="font-mono text-sm font-bold text-indigo-950 tracking-wider">
                  {newGeneratedKey}
                </div>
                <p className="text-[11px] text-indigo-700 mt-1">
                  30-day access countdown begins strictly when entered by the school.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddSchoolOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  disabled={isAddingSchool}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingSchool}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/30 transition-colors disabled:opacity-50"
                >
                  {isAddingSchool ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Register School
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-in slide-in-from-bottom-2 fade-in duration-150 ${
              toast.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/40 shadow-emerald-950/20'
                : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-500/40 shadow-rose-950/20'
                : 'bg-slate-900 text-slate-100 border-slate-700'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
