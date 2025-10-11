import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function DatabaseConnection() {
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    database: string;
    url: string;
    tables: any[];
    clubUsers: any[];
    playerUsers: any[];
    authUsers: any[];
    error: string | null;
  }>({
    connected: false,
    database: '',
    url: '',
    tables: [],
    clubUsers: [],
    playerUsers: [],
    authUsers: [],
    error: null,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const url = import.meta.env.VITE_SUPABASE_URL || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

      const { data: clubUsers, error: clubError } = await supabase
        .from('club_users')
        .select('*');

      const { data: playerUsers, error: playerError } = await supabase
        .from('player_users')
        .select('*');

      const connected = !clubError && !playerError;
      const database = url.includes('ikadkbzaeqqtamnkgowu') ? 'ikadkbzaeqqtamnkgowu' : url.replace('https://', '').split('.')[0];

      setConnectionStatus({
        connected: connected,
        database: database,
        url: url,
        tables: [],
        clubUsers: clubUsers || [],
        playerUsers: playerUsers || [],
        authUsers: [],
        error: clubError?.message || playerError?.message || null,
      });
    } catch (err: any) {
      setConnectionStatus({
        connected: false,
        database: '',
        url: '',
        tables: [],
        clubUsers: [],
        playerUsers: [],
        authUsers: [],
        error: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking database connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Database Connection Details</h1>

          <div className="space-y-6">
            {/* Connection Status */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold mb-3">Connection Status</h2>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${connectionStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className={`font-medium ${connectionStatus.connected ? 'text-green-700' : 'text-red-700'}`}>
                  {connectionStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Database Info */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold mb-3">Database Information</h2>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div>
                  <span className="font-medium text-gray-700">Database URL:</span>
                  <p className="text-gray-900 font-mono text-sm break-all">{connectionStatus.url}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Database Name:</span>
                  <p className="text-gray-900 font-mono text-sm">{connectionStatus.database}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Expected Database:</span>
                  <p className="text-gray-900 font-mono text-sm">ikadkbzaeqqtamnkgowu</p>
                </div>
                {connectionStatus.database === 'ikadkbzaeqqtamnkgowu' ? (
                  <div className="text-green-600 font-medium">✓ Connected to correct database</div>
                ) : (
                  <div className="text-red-600 font-medium">✗ Wrong database connection</div>
                )}
              </div>
            </div>

            {/* Auth Users */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold mb-3">Auth Users ({connectionStatus.authUsers.length})</h2>
              {connectionStatus.authUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confirmed</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {connectionStatus.authUsers.map((user: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{user.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {user.email_confirmed_at ? '✓' : '✗'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(user.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-600">No auth users found</p>
              )}
            </div>

            {/* Club Users */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold mb-3">Club Users ({connectionStatus.clubUsers.length})</h2>
              {connectionStatus.clubUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Club Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {connectionStatus.clubUsers.map((club: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{club.club_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{club.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 font-mono text-xs">{club.user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-600">No club users found</p>
              )}
            </div>

            {/* Player Users */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold mb-3">Player Users ({connectionStatus.playerUsers.length})</h2>
              {connectionStatus.playerUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Full Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {connectionStatus.playerUsers.map((player: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{player.full_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{player.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 font-mono text-xs">{player.user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-600">No player users found</p>
              )}
            </div>

            {/* Error Display */}
            {connectionStatus.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-semibold mb-2">Error</h3>
                <p className="text-red-700 text-sm">{connectionStatus.error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={checkConnection}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh Connection
              </button>
              <button
                onClick={() => window.location.href = '/login'}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
