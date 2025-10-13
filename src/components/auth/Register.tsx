import React from 'react';
import { AuthForm } from './AuthForm';

// We don't want to depend on AuthForm's TS props.
// If it supports `initialMode`, great; if not, this still renders.
const Register: React.FC = () => {
  const AuthFormAny = AuthForm as any;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-600">Sign up to continue</p>
        </div>
        {/* If AuthForm supports initialMode, it will open on sign up.
           If not, it still renders the normal AuthForm. */}
        <AuthFormAny initialMode="signup" />
      </div>
    </div>
  );
};

export default Register;