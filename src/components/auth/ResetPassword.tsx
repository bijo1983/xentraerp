import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Footer } from '../layout/Footer';
import { PageMetadata } from '../seo/PageMetadata';

const RESET_KEYWORDS = [
  'badminton booking password reset',
  'badminton club software reset password',
  'reset badminton booking account password',
  'badminton tournament software password recovery',
];

type Stage = 'request' | 'otp' | 'password' | 'success';

const emailRegex = /.+@.+\..+/;

export const ResetPassword: React.FC = () => {
  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resetErrors = () => {
    setError(null);
    setMessage(null);
  };

  const handleSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setError('Enter a valid email address to continue.');
      return;
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        if (otpError.message?.toLowerCase().includes('email rate limit exceeded')) {
          setError('Too many attempts. Please wait a moment before trying again.');
        } else {
          setError(otpError.message || 'Unable to send reset code. Please try again.');
        }
        return;
      }

      setStage('otp');
      setMessage(`We sent a 6-digit code to ${trimmedEmail}. Enter it below to continue.`);
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch')) {
        setError('Unable to reach the server. Check your Supabase configuration and try again.');
      } else {
        setError(err?.message || 'Unable to send reset code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();

    const trimmedEmail = email.trim().toLowerCase();
    const cleanToken = token.replace(/\D/g, '').trim();

    if (!cleanToken || cleanToken.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanToken,
        type: 'email',
      });

      if (verifyError) {
        if ((verifyError as any)?.status === 400) {
          setError('Invalid or expired code. Request a new one and try again.');
        } else {
          setError(verifyError.message || 'Verification failed. Please try again.');
        }
        return;
      }

      setStage('password');
      setMessage('Verification successful! Create a new password below.');
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch')) {
        setError('Unable to verify at the moment. Check your Supabase configuration and try again.');
      } else {
        setError(err?.message || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message || 'Could not update password. Please try again.');
        return;
      }

      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore sign out errors */
      }

      setStage('success');
      setMessage('Your password has been updated successfully. You can now sign in with the new password.');
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch')) {
        setError('Unable to update password. Check your Supabase configuration and try again.');
      } else {
        setError(err?.message || 'Could not update password. Please try again.');
      }
    } finally {
      setLoading(false);
      setPassword('');
      setConfirmPassword('');
    }
  };

  const renderRequestStage = () => (
    <form onSubmit={handleSendOtp} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="you@example.com"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition"
      >
        {loading ? 'Sending code…' : 'Send reset code'}
      </button>
    </form>
  );

  const renderOtpStage = () => (
    <form onSubmit={handleVerifyOtp} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">6-digit code</label>
        <input
          inputMode="numeric"
          maxLength={6}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest"
          placeholder="••••••"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition"
      >
        {loading ? 'Verifying…' : 'Verify code'}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setStage('request');
          setToken('');
          setMessage(null);
        }}
        className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        Resend code
      </button>
    </form>
  );

  const renderPasswordStage = () => (
    <form onSubmit={handleUpdatePassword} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">New password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter a new password"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Re-enter your new password"
          minLength={8}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition"
      >
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );

  const renderSuccessStage = () => (
    <div className="space-y-6 text-center">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-700 text-sm">{message}</p>
      </div>
      <Link
        to="/login"
        className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-3 transition"
      >
        Return to sign in
      </Link>
    </div>
  );

  const instructions = {
    request: 'Enter your email address and we will send you a verification code.',
    otp: 'Check your inbox for the 6-digit code we just sent.',
    password: 'Enter and confirm your new password to finish resetting.',
    success: 'All set! Your password has been updated.',
  }[stage];

  return (
    <>
      <PageMetadata
        title="Reset your Badminton Booking password"
        description="Recover access to your Badminton Booking account by verifying your email and choosing a new password."
        path="/reset-password"
        keywords={RESET_KEYWORDS}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-8 space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
                <p className="text-sm text-gray-600">{instructions}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
              )}

              {message && !error && stage !== 'success' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">{message}</div>
              )}

              {stage === 'request' && renderRequestStage()}
              {stage === 'otp' && renderOtpStage()}
              {stage === 'password' && renderPasswordStage()}
              {stage === 'success' && renderSuccessStage()}

              {(stage === 'otp' || stage === 'password') && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setStage('request');
                    setToken('');
                    setPassword('');
                    setConfirmPassword('');
                    setMessage(null);
                  }}
                  className="w-full text-xs text-gray-500 hover:text-gray-700"
                >
                  Use a different email
                </button>
              )}

              <div className="text-center text-sm text-gray-600">
                Remembered your password?{' '}
                <Link to="/login" className="text-blue-600 hover:text-blue-800 font-semibold">
                  Back to sign in
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

export default ResetPassword;
