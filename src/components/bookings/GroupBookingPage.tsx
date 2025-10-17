import React, { useEffect, useState } from 'react';
import { Building2, Globe, Info, Loader2, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { GroupMonthlyBooking } from './GroupMonthlyBooking';

interface GroupRecord {
  id: string;
  group_name: string | null;
  club_id: string | null;
  club_users: {
    id: string;
    club_name: string | null;
    phone_number: string | null;
    website: string | null;
  } | null;
}

type GroupBookingPageProps = {
  showPlanner?: boolean;
};

export const GroupBookingPage: React.FC<GroupBookingPageProps> = ({ showPlanner = true }) => {
  const { userProfile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupRecord, setGroupRecord] = useState<GroupRecord | null>(null);

  useEffect(() => {
    const loadGroup = async () => {
      if (!userProfile?.user_id) {
        setGroupRecord(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('group_users')
          .select(
            `
              id,
              group_name,
              club_id,
              club_users (
                id,
                club_name,
                phone_number,
                website
              )
            `
          )
          .eq('user_id', userProfile.user_id)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        setGroupRecord((data as GroupRecord | null) ?? null);
      } catch (err) {
        console.error('[GroupBookingPage] load group error', err);
        setError('Unable to load your group details right now. Please try again later.');
        setGroupRecord(null);
      } finally {
        setLoading(false);
      }
    };

    void loadGroup();
  }, [userProfile?.user_id]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-gray-600 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading group booking tools…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!groupRecord) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-gray-600">
        This account is not linked to a group profile yet. Contact your club administrator for access.
      </div>
    );
  }

  const clubId = groupRecord.club_users?.id ?? groupRecord.club_id ?? '';
  const groupId = groupRecord.id;
  const groupName = groupRecord.group_name ?? 'Group';
  const clubName = groupRecord.club_users?.club_name ?? null;
  const clubPhone = groupRecord.club_users?.phone_number ?? null;
  const clubWebsite = groupRecord.club_users?.website ?? null;

  const plannerDisabled = !clubId;
  const noClubMessage =
    'Link your group to a club to submit a monthly plan. Ask the club administrator to connect your account in the admin portal.';

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Group bookings</h1>
            <p className="text-gray-600">
              {clubName
                ? 'Review available slots and submit your monthly plan directly to your club.'
                : 'Connect with a club administrator to link your account and unlock the monthly planner.'}
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${
              clubName
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            <Building2 className="h-4 w-4" />
            {clubName ?? 'No club assigned'}
          </div>
        </div>

        {plannerDisabled && (
          <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Info className="h-4 w-4 text-blue-500 mt-0.5" />
            <span>{noClubMessage}</span>
          </div>
        )}

        {clubPhone && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="h-4 w-4 text-gray-500" />
            {clubPhone}
          </div>
        )}

        {clubWebsite && (
          <a
            href={clubWebsite.startsWith('http') ? clubWebsite : `https://${clubWebsite}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-green-700 hover:underline"
          >
            <Globe className="h-4 w-4" /> Visit club website
          </a>
        )}
      </div>

      {showPlanner ? (
        <GroupMonthlyBooking
          clubId={clubId}
          groupId={groupId}
          groupName={groupName}
          mode="group"
          disabled={plannerDisabled}
          noClubMessage={noClubMessage}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-600">
          {clubName
            ? 'Your booking history appears below. Submit your next monthly plan from the Book Court page.'
            : noClubMessage}
        </div>
      )}
    </div>
  );
};

export default GroupBookingPage;
