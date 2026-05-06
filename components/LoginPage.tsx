import React from 'react';
import { LogIn, Rocket, ShieldCheck, UserCircle } from 'lucide-react';
import { signInWithGoogle, signInAnonymously } from '../services/authService';

interface LoginPageProps {
  error?: string | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ error: externalError }) => {
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<string | null>(null);
  
  const handleGoogleLogin = async () => {
    setLocalError(null);
    setLoading('google');
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Login failed", err);
      setLocalError(err.message || "Erreur de connexion Google");
      setLoading(null);
    }
  };

  const handleAnonymousLogin = async () => {
    setLocalError(null);
    setLoading('anon');
    try {
      await signInAnonymously();
    } catch (err: any) {
      console.error("Anonymous login failed", err);
      setLocalError("L'accès invité n'est pas activé. Activez 'Anonymous' dans Supabase Auth > Providers.");
      setLoading(null);
    }
  };

  const error = localError || externalError;

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-gray p-4 font-inter">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-navy rounded-2xl flex items-center justify-center mx-auto shadow-lg rotate-3 hover:rotate-0 transition-transform duration-300">
            <Rocket size={40} className="text-brand-yellow" />
          </div>
          <h1 className="text-3xl font-extrabold text-navy tracking-tight">Pilotage Consulting</h1>
          <p className="text-gray-500 text-sm md:text-base leading-relaxed">
            Connectez-vous pour piloter l'activité du cabinet.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-center gap-3 text-left">
            <div className="bg-red-500 text-white p-1 rounded-full shrink-0">
              <ShieldCheck size={14} />
            </div>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <button
            onClick={handleAnonymousLogin}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-4 bg-navy hover:bg-navy-light text-white font-bold py-5 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-navy/20 disabled:opacity-50"
          >
            {loading === 'anon' ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Rocket size={24} className="text-brand-yellow" />
            )}
            Accéder à l'outil (Mode Invité)
          </button>
          
          <p className="text-[10px] text-gray-400 leading-relaxed px-4">
            En mode invité, vos modifications sont enregistrées et partagées en temps réel avec les autres utilisateurs.
          </p>
        </div>

        <div className="pt-8 border-t border-gray-100">
          <div className="flex items-center justify-center gap-4 text-[10px] text-gray-400 font-mono uppercase tracking-widest">
            <span>Supabase Auth</span>
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>RLS Protected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
