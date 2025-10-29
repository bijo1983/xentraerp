import React from 'react';
import { PageMetadata } from '../seo/PageMetadata';
import { Link } from 'react-router-dom';

const FAQ_KEYWORDS = [
  'badminton booking faq',
  'badminton court software questions',
  'badminton tournament platform help',
];

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does Badminton Booking improve day-to-day operations?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Administrators can monitor utilisation, approve reservation requests, and reconcile payments from a central dashboard designed specifically for badminton facilities.',
      },
    },
    {
      '@type': 'Question',
      name: 'What size of badminton organisation is supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The platform scales from local community groups and academies to national federations that require multi-club oversight and multi-venue scheduling.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do players need an account to book courts?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Players can create a profile, join clubs, and manage personal reservations, ensuring accurate participant records and secure payments for every court booking.',
      },
    },
  ],
};

export const FAQPage: React.FC = () => {
  return (
    <>
      <PageMetadata
        title="Badminton Booking FAQs"
        description="Find answers to common questions about Badminton Booking, including features for clubs, organisers, and community groups."
        path="/faq"
        keywords={FAQ_KEYWORDS}
        structuredData={FAQ_SCHEMA}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">
        <header className="bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Frequently Asked Questions</h1>
            <p className="mt-3 text-slate-600 max-w-2xl">
              Explore how Badminton Booking supports clubs, organisers, and communities with real-time scheduling, tournament workflows, and member communication tools.
            </p>
            <div className="mt-4">
              <Link to="/" className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                ← Back to home
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <dl className="space-y-6 text-sm sm:text-base text-gray-700 bg-white/80 backdrop-blur border border-gray-100 rounded-2xl shadow-sm p-6 sm:p-10">
              <div>
                <dt className="text-lg font-semibold text-gray-900">
                  How does Badminton Booking improve day-to-day operations?
                </dt>
                <dd className="mt-2 text-gray-600">
                  Administrators can monitor utilisation, approve reservation requests, and reconcile payments from a central dashboard designed specifically for badminton facilities.
                </dd>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <dt className="text-lg font-semibold text-gray-900">
                  What size of badminton organisation is supported?
                </dt>
                <dd className="mt-2 text-gray-600">
                  The platform scales from local community groups and academies to national federations that require multi-club oversight and multi-venue scheduling.
                </dd>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <dt className="text-lg font-semibold text-gray-900">
                  Do players need an account to book courts?
                </dt>
                <dd className="mt-2 text-gray-600">
                  Yes. Players can create a profile, join clubs, and manage personal reservations, ensuring accurate participant records and secure payments for every court booking.
                </dd>
              </div>
            </dl>
          </section>
        </main>
      </div>
    </>
  );
};

export default FAQPage;
