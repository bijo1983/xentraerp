import React, { useState, useEffect } from 'react';
import { Save, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const ProfileSettings: React.FC = () => {
  const { userProfile, fetchUserProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countries, setCountries] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone_number: '',
    country_id: '',
    skill_level: 'Beginner',
    address: '',
    website: '',
    company_name: '',
  });

  useEffect(() => {
    fetchCountries();
    if (userProfile) {
      loadUserData();
    }
    // eslint-disable-next-line
  }, [userProfile]);

  const fetchCountries = async () => {
    const { data } = await supabase.from('countries').select('*').order('name');
    setCountries(data || []);
  };

  const loadUserData = async () => {
    if (!userProfile) return;
    setNotFound(false);

    let tableName = '';
    if (userProfile.type === 'Player') tableName = 'player_users';
    else if (userProfile.type === 'Club') tableName = 'club_users';
    else if (userProfile.type === 'Organizer') tableName = 'organizer_users';

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userProfile.id)
      .single();

    // Use DB data if present, otherwise fall back to userProfile
    setFormData({
  name:
    data
      ? (userProfile.type === 'Player'
          ? data.full_name
          : userProfile.type === 'Club'
          ? data.club_name
          : data.organizer_name)
      : userProfile.name || '',
  email: data ? data.email : userProfile.email || '',
  phone_number: data
    ? data.phone_number || userProfile.phone_number || ''
    : userProfile.phone_number || '',
  country_id: data
    ? data.country_id || userProfile.country_id || ''
    : userProfile.country_id || '',
  skill_level: data ? data.skill_level || 'Beginner' : 'Beginner',
  address: data ? data.address || '' : '',
  website: data ? data.website || '' : '',
  company_name: data ? data.company_name || '' : '',
});

    if ((!data || error) && !userProfile.name) {
      setNotFound(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    setLoading(true);
    try {
      let tableName = '';
      if (userProfile.type === 'Player') tableName = 'player_users';
      else if (userProfile.type === 'Club') tableName = 'club_users';
      else if (userProfile.type === 'Organizer') tableName = 'organizer_users';

      const updateData: any = {
        email: formData.email,
        phone_number: formData.phone_number,
        country_id: formData.country_id || null,
        updated_at: new Date().toISOString(),
      };

      if (userProfile.type === 'Player') {
        updateData.full_name = formData.name;
        updateData.skill_level = formData.skill_level;
      } else if (userProfile.type === 'Club') {
        updateData.club_name = formData.name;
        updateData.address = formData.address;
        updateData.website = formData.website;
      } else if (userProfile.type === 'Organizer') {
        updateData.organizer_name = formData.name;
        updateData.company_name = formData.company_name;
        updateData.website = formData.website;
      }

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('user_id', userProfile.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchUserProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-3">Not logged in</h2>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-3">No profile found</h2>
        <p className="mb-6 text-gray-600">
          You don't have a profile yet for your role.<br />
          Please contact admin or finish onboarding.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
        <div className="flex flex-col md:flex-row gap-2 md:gap-8">
          <p className="text-indigo-100">
            <span className="font-semibold">Account Type:</span> {userProfile?.type || 'Unknown'}
          </p>
          <p className="text-indigo-100">
            <span className="font-semibold">Logged in Name:</span> {userProfile?.name || ''}
          </p>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700 font-medium">Profile updated successfully!</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Picture */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Picture</h2>
          <div className="text-center">
            <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
              {userProfile?.name?.charAt(0).toUpperCase()}
            </div>
            <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors mx-auto">
              <Camera className="h-4 w-4" />
              <span>Change Photo</span>
            </button>
          </div>
        </div>

        {/* Profile Form */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {userProfile?.type === 'Player'
                    ? 'Full Name'
                    : userProfile?.type === 'Club'
                    ? 'Club Name'
                    : 'Organization Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country
                </label>
                <select
                  value={formData.country_id}
                  onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select country</option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Player specific fields */}
              {userProfile?.type === 'Player' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Skill Level
                  </label>
                  <select
                    value={formData.skill_level}
                    onChange={(e) => setFormData({ ...formData, skill_level: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Professional">Professional</option>
                  </select>
                </div>
              )}

              {/* Club specific fields */}
              {userProfile?.type === 'Club' && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="https://"
                    />
                  </div>
                </>
              )}

              {/* Organizer specific fields */}
              {userProfile?.type === 'Organizer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="https://"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex space-x-4 pt-6">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>

          {/* Add OrganizerUpgrade for Clubs */}
          {userProfile?.type === 'Club' && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Organizer Upgrade</h2>
              <OrganizerUpgrade />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const OrganizerUpgrade: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBecomeOrganizer = async () => {
    setLoading(true);
    setMessage("");
    if (!userProfile) {
      setMessage("Not logged in.");
      setLoading(false);
      return;
    }

    // 1. Get the club profile for the current user
    const { data: clubUser, error: clubError } = await supabase
      .from('club_users')
      .select('*')
      .eq('user_id', userProfile.id)
      .single();

    if (clubError || !clubUser) {
      setMessage("Club profile not found.");
      setLoading(false);
      return;
    }
if (!clubUser) {
  // Attempt to create the minimal club profile on the fly:
  const { error: clubInsertError } = await supabase
    .from('club_users')
    .insert([{
      user_id: userProfile.id,
      club_name: userProfile.name,
      email: userProfile.email,
      phone_number: userProfile.phone_number || '',
      country_id: userProfile.country_id || null,
      created_at: new Date().toISOString(),
    }]);

  if (clubInsertError) {
    setMessage("Failed to auto-create Club profile: " + (clubInsertError.message || clubInsertError));
    setLoading(false);
    return;
  }
  // Refetch clubUser
  const { data: clubUser2 } = await supabase
    .from('club_users')
    .select('*')
    .eq('user_id', userProfile.id)
    .single();

  if (!clubUser2) {
    setMessage("Club profile creation failed, contact admin.");
    setLoading(false);
    return;
  }
  // Continue with clubUser2 for the rest of the logic!
}

    // 2. Get the Organizer profile_id
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', 'Organizer')
      .single();

    if (profileError || !profileRow) {
      setMessage("Could not find Organizer profile id.");
      setLoading(false);
      return;
    }

    // 3. Insert a new organizer_users row, copying fields from clubUser
    const { error: insertError } = await supabase
      .from('organizer_users')
      .insert([{
        user_id: clubUser.user_id,
        organizer_name: clubUser.club_name,
        email: clubUser.email,
        phone_number: clubUser.phone_number,
        country_id: clubUser.country_id,
        profile_id: profileRow.id,
        website: clubUser.website,
        company_name: clubUser.club_name, // or set separately if you prefer
        created_at: new Date().toISOString(),
        // You can add any other fields you want to transfer
      }]);

    if (insertError) {
      setMessage("Failed to upgrade: " + (insertError.message || insertError));
    } else {
      setMessage("You are now an Organizer! You can create tournaments as an organizer.");
    }
    setLoading(false);
  };

  return (
    <div className="mb-4">
      <button
        onClick={handleBecomeOrganizer}
        disabled={loading}
        className="bg-indigo-600 text-white px-4 py-2 rounded"
      >
        {loading ? "Processing..." : "Become an Organizer"}
      </button>
      {message && <div className="mt-2 text-sm">{message}</div>}
    </div>
  );
};
