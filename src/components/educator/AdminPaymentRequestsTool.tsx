import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  School,
  Building,
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
  ArrowLeft,
  Calendar,
  ShieldCheck,
  Eye,
  Phone,
  Mail,
  MapPin,
  User,
  Sparkles,
  Ban,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import {
  Currency,
  SchoolLicense,
  SchoolPaymentRequest,
  SchoolRenewalRequest,
} from '../../types/payment';
import { PaymentServiceManager } from '../../services/payment/PaymentServiceManager';
import { UserAccount } from '../PremiumAuthModal';
import { isAdminAccount } from '../../utils/userAuthService';

interface AdminPaymentRequestsToolProps {
  onBackToOverview: () => void;
  userAccount?: UserAccount | null;
}

// Helper to compute live timing details for each school license
function getLicenseTimingDetails(sch: SchoolLicense) {
  const isPending =
    sch.status === 'PENDING' ||
    (!sch.validFrom && !sch.startDate && !sch.validUntil && !sch.expiryDate);

  const startIso = sch.validFrom || sch.startDate;
  const expiryIso = sch.validUntil || sch.expiryDate;

  if (isPending || !startIso || !expiryIso) {
    return {
      status: 'PENDING' as const,
      statusLabel: 'Pending Activation',
      startText: 'Not Activated Yet',
      startSubtext: '30-day countdown begins when school enters key in app',
      expiryText: '30 Days from Key Entry',
      daysLeftText: 'Awaiting Key Entry',
      isExpired: false,
      diffDays: 30,
    };
  }

  const startDate = new Date(startIso);
  const expiryDate = new Date(expiryIso);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = diffMs <= 0 || sch.status === 'EXPIRED';

  const formatDateTime = (d: Date) => {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return {
    status: isExpired ? ('EXPIRED' as const) : ('ACTIVE' as const),
    statusLabel: isExpired ? 'Expired' : 'Active',
    startText: formatDateTime(startDate),
    startSubtext: 'Activated on key entry',
    expiryText: formatDateTime(expiryDate),
    daysLeftText: isExpired
      ? `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`
      : diffDays === 0
      ? 'Expires Today'
      : `${diffDays} Day${diffDays === 1 ? '' : 's'} Remaining`,
    isExpired,
    diffDays,
  };
}

export const AdminPaymentRequestsTool: React.FC<AdminPaymentRequestsToolProps> = ({
  onBackToOverview,
  userAccount,
}) => {
  const isAuthorizedAdmin = isAdminAccount(userAccount);
  const paymentManager = PaymentServiceManager.getInstance();

  // Active Admin Tab: Strictly School Management (No individual users)
  const [activeTab, setActiveTab] = useState<'school_requests' | 'school_licenses' | 'renewal_requests' | 'add_school'>('school_licenses');

  // Core School Data
  const [schoolRequests, setSchoolRequests] = useState<SchoolPaymentRequest[]>([]);
  const [schoolLicenses, setSchoolLicenses] = useState<SchoolLicense[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<SchoolRenewalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter for Registered Schools
  const [licenseFilter, setLicenseFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'EXPIRED'>('ALL');
  const [licenseSearch, setLicenseSearch] = useState('');

  // Search & Filter for School Requests
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [requestSearch, setRequestSearch] = useState('');

  // Search & Filter for Renewal Requests
  const [renewalFilter, setRenewalFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [renewalSearch, setRenewalSearch] = useState('');
  const [approvingRenewalId, setApprovingRenewalId] = useState<string | null>(null);
  const [deletingRenewalReq, setDeletingRenewalReq] = useState<SchoolRenewalRequest | null>(null);

  // Notifications & Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal States
  const [selectedSchoolDetails, setSelectedSchoolDetails] = useState<SchoolLicense | null>(null);
  const [renewingLicense, setRenewingLicense] = useState<SchoolLicense | null>(null);
  const [isProcessingRenewal, setIsProcessingRenewal] = useState(false);

  const [deletingSchoolLicense, setDeletingSchoolLicense] = useState<SchoolLicense | null>(null);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const [deletingRequest, setDeletingRequest] = useState<SchoolPaymentRequest | null>(null);

  // Generated License Celebration Modal (Shown after adding school or approving request)
  const [newlyGeneratedKeyData, setNewlyGeneratedKeyData] = useState<{
    schoolName: string;
    licenseKey: string;
    email: string;
  } | null>(null);

  // Add School Form State
  const [addSchoolForm, setAddSchoolForm] = useState({
    schoolName: '',
    schoolAdminName: '',
    contactEmail: '',
    phoneNumber: '',
    city: 'Karachi',
    country: 'Pakistan',
    price: '25000',
    currency: 'PKR' as Currency,
    licenseKey: '',
    adminNotes: '',
  });
  const [isSubmittingSchool, setIsSubmittingSchool] = useState(false);

  // Load Data from Supabase with Local Fallback
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [licenses, requests, renewals] = await Promise.all([
        paymentManager.fetchSchoolLicensesFromSupabase(),
        paymentManager.fetchSchoolRequestsFromSupabase(),
        paymentManager.fetchSchoolRenewalRequestsFromSupabase(),
      ]);
      setSchoolLicenses(licenses);
      setSchoolRequests(requests);
      setRenewalRequests(renewals);
    } catch (err) {
      console.warn('Fallback loading local school records:', err);
      setSchoolLicenses(paymentManager.getAllSchoolLicensesLocal());
      setSchoolRequests(paymentManager.getAllSchoolPaymentRequestsLocal());
      setRenewalRequests(paymentManager.getAllSchoolRenewalRequestsLocal());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    // Listen for real-time key activation events when schools redeem keys or request renewals
    const handleLicenseUpdate = () => {
      loadAllData();
    };
    window.addEventListener('playroom_license_update', handleLicenseUpdate);
    window.addEventListener('playroom_renewal_request_update', handleLicenseUpdate);
    window.addEventListener('storage', handleLicenseUpdate);
    return () => {
      window.removeEventListener('playroom_license_update', handleLicenseUpdate);
      window.removeEventListener('playroom_renewal_request_update', handleLicenseUpdate);
      window.removeEventListener('storage', handleLicenseUpdate);
    };
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleCopyKey = (key: string) => {
    soundManager.playPop();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // 1. ADD SCHOOL & GENERATE LICENSE (Strictly 1 Month, Unlimited Devices)
  const handleCreateSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundManager.playPop();

    if (!addSchoolForm.schoolName.trim() || !addSchoolForm.contactEmail.trim()) {
      showToast('Please enter School Name and Contact Email.', 'error');
      return;
    }

    setIsSubmittingSchool(true);
    try {
      const created = await paymentManager.createSchoolLicense({
        schoolName: addSchoolForm.schoolName.trim(),
        schoolAdminName: addSchoolForm.schoolAdminName.trim() || addSchoolForm.schoolName.trim(),
        contactName: addSchoolForm.schoolAdminName.trim() || addSchoolForm.schoolName.trim(),
        contactEmail: addSchoolForm.contactEmail.trim().toLowerCase(),
        country: addSchoolForm.country.trim() || 'Pakistan',
        city: addSchoolForm.city.trim() || 'Karachi',
        price: parseFloat(addSchoolForm.price) || 0,
        currency: addSchoolForm.currency,
        allowedDevices: 999999, // Unlimited devices
        durationMonths: 1,      // Strictly 1 month
        page1Access: true,      // Playroom App access
        page2Access: true,      // Educator Hub access
        licenseKey: addSchoolForm.licenseKey.trim() || undefined,
        adminNotes: addSchoolForm.adminNotes.trim() || 'Manual offline payment verified by Admin',
        verifiedBy: userAccount?.email || 'Administrator',
        createdBy: userAccount?.email || 'Administrator',
      });

      soundManager.playSuccess();
      showToast(`School license generated successfully for ${created.schoolName}!`, 'success');

      // Show key display modal so admin can easily copy & send to school
      setNewlyGeneratedKeyData({
        schoolName: created.schoolName,
        licenseKey: created.licenseKey || created.id,
        email: created.contactEmail,
      });

      // Reset form
      setAddSchoolForm({
        schoolName: '',
        schoolAdminName: '',
        contactEmail: '',
        phoneNumber: '',
        city: 'Karachi',
        country: 'Pakistan',
        price: '25000',
        currency: 'PKR',
        licenseKey: '',
        adminNotes: '',
      });

      await loadAllData();
      setActiveTab('school_licenses');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to create school license.', 'error');
    } finally {
      setIsSubmittingSchool(false);
    }
  };

  // 2. APPROVE SCHOOL REQUEST & GENERATE 1-MONTH LICENSE
  const handleApproveRequest = async (req: SchoolPaymentRequest) => {
    soundManager.playPop();
    try {
      const res = await paymentManager.adminApproveSchoolRequest(
        req.id,
        'Manual payment received. 1-Month Institutional License issued by Admin.',
        userAccount?.email || 'Administrator'
      );

      if (res.success && res.licenseKey) {
        soundManager.playSuccess();
        showToast(`Request approved! 1-Month License issued for ${req.schoolName}.`, 'success');

        setNewlyGeneratedKeyData({
          schoolName: req.schoolName,
          licenseKey: res.licenseKey,
          email: req.contactEmail,
        });

        await loadAllData();
      } else {
        showToast(res.error || 'Failed to approve school request.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Error approving request.', 'error');
    }
  };

  // Reject School Request
  const handleRejectRequest = async (requestId: string) => {
    soundManager.playPop();
    try {
      const res = await paymentManager.adminRejectSchoolPayment(
        requestId,
        'Declined by Admin',
        userAccount?.email || 'Administrator'
      );
      if (res.success) {
        soundManager.playPop();
        showToast('Request marked as REJECTED.', 'info');
        await loadAllData();
      }
    } catch (err) {
      showToast('Failed to reject request.', 'error');
    }
  };

  // Delete School Request
  const handleConfirmDeleteRequest = async () => {
    if (!deletingRequest) return;
    soundManager.playPop();
    try {
      await paymentManager.deleteSchoolRequest(deletingRequest.id);
      soundManager.playSuccess();
      showToast(`Request from ${deletingRequest.schoolName} deleted.`, 'success');
      await loadAllData();
    } catch (err) {
      showToast('Failed to delete request.', 'error');
    } finally {
      setDeletingRequest(null);
    }
  };

  // 3. RENEW LICENSE (Same License Key Retained, +1 Month Extension)
  const handleConfirmRenewal = async () => {
    if (!renewingLicense) return;
    setIsProcessingRenewal(true);
    soundManager.playPop();

    try {
      const res = await paymentManager.renewSchoolLicense(
        renewingLicense.id || renewingLicense.licenseKey || '',
        `Manual renewal payment received. Extended by 1 month on ${new Date().toLocaleDateString()}`,
        userAccount?.email || 'Administrator'
      );

      if (res.success) {
        soundManager.playSuccess();
        showToast(
          `License for ${renewingLicense.schoolName} renewed for 1 Month (+30 Days). Same key preserved!`,
          'success'
        );
        await loadAllData();
      } else {
        showToast(res.error || 'Failed to renew school license.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to renew school license.', 'error');
    } finally {
      setIsProcessingRenewal(false);
      setRenewingLicense(null);
    }
  };

  // 4. DELETE SCHOOL (Requires Explicit Confirmation)
  const handleConfirmDeleteSchool = async () => {
    if (!deletingSchoolLicense) return;
    setIsProcessingDelete(true);
    soundManager.playPop();

    try {
      const res = await paymentManager.deleteSchoolLicense(
        deletingSchoolLicense.id || deletingSchoolLicense.licenseKey || ''
      );
      if (res.success) {
        soundManager.playSuccess();
        showToast(`School ${deletingSchoolLicense.schoolName} and its license have been deleted.`, 'success');
        await loadAllData();
      } else {
        showToast(res.error || 'Failed to delete school.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to delete school.', 'error');
    } finally {
      setIsProcessingDelete(false);
      setDeletingSchoolLicense(null);
    }
  };

  // Quick Manual Activate (If school needs instant activation from admin console)
  const handleManualActivate = async (sch: SchoolLicense) => {
    soundManager.playPop();
    try {
      const res = await paymentManager.activateSchoolLicenseAdmin(
        sch.id || sch.licenseKey || '',
        userAccount?.email || 'Administrator'
      );
      if (res.success) {
        soundManager.playSuccess();
        showToast(`License for ${sch.schoolName} activated now for 30 days!`, 'success');
        await loadAllData();
      }
    } catch (err) {
      showToast('Failed to activate license.', 'error');
    }
  };

  // Renewal Request Handlers
  const handleApproveRenewalRequest = async (req: SchoolRenewalRequest) => {
    soundManager.playPop();
    setApprovingRenewalId(req.id);
    try {
      const res = await paymentManager.adminApproveSchoolRenewalRequest(
        req.id,
        userAccount?.email || 'Administrator',
        'Renewal approved by Administrator (+30 Days)'
      );
      if (res.success) {
        soundManager.playSuccess();
        showToast(`Renewal approved! Same key (${req.licenseKey}) renewed for 30 days.`, 'success');
        await loadAllData();
      } else {
        showToast(res.error || 'Failed to approve renewal.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error approving renewal.', 'error');
    } finally {
      setApprovingRenewalId(null);
    }
  };

  const handleRejectRenewalRequest = async (req: SchoolRenewalRequest) => {
    soundManager.playPop();
    try {
      const res = await paymentManager.adminRejectSchoolRenewalRequest(
        req.id,
        userAccount?.email || 'Administrator'
      );
      if (res.success) {
        soundManager.playSuccess();
        showToast(`Renewal request for ${req.schoolName} rejected.`, 'info');
        await loadAllData();
      } else {
        showToast(res.error || 'Failed to reject renewal.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error rejecting renewal.', 'error');
    }
  };

  const handleDeleteRenewalRequestConfirm = async () => {
    if (!deletingRenewalReq) return;
    try {
      const res = await paymentManager.deleteSchoolRenewalRequest(deletingRenewalReq.id);
      if (res.success) {
        soundManager.playSuccess();
        showToast('Renewal request deleted.', 'success');
        setDeletingRenewalReq(null);
        await loadAllData();
      } else {
        showToast(res.error || 'Failed to delete renewal request.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error deleting renewal request.', 'error');
    }
  };

  // Compute summary metrics
  const totalSchoolsCount = schoolLicenses.length;
  const activeLicensesCount = schoolLicenses.filter((s) => {
    const timing = getLicenseTimingDetails(s);
    return timing.status === 'ACTIVE';
  }).length;
  const pendingLicensesCount = schoolLicenses.filter((s) => {
    const timing = getLicenseTimingDetails(s);
    return timing.status === 'PENDING';
  }).length;
  const expiredLicensesCount = schoolLicenses.filter((s) => {
    const timing = getLicenseTimingDetails(s);
    return timing.status === 'EXPIRED';
  }).length;
  const pendingRequestsCount = schoolRequests.filter((r) => r.status === 'PENDING').length;
  const pendingRenewalsCount = renewalRequests.filter((r) => r.status === 'PENDING').length;

  // Filtered Renewal Requests
  const filteredRenewals = renewalRequests.filter((req) => {
    if (renewalFilter !== 'ALL' && req.status !== renewalFilter) return false;

    if (renewalSearch.trim()) {
      const q = renewalSearch.toLowerCase();
      const nameMatch = (req.schoolName || '').toLowerCase().includes(q);
      const emailMatch = (req.contactEmail || '').toLowerCase().includes(q);
      const keyMatch = (req.licenseKey || '').toLowerCase().includes(q);
      const cityMatch = (req.city || '').toLowerCase().includes(q);
      const phoneMatch = (req.phoneNumber || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || keyMatch || cityMatch || phoneMatch;
    }
    return true;
  });

  // Filtered Registered Schools
  const filteredSchools = schoolLicenses.filter((sch) => {
    const timing = getLicenseTimingDetails(sch);
    if (licenseFilter !== 'ALL' && timing.status !== licenseFilter) return false;

    if (licenseSearch.trim()) {
      const q = licenseSearch.toLowerCase();
      const nameMatch = (sch.schoolName || '').toLowerCase().includes(q);
      const emailMatch = (sch.contactEmail || '').toLowerCase().includes(q);
      const keyMatch = (sch.licenseKey || sch.id || '').toLowerCase().includes(q);
      const cityMatch = (sch.city || '').toLowerCase().includes(q);
      const adminMatch = (sch.schoolAdminName || sch.contactName || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || keyMatch || cityMatch || adminMatch;
    }
    return true;
  });

  // Filtered School Requests
  const filteredRequests = schoolRequests.filter((req) => {
    if (requestFilter !== 'ALL' && req.status !== requestFilter) return false;

    if (requestSearch.trim()) {
      const q = requestSearch.toLowerCase();
      const nameMatch = (req.schoolName || '').toLowerCase().includes(q);
      const emailMatch = (req.contactEmail || '').toLowerCase().includes(q);
      const phoneMatch = (req.phoneNumber || req.contactPhone || '').toLowerCase().includes(q);
      const cityMatch = (req.city || '').toLowerCase().includes(q);
      const msgMatch = (req.schoolMessage || req.message || req.notes || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || cityMatch || msgMatch;
    }
    return true;
  });

  return (
    <div id="admin-school-management-console" className="space-y-6 select-none max-w-7xl mx-auto pb-12">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border-3 border-indigo-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-900 to-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-md">
            <School className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                School Licensing Console
              </h1>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                1-Month Unlimited
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Offline / Manual Payment Collection • Instant License Generation • Single-Key Renewals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            type="button"
            id="admin-refresh-data-btn"
            onClick={() => {
              soundManager.playPop();
              loadAllData();
            }}
            disabled={isLoading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            title="Refresh schools & requests from database"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-700' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            id="admin-back-to-overview-btn"
            onClick={() => {
              soundManager.playPop();
              onBackToOverview();
            }}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Educator Hub</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Strictly School-Focused) */}
      <div className="flex bg-slate-200/90 p-1.5 rounded-2xl border-2 border-slate-300 gap-1.5 overflow-x-auto">
        <button
          type="button"
          id="tab-registered-schools"
          onClick={() => {
            soundManager.playPop();
            setActiveTab('school_licenses');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'school_licenses'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'bg-transparent text-slate-700 hover:bg-white/60'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Registered Schools</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'school_licenses' ? 'bg-indigo-700 text-white' : 'bg-slate-300 text-slate-800'
            }`}
          >
            {totalSchoolsCount}
          </span>
        </button>

        <button
          type="button"
          id="tab-school-requests"
          onClick={() => {
            soundManager.playPop();
            setActiveTab('school_requests');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'school_requests'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'bg-transparent text-slate-700 hover:bg-white/60'
          }`}
        >
          <School className="w-4 h-4" />
          <span>School Requests</span>
          {pendingRequestsCount > 0 ? (
            <span className="px-2 py-0.5 bg-amber-400 text-slate-950 rounded-full text-[10px] font-black animate-pulse">
              {pendingRequestsCount} Pending
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'school_requests' ? 'bg-indigo-700 text-white' : 'bg-slate-300 text-slate-800'
              }`}
            >
              {schoolRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-renewal-requests"
          onClick={() => {
            soundManager.playPop();
            setActiveTab('renewal_requests');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'renewal_requests'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'bg-transparent text-slate-700 hover:bg-white/60'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Renewal Requests</span>
          {pendingRenewalsCount > 0 ? (
            <span className="px-2 py-0.5 bg-amber-400 text-slate-950 rounded-full text-[10px] font-black animate-pulse">
              {pendingRenewalsCount} Pending
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'renewal_requests' ? 'bg-indigo-700 text-white' : 'bg-slate-300 text-slate-800'
              }`}
            >
              {renewalRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-add-school-license"
          onClick={() => {
            soundManager.playPop();
            setActiveTab('add_school');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'add_school'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'bg-transparent text-slate-700 hover:bg-white/60'
          }`}
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add School & Generate Key</span>
        </button>
      </div>

      {/* Action Banner Toast */}
      {actionMessage && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between shadow-md ${
            actionMessage.type === 'error'
              ? 'bg-rose-600 text-white'
              : actionMessage.type === 'info'
              ? 'bg-indigo-900 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionMessage.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: CURRENT REGISTERED SCHOOLS & TIMINGS (THE MAIN CONTROL PANEL)      */}
      {/* ========================================================================= */}
      {activeTab === 'school_licenses' && (
        <div className="space-y-5">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Total Registered Schools
              </span>
              <div className="text-2xl font-black text-indigo-950 mt-1">{totalSchoolsCount}</div>
              <span className="text-[11px] text-slate-400 font-medium">Institutions in Database</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
                Active Licenses
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{activeLicensesCount}</div>
              <span className="text-[11px] text-slate-400 font-medium">Currently in 30-Day Period</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">
                Pending Activation
              </span>
              <div className="text-2xl font-black text-amber-600 mt-1">{pendingLicensesCount}</div>
              <span className="text-[11px] text-slate-400 font-medium">Waiting for School Key Entry</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">
                Expired Licenses
              </span>
              <div className="text-2xl font-black text-rose-600 mt-1">{expiredLicensesCount}</div>
              <span className="text-[11px] text-slate-400 font-medium">Ready for +1 Month Renewal</span>
            </div>
          </div>

          {/* Search, Filter & Quick Add Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border-2 border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-slate-500">Filter:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setLicenseFilter('ALL')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    licenseFilter === 'ALL'
                      ? 'bg-indigo-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({totalSchoolsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setLicenseFilter('ACTIVE')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    licenseFilter === 'ACTIVE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active ({activeLicensesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setLicenseFilter('PENDING')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    licenseFilter === 'PENDING'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending ({pendingLicensesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setLicenseFilter('EXPIRED')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    licenseFilter === 'EXPIRED'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Expired ({expiredLicensesCount})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search school, email, key..."
                  value={licenseSearch}
                  onChange={(e) => setLicenseSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 w-44 sm:w-60"
                />
              </div>

              <button
                type="button"
                id="btn-quick-add-school"
                onClick={() => {
                  soundManager.playPop();
                  setActiveTab('add_school');
                }}
                className="px-3.5 py-1.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span className="hidden sm:inline">Add School</span>
              </button>
            </div>
          </div>

          {/* Schools List */}
          {filteredSchools.length === 0 ? (
            <div className="bg-white border-2 border-slate-200 rounded-3xl p-12 text-center text-slate-500 space-y-3">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                🏫
              </div>
              <h3 className="text-sm font-black uppercase text-slate-800">No Schools Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {licenseSearch || licenseFilter !== 'ALL'
                  ? 'No registered schools match your search or filter.'
                  : 'No schools are currently registered. Click "Add School & Generate Key" to issue your first 1-month license.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSchools.map((sch) => {
                const timing = getLicenseTimingDetails(sch);
                const displayKey = sch.licenseKey || sch.id;

                return (
                  <div
                    key={sch.id}
                    className={`bg-white border-3 rounded-2xl p-5 sm:p-6 transition-all shadow-sm ${
                      timing.status === 'ACTIVE'
                        ? 'border-emerald-200 hover:border-emerald-300'
                        : timing.status === 'PENDING'
                        ? 'border-amber-200 hover:border-amber-300'
                        : 'border-rose-200 hover:border-rose-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      {/* School Name & Basic Identity */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">
                            {sch.schoolName}
                          </h3>
                          {timing.status === 'ACTIVE' ? (
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Active License
                            </span>
                          ) : timing.status === 'PENDING' ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pending Activation
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
                              <Lock className="w-3 h-3 text-rose-600" />
                              Expired
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-full text-[10px] font-bold">
                            1 Month • Unlimited Devices
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {sch.schoolAdminName || sch.contactName || 'School Administrator'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {sch.contactEmail}
                          </span>
                          {(sch.city || sch.country) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {[sch.city, sch.country].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* License Key Box with 1-Click Copy */}
                      <div className="bg-slate-50 border-2 border-slate-200 p-2.5 rounded-xl flex items-center justify-between gap-3 min-w-[240px]">
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                            License Key
                          </span>
                          <span className="font-mono font-black text-xs sm:text-sm text-indigo-950 tracking-wider">
                            {displayKey}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyKey(displayKey)}
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          title="Copy License Key to send to school"
                        >
                          {copiedKey === displayKey ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700 text-[11px]">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* License Timings Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-4 text-xs">
                      {/* Start Date & Timing */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Start Date (Activation)
                        </span>
                        <div className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-indigo-700 shrink-0" />
                          <span>{timing.startText}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">{timing.startSubtext}</span>
                      </div>

                      {/* Expiry Date */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Expiry Date (1 Month Term)
                        </span>
                        <div className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-indigo-700 shrink-0" />
                          <span>{timing.expiryText}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {timing.status === 'PENDING'
                            ? 'Automatic 30-day calculation'
                            : 'Access locks automatically after expiry'}
                        </span>
                      </div>

                      {/* Days Remaining / Status Badge */}
                      <div
                        className={`p-3 rounded-xl border space-y-1 ${
                          timing.status === 'ACTIVE'
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : timing.status === 'PENDING'
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : 'bg-rose-50/70 border-rose-200 text-rose-950'
                        }`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                          Term Status & Days Left
                        </span>
                        <div className="font-black text-xs sm:text-sm flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <span>{timing.daysLeftText}</span>
                        </div>
                        <span className="text-[11px] text-slate-600 block">
                          {timing.status === 'EXPIRED'
                            ? 'Click Renew to extend same license for +1 Month'
                            : timing.status === 'PENDING'
                            ? 'Ready to activate by school'
                            : 'Full institutional access live'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Action Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500 font-medium">
                        {sch.adminNotes && (
                          <span>
                            <strong>Note:</strong> {sch.adminNotes}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playPop();
                            setSelectedSchoolDetails(sch);
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>

                        {/* Quick Activate (Only if Pending) */}
                        {timing.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleManualActivate(sch)}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Start 30-day countdown right now from admin console"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Activate Now</span>
                          </button>
                        )}

                        {/* RENEW LICENSE (+1 MONTH) - SAME KEY PRESERVED */}
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playPop();
                            setRenewingLicense(sch);
                          }}
                          className="px-4 py-2 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                          title="Extend validity by 1 month (+30 days) using the same license key"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Renew (+1 Month)</span>
                        </button>

                        {/* DELETE SCHOOL OPTION */}
                        <button
                          type="button"
                          onClick={() => {
                            soundManager.playPop();
                            setDeletingSchoolLicense(sch);
                          }}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-rose-200"
                          title="Permanently remove school and revoke license"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INCOMING SCHOOL REQUESTS                                           */}
      {/* ========================================================================= */}
      {activeTab === 'school_requests' && (
        <div className="space-y-4">
          {/* Institutional Info Notice */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-indigo-950">
            <School className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-black uppercase tracking-wide block">
                Incoming School Requests
              </span>
              <p className="leading-relaxed font-medium">
                When institutions contact you or request access, verify their payment manually (via Bank Transfer / Cash) and click <strong>Approve & Issue 1-Month License</strong>. A 1-month unlimited license key will be generated in Pending Activation state so their month only starts when they enter the key in the app.
              </p>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border-2 border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-slate-500">Status:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRequestFilter('ALL')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    requestFilter === 'ALL'
                      ? 'bg-indigo-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({schoolRequests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestFilter('PENDING')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    requestFilter === 'PENDING'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending ({schoolRequests.filter((r) => r.status === 'PENDING').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestFilter('VERIFIED')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    requestFilter === 'VERIFIED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Approved ({schoolRequests.filter((r) => r.status === 'VERIFIED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestFilter('REJECTED')}
                  className={`px-3 py-1 text-xs font-black rounded-lg uppercase transition-all cursor-pointer ${
                    requestFilter === 'REJECTED'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rejected ({schoolRequests.filter((r) => r.status === 'REJECTED').length})
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search requests..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 w-48 sm:w-64"
              />
            </div>
          </div>

          {/* Filtered School Requests List */}
          {filteredRequests.length === 0 ? (
            <div className="bg-white border-2 border-slate-200 rounded-3xl p-12 text-center text-slate-500 space-y-3">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                📋
              </div>
              <h3 className="text-sm font-black uppercase text-slate-800">No School Requests Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {requestFilter !== 'ALL'
                  ? `No requests currently match the ${requestFilter} filter.`
                  : 'Incoming requests from partner schools will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className={`bg-white border-3 rounded-2xl p-5 sm:p-6 transition-all shadow-sm ${
                    req.status === 'PENDING'
                      ? 'border-amber-300'
                      : req.status === 'VERIFIED'
                      ? 'border-emerald-300'
                      : 'border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">
                          {req.schoolName}
                        </h3>
                        {req.status === 'PENDING' ? (
                          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-black uppercase">
                            Pending Review
                          </span>
                        ) : req.status === 'VERIFIED' ? (
                          <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-black uppercase">
                            Approved & Issued
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-full text-[10px] font-black uppercase">
                            Rejected
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {req.schoolAdminName || req.contactName || 'Principal'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {req.contactEmail}
                        </span>
                        {(req.phoneNumber || req.contactPhone) && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {req.phoneNumber || req.contactPhone}
                          </span>
                        )}
                        {(req.city || req.country) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {[req.city, req.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>

                      {(req.schoolMessage || req.message || req.notes) && (
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-700 italic max-w-2xl">
                          "{req.schoolMessage || req.message || req.notes}"
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400">
                        Submitted on: {new Date(req.submittedAt || req.paymentDate || Date.now()).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap sm:flex-col items-end gap-2 shrink-0">
                      {req.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(req)}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Approve & Issue 1-Month Key</span>
                        </button>
                      )}

                      {req.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.id)}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Decline
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingRequest(req)}
                        className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        title="Delete request record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Request</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: SCHOOL LICENSE RENEWAL REQUESTS                                      */}
      {/* ========================================================================= */}
      {activeTab === 'renewal_requests' && (
        <div className="space-y-4">
          {/* Header & Quick Metrics */}
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-amber-500/15 text-amber-800 rounded-2xl flex items-center justify-center shrink-0 border border-amber-300">
                <RefreshCw className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <span>School Renewal Requests</span>
                  {pendingRenewalsCount > 0 && (
                    <span className="px-2.5 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black animate-pulse">
                      {pendingRenewalsCount} Pending Review
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  When schools enter their expired key, a renewal request appears here. Approving extends the <strong>exact same key</strong> for 30 more days.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Pending</div>
                <div className="text-sm font-black text-amber-700">{pendingRenewalsCount}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Approved</div>
                <div className="text-sm font-black text-emerald-700">
                  {renewalRequests.filter((r) => r.status === 'APPROVED').length}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Total</div>
                <div className="text-sm font-black text-slate-800">{renewalRequests.length}</div>
              </div>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={renewalSearch}
                onChange={(e) => setRenewalSearch(e.target.value)}
                placeholder="Search by school, key, email, city..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-600"
              />
              {renewalSearch && (
                <button
                  type="button"
                  onClick={() => setRenewalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filterVal) => {
                const count =
                  filterVal === 'ALL'
                    ? renewalRequests.length
                    : renewalRequests.filter((r) => r.status === filterVal).length;

                return (
                  <button
                    key={filterVal}
                    type="button"
                    onClick={() => {
                      soundManager.playPop();
                      setRenewalFilter(filterVal);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      renewalFilter === filterVal
                        ? 'bg-indigo-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{filterVal}</span>
                    <span className="text-[10px] opacity-80">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Renewal Requests List */}
          {filteredRenewals.length === 0 ? (
            <div className="bg-white border-2 border-slate-200 rounded-3xl p-12 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <RefreshCw className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-800 uppercase">
                {renewalSearch || renewalFilter !== 'ALL'
                  ? 'No matching renewal requests'
                  : 'No Renewal Requests Yet'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {renewalSearch || renewalFilter !== 'ALL'
                  ? 'Try changing or clearing your search filters above.'
                  : 'When schools with expired keys try to access the system, their renewal request will automatically appear here for your approval.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredRenewals.map((req) => {
                const isPending = req.status === 'PENDING';
                const isApproved = req.status === 'APPROVED';
                const isRejected = req.status === 'REJECTED';
                const isApproving = approvingRenewalId === req.id;

                const formatDt = (iso?: string) => {
                  if (!iso) return 'N/A';
                  try {
                    return new Date(iso).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
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
                    key={req.id}
                    className={`bg-white rounded-3xl border-2 p-5 shadow-xs transition-all space-y-4 ${
                      isPending
                        ? 'border-amber-300 ring-2 ring-amber-100'
                        : isApproved
                        ? 'border-emerald-200'
                        : 'border-slate-200 opacity-80'
                    }`}
                  >
                    {/* Top Row: School info + status badge */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-slate-900 uppercase">
                            {req.schoolName}
                          </h3>
                          {isPending && (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>Pending Admin Approval</span>
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>Approved & Renewed (+30 Days)</span>
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Ban className="w-3 h-3 text-rose-700" />
                              <span>Rejected</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {req.city && (
                            <span className="flex items-center gap-1 font-medium">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {[req.city, req.country].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {req.contactEmail && (
                            <span className="flex items-center gap-1 font-medium">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              {req.contactEmail}
                            </span>
                          )}
                          {req.phoneNumber && (
                            <span className="flex items-center gap-1 font-medium">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {req.phoneNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Request Timestamp */}
                      <div className="text-left sm:text-right text-[11px] text-slate-500 font-medium shrink-0">
                        <div>Requested: <strong className="text-slate-800">{formatDt(req.requestedAt)}</strong></div>
                        {req.previousExpiryDate && (
                          <div className="text-slate-400">
                            Previous Expiry: {formatDt(req.previousExpiryDate)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* License Key Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          School License Key (Same key renewed upon approval)
                        </div>
                        <div className="font-mono text-sm sm:text-base font-black text-indigo-950 tracking-wider">
                          {req.licenseKey}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyKey(req.licenseKey)}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-2xs"
                      >
                        {copiedKey === req.licenseKey ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy Key</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Admin Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-600 font-medium">
                        {isPending ? (
                          <span className="text-amber-800 font-bold flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600" />
                            Verify offline monthly payment, then click Approve to activate for 30 days.
                          </span>
                        ) : isApproved ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Approved by {req.reviewedBy || 'Admin'} on {formatDt(req.reviewedAt)} (+30 Days Added).
                          </span>
                        ) : (
                          <span className="text-rose-700 font-medium">
                            Request rejected on {formatDt(req.reviewedAt)}.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRejectRenewalRequest(req)}
                              className="px-3.5 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              Decline
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApproveRenewalRequest(req)}
                              disabled={isApproving}
                              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wide transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isApproving ? 'animate-spin' : ''}`} />
                              <span>{isApproving ? 'Renewing...' : 'Approve Renewal (+30 Days)'}</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeletingRenewalReq(req)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Delete renewal request"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ADD SCHOOL & GENERATE 1-MONTH LICENSE KEY                           */}
      {/* ========================================================================= */}
      {activeTab === 'add_school' && (
        <div className="bg-white border-3 border-indigo-200 rounded-3xl p-6 sm:p-8 max-w-2xl mx-auto shadow-sm space-y-6">
          <div className="space-y-1 text-center">
            <div className="w-12 h-12 bg-indigo-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-md">
              <Plus className="w-6 h-6 stroke-[3]" />
            </div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Add School & Generate License
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Manually enter school details after receiving offline payment. A unique 1-month unlimited license key will be issued in <strong>Pending Activation</strong> state.
            </p>
          </div>

          <form onSubmit={handleCreateSchoolSubmit} className="space-y-4 text-xs">
            {/* School Name */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                School / Institution Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. The City School, Karachi"
                value={addSchoolForm.schoolName}
                onChange={(e) => setAddSchoolForm({ ...addSchoolForm, schoolName: e.target.value })}
                className="w-full p-3 bg-slate-50 border-2 border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:border-indigo-600"
              />
            </div>

            {/* Principal Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Principal / Admin Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mrs. Farhana Khan"
                  value={addSchoolForm.schoolAdminName}
                  onChange={(e) => setAddSchoolForm({ ...addSchoolForm, schoolAdminName: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Contact Email <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="principal@school.edu.pk"
                  value={addSchoolForm.contactEmail}
                  onChange={(e) => setAddSchoolForm({ ...addSchoolForm, contactEmail: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Phone Number & City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone / WhatsApp Number</label>
                <input
                  type="text"
                  placeholder="e.g. +92 300 1234567"
                  value={addSchoolForm.phoneNumber}
                  onChange={(e) => setAddSchoolForm({ ...addSchoolForm, phoneNumber: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">City & Country</label>
                <input
                  type="text"
                  placeholder="Karachi, Pakistan"
                  value={addSchoolForm.city}
                  onChange={(e) => setAddSchoolForm({ ...addSchoolForm, city: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Manual Payment Received */}
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Manual Payment Received (PKR)</label>
                <input
                  type="number"
                  placeholder="25000"
                  value={addSchoolForm.price}
                  onChange={(e) => setAddSchoolForm({ ...addSchoolForm, price: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-700">
                  Offline / Bank Transfer (Manual)
                </div>
              </div>
            </div>

            {/* Fixed Institutional Plan Rules */}
            <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[11px]">
                  Duration:
                </span>
                <span className="font-black text-indigo-950 bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200 text-xs">
                  Strictly 1 Month (30 Days)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[11px]">
                  Device Limit:
                </span>
                <span className="font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-300 text-xs">
                  Unlimited Devices
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-700 uppercase tracking-wider text-[11px]">
                  Activation Timing:
                </span>
                <span className="font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300 text-xs">
                  Starts When School Enters Key
                </span>
              </div>
            </div>

            {/* Custom License Key (Optional) */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Custom License Key <span className="text-slate-400 font-normal">(Leave empty to auto-generate unique key)</span>
              </label>
              <input
                type="text"
                placeholder="Auto-generated e.g. PLAY-SCH-4921-9981"
                value={addSchoolForm.licenseKey}
                onChange={(e) => setAddSchoolForm({ ...addSchoolForm, licenseKey: e.target.value.toUpperCase() })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold uppercase text-indigo-950"
              />
            </div>

            {/* Admin Notes */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Admin Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Paid via Meezan Bank cash deposit"
                value={addSchoolForm.adminNotes}
                onChange={(e) => setAddSchoolForm({ ...addSchoolForm, adminNotes: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-700 font-medium"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('school_licenses')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingSchool}
                className="px-6 py-3 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl font-black uppercase tracking-wide transition-all cursor-pointer flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                <Key className="w-4 h-4" />
                <span>{isSubmittingSchool ? 'Generating...' : 'Generate 1-Month License Key'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: NEWLY GENERATED KEY SHARE MODAL                                 */}
      {/* ========================================================================= */}
      {newlyGeneratedKeyData && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-4 border-emerald-400 p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl"
          >
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
                🎉
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                1-Month License Ready!
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Created for <strong>{newlyGeneratedKeyData.schoolName}</strong>
              </p>
            </div>

            {/* Big Key Container */}
            <div className="bg-indigo-50 border-3 border-indigo-300 p-4 rounded-2xl text-center space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">
                Official School License Key
              </span>
              <div className="font-mono font-black text-xl sm:text-2xl text-indigo-950 tracking-wider select-all">
                {newlyGeneratedKeyData.licenseKey}
              </div>
              <button
                type="button"
                onClick={() => handleCopyKey(newlyGeneratedKeyData.licenseKey)}
                className="w-full py-2.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                {copiedKey === newlyGeneratedKeyData.licenseKey ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy License Key</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Automatic 30-Day Start</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                The school's 1-month countdown will start automatically when a teacher or administrator enters this key on their device. You can monitor their live start and expiry timings in the <strong>Registered Schools</strong> tab.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setNewlyGeneratedKeyData(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Done & View Schools
            </button>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRM RENEWAL (+1 MONTH) - SAME KEY PRESERVED                 */}
      {/* ========================================================================= */}
      {renewingLicense && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-3 border-indigo-300 p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-900 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  Renew License for 1 Month
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {renewingLicense.schoolName}
                </p>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl text-xs text-indigo-950 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-600">License Key:</span>
                <span className="font-mono font-black text-indigo-950">
                  {renewingLicense.licenseKey || renewingLicense.id}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-600">Extension Term:</span>
                <span className="font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  +1 Month (30 Days)
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed pt-1 border-t border-indigo-100">
                The <strong>exact same license key</strong> will remain active. The school does NOT need to enter a new key; their existing devices will automatically continue working.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRenewingLicense(null)}
                disabled={isProcessingRenewal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRenewal}
                disabled={isProcessingRenewal}
                className="px-5 py-2.5 bg-indigo-900 hover:bg-indigo-950 text-white rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessingRenewal ? 'animate-spin' : ''}`} />
                <span>{isProcessingRenewal ? 'Renewing...' : 'Confirm Renewal (+1 Month)'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE SCHOOL CONFIRMATION                                       */}
      {/* ========================================================================= */}
      {deletingSchoolLicense && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-3 border-rose-300 p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  Delete School Record
                </h3>
                <p className="text-xs text-slate-500 font-medium">Permanent Action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete <strong>{deletingSchoolLicense.schoolName}</strong>?
              This will remove the school and revoke the license key (
              <span className="font-mono font-bold text-indigo-950">
                {deletingSchoolLicense.licenseKey || deletingSchoolLicense.id}
              </span>
              ).
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSchoolLicense(null)}
                disabled={isProcessingDelete}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSchool}
                disabled={isProcessingDelete}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isProcessingDelete ? 'Deleting...' : 'Yes, Delete School'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DELETE SCHOOL REQUEST CONFIRMATION                               */}
      {/* ========================================================================= */}
      {deletingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-3 border-rose-300 p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  Delete School Request
                </h3>
                <p className="text-xs text-slate-500 font-medium">{deletingRequest.schoolName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this request inquiry from <strong>{deletingRequest.schoolName}</strong>?
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRequest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRequest}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Request</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE RENEWAL REQUEST CONFIRMATION                                */}
      {/* ========================================================================= */}
      {deletingRenewalReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-3 border-rose-300 p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  Delete Renewal Request
                </h3>
                <p className="text-xs text-slate-500 font-medium">Remove Request Record</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this renewal request record for{' '}
              <strong>{deletingRenewalReq.schoolName}</strong> ({deletingRenewalReq.licenseKey})?
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRenewalReq(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRenewalRequestConfirm}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Request</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: FULL SCHOOL DETAILS VIEW MODAL                                   */}
      {/* ========================================================================= */}
      {selectedSchoolDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border-3 border-indigo-200 p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-900 rounded-xl flex items-center justify-center">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">
                    {selectedSchoolDetails.schoolName}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">School Institutional Record</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSchoolDetails(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">License Key:</span>
                  <span className="font-mono font-black text-indigo-950 text-sm">
                    {selectedSchoolDetails.licenseKey || selectedSchoolDetails.id}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">Principal / Contact:</span>
                  <span className="font-bold text-slate-800">
                    {selectedSchoolDetails.schoolAdminName || selectedSchoolDetails.contactName || 'Principal'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">Email:</span>
                  <span className="font-bold text-slate-800">{selectedSchoolDetails.contactEmail}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">Location:</span>
                  <span className="font-bold text-slate-800">
                    {[selectedSchoolDetails.city, selectedSchoolDetails.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>

              {/* Timing Audit */}
              {(() => {
                const t = getLicenseTimingDetails(selectedSchoolDetails);
                return (
                  <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-2 text-indigo-950">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-600">Status:</span>
                      <span className="font-black uppercase">{t.statusLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-600">Start Date:</span>
                      <span className="font-bold">{t.startText}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-600">Expiry Date:</span>
                      <span className="font-bold">{t.expiryText}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-600">Duration:</span>
                      <span className="font-black">1 Month (30 Days) • Unlimited Devices</span>
                    </div>
                  </div>
                );
              })()}

              {selectedSchoolDetails.adminNotes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                  <span className="font-bold block text-slate-500 text-[10px] uppercase">Admin Notes</span>
                  <p className="mt-0.5">{selectedSchoolDetails.adminNotes}</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSchoolDetails(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
