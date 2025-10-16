import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Globe, Star, Send, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const FindClubs: React.FC = () => {
  const { userProfile } = useAuthStore();

  const [clubs, setClubs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>(''); // UUID string
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinRequests, setJoinRequests] = useState<Set<string>>(new Set());

  const log = (...args: any[]) => console.log('[FindClubs]', ...args);

  // 1) Load countries for dropdown
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('countries')
        .select('id, name, code')
        .order('name');

      if (error) {
        console.error('[FindClubs] countries error:', error);
        setCountries([]);
        return;
      }
      setCountries(data || []);
      log('countries count:', data?.length ?? 0);
    })();
  }, []);

  // 2) Resolve player country from player_users (authoritative) by profile_id
  useEffect(() => {
    (async () => {
      if (!userProfile?.id) return;

      // Prefer profile_id link
      let { data, error } = await supabase
        .from('player_users')
        .select('country_id')
        .eq('profile_id', userProfile.id)
        .maybeSingle();

      // Fallback to id if older schema used that
      if (error || !data?.country_id) {
        const fb = await supabase
          .from('player_users')
          .select('country_id')
          .eq('id', userProfile.id)
          .maybeSingle();
        if (!data?.country_id && fb.data?.country_id) data = fb.data as any;
      }

      const playerCountryId = data?.country_id
        ? String(data.country_id)
        : userProfile?.country_id
          ? String(userProfile.country_id)
          : '';

      log('playerCountryId resolved:', playerCountryId);

      // Set default filter to player's country if found; user can still change from dropdown
      if (playerCountryId) setSelectedCountry(playerCountryId);
    })();
  }, [userProfile]);

  // 3) Fetch clubs whenever search/country changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => { void fetchClubs(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedCountry]);

  const fetchClubs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('club_users')
        .select(`
          *,
          countries (name, code)
        `)
        .eq('approval_status', 'approved')
        .eq('is_visible', true)
        .order('club_name', { ascending: true });

      if (searchTerm) query = query.ilike('club_name', `%${searchTerm}%`);
      if (selectedCountry) query = query.eq('country_id', selectedCountry);

      const { data, error } = await query;

      if (error) {
        console.error('[FindClubs] clubs error:', error);
        setClubs([]);
        return;
      }

      log('clubs fetched:', data?.length ?? 0, 'filter country:', selectedCountry || '(ALL)');

      // Attach courts
      const clubsWithCourts = await Promise.all(
        (data || []).map(async (club) => {
          const { data: courts } = await supabase
            .from('courts')
            .select('id, name, surface_type, hourly_rate, is_available')
            .eq('club_id', club.id);

          return { ...club, courts: courts || [] };
        })
      );

      setClubs(clubsWithCourts);
    } catch (err) {
      console.error('[FindClubs] clubs catch:', err);
      setClubs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRequest = async (clubId: string) => {
    if (!userProfile || userProfile.type !== 'Player') return;
    try {
      setJoinRequests(prev => new Set([...prev, clubId]));
      console.log(`Join request sent to club ${clubId} from player ${userProfile.id}`);
      alert('Join request sent to club administrator!');
    } catch (error) {
      console.error('Error sending join request:', error);
    }
  };

  const ClubCard: React.FC<{ club: any }> = ({ club }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{club.club_name}</h3>
          <div className="flex items-center text-gray-600 mb-2">
            <MapPin className="h-4 w-4 mr-2" />
            <span>{club.countries?.name || 'Location not specified'}</span>
          </div>
          {club.phone_number && (
            <div className="flex items-center text-gray-600 mb-2">
              <Phone className="h-4 w-4 mr-2" />
              <span>{club.phone_number}</span>
            </div>
          )}
          {club.website && (
            <div className="flex items-center text-gray-600">
              <Globe className="h-4 w-4 mr-2" />
              <a
                href={club.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Visit Website
              </a>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center mb-2">
            <Star className="h-4 w-4 text-yellow-500 mr-1" />
            <span className="text-sm text-gray-600">4.5</span>
          </div>
          <span className="text-sm text-gray-500">
            {club.courts?.length || 0} courts
          </span>
        </div>
      </div>

      {club.address && <p className="text-gray-600 mb-4">{club.address}</p>}

      {club.courts && club.courts.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Available Courts</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {club.courts.slice(0, 4).map((court: any) => (
              <div key={court.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{court.name}</span>
                  <span className="text-sm text-emerald-600">${court.hourly_rate}/hr</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {court.surface_type} • {court.is_available ? 'Available' : 'Unavailable'}
                </div>
              </div>
            ))}
          </div>
          {club.courts.length > 4 && (
            <p className="text-sm text-gray-500 mt-2">
              +{club.courts.length - 4} more courts
            </p>
          )}
        </div>
      )}

      <div className="flex space-x-3">
        <button
          onClick={() => handleJoinRequest(club.id)}
          disabled={joinRequests.has(club.id)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            joinRequests.has(club.id)
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          <Send className="h-4 w-4" />
          <span>{joinRequests.has(club.id) ? 'Request Sent' : 'Request to Join'}</span>
        </button>
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          View Details
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Find Clubs</h1>
        <p className="text-blue-100">Discover and join badminton clubs in your area</p>
      </div>

      {/* Search + Country */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Clubs</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search by club name..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Countries</option>
              {countries.map((country) => (
                <option key={country.id} value={String(country.id)}>
                  {country.name}
                </option>
              ))}
            </select>
            {/* For Bahrain, selectedCountry should be: 3db44bd7-9eb8-4b0b-bfef-569d00f1b4c5 */}
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {loading ? 'Searching...' : `${clubs.length} clubs found`}
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded mb-4"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : clubs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {clubs.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Clubs Found</h3>
            <p className="text-gray-600">
              Try setting Country to “All Countries”, or check RLS policies / data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
