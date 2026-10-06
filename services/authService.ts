import { supabase } from './supabase';
import { User, Role, Country } from '../types';

const LOCAL_SESSION_KEY = 'optimus_local_session';

const listeners: ((event: string, session: any) => void)[] = [];

export const getStoredLocalSession = () => {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const createLocalGuestSession = () => {
  const guestId = 'local-guest-' + Math.random().toString(36).substring(2, 7);
  const session = {
    access_token: 'local-offline-token',
    token_type: 'bearer',
    user: {
      id: guestId,
      email: `${guestId}@local.app`,
      app_metadata: { provider: 'anonymous' },
      user_metadata: { full_name: 'Invité (Mode Local)' },
      created_at: new Date().toISOString()
    },
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 365
  };
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("Could not save local session to localStorage", e);
  }
  listeners.forEach(cb => {
    try { cb('SIGNED_IN', session); } catch (e) {}
  });
  return session;
};

export const getCurrentSession = async () => {
  const local = getStoredLocalSession();
  if (local) return local;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return null;
    return session;
  } catch {
    return null;
  }
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        prompt: 'select_account',
        access_type: 'offline',
      }
    }
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("Supabase signOut error:", e);
  }
  listeners.forEach(cb => {
    try { cb('SIGNED_OUT', null); } catch (e) {}
  });
};

export const signInAnonymously = async () => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (data?.session) {
      return data;
    }
    const localSession = createLocalGuestSession();
    return { session: localSession, user: localSession.user };
  } catch (err: any) {
    // Si Supabase est restreint par dépassement de quota (exceed_egress_quota / 402) ou hors-ligne
    console.warn("Supabase indisponible ou restreint, activation transparente du mode invité local.", err?.message || err);
    const localSession = createLocalGuestSession();
    return { session: localSession, user: localSession.user };
  }
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  listeners.push(callback);

  const local = getStoredLocalSession();
  if (local) {
    setTimeout(() => callback('INITIAL_SESSION', local), 0);
  }

  let sub: any = null;
  try {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!getStoredLocalSession()) {
        callback(event, session);
      }
    });
    sub = subscription;
  } catch (e) {
    console.warn("Erreur subscription Supabase Auth:", e);
  }

  return {
    unsubscribe: () => {
      if (sub?.unsubscribe) sub.unsubscribe();
      const idx = listeners.indexOf(callback);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  };
};

export const mapSupabaseUserToAppUser = (supabaseUser: any): User => {
  const isAnonymous = supabaseUser.app_metadata?.provider === 'anonymous' || !supabaseUser.email;
  
  // For anonymous users, we create a friendly display name using the start of their ID
  const shortId = supabaseUser.id.substring(0, 4).toUpperCase();
  const firstName = isAnonymous ? 'Invité' : (supabaseUser.user_metadata?.full_name?.split(' ')[0] || 'Utilisateur');
  const lastName = isAnonymous ? `#${shortId}` : (supabaseUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') || 'Supabase');

  return {
    id: supabaseUser.id,
    firstName,
    lastName,
    email: supabaseUser.email || `guest-${supabaseUser.id}@app.local`,
    grade: Role.CONSULTANT, // Limit default grade for guests if needed, or keep high for demo
    country: Country.FRANCE,
    isAdmin: true, // Keep admin for now so visitors can test everything
    active: true,
    cjm: 0,
    joiningDate: new Date().toISOString().split('T')[0],
    permissions: {
      dashboard: true,
      planning: true,
      availability: true,
      timesheets: true,
      budget_tracking: true,
      admin: true,
      reporting: true
    }
  };
};
