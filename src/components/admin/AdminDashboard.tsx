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
  AlertTriangle,
} from 'lucide-react';
import { soundManager } from '../../utils/audio';
import { UserAccount } from '../PremiumAuthModal';
import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest, SchoolComplaint } from '../../types/payment';
import {
  fetchAllSchoolLicenses,
  fetchAllSchoolRequests,
  fetchAllSchoolRenewals,
  fetchAllSchoolComplaints,
  fetchAllAdminNotifications,
  deduplicateSchoolLicenses,
  saveSchoolLicense,
  saveSchoolRequest,
  saveSchoolRenewal,
  updateSchoolComplaintStatus,
  deleteSchoolComplaint,
  deleteMultipleSchoolComplaints,
  deleteAllSchoolComplaints,
  deleteSchoolLicense,
  deleteMultipleSchoolLicenses,
  revokeSchoolLicense,
  deleteSchoolRequest,
  deleteMultipleSchoolRequests,
  deleteAllSchoolRequests,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  clearAllAdminNotifications,
  generateUniqueLicenseKey,
  createAdminNotification,
  setupLicenseSSEListener,
  calculateCalendarMonthExpiry,
  AdminNotificationItem,
} from '../../services/cloudSchoolSync';
import { getSupabaseClient } from '../../utils/supabaseClient';

import { AdminHeader } from './AdminHeader';
import { AdminDashboardOverview } from './AdminDashboardOverview';
import { AdminSchoolRequests } from './AdminSchoolRequests';
import { AdminRegisteredSchools } from './AdminRegisteredSchools';
import { AdminComplaints } from './AdminComplaints';

interface AdminDashboardProps {
  userAccount?: UserAccount | null;
  onLogout?: () => void;
  onNavigateHome: () => void;
}

export type AdminTab = 'dashboard' | 'school_requests' | 'registered_schools' | 'complaints';

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
  const [complaints, setComplaints] = useState<SchoolComplaint[]>([]);
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
      const [licenses, requests, renewals, notifs, complaintsList] = await Promise.all([
        fetchAllSchoolLicenses(),
        fetchAllSchoolRequests(),
        fetchAllSchoolRenewals(),
        fetchAllAdminNotifications(),
        fetchAllSchoolComplaints(),
      ]);

      // Ensure licenses are strictly unique and deduplicated
      const uniqueLicenses = deduplicateSchoolLicenses(licenses);

      // Filter pending requests: ONLY exclude requests that are explicitly APPROVED or VERIFIED
      const trulyPendingRequests = requests.filter((r) => {
        if (!r || !r.id) return false;
        const status = (r.status || 'PENDING').toUpperCase();
        if (status === 'APPROVED' || status === 'VERIFIED') return false;
        return true;
      });

      setRegisteredSchools(uniqueLicenses);
      setPendingRequests(trulyPendingRequests);
      setRenewalRequests(renewals);
      setNotifications(notifs);
      setComplaints(complaintsList);
    } catch (err) {
      console.warn('[AdminDashboard] Data fetch warning:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();

    console.log('[REALTIME] ADMIN SUBSCRIBED');

    // 1. Real-Time Server-Sent Events (SSE) Listener for instantaneous live update
    const cleanupSSE = setupLicenseSSEListener((event) => {
      if (event?.type === 'ACTIVATION' && event.license) {
        const lic: SchoolLicense = event.license;
        setRegisteredSchools((prev) => {
          const list = [...prev];
          const idx = list.findIndex(
            (s) => s.id === lic.id || (s.licenseKey && lic.licenseKey && s.licenseKey.toUpperCase() === lic.licenseKey.toUpperCase())
          );
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...lic, status: 'ACTIVE' };
          } else {
            list.unshift(lic);
          }
          return list;
        });
        showToast(`🎉 License Key Activated for "${lic.schoolName || 'Partner School'}"! 1 Calendar Month countdown started.`, 'success');
        soundManager.playSuccess();
      } else if (event?.type === 'REVOCATION') {
        const revKey = (event.licenseKey || '').toUpperCase();
        setRegisteredSchools((prev) =>
          prev.map((s) => (s.licenseKey?.toUpperCase() === revKey || s.id === event.licenseId ? { ...s, status: 'REVOKED' } : s))
        );
        showToast(`School license revoked for ${event.schoolName || 'school'}.`, 'info');
      } else if (event?.type === 'SCHOOL_REQUEST' || event?.type === 'INQUIRY') {
        const newReq: SchoolPaymentRequest = event.request;
        if (newReq && newReq.id) {
          setPendingRequests((prev) => {
            const list = [...prev];
            const idx = list.findIndex((r) => r.id === newReq.id);
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...newReq };
            } else {
              list.unshift(newReq);
            }
            return list;
          });
          const notifItem: AdminNotificationItem = {
            id: `notif_inquiry_${(newReq.id || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            type: 'inquiry',
            title: `New School Request: ${newReq.schoolName || 'Partner School'}`,
            message: `${newReq.schoolName} (${newReq.contactName || newReq.schoolAdminName || 'Admin'}) submitted a new inquiry.`,
            timestamp: new Date().toISOString(),
            isRead: false,
            metadata: {
              requestId: newReq.id,
              schoolName: newReq.schoolName,
              email: newReq.contactEmail,
            },
          };
          setNotifications((prev) => [notifItem, ...prev.filter((n) => n.id !== notifItem.id)]);
          soundManager.playSuccess();
          showToast(`📩 New School Inquiry received from "${newReq.schoolName}"!`, 'info');
          loadAllData();
        }
      } else if (event?.type === 'REQUEST_APPROVED') {
        const approvedReqId = (event.requestId || '').toString().toLowerCase().trim();
        setPendingRequests((prev) => prev.filter((r) => (r.id || '').toLowerCase().trim() !== approvedReqId));
        if (event.license) {
          const lic: SchoolLicense = event.license;
          setRegisteredSchools((prev) => {
            const list = [...prev];
            const idx = list.findIndex(
              (s) => s.id === lic.id || (s.licenseKey && lic.licenseKey && s.licenseKey.toUpperCase() === lic.licenseKey.toUpperCase())
            );
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...lic };
            } else {
              list.unshift(lic);
            }
            return list;
          });
        }
      } else if (event?.type === 'REQUEST_DELETED') {
        const delId = (event.requestId || '').toString().toLowerCase().trim();
        setPendingRequests((prev) => prev.filter((r) => (r.id || '').toLowerCase().trim() !== delId));
      } else if (event?.type === 'REQUESTS_DELETED') {
        const delIds = new Set((event.requestIds || []).map((id: string) => (id || '').toLowerCase().trim()));
        setPendingRequests((prev) => prev.filter((r) => !delIds.has((r.id || '').toLowerCase().trim())));
      } else if (event?.type === 'DELETION') {
        if (event.licenseKey) {
          const delKey = (event.licenseKey || '').toString().toUpperCase().trim();
          setRegisteredSchools((prev) => prev.filter((s) => (s.licenseKey || '').toUpperCase().trim() !== delKey));
        }
        if (Array.isArray(event.licenseKeys)) {
          const delKeySet = new Set(event.licenseKeys.map((k: string) => (k || '').toString().toUpperCase().trim()));
          setRegisteredSchools((prev) => prev.filter((s) => !delKeySet.has((s.licenseKey || '').toUpperCase().trim())));
        }
      } else if (event?.type === 'COMPLAINT') {
        const cmp: SchoolComplaint = event.complaint;
        if (cmp && cmp.id) {
          setComplaints((prev) => [cmp, ...prev.filter((c) => c.id !== cmp.id)]);
          const notifItem: AdminNotificationItem = {
            id: `notif_complaint_${(cmp.id || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            type: 'complaint',
            title: `⚠️ New Complaint: ${cmp.schoolName || 'School'}`,
            message: `${cmp.contactName || 'Educator'} (${cmp.contactEmail}) submitted: "${cmp.subject || 'Complaint'}"`,
            timestamp: new Date().toISOString(),
            isRead: false,
            metadata: {
              complaintId: cmp.id,
              schoolName: cmp.schoolName,
              email: cmp.contactEmail,
            },
          };
          setNotifications((prev) => [notifItem, ...prev.filter((n) => n.id !== notifItem.id)]);
          soundManager.playPop();
          showToast(`⚠️ New complaint submitted: "${cmp.schoolName}"`, 'info');
          loadAllData();
        }
      } else if (event?.type === 'COMPLAINTS_DELETED') {
        const delCmpIds = new Set((event.complaintIds || []).map((i: string) => i.toLowerCase().trim()));
        setComplaints((prev) => prev.filter((c) => !delCmpIds.has(c.id.toLowerCase().trim())));
      } else if (event?.type === 'RENEWAL_REQUEST') {
        const renReq = event.request;
        if (renReq) {
          setRenewalRequests((prev) => {
            const list = [...prev];
            const idx = list.findIndex((r) => r.id === renReq.id || (r.licenseKey && renReq.licenseKey && r.licenseKey.toUpperCase() === renReq.licenseKey.toUpperCase()));
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...renReq };
            } else {
              list.unshift(renReq);
            }
            return list;
          });
        }
        showToast(`🔔 New School Renewal Request received for "${event.schoolName || event.licenseKey || 'School'}"!`, 'info');
        soundManager.playPop();
      } else if (event?.type === 'EXPIRY') {
        const expKey = (event.licenseKey || '').toUpperCase();
        setRegisteredSchools((prev) =>
          prev.map((s) => (s.licenseKey?.toUpperCase() === expKey ? { ...s, status: 'EXPIRED' } : s))
        );
      }
      loadAllData();
    });

    // 2. Event listeners for real-time updates across components & tabs
    const handleUpdate = (e?: any) => {
      const detail = e?.detail;
      if (detail && detail.status === 'ACTIVE') {
        const lic: SchoolLicense = detail;
        setRegisteredSchools((prev) => {
          const list = [...prev];
          const idx = list.findIndex(
            (s) => s.id === lic.id || (s.licenseKey && lic.licenseKey && s.licenseKey.toUpperCase() === lic.licenseKey.toUpperCase())
          );
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...lic, status: 'ACTIVE' };
          } else {
            list.unshift(lic);
          }
          return list;
        });
        showToast(`🎉 License Key Activated for "${lic.schoolName || 'Partner School'}"! 1 Calendar Month countdown started.`, 'success');
        soundManager.playSuccess();
      }
      loadAllData();
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('playroom_license_update', handleUpdate);
    window.addEventListener('playroom_school_request_update', handleUpdate);
    window.addEventListener('playroom_renewal_request_update', handleUpdate);
    window.addEventListener('playroom_school_complaint_update', handleUpdate);
    window.addEventListener('playroom_admin_notification_update', handleUpdate);
    window.addEventListener('playroom_admin_notifications_update', handleUpdate);

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        broadcastChannel = new BroadcastChannel('playroom_sync_channel');
        broadcastChannel.onmessage = (event) => {
          const msg = event.data;
          if (msg && msg.type === 'playroom_license_update' && msg.data?.status === 'ACTIVE') {
            const lic: SchoolLicense = msg.data;
            setRegisteredSchools((prev) => {
              const list = [...prev];
              const idx = list.findIndex(
                (s) => s.id === lic.id || (s.licenseKey && lic.licenseKey && s.licenseKey.toUpperCase() === lic.licenseKey.toUpperCase())
              );
              if (idx !== -1) {
                list[idx] = { ...list[idx], ...lic, status: 'ACTIVE' };
              } else {
                list.unshift(lic);
              }
              return list;
            });
            showToast(`🎉 License Key Activated for "${lic.schoolName || 'Partner School'}"! 1 Calendar Month countdown started.`, 'success');
            soundManager.playSuccess();
          } else if (msg && (msg.type === 'RENEWAL_REQUEST' || msg.type === 'playroom_renewal_request_update')) {
            const renReq = msg.request || msg.data || msg;
            console.log('[RENEWAL REALTIME] EVENT RECEIVED');
            console.log('[RENEWAL REALTIME] EVENT TYPE: BROADCAST_CHANNEL');
            console.log(`[RENEWAL REALTIME] ROW ID: ${renReq?.id || 'N/A'}`);
            console.log(`[RENEWAL REALTIME] STATUS: ${renReq?.status || 'PENDING'}`);
            console.log(`[RENEWAL REALTIME] SCHOOL ID: ${renReq?.schoolId || 'N/A'}`);

            if (renReq && (renReq.id || renReq.licenseKey)) {
              setRenewalRequests((prev) => {
                const list = [...prev];
                const idx = list.findIndex((r) => r.id === renReq.id || (r.licenseKey && renReq.licenseKey && r.licenseKey.toUpperCase() === renReq.licenseKey.toUpperCase()));
                if (idx !== -1) {
                  list[idx] = { ...list[idx], ...renReq };
                } else {
                  list.unshift(renReq);
                }
                return list;
              });
            }
            showToast(`🔔 New School Renewal Request received for "${msg.schoolName || renReq?.schoolName || msg.licenseKey || 'School'}"!`, 'info');
            soundManager.playPop();
          }
          loadAllData();
        };
      } catch (_) {}
    }

    // 3. Supabase Realtime Channel Subscription for live multi-device database updates
    const supabase = getSupabaseClient();
    let supabaseRealtimeChannel: any = null;
    if (supabase) {
      try {
        console.log('[RENEWAL REALTIME] SUBSCRIBING');
        supabaseRealtimeChannel = supabase
          .channel('admin-renewal-requests-sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'school_licenses' },
            () => {
              loadAllData();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'school_renewal_requests' },
            (payload: any) => {
              const newRow = payload.new || {};
              const oldRow = payload.old || {};
              const rowId = newRow.id || oldRow.id || 'N/A';
              const status = (newRow.status || oldRow.status || 'PENDING').toUpperCase();
              const schoolId = newRow.school_id || oldRow.school_id || 'N/A';
              const eventType = payload.eventType || 'INSERT';

              console.log('[ADMIN RENEWAL REALTIME] EVENT RECEIVED');
              console.log('[RENEWAL REALTIME] EVENT RECEIVED');
              console.log(`[ADMIN RENEWAL REALTIME] EVENT TYPE: ${eventType}`);
              console.log(`[ADMIN RENEWAL REALTIME] ROW ID: ${rowId}`);
              console.log(`[ADMIN RENEWAL REALTIME] STATUS: ${status}`);
              console.log(`[ADMIN RENEWAL REALTIME] SCHOOL ID: ${schoolId}`);

              if (newRow && (newRow.id || newRow.license_key)) {
                const reqItem: SchoolRenewalRequest = {
                  id: newRow.id || `req_${Date.now()}`,
                  licenseKey: newRow.license_key || '',
                  schoolId: newRow.school_id || '',
                  schoolName: newRow.school_name || 'Partner School',
                  contactEmail: newRow.contact_email || 'school@partner.edu',
                  phoneNumber: newRow.phone_number || '',
                  city: newRow.city || 'Karachi',
                  previousExpiryDate: newRow.previous_expiry_date || '',
                  status: (newRow.status || 'PENDING').toUpperCase() as any,
                  requestedAt: newRow.requested_at || newRow.created_at || new Date().toISOString(),
                  adminNotes: newRow.admin_notes || '',
                  approvedAt: newRow.approved_at,
                  approvedBy: newRow.approved_by,
                };

                setRenewalRequests((prev) => {
                  const list = [...prev];
                  const idx = list.findIndex(
                    (r) =>
                      r.id === reqItem.id ||
                      (r.licenseKey && reqItem.licenseKey && r.licenseKey.toUpperCase() === reqItem.licenseKey.toUpperCase())
                  );
                  if (idx !== -1) {
                    list[idx] = { ...list[idx], ...reqItem };
                  } else {
                    list.unshift(reqItem);
                  }
                  return list;
                });

                showToast(`🔔 New School Renewal Request received for "${reqItem.schoolName || reqItem.licenseKey || 'School'}"!`, 'info');
                soundManager.playPop();
              }
              loadAllData();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'feedback' },
            (payload: any) => {
              const newRow = payload.new || {};
              const oldRow = payload.old || {};
              const msg = newRow.message || oldRow.message || '';
              if (msg.includes('[SCHOOL_RENEWAL_') || msg.includes('[RENEW_REQUEST')) {
                let parsed: any = null;
                try {
                  const jsonPart = msg.replace(/\[SCHOOL_RENEWAL_REQUEST\]|\[SCHOOL_RENEWAL_SYNC\]/, '').trim();
                  parsed = JSON.parse(jsonPart);
                } catch (_) {}

                const rowId = parsed?.id || newRow.id || oldRow.id || 'N/A';
                const status = (parsed?.status || newRow.status || 'PENDING').toUpperCase();
                const schoolId = parsed?.schoolId || 'N/A';
                const eventType = payload.eventType || 'INSERT';

                console.log('[RENEWAL REALTIME] EVENT RECEIVED');
                console.log(`[RENEWAL REALTIME] EVENT TYPE: ${eventType}`);
                console.log(`[RENEWAL REALTIME] ROW ID: ${rowId}`);
                console.log(`[RENEWAL REALTIME] STATUS: ${status}`);
                console.log(`[RENEWAL REALTIME] SCHOOL ID: ${schoolId}`);

                if (parsed && (parsed.id || parsed.licenseKey)) {
                  setRenewalRequests((prev) => {
                    const list = [...prev];
                    const idx = list.findIndex((r) => r.id === parsed.id || (r.licenseKey && parsed.licenseKey && r.licenseKey.toUpperCase() === parsed.licenseKey.toUpperCase()));
                    if (idx !== -1) {
                      list[idx] = { ...list[idx], ...parsed };
                    } else {
                      list.unshift(parsed);
                    }
                    return list;
                  });
                  showToast(`🔔 New School Renewal Request received for "${parsed.schoolName || parsed.licenseKey || 'School'}"!`, 'info');
                  soundManager.playPop();
                }
              }
              loadAllData();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'schools' },
            () => {
              loadAllData();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'school_requests' },
            () => {
              loadAllData();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'school_complaints' },
            () => {
              loadAllData();
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('[RENEWAL REALTIME] SUBSCRIBED');
            }
          });
      } catch (_) {}
    }

    // 4. Fast sync interval (every 3 seconds) for live background updates
    const interval = setInterval(() => {
      loadAllData();
    }, 3000);

    return () => {
      cleanupSSE();
      if (supabaseRealtimeChannel && supabase) {
        try {
          supabase.removeChannel(supabaseRealtimeChannel);
        } catch (_) {}
      }
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('playroom_license_update', handleUpdate);
      window.removeEventListener('playroom_school_request_update', handleUpdate);
      window.removeEventListener('playroom_renewal_request_update', handleUpdate);
      window.removeEventListener('playroom_school_complaint_update', handleUpdate);
      window.removeEventListener('playroom_admin_notification_update', handleUpdate);
      window.removeEventListener('playroom_admin_notifications_update', handleUpdate);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
      clearInterval(interval);
    };
  }, [loadAllData]);

  // Unread notifications count
  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  // Mark all notifications as read
  const handleMarkAllNotifsRead = async () => {
    soundManager.playPop();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllAdminNotificationsRead();
      await loadAllData();
      showToast('All notifications marked as read', 'info');
    } catch (_) {}
  };

  // Mark single notification as read
  const handleMarkNotifRead = async (id: string) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      await markAdminNotificationRead(id);
      await loadAllData();
    } catch (_) {}
  };

  const handleSelectNotif = async (n: AdminNotificationItem) => {
    soundManager.playPop();
    await handleMarkNotifRead(n.id);
    if (n.metadata?.requestId || n.type === 'inquiry') {
      setActiveTab('school_requests');
    } else if (n.type === 'activation' || n.linkTab === 'registered_schools') {
      setActiveTab('registered_schools');
    } else if (n.type === 'renewal_request' || n.linkTab === 'renewal_requests') {
      setActiveTab('registered_schools');
    } else if (n.type === 'complaint' || n.linkTab === 'complaints') {
      setActiveTab('complaints');
    }
  };

  // Delete single notification
  const handleDeleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundManager.playPop();
    try {
      await deleteAdminNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      soundManager.playSuccess();
      showToast('Notification deleted permanently.', 'info');
      loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete notification.', 'error');
    }
  };

  // Clear all notifications
  const handleClearAllNotifs = async () => {
    soundManager.playPop();
    try {
      await clearAllAdminNotifications();
      setNotifications([]);
      soundManager.playSuccess();
      showToast('All notifications cleared successfully.', 'info');
      loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to clear notifications.', 'error');
    }
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
      const targetReqId = req.id || (req as any).requestId || (req as any)._id || '';
      if (!targetReqId) {
        throw new Error('Invalid school request ID.');
      }

      const isValidUUID = (s?: string) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
      const schoolId = isValidUUID(req.schoolId) ? req.schoolId : undefined;

      // 1. Authoritative Backend Approval API Call with complete school details
      const response = await fetch('/api/payment/school-request/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: targetReqId,
          schoolId: schoolId,
          schoolName: req.schoolName,
          schoolAdminName: req.contactName || req.schoolAdminName || 'School Administrator',
          contactName: req.contactName || req.schoolAdminName || 'School Administrator',
          contactEmail: req.contactEmail,
          contactPhone: req.contactPhone || req.phoneNumber || '',
          phoneNumber: req.phoneNumber || req.contactPhone || '',
          country: req.country || 'Pakistan',
          city: req.city || 'Karachi',
          amount: req.amount || 25000,
          currency: req.currency || 'PKR',
          allowedDevices: req.allowedDevices || 999999,
          durationMonths: req.durationMonths || 1,
          configuredDurationDays: (req as any).configuredDurationDays || (req as any).durationDays || 30,
          durationDays: (req as any).durationDays || (req as any).configuredDurationDays || 30,
          configuredStartDate: (req as any).configuredStartDate,
          configuredExpiryDate: (req as any).configuredExpiryDate,
          adminEmail: userAccount?.email || 'admin@playroom.app',
          adminNotes: `Approved from inquiry #${targetReqId}`,
        }),
      });

      let resData: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        resData = JSON.parse(rawText);
      } catch (_) {
        resData = null;
      }

      if (!response.ok || !resData?.success) {
        if (response.status === 404) {
          throw new Error('Approval API endpoint returned 404 Not Found. Ensure the backend server or Vercel serverless functions are deployed.');
        }
        const serverErrMsg = resData?.error || (rawText && rawText.length < 150 ? rawText : `Server error (HTTP ${response.status})`);
        throw new Error(serverErrMsg || 'Database operation failed to approve school request.');
      }

      const approvedLicense: SchoolLicense = resData.license;
      if (!approvedLicense || !approvedLicense.licenseKey) {
        throw new Error('Approval succeeded on server but no valid license was returned.');
      }

      // 2. Persist to client cache & Supabase feedback sync
      await saveSchoolLicense(approvedLicense);

      // 3. Update local school requests state (remove from Pending Requests)
      setPendingRequests((prev) => prev.filter((r) => r.id !== req.id && r.id !== targetReqId));
      setSelectedRequest(null);

      // Update local storage requests to mark approved
      if (typeof window !== 'undefined') {
        try {
          ['playroom_school_requests', 'playroom_cloud_school_requests', 'playroom_payment_requests'].forEach((key) => {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list: SchoolPaymentRequest[] = JSON.parse(raw);
              const updated = list.map((r) => (r.id === req.id || r.id === targetReqId ? { ...r, status: 'APPROVED' as any } : r));
              localStorage.setItem(key, JSON.stringify(updated));
            }
          });
        } catch (_) {}
      }

      // 4. Update Registered Schools state directly so it appears immediately
      setRegisteredSchools((prev) => {
        const list = [...prev];
        const existingIdx = list.findIndex(
          (s) =>
            s.id === approvedLicense.id ||
            (s.licenseKey && approvedLicense.licenseKey && s.licenseKey.toUpperCase() === approvedLicense.licenseKey.toUpperCase()) ||
            (s.schoolId && approvedLicense.schoolId && s.schoolId === approvedLicense.schoolId)
        );
        if (existingIdx !== -1) {
          list[existingIdx] = approvedLicense;
        } else {
          list.unshift(approvedLicense);
        }
        return list;
      });

      soundManager.playSuccess();
      copyToClipboard(approvedLicense.licenseKey, `License Key for ${req.schoolName}`);
      showToast(
        resData.alreadyApproved
          ? `Request was already approved. License key: ${approvedLicense.licenseKey}`
          : `Approved! License key ${approvedLicense.licenseKey} generated and copied. School moved to Registered Schools.`,
        'success'
      );

      // Switch to Registered Schools tab IMMEDIATELY so school appears in registered list right away
      setActiveTab('registered_schools');
      loadAllData();
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
  // 2b. DELETE SCHOOL REQUEST (PERMANENT)
  // ---------------------------------------------------------------------------
  const handleDeleteSchoolRequest = async (req: SchoolPaymentRequest) => {
    soundManager.playPop();
    try {
      await deleteSchoolRequest(req.id);
      setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (selectedRequest?.id === req.id) {
        setSelectedRequest(null);
      }
      soundManager.playSuccess();
      showToast(`Inquiry for "${req.schoolName}" deleted permanently.`, 'info');
      await loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete inquiry.', 'error');
    }
  };

  const handleDeleteAllSchoolRequests = async () => {
    soundManager.playPop();
    try {
      await deleteAllSchoolRequests();
      setPendingRequests([]);
      setSelectedRequest(null);
      soundManager.playSuccess();
      showToast('All school inquiries deleted permanently.', 'info');
      await loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete all inquiries.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 3. GENERATE OR SET KEY FOR REGISTERED SCHOOL
  // ---------------------------------------------------------------------------
  const handleGenerateKeyForSchool = async (
    school: SchoolLicense,
    customKey?: string,
    options?: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => {
    soundManager.playPop();
    try {
      if (options?.startDate && options?.expiryDate) {
        const startTs = new Date(options.startDate).getTime();
        const expTs = new Date(options.expiryDate).getTime();
        if (expTs <= startTs) {
          showToast('Expiry Date must be later than Start Date.', 'error');
          return;
        }
      }

      const keyToUse = (customKey && customKey.trim()) ? customKey.trim().toUpperCase() : generateUniqueLicenseKey();
      const finalDuration = options?.durationDays ?? school.configuredDurationDays ?? school.durationDays ?? 30;
      const finalStartDate = options?.startDate || school.configuredStartDate || school.startDate || null;
      const finalExpiryDate = options?.expiryDate || school.configuredExpiryDate || school.expiryDate || null;

      const updatedLicense: SchoolLicense = {
        ...school,
        licenseKey: keyToUse,
        status: school.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        startDate: finalStartDate,
        expiryDate: finalExpiryDate,
        validFrom: finalStartDate,
        validUntil: finalExpiryDate,
        activatedAt: school.activatedAt || null,
        configuredStartDate: finalStartDate,
        configuredDurationDays: finalDuration,
        configuredExpiryDate: finalExpiryDate,
        durationDays: finalDuration,
        durationMonths: Math.ceil(finalDuration / 30) || 1,
        adminNotes: `License key ${customKey ? 'assigned' : 'generated'} by ${userAccount?.email || 'Admin'} on ${new Date().toLocaleDateString()}`,
      };

      await saveSchoolLicense(updatedLicense);
      soundManager.playSuccess();
      copyToClipboard(keyToUse, `License Key for ${school.schoolName}`);
      showToast(`License key ${keyToUse} saved for "${school.schoolName}" and copied to clipboard!`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update license key.', 'error');
    }
  };

  const handleSaveLicenseConfig = async (
    school: SchoolLicense,
    options: { startDate?: string; durationDays?: number; expiryDate?: string }
  ) => {
    soundManager.playPop();
    try {
      if (options.startDate && options.expiryDate) {
        const startTs = new Date(options.startDate).getTime();
        const expTs = new Date(options.expiryDate).getTime();
        if (expTs <= startTs) {
          showToast('Expiry Date must be later than Start Date.', 'error');
          return;
        }
      }

      const finalDuration = options.durationDays ?? school.configuredDurationDays ?? school.durationDays ?? 30;
      const finalStartDate = options.startDate || school.configuredStartDate || school.startDate || null;
      const finalExpiryDate = options.expiryDate || school.configuredExpiryDate || school.expiryDate || null;

      const updatedLicense: SchoolLicense = {
        ...school,
        configuredStartDate: finalStartDate,
        configuredDurationDays: finalDuration,
        configuredExpiryDate: finalExpiryDate,
        startDate: finalStartDate,
        expiryDate: finalExpiryDate,
        validFrom: finalStartDate,
        validUntil: finalExpiryDate,
        durationDays: finalDuration,
        durationMonths: Math.ceil(finalDuration / 30) || 1,
        adminNotes: `License period configured by ${userAccount?.email || 'Admin'} on ${new Date().toLocaleDateString()}`,
      };

      await saveSchoolLicense(updatedLicense);
      soundManager.playSuccess();
      showToast(`License dates and duration saved for "${school.schoolName}".`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save license configuration.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 4. RENEW / REACTIVATE SCHOOL LICENSE (EXTEND 30 DAYS)
  // ---------------------------------------------------------------------------
  const handleRenewSchoolLicense = async (school: SchoolLicense) => {
    soundManager.playPop();
    const cleanKey = (school.licenseKey || '').trim().toUpperCase();
    const now = new Date();
    let newValidUntil: Date;

    if (school.status === 'ACTIVE' && (school.validUntil || school.expiryDate)) {
      const currentExp = new Date(school.validUntil || school.expiryDate!).getTime();
      if (currentExp > now.getTime()) {
        newValidUntil = calculateCalendarMonthExpiry(new Date(currentExp));
      } else {
        newValidUntil = calculateCalendarMonthExpiry(now);
      }
    } else {
      newValidUntil = calculateCalendarMonthExpiry(now);
    }

    const updatedLicense: SchoolLicense = {
      ...school,
      licenseKey: cleanKey || school.licenseKey,
      status: 'ACTIVE',
      startDate: school.startDate || now.toISOString(),
      validFrom: school.validFrom || now.toISOString(),
      expiryDate: newValidUntil.toISOString(),
      validUntil: newValidUntil.toISOString(),
      durationDays: Math.max(1, Math.round((newValidUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
      durationMonths: 1,
      adminNotes: `Renewed & Activated for 1 calendar month by ${userAccount?.email || 'Admin'} on ${now.toLocaleDateString()}`,
    };

    // 1. Optimistic instant local state update for registeredSchools
    setRegisteredSchools((prev) =>
      prev.map((s) => {
        const matchId = s.id && school.id && s.id === school.id;
        const matchKey = s.licenseKey && cleanKey && s.licenseKey.trim().toUpperCase() === cleanKey;
        return (matchId || matchKey) ? updatedLicense : s;
      })
    );

    // 2. Optimistic instant local state update for renewalRequests
    setRenewalRequests((prev) =>
      prev.map((r) => {
        const matchKey = r.licenseKey && cleanKey && r.licenseKey.trim().toUpperCase() === cleanKey;
        if (matchKey) {
          return {
            ...r,
            status: 'APPROVED',
            approvedAt: now.toISOString(),
            approvedBy: userAccount?.email || 'Admin',
          };
        }
        return r;
      })
    );

    // 3. Broadcast Reactivation across local tabs immediately
    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('playroom_sync_channel');
          bc.postMessage({
            type: 'ACTIVATION',
            status: 'ACTIVE',
            licenseKey: cleanKey,
            schoolName: updatedLicense.schoolName,
            license: updatedLicense,
          });
          bc.close();
        }
        window.dispatchEvent(new CustomEvent('playroom_license_reactivated', { detail: updatedLicense }));
        window.dispatchEvent(new CustomEvent('playroom_license_update', { detail: updatedLicense }));
      } catch (_) {}
    }

    try {
      // 4. Call Backend Server API to trigger server state & SSE broadcast
      try {
        await fetch('/api/payment/school-license/renew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseId: school.id,
            licenseKey: cleanKey,
            adminNotes: `Renewed for 30 days by ${userAccount?.email || 'Admin'} on ${now.toLocaleDateString()}`,
            adminEmail: userAccount?.email || 'admin@playroom.app',
          }),
        });
      } catch (e) {
        console.warn('Backend renew notice:', e);
      }

      await saveSchoolLicense(updatedLicense);

      // If pending renewal exists for this key, mark approved in cloud
      const pendingRen = renewalRequests.find(
        (r) =>
          cleanKey &&
          r.licenseKey &&
          r.licenseKey.toUpperCase().trim() === cleanKey &&
          (r.status || 'PENDING').toUpperCase() === 'PENDING'
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
        `License for ${school.schoolName} (${cleanKey}) extended for 30 days. Valid until ${newValidUntil.toLocaleDateString()}.`,
        { licenseKey: cleanKey, schoolName: school.schoolName, validUntil: newValidUntil.toISOString() }
      );

      soundManager.playSuccess();
      showToast(`🎉 Reactivated: License for "${school.schoolName}" reactivated for 30 Days!`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to renew license.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 5. REVOKE SCHOOL ACCESS (LOCKS KEY & ACCESS IMMEDIATELY)
  // ---------------------------------------------------------------------------
  const handleRevokeSchoolAccess = async (school: SchoolLicense) => {
    soundManager.playPop();
    const cleanKey = (school.licenseKey || '').trim().toUpperCase();

    // 1. Optimistic state update: toggle to REVOKED immediately
    const updatedRevoked: SchoolLicense = {
      ...school,
      status: 'REVOKED',
      adminNotes: `Revoked by ${userAccount?.email || 'Admin'} on ${new Date().toLocaleDateString()}`,
    };
    setRegisteredSchools((prev) =>
      prev.map((s) => {
        const matchId = s.id && school.id && s.id === school.id;
        const matchKey = s.licenseKey && cleanKey && s.licenseKey.trim().toUpperCase() === cleanKey;
        return (matchId || matchKey) ? updatedRevoked : s;
      })
    );

    try {
      await revokeSchoolLicense(school);

      // Notification
      await createAdminNotification(
        'revocation',
        `License Revoked: ${school.schoolName}`,
        `Access revoked for ${school.schoolName} (${cleanKey || 'N/A'}). Device access locked immediately.`,
        { licenseKey: cleanKey, schoolName: school.schoolName, revokedAt: new Date().toISOString() }
      );

      soundManager.playPop();
      showToast(`Access revoked for "${school.schoolName}". Key invalidated immediately.`, 'info');
      loadAllData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to revoke school access.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 5b. DELETE SCHOOL RECORD (PERMANENT)
  // ---------------------------------------------------------------------------
  const handleDeleteSchoolRecord = async (school: SchoolLicense) => {
    soundManager.playPop();
    try {
      const targetId = school.id;
      const targetKey = school.licenseKey;

      await deleteSchoolLicense(targetId);
      if (targetKey) {
        await deleteSchoolLicense(targetKey);
      }

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
              const userRaw = localStorage.getItem('playroom_user');
              if (userRaw) {
                const u = JSON.parse(userRaw);
                if (u.role === 'school_admin' || u.licenseKey === targetKey) {
                  localStorage.removeItem('playroom_user');
                }
              }
            }
          } catch (_) {}
        }
        localStorage.setItem(
          'playroom_revoked_notice',
          JSON.stringify({
            isRevoked: true,
            schoolName: school.schoolName,
            licenseKey: targetKey,
            message:
              'Administrator ne is school ka license cancel / revoke kar diya hai. Dobara access ke liye Administrator se rabta karein ya new inquiry submit karein.',
          })
        );
        window.dispatchEvent(new CustomEvent('playroom_license_revoked'));
        window.dispatchEvent(new CustomEvent('playroom_license_update'));
        window.dispatchEvent(new CustomEvent('playroom_auth_change'));
      }

      setRegisteredSchools((prev) =>
        prev.filter((s) => s.id !== targetId && (!targetKey || s.licenseKey?.toUpperCase() !== targetKey.toUpperCase()))
      );

      soundManager.playSuccess();
      showToast(`School "${school.schoolName}" deleted successfully.`, 'success');
      await loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete school record.', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 5c. DELETE MULTIPLE SCHOOLS (BATCH MULTI-SELECT)
  // ---------------------------------------------------------------------------
  const handleDeleteMultipleSchools = async (schools: SchoolLicense[]) => {
    if (!schools || schools.length === 0) return;
    soundManager.playPop();
    try {
      const schoolIds = schools.map((s) => s.id);
      const schoolKeys = new Set(schools.map((s) => (s.licenseKey || '').toUpperCase().trim()).filter(Boolean));
      // Optimistic update so UI reflects deletions immediately
      setRegisteredSchools((prev) =>
        prev.filter((s) => !schoolIds.includes(s.id) && !schoolKeys.has((s.licenseKey || '').toUpperCase().trim()))
      );

      // Fast atomic batch delete (handles local storage tombstones, backend batch API, and Supabase)
      await deleteMultipleSchoolLicenses(schools);

      if (typeof window !== 'undefined') {
        const activeRaw = localStorage.getItem('playroom_active_school_license');
        if (activeRaw) {
          try {
            const activeLic = JSON.parse(activeRaw);
            const activeKey = (activeLic.licenseKey || '').toUpperCase().trim();
            if (schoolIds.includes(activeLic.id) || (activeKey && schoolKeys.has(activeKey))) {
              localStorage.removeItem('playroom_active_school_license');
            }
          } catch (_) {}
        }
        window.dispatchEvent(new CustomEvent('playroom_license_update'));
      }

      soundManager.playSuccess();
      showToast(`${schools.length} schools deleted permanently.`, 'success');
      await loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete selected schools.', 'error');
      await loadAllData();
    }
  };

  const handleDeleteMultipleRequests = async (requestIds: string[]) => {
    if (!requestIds || requestIds.length === 0) return;
    soundManager.playPop();
    try {
      const idSet = new Set(requestIds.map((id) => id.toLowerCase().trim()));
      setPendingRequests((prev) => prev.filter((r) => !idSet.has((r.id || '').toLowerCase().trim())));
      setSelectedRequest(null);

      await deleteMultipleSchoolRequests(requestIds);

      soundManager.playSuccess();
      showToast(`${requestIds.length} school inquiries deleted permanently.`, 'info');
      await loadAllData();
    } catch (err: any) {
      soundManager.playPop();
      showToast(err?.message || 'Failed to delete selected inquiries.', 'error');
      await loadAllData();
    }
  };

  // ---------------------------------------------------------------------------
  // 6. RENEWAL REQUEST TAB ACTIONS
  // ---------------------------------------------------------------------------
  const handleApproveRenewalRequest = async (req: SchoolRenewalRequest) => {
    soundManager.playPop();
    try {
      const now = new Date();
      const newValidUntil = calculateCalendarMonthExpiry(now).toISOString();
      const cleanKey = (req.licenseKey || '').trim().toUpperCase();

      // 1. Authoritative Backend Approval API Call
      try {
        await fetch('/api/license/renew-request/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: cleanKey,
            requestId: req.id,
            adminEmail: userAccount?.email || 'admin@playroom.app',
          }),
        });
      } catch (apiErr) {
        console.warn('Backend renew request approve endpoint notice:', apiErr);
      }

      // 2. Prepare and save active School License
      const matchingSchool = registeredSchools.find(
        (s) => s.licenseKey && s.licenseKey.toUpperCase().trim() === cleanKey
      );

      const activeLic: SchoolLicense = {
        id: matchingSchool?.id || `lic_${cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        licenseKey: cleanKey,
        schoolId: matchingSchool?.schoolId || req.schoolId || 'school_id',
        schoolName: matchingSchool?.schoolName || req.schoolName || 'Partner School',
        contactEmail: matchingSchool?.contactEmail || req.contactEmail || 'school@partner.edu',
        contactPhone: matchingSchool?.contactPhone || req.phoneNumber || '',
        city: matchingSchool?.city || req.city || 'Karachi',
        country: matchingSchool?.country || 'Pakistan',
        status: 'ACTIVE',
        validFrom: now.toISOString(),
        validUntil: newValidUntil,
        startDate: now.toISOString(),
        expiryDate: newValidUntil,
        durationDays: Math.max(1, Math.round((new Date(newValidUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
        durationMonths: 1,
        allowedDevices: matchingSchool?.allowedDevices || 15,
        price: matchingSchool?.price || 0,
        currency: matchingSchool?.currency || 'PKR',
        page1Access: true,
        page2Access: true,
        adminNotes: `Renewed & Activated by ${userAccount?.email || 'Admin'} on ${now.toLocaleDateString()}`,
        createdAt: matchingSchool?.createdAt || now.toISOString(),
      };

      await saveSchoolLicense(activeLic);

      // 3. Update Renewal Request status to APPROVED
      const updatedRen: SchoolRenewalRequest = {
        ...req,
        status: 'APPROVED',
        approvedAt: now.toISOString(),
        approvedBy: userAccount?.email || 'Admin',
      };
      await saveSchoolRenewal(updatedRen);

      // 4. Update local state immediately without requiring reload
      setRenewalRequests((prev) =>
        prev.map((r) =>
          r.id === req.id || (r.licenseKey && r.licenseKey.toUpperCase() === cleanKey)
            ? updatedRen
            : r
        )
      );

      setRegisteredSchools((prev) => {
        const list = [...prev];
        const idx = list.findIndex(
          (s) =>
            s.id === activeLic.id ||
            (s.licenseKey && activeLic.licenseKey && s.licenseKey.toUpperCase() === activeLic.licenseKey.toUpperCase())
        );
        if (idx !== -1) {
          list[idx] = activeLic;
        } else {
          list.unshift(activeLic);
        }
        return list;
      });

      // 5. Broadcast Reactivation across local tabs
      if (typeof window !== 'undefined') {
        try {
          if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel('playroom_sync_channel');
            bc.postMessage({
              type: 'ACTIVATION',
              status: 'ACTIVE',
              licenseKey: cleanKey,
              schoolName: activeLic.schoolName,
              license: activeLic,
            });
            bc.close();
          }
          window.dispatchEvent(new CustomEvent('playroom_license_reactivated', { detail: activeLic }));
          window.dispatchEvent(new CustomEvent('playroom_license_update', { detail: activeLic }));
        } catch (_) {}
      }

      soundManager.playSuccess();
      showToast(`🎉 Reactivated: License for "${req.schoolName}" reactivated for 30 Days!`, 'success');
      loadAllData();
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
        status: 'PENDING', // Starts 1 calendar month countdown on key entry
        durationMonths: 1,
        durationDays: 30,
        createdAt: new Date().toISOString(),
        adminNotes: `Registered manually by ${userAccount?.email || 'Admin'}. 1 calendar month access starts on key entry.`,
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

  // Complaint Management Handlers
  const handleUpdateComplaintStatus = async (
    id: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
    adminNotes?: string
  ) => {
    try {
      await updateSchoolComplaintStatus(id, status, adminNotes);
      loadAllData();
    } catch (e: any) {
      showToast('Failed to update complaint status', 'error');
      throw e;
    }
  };

  const handleDeleteComplaint = async (id: string) => {
    try {
      await deleteSchoolComplaint(id);
      setComplaints((prev) => prev.filter((c) => c.id !== id));
      const normId = id.toLowerCase().trim();
      setNotifications((prev) =>
        prev.filter((n) => {
          if (n.type === 'complaint') {
            const notifCmpId = (n.metadata?.schoolId || (n.id.startsWith('notif_complaint_') ? n.id.replace('notif_complaint_', '') : '')).toLowerCase().trim();
            return notifCmpId !== normId && n.id !== `notif_complaint_${normId.replace(/[^a-z0-9]/g, '_')}`;
          }
          return true;
        })
      );
      soundManager.playSuccess();
      showToast('Complaint deleted permanently.', 'info');
      await loadAllData();
    } catch (e: any) {
      soundManager.playPop();
      showToast(e?.message || 'Failed to delete complaint', 'error');
      throw e;
    }
  };

  const handleDeleteMultipleComplaints = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    soundManager.playPop();
    try {
      await deleteMultipleSchoolComplaints(ids);
      const idSet = new Set(ids.map((i) => i.toLowerCase().trim()));
      setComplaints((prev) => prev.filter((c) => !idSet.has(c.id.toLowerCase().trim())));
      setNotifications((prev) =>
        prev.filter((n) => {
          if (n.type === 'complaint') {
            const notifCmpId = (n.metadata?.schoolId || (n.id.startsWith('notif_complaint_') ? n.id.replace('notif_complaint_', '') : '')).toLowerCase().trim();
            return !idSet.has(notifCmpId);
          }
          return true;
        })
      );
      soundManager.playSuccess();
      showToast(`${ids.length} complaints deleted permanently.`, 'info');
      await loadAllData();
    } catch (e: any) {
      soundManager.playPop();
      showToast(e?.message || 'Failed to delete selected complaints', 'error');
      throw e;
    }
  };

  const handleDeleteAllComplaints = async () => {
    soundManager.playPop();
    try {
      const allIds = complaints.map((c) => c.id);
      await deleteAllSchoolComplaints(allIds);
      setComplaints([]);
      setNotifications((prev) =>
        prev.filter((n) => n.type !== 'complaint' && !(n.id || '').toLowerCase().includes('complaint'))
      );
      soundManager.playSuccess();
      showToast('All complaints deleted permanently.', 'info');
      await loadAllData();
    } catch (e: any) {
      soundManager.playPop();
      showToast(e?.message || 'Failed to delete all complaints', 'error');
      throw e;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* 1. Header */}
      <AdminHeader
        notifications={notifications}
        unreadNotifsCount={unreadNotifsCount}
        onMarkAllRead={handleMarkAllNotifsRead}
        onMarkNotifRead={handleMarkNotifRead}
        onSelectNotif={handleSelectNotif}
        onClearAll={handleClearAllNotifs}
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

            {/* Tab 4: Complaints & Bug Reports */}
            <button
              id="admin-nav-complaints"
              onClick={() => {
                soundManager.playPop();
                setActiveTab('complaints');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap relative ${
                activeTab === 'complaints'
                  ? 'bg-rose-600 text-white shadow-xs shadow-rose-600/30'
                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Complaints</span>
              {complaints.filter((c) => (c.status || 'OPEN').toUpperCase() === 'OPEN').length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'complaints'
                      ? 'bg-white text-rose-700'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {complaints.filter((c) => (c.status || 'OPEN').toUpperCase() === 'OPEN').length}
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
                complaints={complaints}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onViewRequest={(req) => {
                  setSelectedRequest(req);
                  setActiveTab('school_requests');
                }}
                onApproveRequest={handleApproveSchoolRequest}
                onViewApp={onNavigateHome}
                onDeleteNotif={handleDeleteNotif}
                onClearAllNotifs={handleClearAllNotifs}
                onSelectNotif={handleSelectNotif}
              />
            )}

            {/* View 2: School Requests */}
            {activeTab === 'school_requests' && (
              <AdminSchoolRequests
                pendingRequests={pendingRequests}
                onApproveRequest={handleApproveSchoolRequest}
                onRejectRequest={handleRejectSchoolRequest}
                onDeleteRequest={handleDeleteSchoolRequest}
                onDeleteMultipleRequests={handleDeleteMultipleRequests}
                onDeleteAllRequests={handleDeleteAllSchoolRequests}
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
                renewalRequests={renewalRequests}
                onGenerateKeyForSchool={handleGenerateKeyForSchool}
                onSaveLicenseConfig={handleSaveLicenseConfig}
                onRenewLicense={handleRenewSchoolLicense}
                onRevokeAccess={handleRevokeSchoolAccess}
                onDeleteSchool={handleDeleteSchoolRecord}
                onDeleteMultipleSchools={handleDeleteMultipleSchools}
                onOpenAddSchoolModal={handleOpenAddSchoolModal}
                copyToClipboard={copyToClipboard}
                copiedText={copiedText}
              />
            )}

            {/* View 4: Complaints & Screenshots Management */}
            {activeTab === 'complaints' && (
              <AdminComplaints
                complaints={complaints}
                onUpdateStatus={handleUpdateComplaintStatus}
                onDeleteComplaint={handleDeleteComplaint}
                onDeleteMultipleComplaints={handleDeleteMultipleComplaints}
                onDeleteAllComplaints={handleDeleteAllComplaints}
                showToast={showToast}
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
                  1 calendar month access countdown begins strictly when entered by the school.
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

      {/* Floating Toast Container with Dismiss Cut Button */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-in slide-in-from-bottom-2 fade-in duration-150 ${
              toast.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/40 shadow-emerald-950/20'
                : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-500/40 shadow-rose-950/20'
                : 'bg-slate-900 text-slate-100 border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-indigo-400 shrink-0" />}
              <span className="leading-snug break-words">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                soundManager.playPop();
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-1.5"
              title="Cut / Dismiss notification"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
