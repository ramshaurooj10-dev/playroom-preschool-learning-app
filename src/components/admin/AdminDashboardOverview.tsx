import React from 'react';
import {
  Inbox,
  Building2,
  KeyRound,
  ClockAlert,
  ArrowRight,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest } from '../../types/payment';
import { AdminNotificationItem } from '../../services/cloudSchoolSync';

interface AdminDashboardOverviewProps {
  registeredSchools: SchoolLicense[];
  pendingRequests: SchoolPaymentRequest[];
  renewalRequests: SchoolRenewalRequest[];
  notifications: AdminNotificationItem[];
  onNavigateTab: (tab: 'dashboard' | 'school_requests' | 'registered_schools' | 'renewal_requests' | 'complaints') => void;
  onViewRequest: (request: SchoolPaymentRequest) => void;
}

export const AdminDashboardOverview: React.FC<AdminDashboardOverviewProps> = ({
  registeredSchools,
  pendingRequests,
  renewalRequests,
  notifications,
  onNavigateTab,
  onViewRequest,
}) => {
  const now = new Date().getTime();

  // 1. Calculations for real DB counts
  const pendingRequestsCount = pendingRequests.filter(
    (r) => (r.status || 'PENDING').toUpperCase() === 'PENDING'
  ).length;

  const registeredSchoolsCount = registeredSchools.filter(
    (s) => s.status !== 'REVOKED'
  ).length;

  const activeLicensesCount = registeredSchools.filter((s) => {
    const rawStatus = (s.status || '').toUpperCase();
    if (rawStatus === 'REVOKED') return false;
    const isAct = rawStatus === 'ACTIVE' || Boolean(s.startDate || s.validFrom);
    if (!isAct) return false;
    const exp = s.validUntil || s.expiryDate;
    if (exp) {
      return new Date(exp).getTime() > now;
    }
    return rawStatus === 'ACTIVE';
  }).length;

  const expiringSoonCount = registeredSchools.filter((s) => {
    if (s.status !== 'ACTIVE') return false;
    const exp = s.validUntil || s.expiryDate;
    if (!exp) return false;
    const diffDays = (new Date(exp).getTime() - now) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 7;
  }).length;

  // Recent 5 pending requests (approved inquiries move to Registered Schools)
  const recentRequests = pendingRequests
    .filter((r) => (r.status || 'PENDING').toUpperCase() !== 'APPROVED')
    .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime())
    .slice(0, 5);

  // Helper for notification icons & colors
  const getActivityBadge = (type: string) => {
    switch (type) {
      case 'activation':
        return {
          icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
        };
      case 'renewal_request':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-purple-400" />,
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
        };
      case 'revocation':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-rose-400" />,
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
        };
      default:
        return {
          icon: <Inbox className="w-3.5 h-3.5 text-blue-400" />,
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
        };
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Card 1: Pending Requests */}
        <div
          id="summary-pending-requests"
          onClick={() => onNavigateTab('school_requests')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Requests
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Inbox className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {pendingRequestsCount}
            </span>
            <span className="text-xs font-medium text-amber-600 flex items-center gap-1 group-hover:underline">
              View inquiries <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 2: Registered Schools */}
        <div
          id="summary-registered-schools"
          onClick={() => onNavigateTab('registered_schools')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered Schools
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {registeredSchoolsCount}
            </span>
            <span className="text-xs font-medium text-indigo-600 flex items-center gap-1 group-hover:underline">
              Manage schools <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 3: Active Licenses */}
        <div
          id="summary-active-licenses"
          onClick={() => onNavigateTab('registered_schools')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Licenses
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {activeLicensesCount}
            </span>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 group-hover:underline">
              30-day active <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 4: Expiring Soon */}
        <div
          id="summary-expiring-soon"
          onClick={() => onNavigateTab('renewal_requests')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-rose-200 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Expiring Soon
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ClockAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {expiringSoonCount}
            </span>
            <span className="text-xs font-medium text-rose-600 flex items-center gap-1 group-hover:underline">
              {expiringSoonCount === 1 ? '1 within 7 days' : `${expiringSoonCount} within 7 days`}{' '}
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent School Requests & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left 2 Cols: Recent School Requests */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent School Requests</h3>
                <p className="text-xs text-slate-500">Latest inbound inquiries from partner schools</p>
              </div>
              <button
                onClick={() => onNavigateTab('school_requests')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
              >
                View all requests <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                No school requests pending review.
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider text-[10px] rounded-lg">
                    <tr>
                      <th className="py-2.5 px-3 rounded-l-lg">School</th>
                      <th className="py-2.5 px-3">Contact</th>
                      <th className="py-2.5 px-3">Country</th>
                      <th className="py-2.5 px-3">Submitted</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right rounded-r-lg">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {recentRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-900 truncate max-w-[140px]">
                          {req.schoolName}
                        </td>
                        <td className="py-3 px-3 text-slate-600 truncate max-w-[120px]">
                          {req.contactName || req.schoolAdminName || 'Admin'}
                        </td>
                        <td className="py-3 px-3 text-slate-500">{req.country || 'Pakistan'}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {new Date(req.submittedAt || Date.now()).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              (req.status || 'PENDING').toUpperCase() === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : (req.status || 'PENDING').toUpperCase() === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {(req.status || 'PENDING').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => onViewRequest(req)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-[11px] rounded-lg border border-indigo-200/60 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
                <p className="text-xs text-slate-500">Real-time system events</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>

            <div className="mt-4 space-y-3.5">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  No recent activities recorded.
                </div>
              ) : (
                notifications.slice(0, 5).map((n) => {
                  const badge = getActivityBadge(n.type);
                  return (
                    <div
                      key={n.id}
                      className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start gap-3 text-xs"
                    >
                      <div className={`p-1.5 rounded-lg border flex-shrink-0 ${badge.bg}`}>
                        {badge.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-900 truncate">{n.title}</span>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {new Date(n.timestamp).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
