import React, { useState } from 'react';
import { Lock, ShieldCheck, ShieldAlert, ChevronRight, AlertCircle } from 'lucide-react';

interface AdminGateProps {
  onAuthorize: () => void;
  title?: string;
}

export const ADMIN_ACCESS_CODE = "Admin26";
export const ADMIN_ACCESS_VERSION = "1.0.0";

const AdminGate: React.FC<AdminGateProps> = ({ onAuthorize, title = "Accès Administrateur" }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simuler un petit délai pour le feedback visuel
    setTimeout(() => {
      if (code.trim() === ADMIN_ACCESS_CODE) {
        localStorage.setItem('optimus_admin_access_granted', 'true');
        localStorage.setItem('optimus_admin_access_version', ADMIN_ACCESS_VERSION);
        onAuthorize();
      } else {
        setError(true);
        setCode('');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 bg-brand-gray/30 rounded-3xl animate-in fade-in duration-500">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-xl max-w-sm w-full text-center space-y-6 border border-navy/5">
        <div className="space-y-3">
          <div className="w-16 h-16 bg-navy/5 text-navy rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-2xl font-bold text-navy tracking-tight">{title}</h2>
          <div className="flex items-center justify-center gap-2 bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
            <AlertCircle size={14} />
            <span>Ce module est protégé</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label htmlFor="admin-code" className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
              Code de sécurité
            </label>
            <div className={`relative flex items-center transition-all ${error ? 'animate-shake' : ''}`}>
              <Lock size={16} className={`absolute left-4 ${error ? 'text-red-400' : 'text-navy/30'}`} />
              <input
                id="admin-code"
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="••••••••"
                className={`w-full bg-brand-gray/50 border-2 ${error ? 'border-red-100 focus:border-red-300 text-red-600' : 'border-transparent focus:border-navy/10 text-navy'} rounded-xl py-3.5 pl-11 pr-4 font-bold focus:outline-none transition-all placeholder:text-navy/10 text-sm`}
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center justify-center gap-2 text-red-500 text-[9px] font-bold uppercase tracking-widest mt-2">
                <ShieldAlert size={12} />
                <span>Code administrateur incorrect</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group text-sm"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Déverrouiller le module</span>
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        <p className="text-[9px] text-gray-400 leading-relaxed italic px-4">
          L'accès restera autorisé jusqu'à la prochaine fermeture ou verrouillage de l'application.
        </p>
      </div>
    </div>
  );
};

export default AdminGate;
