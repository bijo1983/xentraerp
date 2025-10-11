import React, { useState } from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

export const AuthForm: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  
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

  React.useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      try {
        console.log('Fetching countries...');
        
        // Simple direct query without connection test
        const { data, error } = await supabase
          .from('countries')
          .select('id, name, code')
          .order('name');
        
        console.log('Countries response:', { data, error });
        
        if (error) {
          console.error('Error fetching countries:', error);
          // Don't show error for countries - it's optional
          setCountries([]);
        } else if (data) {
          console.log(`Loaded ${data.length} countries`);
          setCountries(data);
        } else {
          console.warn('No countries data received');
          setCountries([]);
        }
      } catch (err: any) {
        console.error('Failed to fetch countries:', err);
        // Don't show error for countries - it's optional
        setCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    };
    
    // Only fetch countries if not in login mode
    if (!isLogin) {
      fetchCountries();
    }
  }, [isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signIn(formData.email, formData.password);
      } else {
        console.log('Submitting signup with data:', {
          email: formData.email,
          userType: formData.userType,
          name: formData.name,
          phone_number: formData.phone,
          country_id: formData.country,
        });

        await signUp(formData.email, formData.password, {
          name: formData.name,
          userType: formData.userType,
          phone_number: formData.phone,
          country_id: formData.country,
        });
        
        // Clear form after successful signup
        setFormData({
          email: '',
          password: '',
          name: '',
          userType: 'Player',
          phone: '',
          country: '',
        });
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      const errorMessage = err.message || 'An error occurred';
      
      // Handle specific error types
      if (errorMessage.includes('User already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('Network connection failed')) {
        setError('Unable to connect to the server. Please ensure you have connected to Supabase and try again.');
      } else if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (errorMessage.includes('Missing Supabase environment variables')) {
        setError('Database connection not configured. Please connect to Supabase first.');
      } else {
        setError(errorMessage);
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
      setError('');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Failed to send reset email. Please check your email address.');
    } finally {
      setLoading(false);
    }
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
            {error.includes('connect to Supabase') && (
              <p className="text-red-600 text-xs mt-2">
                Click the "Connect to Supabase" button in the top right corner to set up your database connection.
              </p>
            )}
          </div>
        )}

        {resetEmailSent && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">
              Password reset email sent! Check your inbox and follow the instructions to reset your password.
            </p>
          </div>
        )}

        {/* Forgot Password Link */}
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
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
                  onChange={(e) => {
                    console.log('User type changed to:', e.target.value);
                    setFormData({ ...formData, userType: e.target.value });
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="Player">Player</option>
                  <option value="Club">Club</option>
                  <option value="Organizer">Organizer</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {formData.userType}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.userType === 'Player' ? 'Full Name' : 
                   formData.userType === 'Club' ? 'Club Name' : 'Organization Name'}
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
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                  {countriesLoading && (
                    <p className="text-xs text-gray-500 mt-1">Loading countries...</p>
                  )}
                  {!countriesLoading && countries.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Countries will load after connecting to Supabase
                    </p>
                  )}
                  {!countriesLoading && countries.length > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      {countries.length} countries available
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(''); // Clear any existing errors when switching
            }}
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};