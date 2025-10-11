import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

const EditTournament = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuthStore();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournament = async () => {
      if (!user || !id) {
        setError("Authentication and user required");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        setError("Failed to load tournament");
        setLoading(false);
        return;
      }

      const isOwner = data.organizer_id === user.id;
      if (!isOwner) {
        setError("You are not authorized to edit this tournament.");
        setLoading(false);
        return;
      }

      setForm(data);
      setLoading(false);
    };

    fetchTournament();
  }, [id, user?.id]);

  const handleChange = (e: React.ChangeEvent<any>) => {
    const { name, value } = e.target;
    const numeric = ["max_participants", "entry_fee", "prize_pool"];
    setForm((prev: any) => ({
      ...prev,
      [name]: numeric.includes(name) ? (value === "" ? null : Number(value)) : value,
    }));
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !user || !userProfile?.type || !id) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { id: _, ...formWithoutId } = form;

    const updatePayload = {
      ...formWithoutId,
      organizer_type: userProfile.type,
    };

    const { data, error } = await supabase
      .from("tournaments")
      .update(updatePayload)
      .eq("id", id)
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

  if (loading) return <div className="p-8">Loading...</div>;
  if (!form) return <div className="p-8">Tournament not found or unauthorized.</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Edit Tournament</h1>
      {success && <div className="text-green-600 mb-4">{success}</div>}
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block font-medium">Tournament Name</label>
          <input name="name" value={form.name || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Description</label>
          <textarea name="description" value={form.description || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Location</label>
          <input name="location" value={form.location || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Start Date</label>
          <input name="start_date" type="date" value={form.start_date || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">End Date</label>
          <input name="end_date" type="date" value={form.end_date || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Registration Deadline</label>
          <input name="registration_deadline" type="date" value={form.registration_deadline || ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Max Participants</label>
          <input name="max_participants" type="number" value={form.max_participants ?? ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Entry Fee</label>
          <input name="entry_fee" type="number" value={form.entry_fee ?? ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Prize Pool</label>
          <input name="prize_pool" type="number" value={form.prize_pool ?? ''} onChange={handleChange} className="border px-4 py-2 w-full" />
        </div>
        <div>
          <label className="block font-medium">Tournament Format</label>
          <select name="tournament_format" value={form.tournament_format || ''} onChange={handleChange} className="border px-4 py-2 w-full">
            <option value="single_elimination">Single Elimination</option>
            <option value="double_elimination">Double Elimination</option>
            <option value="round_robin">Round Robin</option>
          </select>
        </div>
        <div>
          <label className="block font-medium">Status</label>
          <select name="status" value={form.status || ''} onChange={handleChange} className="border px-4 py-2 w-full">
            <option value="upcoming">Upcoming</option>
            <option value="registration_open">Registration Open</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button type="submit" disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default EditTournament;
