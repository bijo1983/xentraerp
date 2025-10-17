import React, { useEffect, useState } from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { UserType } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

type AuthFormProps = {
  /** Force starting mode. If omitted, defaults to 'login'. */
  initialMode?: 'login' | 'signup';
  /** Where to go after password sign-in succeeds (defaults to '/'). */
  afterAuthRedirectTo?: string;
};

type SignupUserType = 'Player' | 'Club' | 'Organizer' | 'Group';

export const AuthForm: React.FC<AuthFormProps> = ({
  initialMode = 'login',
  afterAuthRedirectTo = '/',
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const onLoginRoute = location.pathname === '/login';
  const onRegisterRoute = location.pathname === '/register';

  const [isLogin, setIsLogin] = useState(
    onLoginRoute ? true : onRegisterRoute ? false : initialMode !== 'signup'
  );

  // OTP stage handling (for signup only)
  const [stage, setStage] = useState<'form' | 'otp'>('form');
  const [otpCode, setOtpCode] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [error, setError] = useState<string>('');

  const [formData, setFormData] = useState<{
    email: string;
    password: string;
    name: string;
    userType: SignupUserType;
    phone: string;
    country: string;
    clubId: string;
    notes: string;
  }>({
    email: '',
    password: '',
    name: '',
    userType: 'Player',
    phone: '',
    country: '',
    clubId: '',
    notes: '',
  });

  const [countries, setCountries] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);

  const requiresCountry =
    formData.userType === 'Player' ||
    formData.userType === 'Club' ||
    formData.userType === 'Organizer' ||
    formData.userType === 'Group';

  // store actions + status message
  const { signIn, sendEmailOtp, verifyEmailOtp, status, message } = useAuthStore();

  // Keep local mode in sync if initialMode prop changes
  useEffect(() => {
    if (!onLoginRoute && !onRegisterRoute) {
      setIsLogin(initialMode !== 'signup');
      setStage('form');
      setOtpCode('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  // If store says verification is done → redirect to /login with banner
  useEffect(() => {
    if (status === 'verified_required_login') {
      navigate('/login', {
        replace: true,
        state: {
          verifiedMessage:
            message || 'Verification successful. Please sign in with your email and password.',
        },
      });
    }
  }, [status, message, navigate]);

  // Show "verified" banner on login page if redirected
  const verifiedMessage =
    (location.state as any)?.verifiedMessage && isLogin ? (location.state as any).verifiedMessage : null;

  // Load countries only for signup mode
  useEffect(() => {
    const fetchCountries = async () => {
      setCountriesLoading(true);
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('id, name, code')
          .order('name');
        if (error || !data) setCountries([]);
        else setCountries(data);
      } catch {
        setCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    };
    if (!isLogin) fetchCountries();
  }, [isLogin]);

  useEffect(() => {
    const loadClubsForCountry = async () => {
      if (isLogin || formData.userType !== 'Group' || !formData.country) {
        setClubs([]);
        if (formData.clubId || formData.notes) {
          setFormData((prev) => ({ ...prev, clubId: '', notes: '' }));
        }
        return;
      }

      setClubsLoading(true);
      try {
        const { data, error } = await supabase
          .from('club_users')
          .select('id, club_name, approval_status, is_visible')
          .eq('country_id', formData.country)
          .order('club_name');

        if (error) {
          console.error('[AuthForm] failed to load clubs', error);
          setClubs([]);
          return;
        }

        const approved = (data ?? []).filter((club) =>
          (club as any).approval_status === 'approved' && ((club as any).is_visible ?? true)
        );
        setClubs(approved);

        if (formData.clubId && !approved.some((club) => club.id === formData.clubId)) {
          setFormData((prev) => ({ ...prev, clubId: '' }));
        }
      } catch (err) {
        console.error('[AuthForm] loadClubsForCountry exception', err);
        setClubs([]);
      } finally {
        setClubsLoading(false);
      }
    };

    void loadClubsForCountry();
  }, [isLogin, formData.userType, formData.country, formData.clubId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // ---- LOGIN (password) ----
        await signIn(formData.email, formData.password);
        navigate(afterAuthRedirectTo, { replace: true });
      } else {
        // ---- SIGNUP (OTP flow) ----
        if (stage === 'form') {
          // Require password before OTP (min length enforced in UI & store)
          if (!formData.password || formData.password.length < 8) {
            setError('Password is required (min 8 characters).');
            setLoading(false);
            return;
          }

          if (requiresCountry && !formData.country) {
            setError('Please select your country.');
            setLoading(false);
            return;
          }

          const selectedType = formData.userType as UserType;
          await sendEmailOtp(formData.email, formData.password, {
            userType: selectedType,
            profile_type: selectedType,
            name: formData.name,
            phone_number: formData.phone || null,
            country_id: requiresCountry ? formData.country : null,
            club_id: selectedType === 'Group' ? formData.clubId || null : null,
            notes: selectedType === 'Group' ? formData.notes || null : null,
          });

          setStage('otp');
          setLoading(false);
          return;
        }

        if (stage === 'otp') {
          // Verify code (store signs user out and flips status → useEffect will redirect)
          await verifyEmailOtp(formData.email, otpCode);
          // We don't navigate here; we let the status effect above redirect to /login
          return;
        }
      }
    } catch (err: any) {
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/check-email', { replace: true });
        setLoading(false);
        return;
      }

      const msg = err?.message || 'An error occurred';
      if (msg.includes('User already registered') && stage === 'form') {
        setError('This email is already registered. Please sign in instead.');
      } else if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Network connection failed')
      ) {
        setError('Unable to connect to the server. Please ensure Supabase is configured and try again.');
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
    setStage('form');
    setOtpCode('');
    setError('');
  };

  const goBackToForm = () => {
    setStage('form');
    setOtpCode('');
    setError('');
  };

  // Resend OTP — requires the same password again (enforced)
  const handleResendOtp = async () => {
    try {
      setLoading(true);
      setError('');

      if (!formData.password || formData.password.length < 8) {
        setError('Password is required (min 8 characters) to resend the code.');
        return;
      }

      if (requiresCountry && !formData.country) {
        setError('Please select your country before resending the code.');
        return;
      }

      const selectedType = formData.userType as UserType;
      await sendEmailOtp(formData.email, formData.password, {
        userType: selectedType,
        profile_type: selectedType,
        name: formData.name,
        phone_number: formData.phone || null,
        country_id: requiresCountry ? formData.country : null,
        club_id: selectedType === 'Group' ? formData.clubId || null : null,
        notes: selectedType === 'Group' ? formData.notes || null : null,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const canSubmitSignupForm =
    !isLogin &&
    stage === 'form' &&
    formData.email &&
    formData.name &&
    formData.password.length >= 8 &&
    (!requiresCountry || !!formData.country);

  const canSubmitOtp =
    !isLogin && stage === 'otp' && otpCode && otpCode.length === 6;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary-50 rounded-full">
              <Activity className="h-8 w-8 text-primary-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Badminton Booking</h1>
          <p className="text-text-secondary mt-2">
            {isLogin ? 'Welcome back!' : stage === 'form' ? 'Join the community' : 'Check your email and enter the code'}
          </p>
        </div>

        {/* Success banner after redirect from verification */}
        {verifiedMessage && isLogin && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">{verifiedMessage}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {resetEmailSent && isLogin && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">
              Password reset email sent! Check your inbox and follow the instructions.
            </p>
          </div>
        )}

        {isLogin && (
          <div className="text-center mb-4">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-primary-500 hover:text-primary-600 text-sm"
            >
              Forgot your password?
            </button>
          </div>
        )}

        {/* ========================== FORM / OTP VIEWS ========================== */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ---------------------------- LOGIN VIEW ---------------------------- */}
          {isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* --------------------------- SIGNUP FORM VIEW ----------------------- */}
          {!isLogin && stage === 'form' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  User Type
                </label>
                <select
                  value={formData.userType}
                  onChange={(e) => {
                    const nextType = e.target.value as SignupUserType;
                    setFormData((prev) => ({
                      ...prev,
                      userType: nextType,
                      clubId: nextType === 'Group' ? prev.clubId : '',
                      notes: nextType === 'Group' ? prev.notes : '',
                    }));
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="Player">Player</option>
                  <option value="Club">Club</option>
                  <option value="Organizer">Organizer</option>
                  <option value="Group">Group</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  {formData.userType === 'Player'
                    ? 'Full Name'
                    : formData.userType === 'Club'
                    ? 'Club Name'
                    : formData.userType === 'Organizer'
                    ? 'Organization Name'
                    : formData.userType === 'Group'
                    ? 'Group Name'
                    : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter your name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    {requiresCountry ? 'Country *' : 'Country (Optional)'}
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => {
                      setFormData({ ...formData, country: e.target.value });
                      if (error?.toLowerCase().includes('country')) {
                        setError('');
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    disabled={countriesLoading}
                    required={requiresCountry}
                  >
                    <option value="" disabled={requiresCountry}>
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

              {formData.userType === 'Group' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Select Club (Optional)
                    </label>
                    <select
                      value={formData.clubId}
                      onChange={(e) => setFormData({ ...formData, clubId: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      disabled={clubsLoading || !formData.country}
                    >
                      <option value="">
                        {clubsLoading
                          ? 'Loading clubs...'
                          : formData.country
                          ? 'Select club'
                          : 'Select a country first'}
                      </option>
                      {clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.club_name}
                        </option>
                      ))}
                    </select>
                    {!clubsLoading && formData.country && clubs.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        No approved clubs found in the selected country yet.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Group Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Describe your group or recurring needs"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ----------------------------- OTP VIEW ---------------------------- */}
          {!isLogin && stage === 'otp' && (
            <>
              <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700">
                We’ve sent a 6-digit verification code to <b>{formData.email}</b>. Enter it below.
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="tracking-widest text-center text-lg w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="______"
                />
                <p className="text-xs text-text-secondary mt-2">
                  Didn’t get it?{' '}
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-primary-500 hover:text-primary-600 font-medium"
                    disabled={loading}
                  >
                    Resend code
                  </button>
                </p>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={goBackToForm}
                  className="text-sm text-text-secondary hover:text-text-primary"
                  disabled={loading}
                >
                  Edit details
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              (isLogin ? false : stage === 'form' ? !canSubmitSignupForm : !canSubmitOtp)
            }
            className="w-full bg-primary-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Please wait...'
              : isLogin
              ? 'Sign In'
              : stage === 'form'
              ? 'Create Account'
              : 'Verify & Continue'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={switchAuthMode}
            className="text-primary-500 hover:text-primary-600 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
