import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Plus, Trash2, Save, DollarSign, Edit } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { format, addDays, parse } from 'date-fns';

const createDefaultNewSlot = () => ({
  start_time: '09:00',
  end_time: '10:00',
});

const createDefaultBulkSlotSettings = () => ({
  start_time: '06:00',
  end_time: '22:00',
  from_date: format(new Date(), 'yyyy-MM-dd'),
  to_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
  exclude_dates: [] as string[],
});

export const ManageSlots: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [courts, setCourts] = useState<any[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotInterval, setSlotInterval] = useState(60); // Default 60 minutes
  const [slotCreationMode, setSlotCreationMode] = useState<'individual' | 'bulk'>('individual');

  const [newSlot, setNewSlot] = useState(createDefaultNewSlot);

  const [bulkSlotSettings, setBulkSlotSettings] = useState(createDefaultBulkSlotSettings);

  const canUseSessionStorage = typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

  const storageKey = useMemo(
    () => (userProfile ? `manageSlotsState:${userProfile.user_id}` : null),
    [userProfile?.user_id]
  );

  useEffect(() => {
    if (!storageKey || !canUseSessionStorage) return;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (typeof parsed.selectedCourt === 'string') {
        setSelectedCourt(parsed.selectedCourt);
      }

      if (typeof parsed.selectedDate === 'string') {
        const restoredDate = parse(parsed.selectedDate, 'yyyy-MM-dd', new Date());
        if (!Number.isNaN(restoredDate.getTime())) {
          setSelectedDate(restoredDate);
        }
      }

      if (
        parsed.newSlot &&
        typeof parsed.newSlot.start_time === 'string' &&
        typeof parsed.newSlot.end_time === 'string'
      ) {
        setNewSlot(parsed.newSlot);
      }

      if (parsed.slotCreationMode === 'individual' || parsed.slotCreationMode === 'bulk') {
        setSlotCreationMode(parsed.slotCreationMode);
      }

      const intervalValue =
        typeof parsed.slotInterval === 'number'
          ? parsed.slotInterval
          : Number(parsed.slotInterval);
      if (!Number.isNaN(intervalValue) && intervalValue > 0) {
        setSlotInterval(intervalValue);
      }

      if (parsed.bulkSlotSettings) {
        setBulkSlotSettings((prev) => ({
          ...prev,
          ...parsed.bulkSlotSettings,
          exclude_dates: Array.isArray(parsed.bulkSlotSettings.exclude_dates)
            ? parsed.bulkSlotSettings.exclude_dates
            : [],
        }));
      }
    } catch (error) {
      console.warn('Failed to restore slot manager state from sessionStorage', error);
    }
  }, [storageKey, canUseSessionStorage]);

  useEffect(() => {
    if (!storageKey || !canUseSessionStorage) return;

    const payload = {
      selectedCourt,
      selectedDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
      newSlot,
      slotInterval,
      slotCreationMode,
      bulkSlotSettings,
    };

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist slot manager state to sessionStorage', error);
    }
  }, [
    storageKey,
    canUseSessionStorage,
    selectedCourt,
    selectedDate,
    newSlot,
    slotInterval,
    slotCreationMode,
    bulkSlotSettings,
  ]);

  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSlotPrice, setEditSlotPrice] = useState<string>('');

  useEffect(() => {
    if (userProfile) {
      fetchCourts();
    }
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourt && selectedDate && clubId) {
      fetchSlots();
    }
  }, [selectedCourt, selectedDate, clubId]);

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
      setClubId(null);
      return;
    }

    setClubId(clubData.id);

    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('club_id', clubData.id)
      .order('name');

    if (data) {
      setCourts(data);
      if (data.length > 0 && !selectedCourt) {
        setSelectedCourt(data[0].id);
      }
    }
  };

  const fetchSlots = async () => {
    if (!selectedCourt || !selectedDate || !clubId) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('court_slots')
      .select(`
        *,
        courts!inner(
          *,
          club_users (
            *,
            countries (currency_code)
          )
        )
      `)
      .eq('court_id', selectedCourt)
      .eq('date', dateStr)
      .eq('courts.club_id', clubId)
      .order('start_time');

    if (data) {
      // Calculate peak hour pricing for each slot
      const slotsWithPricing = await Promise.all(
        data.map(async (slot) => {
          const { data: priceData } = await supabase.rpc('calculate_slot_price', {
            p_court_id: slot.court_id,
            p_date: dateStr,
            p_start_time: slot.start_time,
            p_end_time: slot.end_time
          });
          
          return {
            ...slot,
            calculated_price: priceData || slot.courts.hourly_rate
          };
        })
      );
      
      setSlots(slotsWithPricing);
    }
  };

  const generateTimeSlots = (startTime: string, endTime: string) => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    
    const interval = slotInterval;
    const slots = [];

    for (let currentMinutes = startTotalMinutes; currentMinutes < endTotalMinutes; currentMinutes += interval) {
      const slotEndMinutes = currentMinutes + interval;
      
      // Don't create slots that go beyond the end time
      if (slotEndMinutes > endTotalMinutes) {
        break;
      }
      
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMin = slotEndMinutes % 60;
      
      const slotStartTime = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`;
      const slotEndTime = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMin.toString().padStart(2, '0')}`;
      
      slots.push({ start_time: slotStartTime, end_time: slotEndTime });
    }

    return slots;
  };

  const addSlot = async () => {
    if (!selectedCourt || !selectedDate || !clubId) return;

    const courtInfo = courts.find((court) => court.id === selectedCourt);
    if (!courtInfo || courtInfo.club_id !== clubId) {
      alert('You can only add slots for courts in your club.');
      return;
    }

    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      const { data: existingSlot, error: existingError } = await supabase
        .from('court_slots')
        .select('id, courts!inner(club_id)')
        .eq('date', dateStr)
        .eq('start_time', newSlot.start_time)
        .eq('end_time', newSlot.end_time)
        .eq('court_id', selectedCourt)
        .eq('courts.club_id', clubId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingSlot) {
        alert('A slot already exists for this court and time.');
        return;
      }

      const { error } = await supabase
        .from('court_slots')
        .insert({
          court_id: selectedCourt,
          date: dateStr,
          start_time: newSlot.start_time,
          end_time: newSlot.end_time,
          is_booked: false,
        });

      if (error) throw error;

      fetchSlots();
      setNewSlot(createDefaultNewSlot());
    } catch (error) {
      console.error('Error adding slot:', error);
      alert('Unable to add slot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!confirm('Are you sure you want to delete this slot?')) return;

    try {
      const { error } = await supabase
        .from('court_slots')
        .delete()
        .eq('id', slotId);

      if (error) throw error;
      fetchSlots();
    } catch (error) {
      console.error('Error deleting slot:', error);
    }
  };

  const generateBulkSlots = async () => {
    if (!selectedCourt || !clubId) return;

    const courtInfo = courts.find((court) => court.id === selectedCourt);
    if (!courtInfo || courtInfo.club_id !== clubId) {
      alert('You can only generate slots for courts in your club.');
      return;
    }

    setLoading(true);
    try {
      const fromDate = new Date(bulkSlotSettings.from_date);
      const toDate = new Date(bulkSlotSettings.to_date);
      const timeSlots = generateTimeSlots(bulkSlotSettings.start_time, bulkSlotSettings.end_time);

      const { data: existingSlots, error: existingError } = await supabase
        .from('court_slots')
        .select('date, start_time, end_time, courts!inner(club_id)')
        .eq('court_id', selectedCourt)
        .eq('courts.club_id', clubId)
        .gte('date', format(fromDate, 'yyyy-MM-dd'))
        .lte('date', format(toDate, 'yyyy-MM-dd'));

      if (existingError) throw existingError;

      const existingSlotKeys = new Set(
        (existingSlots || []).map((slot) => `${slot.date}|${slot.start_time}|${slot.end_time}`)
      );

      const slotsToInsert = [] as any[];
      let skippedCount = 0;

      for (let date = new Date(fromDate); date <= toDate; date.setDate(date.getDate() + 1)) {
        const dateStr = format(date, 'yyyy-MM-dd');

        if (bulkSlotSettings.exclude_dates.includes(dateStr)) {
          continue;
        }

        for (const slot of timeSlots) {
          const key = `${dateStr}|${slot.start_time}|${slot.end_time}`;
          if (existingSlotKeys.has(key)) {
            skippedCount++;
            continue;
          }

          existingSlotKeys.add(key);
          slotsToInsert.push({
            court_id: selectedCourt,
            date: dateStr,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_booked: false,
          });
        }
      }

      if (slotsToInsert.length === 0) {
        const message = skippedCount > 0
          ? 'All slots in the selected range already exist.'
          : 'No slots to generate. All dates are excluded.';
        alert(message);
        return;
      }

      const { error } = await supabase
        .from('court_slots')
        .insert(slotsToInsert);

      if (error) throw error;

      const successMessage = skippedCount > 0
        ? `Generated ${slotsToInsert.length} new slots. Skipped ${skippedCount} duplicate slot${skippedCount === 1 ? '' : 's'}.`
        : `Successfully generated ${slotsToInsert.length} slots!`;

      alert(successMessage);
      fetchSlots();
    } catch (error) {
      console.error('Error generating bulk slots:', error);
      alert('Error generating slots. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateSlotPrice = async () => {
    if (!editingSlot || !editSlotPrice) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('court_slots')
        .update({ custom_price: parseFloat(editSlotPrice) })
        .eq('id', editingSlot.id);

      if (error) throw error;

      setShowEditModal(false);
      setEditingSlot(null);
      setEditSlotPrice('');
      fetchSlots();
    } catch (error) {
      console.error('Error updating slot price:', error);
      alert('Error updating slot price. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openEditSlot = (slot: any) => {
    setEditingSlot(slot);
    setEditSlotPrice((slot.custom_price || slot.calculated_price || slot.courts.hourly_rate).toString());
    setShowEditModal(true);
  };

  const getDateOptions = () => {
    const dates = [];
    for (let i = 0; i < 30; i++) { // Next 30 days
      dates.push(addDays(new Date(), i));
    }
    return dates;
  };

  const getSelectedCourtInfo = () => {
    return courts.find(court => court.id === selectedCourt);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Manage Court Slots</h1>
        <p className="text-blue-100">Create and manage available time slots for your courts</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Court
            </label>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a court</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} ({formatPrice(court.hourly_rate)}/hr)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              min={format(new Date(), 'yyyy-MM-dd')}
              max={format(addDays(new Date(), 365), 'yyyy-MM-dd')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Slot Creation Mode Toggle */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Slot Creation Mode</h3>
          <div className="flex flex-wrap gap-3">
            {[
              { value: 'individual' as const, label: 'Single Day & Time' },
              { value: 'bulk' as const, label: 'Bulk Date Range' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSlotCreationMode(option.value)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  slotCreationMode === option.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk Slot Generation Settings */}
        {slotCreationMode === 'bulk' && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Bulk Slot Generation Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={bulkSlotSettings.from_date}
                onChange={(e) => setBulkSlotSettings({ ...bulkSlotSettings, from_date: e.target.value })}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={bulkSlotSettings.to_date}
                onChange={(e) => setBulkSlotSettings({ ...bulkSlotSettings, to_date: e.target.value })}
                min={bulkSlotSettings.from_date}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={bulkSlotSettings.start_time}
                onChange={(e) => setBulkSlotSettings({ ...bulkSlotSettings, start_time: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time
              </label>
              <input
                type="time"
                value={bulkSlotSettings.end_time}
                onChange={(e) => setBulkSlotSettings({ ...bulkSlotSettings, end_time: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slot Interval (minutes)
              </label>
              <select
                value={slotInterval}
                onChange={(e) => setSlotInterval(parseInt(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exclude Date
              </label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  id="exclude-date-input"
                  min={bulkSlotSettings.from_date}
                  max={bulkSlotSettings.to_date}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('exclude-date-input') as HTMLInputElement;
                    if (input.value && !bulkSlotSettings.exclude_dates.includes(input.value)) {
                      setBulkSlotSettings({
                        ...bulkSlotSettings,
                        exclude_dates: [...bulkSlotSettings.exclude_dates, input.value].sort()
                      });
                      input.value = '';
                    }
                  }}
                  className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Exclude
                </button>
              </div>
            </div>
          </div>

          {bulkSlotSettings.exclude_dates.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Excluded Dates:
              </label>
              <div className="flex flex-wrap gap-2">
                {bulkSlotSettings.exclude_dates.map(date => (
                  <span
                    key={date}
                    className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm"
                  >
                    {format(new Date(date), 'MMM dd, yyyy')}
                    <button
                      type="button"
                      onClick={() => {
                        setBulkSlotSettings({
                          ...bulkSlotSettings,
                          exclude_dates: bulkSlotSettings.exclude_dates.filter(d => d !== date)
                        });
                      }}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={generateBulkSlots}
              disabled={loading || !selectedCourt}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
            >
              <span>Generate Slots for Date Range</span>
            </button>
          </div>

          {selectedCourt && bulkSlotSettings.start_time && bulkSlotSettings.end_time && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Preview:</strong> Will generate {generateTimeSlots(bulkSlotSettings.start_time, bulkSlotSettings.end_time).length} slots per day
                from {bulkSlotSettings.start_time} to {bulkSlotSettings.end_time} with {slotInterval} minute intervals.
                <br />
                Date range: {format(new Date(bulkSlotSettings.from_date), 'MMM dd')} to {format(new Date(bulkSlotSettings.to_date), 'MMM dd, yyyy')}
                {bulkSlotSettings.exclude_dates.length > 0 && (
                  <span> (excluding {bulkSlotSettings.exclude_dates.length} date{bulkSlotSettings.exclude_dates.length > 1 ? 's' : ''})</span>
                )}
                <br />
                <strong>Total slots:</strong> {(() => {
                  const fromDate = new Date(bulkSlotSettings.from_date);
                  const toDate = new Date(bulkSlotSettings.to_date);
                  let dayCount = 0;
                  for (let date = new Date(fromDate); date <= toDate; date.setDate(date.getDate() + 1)) {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    if (!bulkSlotSettings.exclude_dates.includes(dateStr)) {
                      dayCount++;
                    }
                  }
                  return dayCount * generateTimeSlots(bulkSlotSettings.start_time, bulkSlotSettings.end_time).length;
                })()}
              </p>
            </div>
          )}
          </div>
        )}

        {/* Court Info Display */}
        {selectedCourt && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  {getSelectedCourtInfo()?.name}
                </h3>
                <p className="text-sm text-blue-700">
                  {getSelectedCourtInfo()?.surface_type} Surface
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-blue-900">
                  {formatPrice(getSelectedCourtInfo()?.hourly_rate || 0)}/hour
                </p>
                <p className="text-sm text-blue-600">Hourly Rate</p>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Add Individual Slot */}
      {slotCreationMode === 'individual' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Plus className="h-5 w-5 text-green-600 mr-2" />
            Add Individual Slot
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={newSlot.start_time}
                onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time
              </label>
              <input
                type="time"
                value={newSlot.end_time}
                onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={addSlot}
                disabled={loading || !selectedCourt}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Slots */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="h-5 w-5 text-blue-600 mr-2" />
            Existing Slots - {format(selectedDate, 'EEEE, MMM d, yyyy')}
          </h2>
          {selectedCourt && getSelectedCourtInfo() && (
            <p className="text-sm text-gray-600 mt-1">
              {getSelectedCourtInfo()?.name} • {formatPrice(getSelectedCourtInfo()?.hourly_rate || 0)} per hour
            </p>
          )}
        </div>
        <div className="p-6">
          {slots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`p-4 rounded-lg border-2 ${
                    slot.is_booked
                      ? 'border-red-200 bg-red-50'
                      : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {slot.start_time} - {slot.end_time}
                      </p>
                      <p className={`text-sm ${
                        slot.is_booked ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {slot.is_booked ? 'Booked' : 'Available'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Rate: {formatPrice(slot.custom_price || slot.calculated_price)}
                        {slot.custom_price && (
                          <span className="text-blue-600 ml-1" title="Custom price">
                            <Edit className="h-3 w-3 inline" />
                          </span>
                        )}
                        {!slot.custom_price && slot.calculated_price !== getSelectedCourtInfo()?.hourly_rate && (
                          <span className="text-orange-600 ml-1" title="Peak hour pricing">
                            <DollarSign className="h-3 w-3 inline" />
                          </span>
                        )}
                      </p>
                    </div>
                    {!slot.is_booked && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openEditSlot(slot)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit slot price"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteSlot(slot.id)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Slots Created</h3>
              <p className="text-gray-600">Create time slots for this court and date to start accepting bookings.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Slot Price Modal */}
      {showEditModal && editingSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full m-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Edit Slot Price
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Slot
                </label>
                <p className="text-gray-900">
                  {editingSlot.start_time} - {editingSlot.end_time}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original Price
                </label>
                <p className="text-gray-600">
                  {formatPrice(editingSlot.calculated_price)}
                  {editingSlot.calculated_price !== getSelectedCourtInfo()?.hourly_rate && (
                    <span className="text-xs text-orange-600 ml-2">(Peak hour pricing applied)</span>
                  )}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editSlotPrice}
                  onChange={(e) => setEditSlotPrice(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={updateSlotPrice}
                  disabled={loading || !editSlotPrice}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingSlot(null);
                    setEditSlotPrice('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};