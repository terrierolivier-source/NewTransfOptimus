
import React, { useState, useEffect } from 'react';
import { AppState, User, Role, Country } from './types';
import { getInitialState, saveState, syncStateToCloud, createDailyBackup, loadStateFromCloud, setupRealtimeSync } from './services/dataService';
import { onAuthStateChange, signOut, mapSupabaseUserToAppUser, getCurrentSession } from './services/authService';
import { normalizeTimesheetEntry, getDedupedTimesheets } from './utils';
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
import { TimesheetEntry } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(getInitialState());
  const [activeModule, setActiveModule] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
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

  // Refs for logic to avoid stale closures in effects
  const isInitialLoadCompleteRef = React.useRef(false);
  const pendingChangesRef = React.useRef(0);

  // Sync refs with state
  useEffect(() => {
    isInitialLoadCompleteRef.current = isInitialLoadComplete;
    pendingChangesRef.current = pendingChanges;
  }, [isInitialLoadComplete, pendingChanges]);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const handleSession = async (event: string, currentSession: any) => {
      console.log(`[Auth] Event: ${event}`);
      
      const isSignificantEvent = ['INITIAL_SESSION', 'SIGNED_IN'].includes(event);
      
      if (!isSignificantEvent && currentSession) {
        setSession(currentSession);
        return;
      }

      if (!currentSession) {
        console.log("[Auth] No session found. Cleaning up.");
        setSession(null);
        setLoading(false);
        setIsInitialLoadComplete(false);
        isInitialLoadCompleteRef.current = false;
        return;
      }

      setSession(currentSession);
      
      const authorized = localStorage.getItem('optimus_authorized') === 'true';
      if (!authorized) {
        console.log("[Auth] Waiting for AccessGate authorization...");
        setLoading(false);
        return;
      }

      await triggerInitialLoad(currentSession);
    };

    const triggerInitialLoad = async (currentSession: any) => {
      if (isInitialLoadCompleteRef.current || isCloudLoading) return;
      
      setIsCloudLoading(true);
      try {
        const stillPendingInStorage = localStorage.getItem('optimus_pending_sync') === 'true';
        
        // Anti-overwriting guard
        if (isInitialLoadCompleteRef.current && (pendingChangesRef.current > 0 || stillPendingInStorage)) {
          console.log("[Init] Skipping cloud reload: local state is newer/dirty.");
          return;
        }

        console.log("[Init] Loading data from Supabase...");
        const cloudData = await loadStateFromCloud();
        
        setState(prev => {
          const currentPending = localStorage.getItem('optimus_pending_sync') === 'true';
          if (isInitialLoadCompleteRef.current && (pendingChangesRef.current > 0 || currentPending)) {
            console.log("[Init] Aborting state merge: local changes detected during load.");
            return prev;
          }

          const newState = { ...prev, ...cloudData };
          const appUser = mapSupabaseUserToAppUser(currentSession.user);
          const existingUser = newState.users.find(u => u.email === appUser.email);
          
          console.log("[Init] Cloud data received and applied to state.");
          return { 
            ...newState, 
            currentUser: existingUser || appUser 
          };
        });

        console.log("[Init] Initial load complete.");
        setIsInitialLoadComplete(true);

        // Real-time sync setup
        unsubs.forEach(u => u());
        unsubs = [];
        const newUnsubs = setupRealtimeSync(setState);
        unsubs.push(...newUnsubs);
      } catch (err) {
        console.error("[Init] Data load error", err);
      } finally {
        setIsCloudLoading(false);
        setLoading(false);
      }
    };

    const authSubscription = onAuthStateChange((event, newSession) => {
      handleSession(event, newSession);
    });

    return () => {
      authSubscription.unsubscribe();
      unsubs.forEach(u => u());
    };
  }, []); // Only once on mount

  useEffect(() => {
    saveState(state);
    
    // Safety check: don't sync if load not complete or state is empty
    const isStateEmpty = state.missions.length === 0 && state.collaborators.length === 0;
    
    if (session && isInitialLoadComplete && !isStateEmpty) {
      setSaveStatus('idle');
      setPendingChanges(prev => prev + 1);
      localStorage.setItem('optimus_pending_sync', 'true');

      const timer = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          await syncStateToCloud(state);
          
          localStorage.removeItem('optimus_pending_sync');
          setPendingChanges(0); 
          setSaveStatus(prev => (prev === 'saving' ? 'saved' : prev));
          
          setTimeout(() => setSaveStatus(prev => (prev === 'saved' ? 'idle' : prev)), 2000);
        } catch (err) {
          console.error("[Sync] Auto-save failed", err);
          setSaveStatus('error');
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state, session, isInitialLoadComplete]);

  const updateState = (newState: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  const upsertTimesheetInState = (entry: TimesheetEntry) => {
    setState(prev => {
      const currentTimesheets = prev.timesheets || [];
      const { missionId, activityType } = normalizeTimesheetEntry(entry);
      
      const normalizedEntry = {
        ...entry,
        missionId,
        activityType,
        updatedAt: entry.updatedAt || new Date().toISOString()
      };

      // We append and then dedup the whole thing to be absolutely safe
      const updatedTimesheets = getDedupedTimesheets([...currentTimesheets, normalizedEntry]);

      return { ...prev, timesheets: updatedTimesheets };
    });
  };

  const removeTimesheetFromState = (idOrEntry: string | TimesheetEntry) => {
    setState(prev => {
      const currentTimesheets = prev.timesheets || [];
      const id = typeof idOrEntry === 'string' ? idOrEntry : idOrEntry.id;
      
      let updatedTimesheets;
      if (id && id.length > 10) { // Valid UUID usually
        updatedTimesheets = currentTimesheets.filter(t => t.id !== id);
      } else if (typeof idOrEntry !== 'string') {
        const { missionId, activityType } = normalizeTimesheetEntry(idOrEntry);
        updatedTimesheets = currentTimesheets.filter(t => !(
          t.collaboratorId === idOrEntry.collaboratorId &&
          (t.missionId || null) === missionId &&
          (t.activityType || null) === activityType &&
          t.weekStart === idOrEntry.weekStart &&
          t.dayIndex === idOrEntry.dayIndex
        ));
      } else {
        updatedTimesheets = currentTimesheets;
      }
      
      return { ...prev, timesheets: updatedTimesheets };
    });
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

  // Re-trigger load when authorization is granted
  useEffect(() => {
    if (isAuthorized && session && !isInitialLoadComplete && !isCloudLoading) {
      console.log("[Init] Access granted, triggering cloud load.");
      // We don't have access to the inner function triggerInitialLoad here easily if we want to keep things clean.
      // Easiest is to force a re-render or use a signal.
      // But actually handleSession would have skipped it because isAuthorized was false.
      // So we can just try to load here.
      const load = async () => {
        setIsCloudLoading(true);
        try {
          const cloudData = await loadStateFromCloud();
          setState(prev => {
            const newState = { ...prev, ...cloudData };
            const appUser = mapSupabaseUserToAppUser(session.user);
            const existingUser = newState.users.find(u => u.email === appUser.email);
            return { ...newState, currentUser: existingUser || appUser };
          });
          setIsInitialLoadComplete(true);
          console.log("[Init] Manual load after access granted complete.");
        } catch(e) {
          console.error("Load after access failed", e);
        } finally {
          setIsCloudLoading(false);
        }
      };
      load();
    }
  }, [isAuthorized, session, isInitialLoadComplete]);

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
        return (
          <Timesheets 
            state={state} 
            updateState={updateState} 
            upsertTimesheetInState={upsertTimesheetInState}
            removeTimesheetFromState={removeTimesheetFromState}
            setSaveStatus={setSaveStatus} 
          />
        );
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

  if (loading || (isAuthorized && session && !isInitialLoadComplete)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-brand-gray space-y-4">
        <div className="w-12 h-12 border-4 border-navy border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-navy animate-pulse uppercase tracking-widest text-[10px]">
          {isCloudLoading ? 'Chargement des données Supabase...' : 'Initialisation sécurisée...'}
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
