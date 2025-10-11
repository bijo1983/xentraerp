import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Activity, Trophy, Users, Calendar, ArrowRight } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const navigate = useNavigate();

  const {
    signIn,
    user,
    userProfile,
    loading,
  } = useAuthStore();

  useEffect(() => {
    console.log("🔍 Login state:", { loading, user, userProfile });
    if (user && userProfile) {
      navigate('/dashboard');
    }
  }, [user, userProfile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      await signIn(email, password);
    } catch (error: any) {
      if (error.message?.includes('Supabase is not configured') || error.message?.includes('Failed to fetch')) {
        setLocalError('Database connection not configured. Please connect to Supabase first by clicking the "Connect to Supabase" button in the top right corner.');
      } else {
        setLocalError(error.message || 'Login failed. Please try again.');
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setLocalError('Please enter your email address first');
      return;
    }

    setIsResettingPassword(true);
    setLocalError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setResetEmailSent(true);
      setLocalError(null);
    } catch (error: any) {
      console.error('Password reset error:', error);
      if (error.message?.includes('Supabase is not configured') || error.message?.includes('Failed to fetch')) {
        setLocalError('Database connection not configured. Please connect to Supabase first by clicking the "Connect to Supabase" button in the top right corner.');
      } else {
        setLocalError('Failed to send reset email. Please check your email address and try again.');
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (loading) return <div className="p-6 text-center">🔄 Loading BadmintonHub...</div>;

  if (!loading && user && !userProfile) {
    return (
      <div className="p-6 text-center">
        ❌ No profile found for your account.<br />
        Please contact support or re-register.
        <br />
        <Button onClick={() => useAuthStore.getState().signOut()} className="mt-4">Logout</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-4rem)]">
          <div className="space-y-6 sm:space-y-8 order-2 lg:order-1">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600" />
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
                  BadmintonHub
                </h1>
              </div>
              <p className="text-base sm:text-xl text-gray-600 leading-relaxed">
                Your complete platform for managing courts, tournaments, and the badminton community.
              </p>
            </div>

            <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Court Booking</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Manage court schedules and bookings with real-time availability.
                </p>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-green-100 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Tournaments</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Organize and manage tournaments with bracket generation.
                </p>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Community</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Connect players, clubs, and organizers in one place.
                </p>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                  <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Analytics</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Track bookings, payments, and performance metrics.
                </p>
              </div>
            </div>

            <div className="hidden sm:block bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-4 sm:p-6 text-white">
              <p className="text-xs sm:text-sm font-medium mb-1">Trusted by clubs and players</p>
              <p className="text-xl sm:text-2xl font-bold">Streamline your badminton operations</p>
            </div>
          </div>

          <div className="lg:pl-8 order-1 lg:order-2">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 max-w-md mx-auto">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Welcome back</h2>
                <p className="text-gray-600 text-sm sm:text-base">Sign in to your account to continue</p>
              </div>

              {localError && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-xs sm:text-sm">{localError}</p>
                </div>
              )}

              {resetEmailSent && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-xs sm:text-sm font-medium">Password reset email sent!</p>
                  <p className="text-green-600 text-xs sm:text-sm mt-1">
                    Check your inbox at <strong>{email}</strong> and follow the instructions.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter your password"
                  />
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 py-2 sm:py-3 text-sm sm:text-base font-semibold flex items-center justify-center group">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </form>

              <div className="mt-3 sm:mt-4 text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResettingPassword || !email}
                  className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isResettingPassword ? 'Sending reset email...' : 'Forgot your password?'}
                </button>
                {!email && (
                  <p className="text-xs text-gray-500 mt-1">
                    Enter your email address first
                  </p>
                )}
              </div>

              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 text-center">
                <p className="text-gray-600 text-xs sm:text-sm mb-3">
                  Don't have an account?
                </p>
                <a
                  href="/"
                  className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 text-sm sm:text-base font-semibold transition-colors group"
                >
                  Create an account
                  <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>

              <div className="mt-4 sm:mt-6 text-center">
                <a
                  href="/db-connection"
                  className="text-gray-400 hover:text-gray-600 text-xs transition-colors"
                >
                  Check Database Connection
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
