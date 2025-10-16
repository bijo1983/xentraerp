import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

interface Tournament {
  id: string;
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date: string;
  registration_deadline?: string;
  max_participants?: number | null;
  entry_fee?: number | null;
  prize_pool?: number | null;
  tournament_format?: string;
  status?: string;
  currency_code?: string;
  organizer_id: string;
  organizer_type?: string;
}

const TournamentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuthStore();
  const [form, setForm] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const fetchTournament = async () => {
      if (!userProfile?.id || !id) {
        setError("Authentication and profile required");
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (tournamentError || !tournamentData) {
        setError("Failed to load tournament");
        setLoading(false);
        return;
      }

      setForm(tournamentData);
      setIsOwner(user?.id === tournamentData.organizer_id);
      setLoading(false);
    };

    fetchTournament();
  }, [id, userProfile?.id, user?.id]);

  const handleChange = (e: React.ChangeEvent<any>) => {
    if (!form) return;
    const { name, value } = e.target;
    const parsed = ["max_participants", "entry_fee", "prize_pool"].includes(name)
      ? value === "" ? null : Number(value)
      : value;
    setForm({ ...form, [name]: parsed });
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !id || !userProfile?.type || !user?.id) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const updatePayload = {
      ...form,
      organizer_type: userProfile.type
    };

    const { data, error } = await supabase
      .from("tournaments")
      .update(updatePayload)
      .eq("id", id)
      .eq("organizer_id", user.id)
      .select();

    if (error) {
      setError("Failed to update tournament: " + error.message);
    } else if (!data || data.length === 0) {
      setError("No data returned or permission denied");
    } else {
      setSuccess("Tournament updated successfully!");
      setForm(data[0]);
      setTimeout(() => setSuccess(null), 3000);
    }
    setSaving(false);
  };

  if (loading) return null;
  if (error && !form) return <div className="p-8 text-red-600">{error}</div>;
  if (!form) return <div className="p-8">Tournament not found</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{isOwner ? 'Edit' : 'View'} Tournament</h1>

      {success && <div className="text-green-600 mb-4">{success}</div>}
      {error && <div className="text-red-600 mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-4">
        <input 
          name="name" 
          value={form.name || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Tournament Name"
        />
        <textarea 
          name="description" 
          value={form.description || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Description"
        />
        <input 
          name="location" 
          value={form.location || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Location"
        />
        <input 
          name="start_date" 
          type="date" 
          value={form.start_date || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
        />
        <input 
          name="end_date" 
          type="date" 
          value={form.end_date || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
        />
        <input 
          name="registration_deadline" 
          type="date" 
          value={form.registration_deadline || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
        />
        <input 
          name="max_participants" 
          type="number" 
          value={form.max_participants || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Max Participants"
        />
        <input 
          name="entry_fee" 
          type="number" 
          step="0.01"
          value={form.entry_fee || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Entry Fee"
        />
        <input 
          name="prize_pool" 
          type="number" 
          step="0.01"
          value={form.prize_pool || ''} 
          onChange={handleChange} 
          disabled={!isOwner}
          className="w-full border rounded p-2"
          placeholder="Prize Pool"
        />
        <select name="tournament_format" value={form.tournament_format ?? ''} onChange={handleChange} disabled={!isOwner}>
          <option value="single_elimination">Single Elimination</option>
          <option value="double_elimination">Double Elimination</option>
          <option value="round_robin">Round Robin</option>
        </select>
        <select name="status" value={form.status ?? ''} onChange={handleChange} disabled={!isOwner}>
          <option value="upcoming">Upcoming</option>
          <option value="registration_open">Registration Open</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {isOwner && (
          <button
            type="submit"
            disabled={saving}
            className="bg-primary-500 text-white px-4 py-2 rounded hover:bg-primary-600 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/tournaments')}
          className="ml-2 border border-background-subtle bg-background-subtle text-text-primary px-4 py-2 rounded hover:bg-background"
        >
          Back to Tournaments
        </button>
      </form>
    </div>
  );
};

export default TournamentDetails;
