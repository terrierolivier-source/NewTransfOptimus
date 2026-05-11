import { supabase } from './supabase';
import { User, Role, Country } from '../types';

export const getCurrentSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const signInAnonymously = async () => {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return subscription;
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
