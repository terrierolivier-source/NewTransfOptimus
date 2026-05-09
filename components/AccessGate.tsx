import React, { useState } from 'react';
import { Lock, Rocket, ShieldAlert, ChevronRight } from 'lucide-react';

interface AccessGateProps {
  onAuthorize: () => void;
}

// CETTE PROTECTION EST UNE BARRIÈRE SIMPLE CONTRE L'ACCÈS ACCIDENTEL.
// CE N'EST PAS UNE SÉCURITÉ FORTE. POUR UNE VRAIE SÉCURITÉ, METTRE EN PLACE UNE AUTHENTIFICATION COMPLÈTE.
export const APP_ACCESS_CODE = "OPTIMUS2026";
export const APP_ACCESS_VERSION = "1.0.0";

const AccessGate: React.FC<AccessGateProps> = ({ onAuthorize }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simuler un petit délai pour le feedback visuel
    setTimeout(() => {
      if (code.trim() === APP_ACCESS_CODE) {
        localStorage.setItem('optimus_authorized', 'true');
        localStorage.setItem('optimus_access_version', APP_ACCESS_VERSION);
        onAuthorize();
      } else {
        setError(true);
        setCode('');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-gray p-4 font-inter">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-navy rounded-2xl flex items-center justify-center mx-auto shadow-lg rotate-3 hover:rotate-0 transition-transform duration-300">
            <Rocket size={40} className="text-brand-yellow" />
          </div>
          <h1 className="text-3xl font-extrabold text-navy tracking-tight">OptimusPlan</h1>
          <p className="text-gray-500 text-sm md:text-base leading-relaxed">
            Veuillez saisir le code d'accès pour entrer dans l'application.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 text-left">
            <label htmlFor="access-code" className="text-[10px] font-black text-navy/40 uppercase tracking-widest ml-4">
              Code d'accès sécurisé
            </label>
            <div className={`relative flex items-center transition-all ${error ? 'animate-shake' : ''}`}>
              <Lock size={18} className={`absolute left-4 ${error ? 'text-red-400' : 'text-navy/30'}`} />
              <input
                id="access-code"
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="••••••••"
                className={`w-full bg-brand-gray border-2 ${error ? 'border-red-200 focus:border-red-400 text-red-600' : 'border-transparent focus:border-navy/10 text-navy'} rounded-2xl py-4 pl-12 pr-4 font-bold focus:outline-none transition-all placeholder:text-navy/10`}
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center justify-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-widest mt-2 animate-in fade-in slide-in-from-top-1">
                <ShieldAlert size={12} />
                <span>Code d'accès incorrect</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full flex items-center justify-center gap-3 bg-navy hover:bg-navy-light text-white font-bold py-5 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-navy/20 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Accéder à l'application</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-gray-100 italic text-[9px] text-gray-400 leading-relaxed px-4">
          Cette protection est une barrière simple contre l’accès accidentel. Pour une sécurité renforcée, contactez l'administrateur.
        </div>
      </div>
    </div>
  );
};

export default AccessGate;
