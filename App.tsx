
import React, { useState, useEffect } from 'react';
import { AppState, User, Role, Country } from './types';
import { getInitialState, saveState, syncStateToCloud, createDailyBackup, loadStateFromCloud, setupRealtimeSync } from './services/dataService';
import { onAuthStateChange, signOut, mapSupabaseUserToAppUser, getCurrentSession } from './services/authService';
import Layout from './components/Layout';
import AccessGate, { APP_ACCESS_VERSION } from './components/AccessGate';
import AdminGate, { ADMIN_ACCESS_VERSION } from './components/AdminGate';
import Dashboard from './modules/Dashboard';
import Admin from './modules/Admin';
import Missions from './modules/Missions';
import Timesheets from './modules/Timesheets';
import Planning from './modules/Planning';
import Availability from './modules/Availability';
import BudgetTracking from './modules/BudgetTracking';
import LoginPage from './components/LoginPage';
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(getInitialState());
  const [activeModule, setActiveModule] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(() => {
    const authorized = localStorage.getItem('optimus_authorized') === 'true';
    const storedVersion = localStorage.getItem('optimus_access_version');
    return authorized && storedVersion === APP_ACCESS_VERSION;
  });
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(() => {
    const adminAuthorized = localStorage.getItem('optimus_admin_access_granted') === 'true';
    const storedAdminVersion = localStorage.getItem('optimus_admin_access_version');
    return adminAuthorized && storedAdminVersion === ADMIN_ACCESS_VERSION;
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingChanges, setPendingChanges] = useState(0);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let isInitialized = false;

    const handleSession = async (event: string, currentSession: any) => {
      // Avoid processing the same session state twice if possible
      // but we need to handle transitions.
      
      const shouldReload = ['INITIAL_SESSION', 'SIGNED_IN'].includes(event);
      
      if (!shouldReload && session) {
        // Just Update session without reloading everything if it's just a token refresh
        setSession(currentSession);
        return;
      }

      // Cleanup previous listeners
      unsubs.forEach(u => u());
      unsubs = [];

      if (!currentSession) {
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(currentSession);
      
      try {
        // Guard against race conditions and overwriting fresh local data
        const isPendingSync = localStorage.getItem('optimus_pending_sync') === 'true';
        if (pendingChanges > 0 || isPendingSync) {
          console.log("Skipping cloud reload: pending changes detected (local or persistent flag).");
          return;
        }

        // Initial load from cloud
        const cloudData = await loadStateFromCloud();
        
        setState(prev => {
          // Double check inside setState to be absolutely sure
          const stillPending = localStorage.getItem('optimus_pending_sync') === 'true';
          if (pendingChanges > 0 || stillPending) return prev;

          const newState = { ...prev, ...cloudData };
          const appUser = mapSupabaseUserToAppUser(currentSession.user);
          
          const existingUser = newState.users.find(u => u.email === appUser.email);
          return { 
            ...newState, 
            currentUser: existingUser || appUser 
          };
        });

        // Real-time sync
        const newUnsubs = setupRealtimeSync(setState);
        unsubs.push(...newUnsubs);
      } catch (err) {
        console.error("Error during session data load", err);
      } finally {
        setLoading(false);
      }
    };

    // onAuthStateChange will trigger handleSession with the current session immediately
    const authSubscription = onAuthStateChange((event, newSession) => {
      handleSession(event, newSession);
    });

    return () => {
      authSubscription.unsubscribe();
      unsubs.forEach(u => u());
    };
  }, []);

  useEffect(() => {
    saveState(state);
    if (session) {
      setSaveStatus('idle');
      setPendingChanges(prev => prev + 1);
      localStorage.setItem('optimus_pending_sync', 'true');

      const timer = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          await syncStateToCloud(state);
          
          localStorage.removeItem('optimus_pending_sync');
          setPendingChanges(0); // All changes up to this save are persisted
          setSaveStatus('saved');
          
          // Clear status after 2 seconds
          setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2000);
        } catch (err) {
          console.error("Auto-save failed", err);
          setSaveStatus('error');
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state, session]);

  const updateState = (newState: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleLock = () => {
    localStorage.removeItem('optimus_authorized');
    localStorage.removeItem('optimus_admin_access_granted');
    localStorage.removeItem('optimus_admin_access_version');
    setIsAuthorized(false);
    setIsAdminAuthorized(false);
  };

  const handleAdminLock = () => {
    localStorage.removeItem('optimus_admin_access_granted');
    localStorage.removeItem('optimus_admin_access_version');
    setIsAdminAuthorized(false);
  };

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard state={state} />;
      case 'admin':
        if (!isAdminAuthorized) {
          return <AdminGate onAuthorize={() => setIsAdminAuthorized(true)} title="Accès Administration" />;
        }
        return <Admin state={state} updateState={updateState} />;
      case 'missions':
        return <Missions state={state} updateState={updateState} />;
      case 'timesheets':
        return <Timesheets state={state} updateState={updateState} />;
      case 'planning':
        return <Planning state={state} updateState={updateState} />;
      case 'availability':
        return <Availability state={state} updateState={updateState} />;
      case 'budget_tracking':
        if (!isAdminAuthorized) {
          return <AdminGate onAuthorize={() => setIsAdminAuthorized(true)} title="Accès Suivi Budgétaire" />;
        }
        return <BudgetTracking state={state} updateState={updateState} />;
      default:
        return <Dashboard state={state} />;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-brand-gray space-y-4">
        <div className="w-12 h-12 border-4 border-navy border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-navy animate-pulse uppercase tracking-widest text-xs">
          Initialisation sécurisée...
        </p>
      </div>
    );
  }

  if (!isAuthorized) {
    return <AccessGate onAuthorize={() => setIsAuthorized(true)} />;
  }

  if (!session) {
    return <LoginPage error={authError} />;
  }

  return (
    <Layout
      activeModule={activeModule}
      setActiveModule={setActiveModule}
      currentUser={state.currentUser || state.collaborators[0]}
      globalCountry={state.globalCountry}
      setGlobalCountry={(c) => updateState({ globalCountry: c })}
      globalFY={state.globalFY}
      setGlobalFY={(fy) => updateState({ globalFY: fy })}
      onLogout={handleLogout}
      onLock={handleLock}
      isAdminAuthorized={isAdminAuthorized}
      onAdminLock={handleAdminLock}
    >
      {renderModule()}
      
      {/* Save Status Indicator */}
      {saveStatus !== 'idle' && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 z-[9999] animate-in slide-in-from-right-4 duration-300 ${
          saveStatus === 'saving' ? 'bg-navy text-yellow-accent' :
          saveStatus === 'saved' ? 'bg-emerald-500 text-white' :
          'bg-red-500 text-white'
        }`}>
          {saveStatus === 'saving' && <div className="w-3 h-3 border-2 border-yellow-accent border-t-transparent rounded-full animate-spin"></div>}
          {saveStatus === 'saved' && <CheckCircle size={14} />}
          {saveStatus === 'error' && <AlertTriangle size={14} />}
          {saveStatus === 'saving' ? 'Sauvegarde...' : saveStatus === 'saved' ? 'Sauvegardé' : 'Erreur de sauvegarde'}
        </div>
      )}
    </Layout>
  );
};

export default App;
