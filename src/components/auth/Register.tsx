import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthForm } from './AuthForm';

const Register: React.FC = () => {
  const AuthFormAny = AuthForm as any;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-600">Sign up to continue</p>
        </div>

        <AuthFormAny initialMode="signup" />

        {/* ✅ Add this footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-gray-600 text-sm mb-2">Already have an account?</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 font-semibold transition-colors"
          >
            Sign in
          </Link>

          {/* Or programmatic navigation if you prefer a button:
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-800 font-semibold"
          >
            Sign in
          </button>
          */}
        </div>
      </div>
    </div>
  );
};

export default Register;
