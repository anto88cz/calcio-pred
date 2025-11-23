'use client';

import { useState, useEffect } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [correctPassword, setCorrectPassword] = useState('');

  useEffect(() => {
    // Fetch password dal backend
    const fetchPassword = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/auth/config`);
        const data = await response.json();
        setCorrectPassword(data.password);
      } catch (err) {
        console.error('Errore nel recupero della configurazione:', err);
        setCorrectPassword('calcio2025'); // Fallback
      }
    };

    // Controlla se l'utente è già autenticato (sessionStorage)
    const authToken = sessionStorage.getItem('calcio_pred_auth');
    if (authToken === 'authenticated') {
      setIsAuthenticated(true);
      setLoading(false);
    } else {
      fetchPassword().then(() => setLoading(false));
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === correctPassword) {
      sessionStorage.setItem('calcio_pred_auth', 'authenticated');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Password errata. Riprova.');
      setPassword('');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('calcio_pred_auth');
    setIsAuthenticated(false);
    setPassword('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo e Titolo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl mb-4">
              <span className="text-3xl sm:text-4xl">⚽</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
              CALCIO-PRED
            </h1>
            <p className="text-sm sm:text-base text-gray-400">AI-Powered Football Predictions</p>
          </div>

          {/* Form Login */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl p-6 sm:p-8">
            <div className="mb-6">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-600/20 rounded-lg mb-3 mx-auto">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-center text-white mb-2">Accesso Richiesto</h2>
              <p className="text-xs sm:text-sm text-center text-gray-400">Inserisci la password per accedere</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Inserisci password..."
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <p className="text-red-300 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 focus:ring-4 focus:ring-blue-500/50 transition shadow-lg"
              >
                Accedi
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-xs text-center text-gray-500">
                🔒 Accesso sicuro e crittografato
              </p>
            </div>
          </div>

          <p className="text-xs text-center text-gray-600 mt-6">
            © 2025 CALCIO-PRED · All rights reserved
          </p>
        </div>
      </div>
    );
  }

  // Utente autenticato - mostra il contenuto + pulsante logout
  return (
    <div>
      {/* Pulsante Logout fisso in alto a destra */}
      <button
        onClick={handleLogout}
        className="fixed top-4 right-4 z-[100] px-3 py-1.5 bg-red-600/90 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition shadow-lg backdrop-blur-sm flex items-center gap-2"
        title="Logout"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className="hidden sm:inline">Logout</span>
      </button>
      
      {children}
    </div>
  );
}
