import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader, Database, Key, Globe, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VerificationResult {
  test: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

export const SupabaseVerification: React.FC = () => {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const updateResult = (test: string, status: VerificationResult['status'], message: string, details?: any) => {
    setResults(prev => {
      const existing = prev.find(r => r.test === test);
      const newResult = { test, status, message, details };
      
      if (existing) {
        return prev.map(r => r.test === test ? newResult : r);
      } else {
        return [...prev, newResult];
      }
    });
  };

  const runVerification = async () => {
    setIsRunning(true);
    setResults([]);

    // Test 1: Environment Variables
    updateResult('env', 'pending', 'Checking environment variables...');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        updateResult('env', 'error', 'Missing environment variables', {
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
          urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined'
        });
      } else {
        updateResult('env', 'success', 'Environment variables found', {
          url: `${supabaseUrl.substring(0, 30)}...`,
          keyLength: supabaseKey.length
        });
      }
    } catch (error) {
      updateResult('env', 'error', 'Error checking environment variables', error);
    }

    // Test 2: Network Connectivity
    updateResult('network', 'pending', 'Testing network connectivity...');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          }
        });
        
        if (response.ok) {
          updateResult('network', 'success', 'Network connectivity successful', {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries())
          });
        } else {
          updateResult('network', 'error', `Network request failed: ${response.status}`, {
            status: response.status,
            statusText: response.statusText
          });
        }
      }
    } catch (error: any) {
      updateResult('network', 'error', 'Network connectivity failed', {
        message: error.message,
        type: error.constructor.name
      });
    }

    // Test 3: Supabase Client Initialization
    updateResult('client', 'pending', 'Testing Supabase client...');
    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      
      if (error) {
        updateResult('client', 'error', 'Supabase client error', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
      } else {
        updateResult('client', 'success', 'Supabase client working', { data });
      }
    } catch (error: any) {
      updateResult('client', 'error', 'Supabase client exception', {
        message: error.message,
        stack: error.stack
      });
    }

    // Test 4: Database Tables
    updateResult('tables', 'pending', 'Checking database tables...');
    try {
      const tables = ['profiles', 'countries', 'player_users', 'club_users', 'organizer_users'];
      const tableResults = {};
      
      for (const table of tables) {
        try {
          const { data, error } = await supabase.from(table).select('*').limit(1);
          tableResults[table] = error ? { error: error.message } : { success: true, count: data?.length || 0 };
        } catch (err: any) {
          tableResults[table] = { error: err.message };
        }
      }
      
      const hasErrors = Object.values(tableResults).some((result: any) => result.error);
      
      if (hasErrors) {
        updateResult('tables', 'warning', 'Some tables have issues', tableResults);
      } else {
        updateResult('tables', 'success', 'All tables accessible', tableResults);
      }
    } catch (error: any) {
      updateResult('tables', 'error', 'Database tables check failed', error);
    }

    // Test 5: Authentication
    updateResult('auth', 'pending', 'Testing authentication system...');
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        updateResult('auth', 'warning', 'Auth check completed with error', {
          message: error.message,
          currentUser: user?.email || 'none'
        });
      } else {
        updateResult('auth', 'success', 'Authentication system working', {
          currentUser: user?.email || 'none',
          isAuthenticated: !!user
        });
      }
    } catch (error: any) {
      updateResult('auth', 'error', 'Authentication test failed', error);
    }

    // Test 6: RLS Policies
    updateResult('rls', 'pending', 'Testing Row Level Security...');
    try {
      // Test public access to countries (should work)
      const { data: countriesData, error: countriesError } = await supabase
        .from('countries')
        .select('*')
        .limit(5);
      
      // Test access to profiles (should work)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      const rlsResults = {
        countries: countriesError ? { error: countriesError.message } : { success: true, count: countriesData?.length },
        profiles: profilesError ? { error: profilesError.message } : { success: true, count: profilesData?.length }
      };
      
      const hasRlsErrors = Object.values(rlsResults).some((result: any) => result.error);
      
      if (hasRlsErrors) {
        updateResult('rls', 'error', 'RLS policies blocking access', rlsResults);
      } else {
        updateResult('rls', 'success', 'RLS policies working correctly', rlsResults);
      }
    } catch (error: any) {
      updateResult('rls', 'error', 'RLS test failed', error);
    }

    setIsRunning(false);
  };

  useEffect(() => {
    runVerification();
  }, []);

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'pending':
        return <Loader className="h-5 w-5 text-blue-600 animate-spin" />;
    }
  };

  const getStatusColor = (status: VerificationResult['status']) => {
    switch (status) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'pending':
        return 'border-blue-200 bg-blue-50';
    }
  };

  const getTestIcon = (test: string) => {
    switch (test) {
      case 'env':
        return <Key className="h-5 w-5" />;
      case 'network':
        return <Globe className="h-5 w-5" />;
      case 'client':
        return <Database className="h-5 w-5" />;
      case 'tables':
        return <Database className="h-5 w-5" />;
      case 'auth':
        return <Shield className="h-5 w-5" />;
      case 'rls':
        return <Shield className="h-5 w-5" />;
      default:
        return <CheckCircle className="h-5 w-5" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Supabase Connection Verification</h1>
        <p className="text-blue-100">Comprehensive testing of your Supabase setup and connectivity</p>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Verification Results</h2>
        <button
          onClick={runVerification}
          disabled={isRunning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? 'Running Tests...' : 'Run Tests Again'}
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result) => (
          <div
            key={result.test}
            className={`border-2 rounded-lg p-4 ${getStatusColor(result.status)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                {getTestIcon(result.test)}
                <h3 className="font-semibold text-gray-900 capitalize">
                  {result.test === 'env' ? 'Environment Variables' :
                   result.test === 'network' ? 'Network Connectivity' :
                   result.test === 'client' ? 'Supabase Client' :
                   result.test === 'tables' ? 'Database Tables' :
                   result.test === 'auth' ? 'Authentication' :
                   result.test === 'rls' ? 'Row Level Security' :
                   result.test}
                </h3>
              </div>
              {getStatusIcon(result.status)}
            </div>
            
            <p className="text-gray-700 mb-2">{result.message}</p>
            
            {result.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
                  View Details
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.filter(r => r.status === 'success').length}
              </div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {results.filter(r => r.status === 'warning').length}
              </div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {results.filter(r => r.status === 'error').length}
              </div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {results.filter(r => r.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-600">Running</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};