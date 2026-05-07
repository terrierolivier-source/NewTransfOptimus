
import React, { useState, useEffect } from 'react';
import { AppState, User, Role, Country } from './types';
import { getInitialState, saveState, syncStateToCloud, createDailyBackup, loadStateFromCloud, setupRealtimeSync } from './services/dataService';
import { onAuthStateChange, signOut, mapSupabaseUserToAppUser, getCurrentSession } from './services/authService';
import Layout from './components/Layout';
import Dashboard from './modules/Dashboard';
import Admin from './modules/Admin';
import Missions from './modules/Missions';
import Timesheets from './modules/Timesheets';
import Planning from './modules/Planning';
import Availability from './modules/Availability';
import BudgetTracking from './modules/BudgetTracking';
import LoginPage from './components/LoginPage';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(getInitialState());
  const [activeModule, setActiveModule] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let isInitialized = false;

    const handleSession = async (currentSession: any) => {
      // Avoid processing the same session state twice if possible
      // but we need to handle transitions.
      
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
        // Initial load from cloud
        const cloudData = await loadStateFromCloud();
        
        setState(prev => {
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
    const authSubscription = onAuthStateChange((newSession) => {
      handleSession(newSession);
    });

    return () => {
      authSubscription.unsubscribe();
      unsubs.forEach(u => u());
    };
  }, []);

  useEffect(() => {
    saveState(state);
    if (session) {
      const timer = setTimeout(() => {
        syncStateToCloud(state);
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

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard state={state} />;
      case 'admin':
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
    >
      {renderModule()}
    </Layout>
  );
};

export default App;
