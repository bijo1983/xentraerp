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
        // ---- LOGIN ----
        await signIn(formData.email, formData.password);
        navigate(afterAuthRedirectTo, { replace: true });
      } else {
        // ---- SIGNUP ----
        const status = await signUp(formData.email, formData.password, {
          name: formData.name,
          userType: formData.userType as 'Player' | 'Club' | 'Organizer',
          phone_number: formData.phone || null,
          country_id: formData.country || null,
          // (address/website/company_name/skill_level not collected here)
        });

        if (status === 'needs_verification') {
          // Show verify instructions page (no dashboard yet)
          setFormData({
            email: '',
            password: '',
            name: '',
            userType: 'Player',
            phone: '',
            country: '',
          });
          navigate('/check-email', { replace: true });
          return;
        }

        // Auto-confirm environments land here
        navigate(afterAuthRedirectTo, { replace: true });
      }
    } catch (err: any) {
      // Handle store’s EmailNotVerifiedError specially
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/check-email', { replace: true });
        setLoading(false);
        return;
      }

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
    if (onLoginRoute) {
      navigate('/register');
      return;
    }
    if (onRegisterRoute) {
      navigate('/login');
      return;
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Badminton Booking</h1>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Welcome back!' : 'Join the community'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {resetEmailSent && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">
              Password reset email sent! Check your inbox and follow the instructions.
            </p>
          </div>
        )}

        {isLogin && (
          <div className="text-
