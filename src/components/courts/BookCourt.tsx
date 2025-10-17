import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, DollarSign, Search, Building2, Phone, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { CurrencySelector } from '../ui/CurrencySelector';
import { GroupBookingPage } from '../bookings/GroupBookingPage';
import { format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore } from 'date-fns';

const BOOKING_STATUS_DEFAULT = 'pending';
const PAYMENT_STATUS_DEFAULT = 'pending';

export const BookCourt: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();

  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [clubs, setClubs] = useState<any[]>([]);
  const [selectedClub, setSelectedClub] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [datesWithSlots, setDatesWithSlots] = useState<Set<string>>(new Set());
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);

  useEffect(() => {
    fetchCountries();
  }, []);

  useEffect(() => {
    if (userProfile && countries.length > 0) {
      const playerCountryId = (userProfile as any).country_id;
      if (playerCountryId) {
        setSelectedCountry(playerCountryId);
      }
    }
  }, [userProfile, countries]);

  useEffect(() => {
    if (selectedClub && selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedClub, selectedDate]);

  useEffect(() => {
    if (selectedClub) {
      fetchAvailableDates();
    }
  }, [selectedClub, currentMonth]);

  const fetchCountries = async () => {
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching countries:', error);
      setError('Failed to load countries');
    } else {
      setCountries(data || []);
    }
  };

  const handleSearch = async () => {
    if (!selectedCountry) {
      setError('Please select a country');
      return;
    }

    setLoading(true);
    setSearchPerformed(true);
    setError(null);

    const { data, error } = await supabase
      .from('club_users')
      .select(`
        id,
        club_name,
        phone_number,
        address,
        website,
        country_id,
        countries (
          name,
          code
        )
      `)
      .eq('country_id', selectedCountry);

    setLoading(false);

    if (error) {
      console.error('Error fetching clubs:', error);
      setError('Failed to load clubs. Please try again.');
    } else {
      setClubs(data || []);
      setSelectedClub(null);
      setAvailableSlots([]);
      setSelectedSlot(null);
    }
  };

  const handleClubSelect = (club: any) => {
    setSelectedClub(club);
    setSelectedSlot(null);
  };

  const fetchAvailableDates = async () => {
    if (!selectedClub) return;

    const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('court_slots')
      .select('date, courts!inner(club_id), bookings(id, status)')
      .eq('courts.club_id', selectedClub.id)
      .eq('is_booked', false)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!error && data) {
      const availableSlots = data.filter(slot => {
        const hasPendingBooking = slot.bookings?.some(
          (booking: any) => booking.status === 'pending'
        );
        return !hasPendingBooking;
      });

      const uniqueDates = new Set(availableSlots.map(slot => slot.date));
      setDatesWithSlots(uniqueDates);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedClub) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    setLoading(true);

    const { data, error } = await supabase
      .from('court_slots')
      .select(`
        *,
        courts!inner (
          id,
          name,
          surface_type,
          hourly_rate,
          amenities,
          club_id,
          club_users (
            club_name,
            phone_number
          )
        ),
        bookings (
          id,
          status
        )
      `)
      .eq('courts.club_id', selectedClub.id)
      .eq('date', dateStr)
      .eq('is_booked', false)
      .order('start_time');

    if (error) {
      console.error('Error fetching slots:', error);
      setError('Failed to load available slots');
      setLoading(false);
      return;
    }

    if (data) {
      const availableSlots = data.filter(slot => {
        const hasPendingBooking = slot.bookings?.some(
          (booking: any) => booking.status === 'pending'
        );
        return !hasPendingBooking;
      });

      const slotsWithPricing = await Promise.all(
        availableSlots.map(async (slot) => {
          const { data: priceData } = await supabase.rpc('calculate_slot_price', {
            p_court_id: slot.court_id,
            p_date: dateStr,
            p_start_time: slot.start_time,
            p_end_time: slot.end_time
          });

          return {
            ...slot,
            calculated_price: priceData || slot.courts.hourly_rate,
            effective_price: slot.custom_price || priceData || slot.courts.hourly_rate
          };
        })
      );

      setAvailableSlots(slotsWithPricing);
    }

    setLoading(false);
  };

const handleBooking = async () => {
  if (!selectedSlot) return;

  setLoading(true);
  setError(null);

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw new Error(`Auth error: ${authErr.message}`);
    const authUserId = authData?.user?.id;
    if (!authUserId) throw new Error('Not signed in.');

    const { data: playerRow, error: pErr } = await supabase
      .from('player_users')
      .select('id')
                  .eq('user_id', authUserId)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!playerRow?.id) {
      throw new Error('Player profile not found (ID does not exist in player_users).');
    }

    const { data: slotCheck, error: slotErr } = await supabase
      .from('court_slots')
      .select('id, court_id, is_booked, custom_price, courts:court_id(hourly_rate), bookings(id, status)')
      .eq('id', selectedSlot.id)
      .maybeSingle();

    if (slotErr || !slotCheck) throw new Error('Selected slot not found.');
    if (slotCheck.is_booked) throw new Error('This slot has already been booked.');

    const hasPendingBooking = slotCheck.bookings?.some(
      (booking: any) => booking.status === 'pending'
    );
    if (hasPendingBooking) {
      throw new Error('This slot already has a pending booking. Please select another slot or wait for the current booking to be processed.');
    }

    const totalAmount = Number(
      selectedSlot?.effective_price ??
      slotCheck.custom_price ??
      selectedSlot?.calculated_price ??
      slotCheck.courts?.hourly_rate ??
      selectedSlot?.custom_price ??
      selectedSlot?.courts?.hourly_rate ??
      0
    ) || 0;

    const { error: bookErr } = await supabase
      .from('bookings')
      .insert({
        player_id: playerRow.id,
        slot_id: slotCheck.id,
        total_amount: totalAmount,
        status: BOOKING_STATUS_DEFAULT,
        payment_status: PAYMENT_STATUS_DEFAULT,
      });

    if (bookErr) throw bookErr;

    setBookingSuccess(true);
    setSelectedSlot(null);
    await fetchAvailableSlots();
    await fetchAvailableDates();

  } catch (err: any) {
    console.error('[BookCourt] Booking error:', err);
    setError(err?.message || 'Failed to create booking. Please try again.');
  } finally {
    setLoading(false);
  }
};

  const getCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const isDayAvailable = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return datesWithSlots.has(dateStr);
  };

  const isDayDisabled = (date: Date) => {
    return isBefore(startOfDay(date), startOfDay(new Date()));
  };

  const renderForGroup = (content: React.ReactNode) => {
    if (userProfile?.type !== 'Group') {
      return content;
    }

    return (
      <div className="space-y-10">
        <GroupBookingPage />
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900">Explore clubs in your country</h2>
            <p className="text-sm text-gray-600 mt-1">
              Browse available slots across any club in your country—just like individual players do.
            </p>
          </div>
          {content}
        </div>
      </div>
    );
  };

  if (error) {
    const errorView = (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-red-900 mb-2">Error Loading Page</h2>
          <p className="text-red-700 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
    return renderForGroup(errorView);
  }

  if (bookingSuccess) {
    const successView = (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Booking Request Submitted!</h2>
          <p className="text-text-secondary mb-6">
            Your booking request has been sent to the club for approval. You will be notified once the club approves your booking.
          </p>
          <button
            onClick={() => {
              setBookingSuccess(false);
              setSelectedClub(null);
              setClubs([]);
              setSearchPerformed(false);
            }}
            className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Book Another Court
          </button>
        </div>
      </div>
    );
    return renderForGroup(successView);
  }

  const standardView = (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-text-primary">
          {userProfile?.type === 'Group' ? 'Search club availability' : 'Book a Court'}
        </h1>
        <div className="hidden md:block">
          <CurrencySelector />
        </div>
      </div>

      <div className="md:hidden">
        <CurrencySelector />
      </div>

      {!selectedClub ? (
        <>
          <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-4 flex items-center">
              <Search className="h-5 w-5 text-secondary-500 mr-2" />
              Search Clubs
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Select Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                >
                  <option value="">Choose a country...</option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSearch}
                disabled={!selectedCountry || loading}
                className="w-full px-6 py-3 bg-secondary-500 text-white rounded-lg hover:bg-secondary-600 transition-colors disabled:bg-background-subtle disabled:text-text-secondary disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5 mr-2" />
                    Search Clubs
                  </>
                )}
              </button>
            </div>
          </div>

          {searchPerformed && (
            <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
              <div className="p-6 border-b border-background-subtle">
                <h2 className="text-xl font-semibold text-text-primary flex items-center">
                  <Building2 className="h-5 w-5 text-primary-500 mr-2" />
                  Available Clubs ({clubs.length})
                </h2>
              </div>
              <div className="p-6">
                {clubs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clubs.map((club) => (
                      <div
                        key={club.id}
                        onClick={() => handleClubSelect(club)}
                        className="border-2 border-background-subtle rounded-xl p-6 hover:border-secondary-500 hover:shadow-lg transition-all cursor-pointer"
                      >
                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                          {club.club_name}
                        </h3>
                        {club.address && (
                          <div className="flex items-start text-sm text-text-secondary mb-2">
                            <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                            <span>{club.address}</span>
                          </div>
                        )}
                        {club.phone_number && (
                          <div className="flex items-center text-sm text-text-secondary mb-2">
                            <Phone className="h-4 w-4 mr-2" />
                            <span>{club.phone_number}</span>
                          </div>
                        )}
                        {club.website && (
                          <div className="flex items-center text-sm text-text-secondary mb-2">
                            <Globe className="h-4 w-4 mr-2" />
                            <a
                              href={club.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-secondary-500 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Visit Website
                            </a>
                          </div>
                        )}
                        <div className="mt-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary-100 text-secondary-700">
                            <Globe className="h-3 w-3 mr-1" />
                            {club.countries?.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Building2 className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                    <p className="text-text-secondary">No clubs found in the selected country.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold text-text-primary flex items-center">
                  <Building2 className="h-5 w-5 text-primary-500 mr-2" />
                  {selectedClub.club_name}
                </h2>
                {selectedClub.address && (
                  <p className="text-sm text-text-secondary mt-1 flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    {selectedClub.address}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedClub(null);
                  setSelectedSlot(null);
                  setAvailableSlots([]);
                }}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-subtle rounded-lg transition-colors"
              >
                Change Club
              </button>
            </div>
          </div>

           <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center">
                <Calendar className="h-5 w-5 text-primary-500 mr-2" />
                Select Date
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPreviousMonth}
                  className="p-2 hover:bg-background-subtle rounded-lg transition-colors"
                >
                  <svg className="h-5 w-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm sm:text-base font-semibold text-text-primary min-w-[140px] text-center">
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                <button
                  onClick={goToNextMonth}
                  className="p-2 hover:bg-background-subtle rounded-lg transition-colors"
                >
                  <svg className="h-5 w-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs sm:text-sm font-medium text-text-secondary py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {getCalendarDays().map((date, index) => {
                const isAvailable = isDayAvailable(date);
                const isDisabled = isDayDisabled(date);
                const isSelected = isSameDay(date, selectedDate);
                const isTodayDate = isToday(date);

                return (
                  <button
                    key={index}
                    onClick={() => !isDisabled && isAvailable && setSelectedDate(date)}
                    disabled={isDisabled || !isAvailable}
                    className={`
                      aspect-square p-1 sm:p-2 rounded-lg text-xs sm:text-sm font-medium transition-all
                      ${
                        isSelected
                          ? 'bg-primary-500 text-white ring-2 ring-primary-500 ring-offset-2'
                          : isAvailable && !isDisabled
                          ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100 cursor-pointer'
                          : 'bg-background-subtle text-text-secondary cursor-not-allowed'
                      }
                      ${isTodayDate && !isSelected ? 'ring-1 ring-secondary-500' : ''}
                    `}
                  >
                    <div className="flex flex-col items-center justify-center h-full">
                      <span>{format(date, 'd')}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-background-subtle flex flex-wrap gap-4 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-secondary-50 border border-secondary-200"></div>
                <span className="text-text-secondary">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary-500"></div>
                <span className="text-text-secondary">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-background-subtle border border-background-subtle"></div>
                <span className="text-text-secondary">Not Available</span>
              </div>
            </div>
          </div>

          <div className="bg-background rounded-xl shadow-sm border border-background-subtle">
            <div className="p-6 border-b border-background-subtle">
              <h2 className="text-xl font-semibold text-text-primary flex items-center">
                <Clock className="h-5 w-5 text-secondary-500 mr-2" />
                Available Courts - {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary-500 mx-auto mb-4"></div>
                  <p className="text-text-secondary">Loading available courts...</p>
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className={`border-2 rounded-xl p-6 transition-all cursor-pointer ${
                        selectedSlot?.id === slot.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-background-subtle hover:border-primary-300 hover:shadow-md'
                      }`}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-text-primary">{slot.courts?.name || 'Court'}</h3>
                          <p className="text-sm text-text-secondary">{slot.courts?.club_users?.club_name || selectedClub.club_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary-500">
                            {formatPrice(slot.effective_price || slot.custom_price || slot.courts?.hourly_rate || 0)}
                          </p>
                          <p className="text-xs text-text-secondary">per hour</p>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-text-secondary">
                          <Clock className="h-4 w-4 mr-2" />
                          {slot.start_time} - {slot.end_time}
                        </div>
                        <div className="flex items-center text-sm text-text-secondary">
                          <MapPin className="h-4 w-4 mr-2" />
                          {slot.courts?.surface_type || 'Synthetic'} Surface
                        </div>
                      </div>

                      {slot.courts?.amenities && slot.courts.amenities.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-text-primary mb-1">Amenities:</p>
                          <div className="flex flex-wrap gap-1">
                            {slot.courts.amenities.slice(0, 3).map((amenity: string, index: number) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-secondary-50 text-secondary-600 text-xs rounded-full"
                              >
                                {amenity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedSlot?.id === slot.id && (
                        <div className="mt-4 pt-4 border-t border-primary-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBooking();
                            }}
                            disabled={loading}
                            className="w-full px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:bg-background-subtle disabled:text-text-secondary"
                          >
                            {loading ? 'Booking...' : 'Confirm Booking'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                  <p className="text-text-secondary">No available courts for this date.</p>
                  <p className="text-sm text-text-secondary mt-2">Try selecting a different date.</p>
                </div>
              )}
            </div>
          </div>

          {selectedSlot && (
            <div className="bg-background rounded-xl shadow-sm border border-background-subtle p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center">
                <DollarSign className="h-5 w-5 text-green-600 mr-2" />
                Booking Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Club:</span>
                  <span className="font-medium">{selectedClub.club_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Court:</span>
                  <span className="font-medium">{selectedSlot.courts?.name || 'Court'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Date:</span>
                  <span className="font-medium">{format(selectedDate, 'MMMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Time:</span>
                  <span className="font-medium">{selectedSlot.start_time} - {selectedSlot.end_time}</span>
                </div>
                <div className="border-t pt-3 flex justify-between text-lg font-semibold">
                  <span>Total:</span>
                  <span className="text-primary-500">
                    {formatPrice(selectedSlot.effective_price || selectedSlot.custom_price || selectedSlot.courts?.hourly_rate || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return renderForGroup(standardView);
};
