import React, { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { PageMetadata } from '../seo/PageMetadata';

const CREATE_TOURNAMENT_KEYWORDS = [
  'create badminton tournament',
  'badminton tournament software',
  'sports event management platform',
  'badminton bracket management',
  'tournament registration system',
];

const CREATE_TOURNAMENT_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'CreateAction',
  name: 'Create a badminton tournament',
  agent: {
    '@type': 'Organization',
    name: 'Badminton Booking Platform',
  },
  result: {
    '@type': 'Event',
    name: 'Badminton tournament',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  },
};

export const CreateTournament: React.FC = () => {
  const { userProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hostType, setHostType] = useState<"club" | "organizer" | "none">("none");
  const [organizerUsersId, setOrganizerUsersId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("BHD");
  const [hostName, setHostName] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    start_date: '',
    end_date: '',
    registration_deadline: '',
    max_participants: 32,
    entry_fee: '',
    prize_pool: '',
    tournament_format: 'single_elimination',
    currency_code: '',
  });

  // Detect host type, host name, and organizerUsersId
  useEffect(() => {
    if (!userProfile) {
      setHostType("none");
      setOrganizerUsersId(null);
      setHostName(null);
      return;
    }

    // Use the profile ID as organizer_id
    if (userProfile.type === "Club") {
      setHostType("club");
      setOrganizerUsersId(userProfile.id); // Use profile ID
      setHostName(userProfile.name);
    } else if (userProfile.type === "Organizer") {
      setHostType("organizer");
      setOrganizerUsersId(userProfile.id); // Use profile ID
      setHostName(userProfile.name);
    } else {
      setHostType("none");
      setOrganizerUsersId(null);
      setHostName(null);
    }
  }, [userProfile]);

  // Handle form input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setErrorMsg("");

    if (!organizerUsersId || !hostName || hostType === "none" || !userProfile) {
      setErrorMsg("Unable to detect club/organizer identity. Please ensure you have a complete profile.");
      setLoading(false);
      return;
    }

    // Create tournament with proper organizer_id and hosted_by values
    const tournamentPayload = {
      ...formData,
      organizer_id: userProfile.user_id, // Use auth user ID
      hosted_by: hostType, // This should be 'club' or 'organizer', not the name
      currency_code: currency || 'BHD',
      status: "upcoming",
    };

    console.log('Creating tournament with payload:', {
      ...tournamentPayload,
      userProfile: {
        id: userProfile.id,
        user_id: userProfile.user_id,
        type: userProfile.type,
        name: userProfile.name
      }
    });
    const { error } = await supabase
      .from('tournaments')
      .insert([tournamentPayload]);
    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      setSuccess(false);
    } else {
      setSuccess(true);
      setFormData({
        name: '',
        description: '',
        location: '',
        start_date: '',
        end_date: '',
        registration_deadline: '',
        max_participants: 32,
        entry_fee: '',
        prize_pool: '',
        tournament_format: 'single_elimination',
        currency_code: '',
      });
    }
  };

  return (
    <>
      <PageMetadata
        title="Create a Badminton Tournament | Badminton Booking"
        description="Launch a badminton tournament with configurable draws, registration fees, and scheduling workflows using Badminton Booking."
        path="/create-tournament"
        keywords={CREATE_TOURNAMENT_KEYWORDS}
        structuredData={CREATE_TOURNAMENT_SCHEMA}
      />
      <div className="bg-white p-6 rounded shadow-md max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Trophy />Create Tournament</h2>
        {errorMsg && <div className="bg-red-100 text-red-700 p-2 mb-2 rounded">{errorMsg}</div>}
        {success && <div className="bg-green-100 text-green-700 p-2 mb-2 rounded">Tournament created!</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
        <input name="name" value={formData.name} onChange={handleChange} required placeholder="Tournament Name" className="w-full border rounded p-2" />
        <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full border rounded p-2" />
        <input name="location" value={formData.location} onChange={handleChange} required placeholder="Location" className="w-full border rounded p-2" />
        <input name="start_date" value={formData.start_date} onChange={handleChange} required type="date" className="w-full border rounded p-2" />
        <input name="end_date" value={formData.end_date} onChange={handleChange} required type="date" className="w-full border rounded p-2" />
        <input name="registration_deadline" value={formData.registration_deadline} onChange={handleChange} required type="date" className="w-full border rounded p-2" />
        <input name="max_participants" value={formData.max_participants} onChange={handleChange} type="number" min="2" placeholder="Max Participants" className="w-full border rounded p-2" />
        <input name="entry_fee" value={formData.entry_fee} onChange={handleChange} placeholder="Entry Fee" className="w-full border rounded p-2" />
        <input name="prize_pool" value={formData.prize_pool} onChange={handleChange} placeholder="Prize Pool" className="w-full border rounded p-2" />
        <select name="tournament_format" value={formData.tournament_format} onChange={handleChange} className="w-full border rounded p-2">
          <option value="single_elimination">Single Elimination</option>
          <option value="double_elimination">Double Elimination</option>
          <option value="round_robin">Round Robin</option>
        </select>
        <button type="submit" disabled={loading} className="bg-blue-600 text-white rounded p-2 w-full">
          {loading ? 'Creating...' : 'Create Tournament'}
        </button>
      </form>
    </div>
    </>
  );
};
