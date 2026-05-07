import React from 'react';
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
  Rocket
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
  onLogout
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: true },
    { id: 'missions', label: 'Missions', icon: Briefcase, permission: true },
    { id: 'planning', label: 'Planification', icon: CalendarRange, permission: true },
    { id: 'availability', label: 'Disponibilité', icon: Users, permission: true },
    { id: 'timesheets', label: 'Gestion des temps', icon: Clock, permission: true },
    { id: 'budget_tracking', label: 'Suivi Budgétaire', icon: BadgeEuro, permission: true },
    { id: 'admin', label: 'Administration', icon: Settings, permission: true },
  ];

  return (
    <div className="flex h-screen bg-brand-gray overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-navy text-brand-white flex flex-col shadow-2xl z-40">
        <div className="p-6 flex items-center gap-3">
          {/* Nouveau logo Gantt en bleu dans son encadré blanc arrondi */}
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shrink-0 transform hover:scale-105 transition-transform duration-300">
            <Rocket size={24} className="text-blue-600" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-white">OptimusPlan'</span>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.filter(i => i.permission).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
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
              <div className="w-8 h-8 rounded-lg bg-yellow-accent flex items-center justify-center font-bold text-navy border border-brand-white/10 text-xs">
                {currentUser.firstName[0]}{currentUser.lastName[0]}
              </div>
              <span className="text-[10px] text-brand-white/40 font-bold uppercase tracking-tighter">Session Active</span>
            </div>
            <button onClick={onLogout} className="text-brand-white/60 hover:text-yellow-accent transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-brand-white border-b flex items-center justify-between px-8 shadow-sm z-30">
          <h1 className="text-xl font-black text-navy uppercase tracking-tighter">
            {menuItems.find(m => m.id === activeModule)?.label}
          </h1>

          <div className="flex items-center gap-4">
            {/* Cartouche Pays Interactif */}
            <div className="flex items-center gap-1 bg-brand-gray rounded-full p-1 border border-gray-200 shadow-inner">
              <button 
                onClick={() => setGlobalCountry('Global')}
                className={`p-1.5 rounded-full transition-all flex items-center justify-center min-w-[32px] ${globalCountry === 'Global' ? 'bg-navy text-yellow-accent shadow-sm' : 'text-navy/40 hover:text-navy'}`}
                title="Tous les pays (Global)"
              >
                <Globe size={18} />
              </button>
              
              <div className="w-px h-4 bg-gray-300 mx-1"></div>

              {Object.values(Country).map((country) => (
                <button
                  key={country}
                  onClick={() => setGlobalCountry(country)}
                  className={`flex items-center justify-center w-10 h-8 rounded-full transition-all duration-200 ${
                    globalCountry === country 
                    ? 'bg-white shadow-md border border-gray-100 scale-110 z-10' 
                    : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                  title={country}
                >
                  <span className="text-xl leading-none select-none drop-shadow-sm">{COUNTRY_FLAGS[country]}</span>
                </button>
              ))}
            </div>

            {/* Sélecteur FY */}
            <div className="flex items-center gap-2 bg-brand-gray rounded-full px-4 py-1.5 border border-gray-200 shadow-inner group">
              <span className="text-[10px] font-black text-navy/40 uppercase tracking-widest">FY</span>
              <div className="relative flex items-center">
                <select 
                  value={globalFY}
                  onChange={(e) => setGlobalFY(e.target.value)}
                  className="bg-transparent text-xs font-bold text-navy focus:outline-none cursor-pointer pr-4 appearance-none"
                >
                  {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(year => (
                    <option key={year} value={`FY${year}`}>{year}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-0 pointer-events-none text-navy/40 group-hover:text-navy transition-colors" />
              </div>
            </div>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;