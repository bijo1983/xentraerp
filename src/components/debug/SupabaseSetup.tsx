import React, { useState } from 'react';
import { Database, Key, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

export const SupabaseSetup: React.FC = () => {
  const [step, setStep] = useState(1);
  const [projectUrl, setProjectUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');

  const hasEnvVars = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (hasEnvVars) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-green-900 mb-2">Database Connected!</h2>
          <p className="text-green-700">Your Supabase database is properly configured.</p>
          <div className="mt-4 p-3 bg-green-100 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Project URL:</strong> {import.meta.env.VITE_SUPABASE_URL}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <Database className="h-16 w-16 text-blue-600 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect to Supabase</h1>
        <p className="text-gray-600">Set up your database connection to get started</p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-xl border-2 ${step >= 1 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <div className="flex items-center mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${step >= 1 ? 'bg-blue-500' : 'bg-gray-400'}`}>
              1
            </div>
            <h3 className="ml-3 font-semibold text-gray-900">Create Project</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Sign up for Supabase and create a new project
          </p>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-800"
          >
            <span>Go to Supabase</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className={`p-6 rounded-xl border-2 ${step >= 2 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <div className="flex items-center mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${step >= 2 ? 'bg-blue-500' : 'bg-gray-400'}`}>
              2
            </div>
            <h3 className="ml-3 font-semibold text-gray-900">Get Credentials</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Copy your project URL and anon key from Settings → API
          </p>
          <button
            onClick={() => setStep(2)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            I have my credentials
          </button>
        </div>

        <div className={`p-6 rounded-xl border-2 ${step >= 3 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <div className="flex items-center mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${step >= 3 ? 'bg-blue-500' : 'bg-gray-400'}`}>
              3
            </div>
            <h3 className="ml-3 font-semibold text-gray-900">Configure</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Enter your credentials to connect the database
          </p>
          <button
            onClick={() => setStep(3)}
            disabled={step < 2}
            className="text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400"
          >
            Configure now
          </button>
        </div>
      </div>

      {/* Configuration Form */}
      {step >= 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Key className="h-5 w-5 text-blue-600 mr-2" />
            Database Configuration
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project URL
              </label>
              <input
                type="url"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://https://ikadkbzaeqqtamnkgowu.supabase.co"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in your Supabase project settings under API → Project URL
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Anon Key
              </label>
              <textarea
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in your Supabase project settings under API → Project API keys → anon public
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
                <div>
                  <h3 className="font-medium text-yellow-900">Next Steps</h3>
                  <p className="text-sm text-yellow-800 mt-1">
                    After entering your credentials, click the "Connect to Supabase" button in the top right corner of the screen to establish the connection.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Environment Variables</h3>
              <p className="text-sm text-blue-800 mb-3">
                Create a <code className="bg-blue-100 px-1 rounded">.env</code> file in your project root with:
              </p>
              <pre className="bg-blue-100 p-3 rounded text-sm overflow-x-auto">
{`VITE_SUPABASE_URL=${projectUrl || 'your_project_url_here'}
VITE_SUPABASE_ANON_KEY=${anonKey || 'your_anon_key_here'}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Need Help?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">Finding Your Credentials</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Go to your Supabase project dashboard</li>
              <li>Click on "Settings" in the sidebar</li>
              <li>Navigate to "API" section</li>
              <li>Copy the "Project URL" and "anon public" key</li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">Database Schema</h4>
            <p className="text-gray-600">
              The database schema will be automatically created when you connect. 
              It includes tables for users, tournaments, courts, bookings, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};