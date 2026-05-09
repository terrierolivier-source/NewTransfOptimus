import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  CalendarRange, 
  Users, 
  Clock, 
  Settings, 
  LogOut,
  Globe,
  Briefcase,
  BadgeEuro,
  ChevronDown,
  Rocket,
  ShieldOff,
  Menu,
  X
} from 'lucide-react';
import { Country } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeModule: string;
  setActiveModule: (m: string) => void;
  currentUser: any;
  globalCountry: string;
  setGlobalCountry: (c: any) => void;
  globalFY: string;
  setGlobalFY: (fy: string) => void;
  onLogout: () => void;
  onLock: () => void;
  isAdminAuthorized?: boolean;
  onAdminLock?: () => void;
}

const COUNTRY_FLAGS: Record<string, string> = {
  [Country.FRANCE]: '🇫🇷',
  [Country.SPAIN]: '🇪🇸',
  [Country.ITALY]: '🇮🇹',
};

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeModule, 
  setActiveModule, 
  currentUser,
  globalCountry,
  setGlobalCountry,
  globalFY,
  setGlobalFY,
  onLogout,
  onLock,
  isAdminAuthorized = false,
  onAdminLock
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: true },
    { id: 'missions', label: 'Missions', icon: Briefcase, permission: true },
    { id: 'planning', label: 'Planification', icon: CalendarRange, permission: true },
    { id: 'availability', label: 'Disponibilité', icon: Users, permission: true },
    { id: 'timesheets', label: 'Gestion des temps', icon: Clock, permission: true },
    { id: 'budget_tracking', label: 'Suivi Budgétaire', icon: BadgeEuro, permission: true },
    { id: 'admin', label: 'Administration', icon: Settings, permission: true },
  ];

  const handleModuleSelect = (id: string) => {
    setActiveModule(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-brand-gray overflow-hidden relative">
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-navy text-white flex items-center justify-between px-4 z-[60] shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
            <Rocket size={18} className="text-blue-600" />
          </div>
          <span className="text-lg font-black tracking-tight">OptimusPlan'</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors border border-white/10"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-navy/60 backdrop-blur-sm z-[50] transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[55] w-64 bg-navy text-brand-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:transform-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shrink-0 transform hover:scale-105 transition-transform duration-300">
            <Rocket size={24} className="text-blue-600" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-white">OptimusPlan'</span>
        </div>

        <div className="p-6 md:hidden flex items-center justify-between">
          <div className="flex items-center gap-2">
             <button 
               onClick={onLogout}
               className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-gray-100 hover:bg-red-50 text-red-500 transition-colors"
               title="Déconnexion"
             >
                <LogOut size={18} />
             </button>
             <span className="text-lg font-black tracking-tight text-white leading-none">Menu</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-white/40 group px-2 py-1 flex items-center gap-1 border border-white/5 rounded-md hover:bg-white/5 transition-all">
            <span className="text-[10px] font-bold uppercase tracking-widest hidden group-hover:inline">Fermer</span>
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-2 md:py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.filter(i => i.permission).map((item) => (
            <button
              key={item.id}
              onClick={() => handleModuleSelect(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                activeModule === item.id 
                ? 'bg-yellow-accent text-navy font-bold shadow-md transform translate-x-1' 
                : 'hover:bg-brand-white/10 text-brand-white/80 hover:text-brand-white'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-brand-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={onLogout}
                title="Déconnexion"
                className="w-10 h-10 rounded-xl bg-brand-white/5 hover:bg-red-500/20 text-brand-white/40 hover:text-red-400 flex items-center justify-center transition-all group border border-brand-white/5"
              >
                <LogOut size={20} className="group-hover:scale-110 transition-transform" />
              </button>
              <div className="flex flex-col">
                <span className="text-[8px] text-brand-white/30 font-black uppercase tracking-widest leading-none mt-0.5">Session Active</span>
              </div>
            </div>
            
            <button 
              onClick={onLock} 
              title="Verrouiller l'application" 
              className="p-2 rounded-lg text-brand-white/20 hover:text-yellow-accent hover:bg-brand-white/5 transition-all"
            >
              <ShieldOff size={16} />
            </button>
          </div>

          {isAdminAuthorized && onAdminLock && (
            <div className="mt-2 flex items-center justify-center">
              <button 
                onClick={onAdminLock}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-light/30 border border-brand-white/5 hover:bg-navy-light/50 text-[9px] font-bold text-white/40 hover:text-white transition-all uppercase tracking-widest"
              >
                <ShieldOff size={12} />
                <span>Verrouiller accès admin</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden pt-16 md:pt-0">
        {/* Header */}
        <header className="h-16 md:h-20 bg-brand-white border-b flex items-center justify-between px-4 md:px-8 shadow-sm z-30">
          <h1 className="text-sm md:text-xl font-black text-navy uppercase tracking-tighter truncate max-w-[120px] md:max-w-none mr-2">
            {menuItems.find(m => m.id === activeModule)?.label}
          </h1>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            {/* Cartouche Pays Interactif */}
            <div className="flex items-center gap-0.5 md:gap-1 bg-brand-gray rounded-full p-0.5 md:p-1 border border-gray-200 shadow-inner">
              <button 
                onClick={() => setGlobalCountry('Global')}
                className={`p-1 md:p-1.5 rounded-full transition-all flex items-center justify-center min-w-[28px] md:min-w-[32px] ${globalCountry === 'Global' ? 'bg-navy text-yellow-accent shadow-sm' : 'text-navy/40 hover:text-navy'}`}
                title="Tous les pays (Global)"
              >
                <Globe size={14} className="md:w-[18px] md:h-[18px]" />
              </button>
              
              <div className="w-px h-3 md:h-4 bg-gray-300 mx-0.5 md:mx-1"></div>

              {Object.values(Country).map((country) => (
                <button
                  key={country}
                  onClick={() => setGlobalCountry(country)}
                  className={`flex items-center justify-center w-7 h-6 md:w-10 md:h-8 rounded-full transition-all duration-200 ${
                    globalCountry === country 
                    ? 'bg-white shadow-md border border-gray-100 scale-110 z-10' 
                    : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                  title={country}
                >
                  <span className="text-base md:text-xl leading-none select-none drop-shadow-sm">{COUNTRY_FLAGS[country]}</span>
                </button>
              ))}
            </div>

            {/* Sélecteur FY */}
            <div className="flex items-center gap-1.5 md:gap-2 bg-brand-gray rounded-full px-2 md:px-4 py-1.5 border border-gray-200 shadow-inner group">
              <span className="hidden sm:inline text-[8px] md:text-[10px] font-black text-navy/40 uppercase tracking-widest">FY</span>
              <div className="relative flex items-center">
                <select 
                  value={globalFY}
                  onChange={(e) => setGlobalFY(e.target.value)}
                  className="bg-transparent text-[10px] md:text-xs font-bold text-navy focus:outline-none cursor-pointer pr-3 md:pr-4 appearance-none"
                >
                  {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(year => (
                    <option key={year} value={`FY${year}`}>{year}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-0 pointer-events-none text-navy/40 group-hover:text-navy transition-colors md:w-[12px] md:h-[12px]" />
              </div>
            </div>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
