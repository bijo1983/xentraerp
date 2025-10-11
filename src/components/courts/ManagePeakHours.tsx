import React, { useState, useEffect } from 'react';
import { Clock, Plus, CreditCard as Edit, Trash2, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';

interface PeakHour {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  pricing_type: 'multiplier' | 'fixed';
  pricing_value: number;
  is_active: boolean;
}

interface Props {
  courtId: string;
  courtName: string;
  baseRate: number;
  onClose: () => void;
}

export const ManagePeakHours: React.FC<Props> = ({ courtId, courtName, baseRate, onClose }) => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPeakHour, setEditingPeakHour] = useState<PeakHour | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    start_time: '17:00',
    end_time: '20:00',
    days_of_week: [1, 2, 3, 4, 5] as number[], // Weekdays by default
    pricing_type: 'multiplier' as 'multiplier' | 'fixed',
    pricing_value: 1.5,
    is_active: true,
  });

  const daysOfWeek = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 7, label: 'Sun' },
  ];

  useEffect(() => {
    fetchPeakHours();
  }, [courtId]);

  const fetchPeakHours = async () => {
    const { data, error } = await supabase
      .from('court_peak_hours')
      .select('*')
      .eq('court_id', courtId)
      .order('start_time');

    if (data) {
      setPeakHours(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const peakHourData = {
        ...formData,
        court_id: courtId,
      };

      if (editingPeakHour) {
        await supabase
          .from('court_peak_hours')
          .update(peakHourData)
          .eq('id', editingPeakHour.id);
      } else {
        await supabase
          .from('court_peak_hours')
          .insert(peakHourData);
      }

      resetForm();
      fetchPeakHours();
    } catch (error) {
      console.error('Error saving peak hour:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      start_time: '17:00',
      end_time: '20:00',
      days_of_week: [1, 2, 3, 4, 5],
      pricing_type: 'multiplier',
      pricing_value: 1.5,
      is_active: true,
    });
    setShowAddForm(false);
    setEditingPeakHour(null);
  };

  const handleEdit = (peakHour: PeakHour) => {
    setFormData({
      name: peakHour.name,
      start_time: peakHour.start_time,
      end_time: peakHour.end_time,
      days_of_week: peakHour.days_of_week,
      pricing_type: peakHour.pricing_type,
      pricing_value: peakHour.pricing_value,
      is_active: peakHour.is_active,
    });
    setEditingPeakHour(peakHour);
    setShowAddForm(true);
  };

  const handleDelete = async (peakHourId: string) => {
    if (!confirm('Are you sure you want to delete this peak hour period?')) return;

    try {
      await supabase
        .from('court_peak_hours')
        .delete()
        .eq('id', peakHourId);
      
      fetchPeakHours();
    } catch (error) {
      console.error('Error deleting peak hour:', error);
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort()
    }));
  };

  const formatDays = (days: number[]) => {
    return days.map(day => daysOfWeek.find(d => d.value === day)?.label).join(', ');
  };

  const calculateExamplePrice = (pricingType: 'multiplier' | 'fixed', pricingValue: number) => {
    if (pricingType === 'fixed') {
      return formatPrice(pricingValue);
    } else {
      return formatPrice(baseRate * pricingValue);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Clock className="h-5 w-5 text-blue-600 mr-2" />
                Peak Hours - {courtName}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Base rate: {formatPrice(baseRate)}/hour
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingPeakHour ? 'Edit Peak Hour Period' : 'Add Peak Hour Period'}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Period Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Evening Rush, Weekend Premium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {daysOfWeek.map(day => (
                      <label key={day.value} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.days_of_week.includes(day.value)}
                          onChange={() => toggleDay(day.value)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                        />
                        <span className="text-sm text-gray-700">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pricing Type
                    </label>
                    <select
                      value={formData.pricing_type}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        pricing_type: e.target.value as 'multiplier' | 'fixed',
                        pricing_value: e.target.value === 'multiplier' ? 1.5 : baseRate * 1.5
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="multiplier">Multiplier</option>
                      <option value="fixed">Fixed Rate</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {formData.pricing_type === 'multiplier' ? 'Multiplier' : 'Fixed Rate'}
                    </label>
                    <input
                      type="number"
                      min={formData.pricing_type === 'multiplier' ? '1' : '0'}
                      step={formData.pricing_type === 'multiplier' ? '0.1' : '0.01'}
                      required
                      value={formData.pricing_value}
                      onChange={(e) => setFormData({ ...formData, pricing_value: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={formData.pricing_type === 'multiplier' ? '1.5' : '0.00'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Example Price
                    </label>
                    <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-gray-900">
                      {calculateExamplePrice(formData.pricing_type, formData.pricing_value)}/hour
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Saving...' : (editingPeakHour ? 'Update' : 'Add')}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Add Button */}
          {!showAddForm && (
            <div className="mb-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Peak Hour Period</span>
              </button>
            </div>
          )}

          {/* Peak Hours List */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Current Peak Hour Periods</h3>
            {peakHours.length > 0 ? (
              <div className="space-y-4">
                {peakHours.map((peakHour) => (
                  <div key={peakHour.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="font-medium text-gray-900">{peakHour.name}</h4>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            peakHour.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {peakHour.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Time:</span> {peakHour.start_time} - {peakHour.end_time}
                          </div>
                          <div>
                            <span className="font-medium">Days:</span> {formatDays(peakHour.days_of_week)}
                          </div>
                          <div>
                            <span className="font-medium">Rate:</span> {
                              peakHour.pricing_type === 'fixed' 
                                ? formatPrice(peakHour.pricing_value)
                                : `${peakHour.pricing_value}x (${formatPrice(baseRate * peakHour.pricing_value)})`
                            }/hour
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => handleEdit(peakHour)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(peakHour.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>No peak hour periods defined</p>
                <p className="text-sm">Add peak hour periods to charge different rates during busy times</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};