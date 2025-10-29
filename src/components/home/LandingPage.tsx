import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Calendar, Trophy, Users } from 'lucide-react';
import badmintonLogo from '../../assets/logo/badminton-booking-logo.svg';
import { Footer } from '../layout/Footer';
import { PageMetadata } from '../seo/PageMetadata';
import { useAuthStore } from '../../store/authStore';

const HOME_KEYWORDS = [
  'badminton booking software',
  'badminton club management',
  'badminton court reservation system',
  'badminton tournament software',
  'sports facility scheduling platform',
];

export const LandingPage: React.FC = () => {
  const { userProfile } = useAuthStore();

  return (
    <>
      <PageMetadata
        title="Badminton Booking | Court & Tournament Management"
        description="Streamline badminton court bookings, tournaments, and community management with Badminton Booking. Real-time availability, analytics, and communication tools in one platform."
        path="/"
        keywords={HOME_KEYWORDS}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">
        <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/" className="text-xl font-bold text-slate-900 tracking-tight">
              Badminton Booking
            </Link>

            <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600 sm:hidden">
              <Link to="/" className="hover:text-slate-900 transition-colors">
                Home
              </Link>
              <Link to="/faq" className="hover:text-slate-900 transition-colors">
                FAQ
              </Link>
              <Link to="/login" className="hover:text-slate-900 transition-colors">
                Login
              </Link>
            </nav>

            <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-600">
              <Link to="/" className="hover:text-slate-900 transition-colors">
                Home
              </Link>
              <Link to="/faq" className="hover:text-slate-900 transition-colors">
                FAQ
              </Link>
              <Link to="/login" className="hover:text-slate-900 transition-colors">
                Login
              </Link>
            </nav>

            <div className="flex items-center space-x-3">
              {userProfile ? (
                <Link
                  to="/dashboard"
                  className="hidden sm:inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 transition"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 transition"
                >
                  Sign Up
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="space-y-4">
                  <img
                    src={badmintonLogo}
                    alt="Badminton Booking logo"
                    className="h-12 w-auto sm:h-16"
                  />
                  <div className="flex items-center space-x-3">
                    <Activity className="h-10 w-10 text-blue-600" />
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
                      Badminton club management made simple
                    </h1>
                  </div>
                  <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
                    Bring bookings, competitions, and member communication into a single badminton-specific workspace. Eliminate double bookings, automate reminders, and keep every player informed.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Court Booking</h3>
                    <p className="text-sm text-gray-600">
                      Manage court schedules and bookings with real-time availability.
                    </p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                      <Trophy className="h-6 w-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Tournaments</h3>
                    <p className="text-sm text-gray-600">
                      Organize and manage tournaments with bracket generation.
                    </p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                      <Users className="h-6 w-6 text-orange-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Community</h3>
                    <p className="text-sm text-gray-600">
                      Connect players, clubs, and organizers in one place.
                    </p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-3">
                      <Activity className="h-6 w-6 text-cyan-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Analytics</h3>
                    <p className="text-sm text-gray-600">
                      Track bookings, payments, and performance metrics.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:block bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 text-white">
                  <p className="text-sm font-medium mb-1">Trusted by clubs and players</p>
                  <p className="text-2xl font-bold">Streamline your badminton operations</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition"
                  >
                    Create your free account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:text-blue-900 transition"
                  >
                    Sign in
                  </Link>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl shadow-xl p-6 sm:p-8 space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">Streamline your badminton operations</h2>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Real-time court availability with adjustable pricing and peak-hour controls. Tournament workflows covering registrations, draws, officiating checklists, and live scoring. Automated updates that keep badminton players engaged and insightful dashboards showing revenue, utilisation, and membership growth trends.
                </p>
                <ul className="space-y-3 text-sm sm:text-base text-gray-700">
                  <li className="flex items-start">
                    <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-blue-500"></span>
                    Real-time court availability with adjustable pricing and peak-hour controls.
                  </li>
                  <li className="flex items-start">
                    <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-green-500"></span>
                    Tournament workflows covering registrations, draws, officiating checklists, and live scoring.
                  </li>
                  <li className="flex items-start">
                    <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-orange-500"></span>
                    Automated email and SMS updates that keep badminton players engaged and informed.
                  </li>
                  <li className="flex items-start">
                    <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-cyan-500"></span>
                    Insightful dashboards showing revenue, utilisation, and membership growth trends.
                  </li>
                </ul>
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Looking for common questions? Explore our{' '}
                    <Link to="/faq" className="text-blue-600 hover:text-blue-800 font-semibold">
                      Frequently Asked Questions
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default LandingPage;
