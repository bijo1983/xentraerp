import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import badmintonLogo from '../../assets/logo/badminton-booking-logo.svg';
import { Footer } from '../layout/Footer';
import { PageMetadata } from '../seo/PageMetadata';

const LOGIN_KEYWORDS = [
  'badminton booking login',
  'badminton court reservation software',
  'sports club management platform',
  'badminton tournament management login',
  'indoor court scheduling tool',
  'badminton club software platform',
];

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
    console.log('🔍 Login state:', { loading, user, userProfile });
    if (user && userProfile) {
      navigate('/dashboard', { replace: true });
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

  if (loading) return <div className="p-6 text-center">🔄 Loading Badminton Booking...</div>;

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
    <>
      <PageMetadata
        title="Badminton Booking | Badminton Court Reservation Login"
        description="Sign in to Badminton Booking to manage badminton court reservations, publish tournaments, and coordinate your club or community in one connected platform."
        path="/login"
        keywords={LOGIN_KEYWORDS}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
              <div className="mb-6 sm:mb-8 text-center">
                <img
                  src={badmintonLogo}
                  alt="Badminton Booking logo"
                  className="mx-auto mb-4 h-12 w-auto sm:h-14"
                />
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
                <p className="text-gray-600 text-xs sm:text-sm mb-3">Don&apos;t have an account?</p>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 text-sm sm:text-base font-semibold transition-colors group"
                >
                  Create an account
                  <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};
