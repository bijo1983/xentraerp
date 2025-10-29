import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, MapPin, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export const LandingPage: React.FC = () => {
  const { userProfile } = useAuthStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="text-xl font-bold text-slate-900 tracking-tight">
            Badminton Booking
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600 sm:hidden">
            <Link to="/" className="hover:text-slate-900 transition-colors">
              Home
            </Link>
            <Link to="/login" className="hover:text-slate-900 transition-colors">
              Login
            </Link>
            <a href="#contact" className="hover:text-slate-900 transition-colors">
              Contact Us
            </a>
          </nav>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-600">
            <Link to="/" className="hover:text-slate-900 transition-colors">
              Home
            </Link>
            <Link to="/login" className="hover:text-slate-900 transition-colors">
              Login
            </Link>
            <a href="#contact" className="hover:text-slate-900 transition-colors">
              Contact Us
            </a>
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
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600 transition"
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
              <p className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 shadow">
                Seamless court scheduling
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
                Organize and book badminton courts without the back-and-forth.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
                Manage your club, tournaments, and player bookings in one intuitive dashboard inspired by the simplicity of leading booking platforms like AllBooked. Give players the power to reserve courts instantly while keeping operations running smoothly.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-600 transition"
                >
                  Create your free account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900 transition"
                >
                  Sign in
                </Link>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur shadow-xl rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-100">
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
                  <CalendarCheck className="h-6 w-6 text-emerald-500 mb-3" />
                  <h3 className="text-base font-semibold text-slate-900">Smart scheduling</h3>
                  <p>Open or block time slots, manage tournaments, and keep track of every booking.</p>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 shadow-sm">
                  <MapPin className="h-6 w-6 text-sky-500 mb-3" />
                  <h3 className="text-base font-semibold text-slate-900">Club visibility</h3>
                  <p>Help players discover courts nearby and promote your facilities effortlessly.</p>
                </div>
                <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4 shadow-sm">
                  <ShieldCheck className="h-6 w-6 text-purple-500 mb-3" />
                  <h3 className="text-base font-semibold text-slate-900">Secure access</h3>
                  <p>Role-based dashboards ensure organizers, clubs, and players have the tools they need.</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900">Always in sync</h3>
                  <p>Real-time updates keep everyone aligned on schedules and results.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-white/90 border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">We&apos;re here to help</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Questions about onboarding your club or organizing a tournament? Reach out and our team will make sure you get started the right way.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 text-sm text-slate-700">
              <a href="mailto:support@badmintonbooking.com" className="rounded-full border border-slate-300 px-5 py-3 hover:border-slate-400 hover:text-slate-900 transition">
                support@badmintonbooking.com
              </a>
              <span className="text-slate-400">|</span>
              <a href="tel:+1234567890" className="rounded-full border border-slate-300 px-5 py-3 hover:border-slate-400 hover:text-slate-900 transition">
                +1 (234) 567-890
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 text-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <p>&copy; {new Date().getFullYear()} Badminton Booking. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-white transition">
              Login
            </Link>
            <Link to="/register" className="hover:text-white transition">
              Sign Up
            </Link>
            <a href="#contact" className="hover:text-white transition">
              Contact Us
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
