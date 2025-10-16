import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Clock, CreditCard as Edit, Trash2, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { CurrencySelector } from '../ui/CurrencySelector';
import { ManagePeakHours } from './ManagePeakHours';

export const ManageCourts: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [courts, setCourts] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCourt, setEditingCourt] = useState<any>(null);
  const [showPeakHours, setShowPeakHours] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    surface_type: 'Synthetic',
    hourly_rate: '',
    amenities: [] as string[],
    is_available: true,
  });

  const surfaceTypes = ['Synthetic', 'Wooden', 'Rubber', 'Concrete'];
  const amenityOptions = ['Air Conditioning', 'Lighting', 'Shower', 'Parking', 'Equipment Rental', 'Refreshments'];

  useEffect(() => {
    if (userProfile) {
      fetchCourts();
    }
  }, [userProfile]);

  const fetchCourts = async () => {
    if (!userProfile) return;

    // First get the club_users.id for this auth user
    const { data: clubData, error: clubError } = await supabase
      .from('club_users')
      .select('id')
      .eq('user_id', userProfile.user_id)
      .single();

    if (clubError || !clubData) {
      console.error('Error fetching club data:', clubError);
      return;
    }

    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('club_id', clubData.id)
      .order('name');

    if (data) {
      setCourts(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    // Get the club_users.id for this auth user
    const { data: clubData, error: clubError } = await supabase
      .from('club_users')
      .select('id')
      .eq('user_id', userProfile.user_id)
      .single();

    if (clubError || !clubData) {
      console.error('Error fetching club data:', clubError);
      return;
    }

    setLoading(true);
    try {
      const courtData = {
        ...formData,
        club_id: clubData.id,
        hourly_rate: parseFloat(formData.hourly_rate),
      };

      if (editingCourt) {
        await supabase
          .from('courts')
          .update(courtData)
          .eq('id', editingCourt.id);
      } else {
        await supabase
          .from('courts')
          .insert(courtData);
      }

      resetForm();
      fetchCourts();
    } catch (error) {
      console.error('Error saving court:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      location: '',
      surface_type: 'Synthetic',
      hourly_rate: '',
      amenities: [],
      is_available: true,
    });
    setShowAddForm(false);
    setEditingCourt(null);
  };

  const handleEdit = (court: any) => {
    setFormData({
      name: court.name,
      location: court.location || '',
      surface_type: court.surface_type,
      hourly_rate: court.hourly_rate.toString(),
      amenities: court.amenities || [],
      is_available: court.is_available,
    });
    setEditingCourt(court);
    setShowAddForm(true);
  };

  const handleDelete = async (courtId: string) => {
    if (!confirm('Are you sure you want to delete this court?')) return;

    try {
      await supabase
        .from('courts')
        .delete()
        .eq('id', courtId);
      
      fetchCourts();
    } catch (error) {
      console.error('Error deleting court:', error);
    }
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-400 to-secondary-500 rounded-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Manage Courts</h1>
            <p className="text-secondary-100">Add and manage your club's court facilities</p>
          </div>
          <div className="flex items-center space-x-4">
            <CurrencySelector compact className="bg-background/10 backdrop-blur-sm rounded-lg p-3" />
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-background/20 backdrop-blur-sm text-white rounded-lg hover:bg-background/30 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Add Court</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-text-primary">
              {editingCourt ? 'Edit Court' : 'Add New Court'}
            </h2>
            <button
              onClick={resetForm}
              className="text-text-secondary hover:text-text-primary"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Court Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g., Court A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g., Building A, Level 2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Surface Type
                </label>
                <select
                  value={formData.surface_type}
                  onChange={(e) => setFormData({ ...formData, surface_type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  {surfaceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Hourly Rate (Amount only)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0.00"
                />
                <p className="text-xs text-text-secondary mt-1">
                  Enter amount only. Currency will be displayed based on your settings.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Amenities
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {amenityOptions.map(amenity => (
                  <label key={amenity} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.includes(amenity)}
                      onChange={() => toggleAmenity(amenity)}
                      className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-text-primary">{amenity}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_available}
                  onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-text-primary">Court is available for booking</span>
              </label>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : (editingCourt ? 'Update Court' : 'Add Court')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-3 border border-background-subtle bg-background-subtle text-text-primary rounded-lg hover:bg-background transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Courts List */}
      <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
        <div className="p-6 border-b border-background-subtle">
          <h2 className="text-xl font-semibold text-text-primary flex items-center">
            <MapPin className="h-5 w-5 text-primary-500 mr-2" />
            Your Courts ({courts.length})
          </h2>
        </div>
        <div className="p-6">
          {courts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courts.map((court) => (
                <div key={court.id} className="border border-background-subtle rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-text-primary">{court.name}</h3>
                      {court.location && (
                        <p className="text-sm text-text-secondary">{court.location}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(court)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setShowPeakHours(court)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Manage Peak Hours"
                      >
                        <DollarSign className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(court.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Surface:</span>
                      <span className="font-medium">{court.surface_type}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Rate:</span>
                      <span className="font-medium text-primary-500">
                        {formatPrice(court.hourly_rate)}/hr
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Status:</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        court.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {court.is_available ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </div>

                  {court.amenities && court.amenities.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-text-primary mb-2">Amenities:</p>
                      <div className="flex flex-wrap gap-1">
                        {court.amenities.map((amenity: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-background-subtle text-xs text-text-secondary rounded"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary mb-2">No Courts Added</h3>
              <p className="text-text-secondary mb-4">Start by adding your first court to begin accepting bookings.</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                Add Your First Court
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Peak Hours Modal */}
      {showPeakHours && (
        <ManagePeakHours
          courtId={showPeakHours.id}
          courtName={showPeakHours.name}
          baseRate={showPeakHours.hourly_rate}
          onClose={() => setShowPeakHours(null)}
        />
      )}
    </div>
  );
};