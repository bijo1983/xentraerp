import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthForm } from './AuthForm';
import badmintonLogo from '../../assets/logo/badminton-booking-logo.svg';
import { Footer } from '../layout/Footer';
import { PageMetadata } from '../seo/PageMetadata';

const REGISTER_KEYWORDS = [
  'badminton booking sign up',
  'badminton club software registration',
  'sports facility scheduling platform',
  'badminton tournament management software',
  'online court booking system',
];

const REGISTER_HOW_TO_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Create a Badminton Booking account',
  description: 'Sign up for Badminton Booking to manage courts, tournaments, and player communities from one dashboard.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Enter club or organiser details',
      text: 'Provide your organisation name, contact information, and location so players can find you in search results.',
    },
    {
      '@type': 'HowToStep',
      name: 'Configure courts and pricing',
      text: 'Set operating hours, pricing rules, and availability windows for each badminton court you manage.',
    },
    {
      '@type': 'HowToStep',
      name: 'Invite team members and launch',
      text: 'Send invites to coaches and administrators, publish tournaments, and start accepting online reservations.',
    },
  ],
};

const Register: React.FC = () => {
  const AuthFormAny = AuthForm as any;
  const navigate = useNavigate();

  return (
    <>
      <PageMetadata
        title="Create Your Badminton Booking Account"
        description="Register for Badminton Booking to streamline badminton court scheduling, tournament management, and member communications for your club or academy."
        path="/register"
        keywords={REGISTER_KEYWORDS}
        structuredData={REGISTER_HOW_TO_SCHEMA}
      />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <img
                src={badmintonLogo}
                alt="Badminton Booking logo"
                className="mx-auto mb-4 h-12 w-auto"
              />
              <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
              <p className="text-gray-600">Sign up to continue</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-left space-y-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Set up your badminton hub in minutes</h2>
              <p className="text-sm text-gray-600">
                Build a professional presence for your badminton club, academy, or event brand. Collect player registrations,
                publish competitions, and confirm bookings without spreadsheets or manual follow-up.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-blue-500"></span>
                  Showcase available courts with configurable pricing, surfaces, and amenities.
                </li>
                <li className="flex items-start">
                  <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-green-500"></span>
                  Automate tournament registrations, draw generation, and live scoring updates.
                </li>
                <li className="flex items-start">
                  <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-orange-500"></span>
                  Invite coaching staff and volunteers with secure access controls.
                </li>
              </ul>
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
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Register;
