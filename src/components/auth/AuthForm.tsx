import React, { useEffect, useState } from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

type AuthFormProps = {
  /** Force starting mode. If omitted, defaults to 'login'. */
  initialMode?: 'login' | 'signup';
  /** Where to go after sign-in/sign-up succeeds (defaults to '/dashboard'). */
  afterAuthRedirectTo?: string;
};

export const AuthForm: React.FC<AuthFormProps> = ({
  initialMode = 'login',
  afterAuthRedirectTo = '/dashboard',
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // If AuthForm is used on dedicated routes, prefer URL to set mode.
  // Otherwise use initialMode prop.
  const onLoginRoute = location.pathname === '/login';
  const onRegisterRoute = location.pathname === '/register';

  const [isLogin, setIsLogin] = useState(
    onLoginRoute ? true : onRegisterRoute ? false : initialMode !== 'signup'
  );

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    userType: 'Player',
    phone: '',
    country: '',
  });

  const [countries, setCountries] = useState<any[]>([]);
  const { signIn, signUp } = useAuthStore();

  // Keep local mode in sync if initialMode prop changes (embedded usage)
  useEffect(() => {
    if (!onLoginRoute && !onRegisterRoute) {
      setIsLogin(initialMode !== 'signup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  // Load countries only for signup mode
  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('id, name, code')
          .order('name');
        if (error || !data) {
          setCountries([]);
        } else {
          setCountries(data);
        }
      } catch {
        setCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    };

    if (!isLogin) fetchCountries();
  }, [isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signIn(formData.email, formData.password);
      } else {
        await signUp(formData.email, formData.password, {
          name: formData.name,
          userType: formData.userType,
          phone_number: formData.phone,
          country_id: formData.country,
        });
        // Clear form on successful signup
        setFormData({
          email: '',
          password: '',
          name: '',
          userType: 'Player',
          phone: '',
          country: '',
        });
      }

      // Navigate after success
      navigate(afterAuthRedirectTo, { replace: true });
    } catch (err: any) {
      const msg = err?.message || 'An error occurred';
      if (msg.includes('User already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Network connection failed')
      ) {
        setError(
          'Unable to connect to the server. Please ensure Supabase is configured and try again.'
        );
      } else if (msg.includes('Invalid login credentials')) {
        setError('Invalid email or password.');
      } else if (msg.includes('Missing Supabase environment variables')) {
        setError('Database connection not configured. Please connect to Supabase first.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setError('Please enter your email address first');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetEmailSent(true);
    } catch {
      setError('Failed to send reset email. Please check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const switchAuthMode = () => {
    // If we are on dedicated routes, navigate between them instead of toggling local state
    if (onLoginRoute) {
      navigate('/register');
      return;
    }
    if (onRegisterRoute) {
      navigate('/login');
      return;
    }
    // Embedded usage: just toggle
    setIsLogin((s) => !s);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-emerald-100 rounded-full">
              <Activity className="h-8 w-8 text-emerald-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BadmintonHub</h1>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Welcome back!' : 'Join the community'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
            {error.includes('Supabase') && (
              <p className="text-red-600 text-xs mt-2">
                Click the “Connect to Supabase” button in the top right to set up your connection.
              </p>
            )}
          </div>
        )}

        {resetEmailSent && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">
              Password reset email sent! Check your inbox and follow the instructions.
            </p>
          </div>
        )}

        {/* Forgot Password Link (only in login) */}
        {isLogin && (
          <div className="text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-emerald-600 hover:text-emerald-700 text-sm"
            >
              Forgot your password?
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Type
                </label>
                <select
                  value={formData.userType}
                  onChange={(e) =>
                    setFormData({ ...formData, userType: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="Player">Player</option>
                  <option value="Club">Club</option>
                  <option value="Organizer">Organizer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.userType === 'Player'
                    ? 'Full Name'
                    : formData.userType === 'Club'
                    ? 'Club Name'
                    : 'Organization Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter your name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Country (Optional)
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    disabled={countriesLoading}
                  >
                    <option value="">
                      {countriesLoading ? 'Loading...' : 'Select country'}
                    </option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={switchAuthMode}
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};
