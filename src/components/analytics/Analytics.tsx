import React, { useState, useEffect } from 'react';
import { Calendar, DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../hooks/useCurrency';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export const Analytics: React.FC = () => {
  const { userProfile } = useAuthStore();
  const { formatPrice } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [analytics, setAnalytics] = useState({
    totalBookings: 0,
    approvedBookings: 0,
    pendingBookings: 0,
    rejectedBookings: 0,
    cancelledBookings: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    paidPayments: 0,
  });
  const [monthlyTrends, setMonthlyTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      fetchAnalytics();
    }
  }, [userProfile, selectedMonth]);

  const fetchAnalytics = async () => {
    if (!userProfile) return;

    setLoading(true);
    try {
      const { data: clubData, error: clubError } = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', userProfile.user_id)
        .single();

      if (clubError || !clubData) {
        console.error('Error fetching club data:', clubError);
        setLoading(false);
        return;
      }

      const { data: courtsData } = await supabase
        .from('courts')
        .select('id')
        .eq('club_id', clubData.id);

      if (!courtsData || courtsData.length === 0) {
        setLoading(false);
        return;
      }

      const monthDate = new Date(selectedMonth + '-01');
      const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');

      let allBookings: any[] = [];

      for (const court of courtsData) {
        try {
          const { data, error } = await supabase.rpc('get_club_monthly_bookings', {
            p_court_id: court.id,
            p_start_date: startDate,
            p_end_date: endDate
          });

          if (error) {
            console.error('Error fetching bookings for court:', court.id, error);
            continue;
          }

          if (data && data.length > 0) {
            allBookings = [...allBookings, ...data];
          }
        } catch (err) {
          console.error('Error in RPC call:', err);
        }
      }

      if (allBookings.length > 0) {
        const totalBookings = allBookings.length;
        const approvedBookings = allBookings.filter(b => b.booking_status === 'approved').length;
        const pendingBookings = allBookings.filter(b => b.booking_status === 'pending').length;
        const rejectedBookings = allBookings.filter(b => b.booking_status === 'rejected').length;
        const cancelledBookings = allBookings.filter(b => b.booking_status === 'cancelled').length;

        const paidBookings = allBookings.filter(b => b.payment_status === 'paid');
        const pendingPaymentBookings = allBookings.filter(
          b => b.booking_status === 'approved' && b.payment_status === 'pending'
        );

        const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        const pendingPayments = pendingPaymentBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        const paidPayments = totalRevenue;

        setAnalytics({
          totalBookings,
          approvedBookings,
          pendingBookings,
          rejectedBookings,
          cancelledBookings,
          totalRevenue,
          pendingPayments,
          paidPayments,
        });
      } else {
        setAnalytics({
          totalBookings: 0,
          approvedBookings: 0,
          pendingBookings: 0,
          rejectedBookings: 0,
          cancelledBookings: 0,
          totalRevenue: 0,
          pendingPayments: 0,
          paidPayments: 0,
        });
      }

      await fetchMonthlyTrends(courtsData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyTrends = async (courtsData: any[]) => {
    const trends = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
      const monthLabel = format(monthDate, 'MMM yyyy');

      let monthBookings: any[] = [];

      for (const court of courtsData) {
        try {
          const { data, error } = await supabase.rpc('get_club_monthly_bookings', {
            p_court_id: court.id,
            p_start_date: startDate,
            p_end_date: endDate
          });

          if (!error && data && data.length > 0) {
            monthBookings = [...monthBookings, ...data];
          }
        } catch (err) {
          console.error('Error fetching trends:', err);
        }
      }

      if (monthBookings.length > 0) {
        const totalBookings = monthBookings.length;
        const revenue = monthBookings
          .filter(b => b.payment_status === 'paid')
          .reduce((sum, b) => sum + (b.total_amount || 0), 0);

        trends.push({
          month: monthLabel,
          bookings: totalBookings,
          revenue: revenue,
        });
      } else {
        trends.push({
          month: monthLabel,
          bookings: 0,
          revenue: 0,
        });
      }
    }

    setMonthlyTrends(trends);
  };

  const StatCard: React.FC<{
    icon: React.ElementType;
    title: string;
    value: string | number;
    subtitle?: string;
    color: string;
  }> = ({ icon: Icon, title, value, subtitle, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Analytics & Reports</h1>
        <p className="text-blue-100">Track your bookings, revenue, and payment status</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Month
        </label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full md:w-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Booking Statistics - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={Calendar}
                title="Total Bookings"
                value={analytics.totalBookings}
                subtitle={`${analytics.approvedBookings} approved, ${analytics.pendingBookings} pending`}
                color="bg-blue-500"
              />
              <StatCard
                icon={CheckCircle}
                title="Approved Bookings"
                value={analytics.approvedBookings}
                subtitle={`${analytics.rejectedBookings} rejected, ${analytics.cancelledBookings} cancelled`}
                color="bg-green-500"
              />
              <StatCard
                icon={Clock}
                title="Pending Approvals"
                value={analytics.pendingBookings}
                subtitle="Awaiting your action"
                color="bg-yellow-500"
              />
              <StatCard
                icon={AlertCircle}
                title="Rejected/Cancelled"
                value={analytics.rejectedBookings + analytics.cancelledBookings}
                subtitle={`${analytics.rejectedBookings} rejected, ${analytics.cancelledBookings} cancelled`}
                color="bg-red-500"
              />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Payment Statistics - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard
                icon={DollarSign}
                title="Total Revenue Collected"
                value={formatPrice(analytics.paidPayments)}
                subtitle="Successfully collected payments"
                color="bg-green-600"
              />
              <StatCard
                icon={TrendingUp}
                title="Pending Payments"
                value={formatPrice(analytics.pendingPayments)}
                subtitle="Awaiting payment"
                color="bg-yellow-600"
              />
              <StatCard
                icon={DollarSign}
                title="Total Expected Revenue"
                value={formatPrice(analytics.paidPayments + analytics.pendingPayments)}
                subtitle="Collected + Pending"
                color="bg-blue-600"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">6-Month Trends</h2>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Month
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Bookings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue Collected
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {monthlyTrends.map((trend, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {trend.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {trend.bookings}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {formatPrice(trend.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start">
              <TrendingUp className="h-6 w-6 text-blue-600 mr-3 mt-1" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">Summary Insights</h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li>
                    <span className="font-medium">Approval Rate:</span>{' '}
                    {analytics.totalBookings > 0
                      ? Math.round((analytics.approvedBookings / analytics.totalBookings) * 100)
                      : 0}
                    % of bookings approved
                  </li>
                  <li>
                    <span className="font-medium">Payment Collection Rate:</span>{' '}
                    {analytics.paidPayments + analytics.pendingPayments > 0
                      ? Math.round(
                          (analytics.paidPayments / (analytics.paidPayments + analytics.pendingPayments)) * 100
                        )
                      : 0}
                    % of expected revenue collected
                  </li>
                  <li>
                    <span className="font-medium">Action Required:</span>{' '}
                    {analytics.pendingBookings} booking(s) awaiting approval
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
