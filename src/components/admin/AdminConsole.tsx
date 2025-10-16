import React from 'react';
import {
  ShieldCheck,
  Building2,
  Users2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

const APPROVAL_OPTIONS = ['pending', 'approved', 'rejected'] as const;
const PAYMENT_OPTIONS = ['unpaid', 'paid', 'overdue'] as const;

type ApprovalStatus = (typeof APPROVAL_OPTIONS)[number];
type PaymentStatus = (typeof PAYMENT_OPTIONS)[number];

type BaseProfile = {
  id: string;
  email: string;
  phone_number: string | null;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  countries?: { name?: string | null; code?: string | null } | null;
};

type ClubProfile = BaseProfile & {
  club_name: string;
  address: string | null;
  website: string | null;
};

type OrganizerProfile = BaseProfile & {
  organizer_name: string;
  company_name: string | null;
  website: string | null;
};

type ManagementEntity = 'clubs' | 'organizers';

type SummaryStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  overdue: number;
};

const approvalColors: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

const paymentColors: Record<PaymentStatus, string> = {
  unpaid: 'bg-slate-100 text-slate-700 border border-slate-200',
  paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  overdue: 'bg-amber-100 text-amber-800 border border-amber-200',
};

const visibilityColors = {
  true: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  false: 'bg-slate-100 text-slate-600 border border-slate-200',
} as const;

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    console.error('Failed to format date', err);
    return value;
  }
};

const toTitle = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const AdminConsole: React.FC = () => {
  const { userProfile } = useAuthStore();

  const [activeTab, setActiveTab] = React.useState<ManagementEntity>('clubs');
  const [clubs, setClubs] = React.useState<ClubProfile[]>([]);
  const [organizers, setOrganizers] = React.useState<OrganizerProfile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionState, setActionState] = React.useState<Record<string, boolean>>({});
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);

  const isAdmin = userProfile?.type === 'Administrator';

  const summary = React.useMemo(() => {
    const compute = <T extends BaseProfile>(items: T[]): SummaryStats => ({
      total: items.length,
      pending: items.filter(item => item.approval_status === 'pending').length,
      approved: items.filter(item => item.approval_status === 'approved').length,
      rejected: items.filter(item => item.approval_status === 'rejected').length,
      overdue: items.filter(item => item.payment_status === 'overdue').length,
    });

    return {
      clubs: compute(clubs),
      organizers: compute(organizers),
    };
  }, [clubs, organizers]);

  const fetchProfiles = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);

    try {
      const [clubResponse, organizerResponse] = await Promise.all([
        supabase
          .from('club_users')
          .select(`
            id,
            club_name,
            email,
            phone_number,
            approval_status,
            payment_status,
            is_visible,
            address,
            website,
            created_at,
            updated_at,
            countries (name, code)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('organizer_users')
          .select(`
            id,
            organizer_name,
            company_name,
            email,
            phone_number,
            approval_status,
            payment_status,
            is_visible,
            website,
            created_at,
            updated_at,
            countries (name, code)
          `)
          .order('created_at', { ascending: false }),
      ]);

      if (clubResponse.error) {
        throw clubResponse.error;
      }

      if (organizerResponse.error) {
        throw organizerResponse.error;
      }

      setClubs(clubResponse.data ?? []);
      setOrganizers(organizerResponse.data ?? []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[AdminConsole] fetch error', err);
      setError((err as Error).message ?? 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  const setSaving = React.useCallback((id: string, saving: boolean) => {
    setActionState(prev => ({ ...prev, [id]: saving }));
  }, []);

  const updateLocalState = React.useCallback(
    (entity: ManagementEntity, id: string, patch: Partial<ClubProfile & OrganizerProfile>) => {
      if (entity === 'clubs') {
        setClubs(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
      } else {
        setOrganizers(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
      }
    },
    [],
  );

  const applyUpdate = React.useCallback(
    async (
      entity: ManagementEntity,
      id: string,
      patch: Partial<ClubProfile & OrganizerProfile>,
    ) => {
      const table = entity === 'clubs' ? 'club_users' : 'organizer_users';
      setSaving(id, true);
      setError(null);

      try {
        const { error: updateError } = await supabase
          .from(table)
          .update(patch)
          .eq('id', id);

        if (updateError) {
          throw updateError;
        }

        updateLocalState(entity, id, patch);
        setLastRefreshed(new Date());
      } catch (err) {
        console.error('[AdminConsole] update error', err);
        setError((err as Error).message ?? 'Failed to update record.');
        throw err;
      } finally {
        setSaving(id, false);
      }
    },
    [setSaving, updateLocalState],
  );

  const handleApprove = async (entity: ManagementEntity, profile: ClubProfile | OrganizerProfile) => {
    try {
      await applyUpdate(entity, profile.id, {
        approval_status: 'approved',
        is_visible: true,
      });
    } catch {
      // Error handled globally
    }
  };

  const handleReject = async (entity: ManagementEntity, profile: ClubProfile | OrganizerProfile) => {
    try {
      await applyUpdate(entity, profile.id, {
        approval_status: 'rejected',
        is_visible: false,
      });
    } catch {
      // Error handled globally
    }
  };

  const handleSetPending = async (entity: ManagementEntity, profile: ClubProfile | OrganizerProfile) => {
    try {
      await applyUpdate(entity, profile.id, {
        approval_status: 'pending',
        is_visible: false,
      });
    } catch {
      // Error handled globally
    }
  };

  const handleVisibilityToggle = async (
    entity: ManagementEntity,
    profile: ClubProfile | OrganizerProfile,
    visible: boolean,
  ) => {
    const patch: Partial<ClubProfile & OrganizerProfile> = { is_visible: visible };
    if (visible && profile.approval_status === 'pending') {
      patch.approval_status = 'approved';
    }

    try {
      await applyUpdate(entity, profile.id, patch);
    } catch {
      // handled globally
    }
  };

  const handleApprovalChange = async (
    entity: ManagementEntity,
    profile: ClubProfile | OrganizerProfile,
    approval: ApprovalStatus,
  ) => {
    const patch: Partial<ClubProfile & OrganizerProfile> = {
      approval_status: approval,
    };

    if (approval !== 'approved') {
      patch.is_visible = false;
    }

    try {
      await applyUpdate(entity, profile.id, patch);
    } catch {
      // handled globally
    }
  };

  const handlePaymentChange = async (
    entity: ManagementEntity,
    profile: ClubProfile | OrganizerProfile,
    payment: PaymentStatus,
  ) => {
    try {
      await applyUpdate(entity, profile.id, { payment_status: payment });
    } catch {
      // handled globally
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-6">
        <p className="font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Administrator access required
        </p>
        <p className="text-sm text-rose-600">
          You do not have permission to view this console. Please sign in with an administrator account.
        </p>
      </div>
    );
  }

  const currentEntities = activeTab === 'clubs' ? clubs : organizers;
  const currentSummary = summary[activeTab];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8" />
              <div>
                <p className="uppercase text-sm tracking-wider text-emerald-100">Platform Administration</p>
                <h1 className="text-2xl font-bold">Admin Console</h1>
              </div>
            </div>
            <p className="mt-3 text-emerald-50 max-w-2xl text-sm">
              Approve new club and organizer registrations, control platform visibility, and manage subscription status for every partner.
            </p>
          </div>
          <div className="bg-white bg-opacity-10 rounded-xl px-4 py-3">
            <p className="text-sm text-emerald-100">Last refreshed</p>
            <p className="font-semibold">
              {lastRefreshed ? lastRefreshed.toLocaleString() : 'Awaiting sync'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="border-b border-gray-200 p-4 sm:p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">Clubs</p>
                <p className="text-lg font-semibold text-gray-900">{summary.clubs.total} total</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">Organizers</p>
                <p className="text-lg font-semibold text-gray-900">{summary.organizers.total} total</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-lg border border-gray-200 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-gray-400" />
              Pending approvals: {summary.clubs.pending + summary.organizers.pending}
            </div>
            <button
              onClick={() => void fetchProfiles()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pt-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4">
            <button
              onClick={() => setActiveTab('clubs')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'clubs' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Clubs ({summary.clubs.pending} pending)
            </button>
            <button
              onClick={() => setActiveTab('organizers')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'organizers' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Organizers ({summary.organizers.pending} pending)
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-4 mb-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading {activeTab === 'clubs' ? 'clubs' : 'organizers'}...
            </div>
          ) : currentEntities.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <ShieldCheck className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <p className="font-medium">No {activeTab} found</p>
              <p className="text-sm text-gray-500 mt-1">
                New registrations will appear here for approval and subscription management.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentEntities.map(profile => {
                const isSaving = actionState[profile.id] ?? false;
                const locationLabel = profile.countries?.name ?? 'Not specified';
                const approvalClass = approvalColors[profile.approval_status];
                const paymentClass = paymentColors[profile.payment_status];
                const visibilityClass = visibilityColors[profile.is_visible];

                return (
                  <div
                    key={profile.id}
                    className="border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow bg-white"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                          {'club_name' in profile ? profile.club_name : profile.organizer_name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">{profile.email}</p>
                        {profile.phone_number && (
                          <p className="text-sm text-gray-500">{profile.phone_number}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${approvalClass}`}>
                          {toTitle(profile.approval_status)}
                        </span>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${paymentClass}`}>
                          Payment: {toTitle(profile.payment_status)}
                        </span>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${visibilityClass}`}>
                          {profile.is_visible ? 'Visible in listings' : 'Hidden from listings'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm text-gray-600">
                      <div>
                        <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Location</p>
                        <p>{locationLabel}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Created</p>
                        <p>{formatDateTime(profile.created_at)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Last update</p>
                        <p>{formatDateTime(profile.updated_at)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      {'club_name' in profile && profile.address && (
                        <div>
                          <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Address</p>
                          <p>{profile.address}</p>
                        </div>
                      )}
                      {profile.website && (
                        <div>
                          <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Website</p>
                          <a
                            href={profile.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            {profile.website}
                          </a>
                        </div>
                      )}
                      {'organizer_name' in profile && profile.company_name && (
                        <div>
                          <p className="font-medium text-gray-500 uppercase tracking-wide text-xs mb-1">Company</p>
                          <p>{profile.company_name}</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => void handleApprove(activeTab, profile)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve & publish
                        </button>
                        <button
                          onClick={() => void handleReject(activeTab, profile)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject & hide
                        </button>
                        <button
                          onClick={() => void handleSetPending(activeTab, profile)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                        >
                          Pending review
                        </button>
                        <button
                          onClick={() => void handleVisibilityToggle(activeTab, profile, !profile.is_visible)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {profile.is_visible ? (
                            <>
                              <EyeOff className="h-4 w-4" />
                              Hide listing
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              Make visible
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Approval</span>
                          <select
                            value={profile.approval_status}
                            onChange={event =>
                              void handleApprovalChange(activeTab, profile, event.target.value as ApprovalStatus)
                            }
                            disabled={isSaving}
                            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {APPROVAL_OPTIONS.map(option => (
                              <option key={option} value={option}>
                                {toTitle(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Payment</span>
                          <select
                            value={profile.payment_status}
                            onChange={event =>
                              void handlePaymentChange(activeTab, profile, event.target.value as PaymentStatus)
                            }
                            disabled={isSaving}
                            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {PAYMENT_OPTIONS.map(option => (
                              <option key={option} value={option}>
                                {toTitle(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminConsole;
