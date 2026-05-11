import { AppState, Country, Mission, MissionStatus, BillingMode, PlanningEntry, TimesheetEntry, InternalStaffing, ManualExpense, BudgetFamily, Holiday, User, Collaborator, CollaboratorType, Role } from '../types';
import React from 'react';
import { parseCSVUsers, SEED_MISSIONS_RAW } from '../constants';
import { getFiscalYear, generateId } from '../utils';
import { startOfWeek, addWeeks, format, parseISO, isWithinInterval, eachWeekOfInterval } from 'date-fns';
import { supabase } from './supabase';

const STORAGE_KEY = 'consultant_pilotage_v1_state';

export const isValidUuid = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

export const nullableUuid = (value: string | null | undefined): string | null => {
  return isValidUuid(value) ? value! : null;
};

const mapUserToSupabase = (u: User) => {
  const payload: any = {
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    grade: u.grade,
    country: u.country,
    is_admin: u.isAdmin,
    active: u.active,
    cjm: u.cjm,
    joining_date: u.joiningDate,
    leaving_date: u.leavingDate,
    permissions: u.permissions,
    updated_at: new Date().toISOString()
  };

  const validId = nullableUuid(u.id);
  if (validId) {
    payload.id = validId;
  }

  return payload;
};

const mapSupabaseToUser = (u: any): User => ({
  id: u.id,
  email: u.email,
  firstName: u.first_name,
  lastName: u.last_name,
  grade: u.grade,
  country: u.country,
  isAdmin: u.is_admin,
  active: u.active,
  cjm: u.cjm,
  joiningDate: u.joining_date,
  leavingDate: u.leaving_date,
  permissions: u.permissions
});

const mapCollaboratorToSupabase = (c: Collaborator) => {
  const payload: any = {
    email: c.email,
    first_name: c.firstName,
    last_name: c.lastName,
    grade: c.grade,
    country: c.country,
    collaborator_type: c.collaboratorType,
    active: c.active,
    cjm: c.cjm,
    joining_date: c.joiningDate,
    leaving_date: c.leavingDate,
    notes: c.notes,
    updated_at: new Date().toISOString()
  };

  const validId = nullableUuid(c.id);
  if (validId) {
    payload.id = validId;
  }

  return payload;
};

const mapSupabaseToCollaborator = (c: any): Collaborator => ({
  id: c.id,
  email: c.email,
  firstName: c.first_name,
  lastName: c.last_name,
  grade: c.grade as Role,
  country: c.country as Country,
  collaboratorType: c.collaborator_type as CollaboratorType,
  active: c.active,
  cjm: c.cjm,
  joiningDate: c.joining_date,
  leavingDate: c.leaving_date,
  notes: c.notes
});

const mapMissionToSupabase = (m: Mission) => {
  const payload: any = {
    client_id: nullableUuid(m.clientId),
    client_name: m.clientName,
    name: m.name,
    manager_id: nullableUuid(m.managerId),
    manager_collaborator_id: nullableUuid(m.managerCollaboratorId),
    billing_mode: m.billingMode,
    type: m.type,
    typology: m.typology,
    country: m.country,
    start_date: m.startDate,
    end_date: m.endDate,
    status: m.status,
    forfait_amount_current_fy: m.forfaitAmountCurrentFY,
    forfait_amount_next_fy: m.forfaitAmountNextFY,
    success_fees_current_fy: m.successFeesCurrentFY,
    success_fees_next_fy: m.successFeesNextFY,
    active: m.active,
    billing_overrides: m.billingOverrides,
    internal_staffing: m.internalStaffing,
    freelance_staffing: m.freelanceStaffing,
    subcontractor_staffing: m.subcontractorStaffing,
    customer_po: m.customerPo,
    updated_at: new Date().toISOString()
  };

  const validId = nullableUuid(m.id);
  if (validId) {
    payload.id = validId;
  }

  if (!payload.id) {
    console.warn(`Mission ${m.name} has invalid UUID: ${m.id}. It will likely be inserted as a new record.`);
  }

  return payload;
};

const mapSupabaseToMission = (m: any): Mission => ({
  id: m.id,
  clientId: m.client_id,
  clientName: m.client_name,
  name: m.name,
  managerId: m.manager_id,
  managerCollaboratorId: m.manager_collaborator_id || '',
  billingMode: m.billing_mode,
  type: m.type,
  typology: m.typology,
  country: m.country,
  startDate: m.start_date,
  endDate: m.end_date,
  status: m.status,
  forfaitAmountCurrentFY: m.forfait_amount_current_fy,
  forfaitAmountNextFY: m.forfait_amount_next_fy,
  successFeesCurrentFY: m.success_fees_current_fy,
  successFeesNextFY: m.success_fees_next_fy,
  active: m.active,
  billingOverrides: m.billing_overrides,
  internalStaffing: m.internal_staffing || [],
  freelanceStaffing: m.freelance_staffing || [],
  subcontractorStaffing: m.subcontractor_staffing || [],
  customerPo: m.customer_po
});

const mapPlanningToSupabase = (p: PlanningEntry) => {
  const payload: any = {
    mission_id: nullableUuid(p.missionId),
    // Force user_id to null because public.users is no longer the source for planning
    user_id: null,
    collaborator_id: nullableUuid(p.collaboratorId || p.userId), // Fallback to userId if collaboratorId is missing in state
    external_name: p.externalName,
    external_type: p.externalType,
    week_start: p.weekStart,
    percentage: p.percentage,
    tjm: p.tjm,
    cost_day: p.costDay,
    sentiment: p.sentiment,
    weather: p.weather,
    comment: p.comment,
    updated_at: new Date().toISOString()
  };

  const validId = nullableUuid(p.id);
  if (validId) {
    payload.id = validId;
  }

  return payload;
};

const mapSupabaseToPlanning = (p: any): PlanningEntry => ({
  id: p.id,
  missionId: p.mission_id,
  userId: p.user_id || p.collaborator_id, // Fallback for frontend logic
  collaboratorId: p.collaborator_id || '',
  externalName: p.external_name,
  externalType: p.external_type,
  weekStart: p.week_start,
  percentage: p.percentage,
  tjm: p.tjm,
  costDay: p.cost_day,
  sentiment: p.sentiment,
  weather: p.weather,
  comment: p.comment
});

const mapTimesheetToSupabase = (t: TimesheetEntry) => {
  const payload: any = {
    // Force user_id to null because public.users is no longer the source for metadata
    user_id: null,
    collaborator_id: nullableUuid(t.collaboratorId || t.userId), // Fallback to userId if collaboratorId is missing in state
    mission_id: nullableUuid(t.missionId),
    week_start: t.weekStart,
    day_index: t.dayIndex,
    percentage: t.percentage,
    status: t.status,
    comment: t.comment,
    updated_at: new Date().toISOString()
  };

  const validId = nullableUuid(t.id);
  if (validId) {
    payload.id = validId;
  }

  return payload;
};

const mapSupabaseToTimesheet = (t: any): TimesheetEntry => ({
  id: t.id,
  userId: t.user_id || t.collaborator_id, // Fallback for frontend logic
  collaboratorId: t.collaborator_id || '',
  missionId: t.mission_id,
  weekStart: t.week_start,
  dayIndex: t.day_index,
  percentage: t.percentage,
  status: t.status,
  comment: t.comment
});

const parseCSVDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [d, m, y] = dateStr.split('/');
  return `${y}-${m}-${d}`;
};

export const syncBudgetDataToCloud = async (state: AppState) => {
  if (!state.globalFY) return;
  try {
    const { error } = await supabase.from('budget_data').upsert({
      fy: state.globalFY,
      manual_expenses: state.manualExpenses[state.globalFY] || {},
      budget_families: state.budgetFamilies[state.globalFY] || {},
      budget_values: state.budgetValues[state.globalFY] || {}
    });
    if (error) throw error;
  } catch (e) {
    console.error('Supabase Budget sync failed', e);
    throw e;
  }
};

export const syncMissionToCloud = async (mission: Mission) => {
  const payload = mapMissionToSupabase(mission);
  try {
    const { error } = await supabase.from('missions').upsert(payload);
    if (error) {
      console.error('Supabase Mission sync failed:', {
        error,
        payload,
        mission
      });
    }
  } catch (e) {
    console.error('Supabase Mission sync exception:', e);
  }
};

export const deleteMissionFromCloud = async (missionId: string) => {
  try {
    await supabase.from('missions').delete().eq('id', missionId);
  } catch (e) {
    console.error('Supabase Mission delete failed', e);
  }
};

export const deletePlanningEntriesForMission = async (missionId: string) => {
  try {
    await supabase.from('planning').delete().eq('mission_id', missionId);
  } catch (e) {
    console.error('Supabase Planning delete failed', e);
  }
};

export const syncUserToCloud = async (user: User) => {
  try {
    await supabase.from('users').upsert(mapUserToSupabase(user));
  } catch (e) {
    console.error('Supabase User sync failed', e);
  }
};

export const syncCollaboratorToCloud = async (collaborator: Collaborator) => {
  try {
    await supabase.from('collaborators').upsert(mapCollaboratorToSupabase(collaborator));
  } catch (e) {
    console.error('Supabase Collaborator sync failed', e);
  }
};

export const deleteCollaboratorFromCloud = async (id: string) => {
  try {
    await supabase.from('collaborators').delete().eq('id', id);
  } catch (e) {
    console.error('Supabase Collaborator delete failed', e);
  }
};

export const loadPlanningFromCloud = async (): Promise<PlanningEntry[]> => {
  try {
    const { data, error } = await supabase.from('planning').select('*');
    if (error) {
      console.error('Error loading planning from Supabase:', error);
      return [];
    }
    return data ? data.map(p => mapSupabaseToPlanning(p)) : [];
  } catch (e) {
    console.error('Exception loading planning from Supabase:', e);
    return [];
  }
};

export const syncPlanningToCloud = async (planning: PlanningEntry[]) => {
  if (planning.length === 0) return;
  const data = planning.map(p => mapPlanningToSupabase(p));
  try {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('planning').upsert(chunk);
      if (error) {
        console.error('Supabase Planning sync error:', {
          error,
          chunk,
          originalPlanning: planning.slice(i, i + CHUNK_SIZE)
        });
      }
    }
  } catch (e) {
    console.error('Supabase Planning sync exception:', e);
  }
};

export const loadTimesheetsFromCloud = async (): Promise<TimesheetEntry[]> => {
  try {
    const { data, error } = await supabase.from('timesheets').select('*');
    if (error) {
      console.error('Error loading timesheets from Supabase:', error);
      return [];
    }
    return data ? data.map(t => mapSupabaseToTimesheet(t)) : [];
  } catch (e) {
    console.error('Exception loading timesheets from Supabase:', e);
    return [];
  }
};

export const syncTimesheetsToCloud = async (entries: TimesheetEntry[]) => {
  if (entries.length === 0) return;
  const data = entries.map(e => mapTimesheetToSupabase(e));
  try {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('timesheets').upsert(chunk);
      if (error) {
        console.error('Supabase Timesheet sync error:', {
          error,
          chunk,
          originalEntries: entries.slice(i, i + CHUNK_SIZE)
        });
      }
    }
  } catch (e) {
    console.error('Supabase Timesheet sync exception:', e);
  }
};

export const setupRealtimeSync = (
  setState: React.Dispatch<React.SetStateAction<AppState>>
): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  // Supabase Real-time listeners
  const channel = supabase.channel(`db-realtime-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
      const u = mapSupabaseToUser(payload.new || payload.old);
      setState(prev => {
        const index = prev.users.findIndex(old => old.id === u.id);
        const newUsers = index >= 0 
          ? prev.users.map(old => old.id === u.id ? u : old)
          : [...prev.users, u];
        return { ...prev, users: newUsers };
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'collaborators' }, payload => {
      const c = mapSupabaseToCollaborator(payload.new || payload.old);
      setState(prev => {
        const index = prev.collaborators.findIndex(old => old.id === c.id);
        const newCollaborators = index >= 0 
          ? prev.collaborators.map(old => old.id === c.id ? c : old)
          : [...prev.collaborators, c];
        return { ...prev, collaborators: newCollaborators };
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, payload => {
      const m = mapSupabaseToMission(payload.new);
      setState(prev => {
        const index = prev.missions.findIndex(old => old.id === m.id);
        const newMissions = index >= 0 
          ? prev.missions.map(old => old.id === m.id ? m : old)
          : [...prev.missions, m];
        return { ...prev, missions: newMissions };
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, payload => {
      const newData = payload.new as any;
      if (newData && newData.key === 'global') {
        const data = newData.data;
        setState(prev => ({
          ...prev,
          globalFY: data.globalFY || prev.globalFY,
          globalCountry: data.globalCountry || prev.globalCountry,
          globalLanguage: data.globalLanguage || prev.globalLanguage,
          isMonthlyClosed: data.isMonthlyClosed || prev.isMonthlyClosed
        }));
      }
    })
    .subscribe();

  unsubs.push(() => {
    supabase.removeChannel(channel);
  });

  return unsubs;
};

export const deleteTimesheetFromCloud = async (id: string) => {
  if (!id) return;
  try {
    const { error } = await supabase.from('timesheets').delete().eq('id', id);
    if (error) {
      console.error('Error deleting timesheet from Supabase:', error);
    }
  } catch (e) {
    console.error('Exception deleting timesheet from Supabase:', e);
  }
};

export const syncStateToCloud = async (state: AppState) => {
  try {
    // Config
    await supabase.from('config').upsert({
      key: 'global',
      data: {
        globalFY: state.globalFY,
        globalCountry: state.globalCountry,
        globalLanguage: state.globalLanguage,
        isMonthlyClosed: state.isMonthlyClosed
      }
    });

    // Budget
    if (state.globalFY) {
      await supabase.from('budget_data').upsert({
        fy: state.globalFY,
        manual_expenses: state.manualExpenses[state.globalFY] || {},
        budget_families: state.budgetFamilies[state.globalFY] || {},
        budget_values: state.budgetValues[state.globalFY] || {}
      });
    }

    // Collaborators
    if (state.collaborators.length > 0) {
      const collaboratorsData = state.collaborators.slice(0, 100).map(c => mapCollaboratorToSupabase(c));
      await supabase.from('collaborators').upsert(collaboratorsData);
    }
    // Missions massive sync removed to prevent 400 errors and avoid redundant heavy updates.
    // Targeted syncs are handled in Missions.tsx via syncMissionToCloud.
  } catch (e) {
    console.error('Supabase bulk sync failed', e);
  }
};

export const loadStateFromCloud = async (): Promise<Partial<AppState>> => {
  const results: Partial<AppState> = {};

  try {
    const { data: config } = await supabase.from('config').select('*').eq('key', 'global').single();
    if (config) {
      results.globalFY = config.data.globalFY;
      results.globalCountry = config.data.globalCountry;
      results.globalLanguage = config.data.globalLanguage;
      results.isMonthlyClosed = config.data.isMonthlyClosed;
    }

    const { data: missions } = await supabase.from('missions').select('*');
    if (missions) results.missions = missions.map(m => mapSupabaseToMission(m));

    const { data: collaborators } = await supabase.from('collaborators').select('*');
    if (collaborators) results.collaborators = collaborators.map(c => mapSupabaseToCollaborator(c));

    const { data: users } = await supabase.from('users').select('*');
    if (users) results.users = users.map(u => mapSupabaseToUser(u));

    const { data: planning } = await supabase.from('planning').select('*');
    if (planning) results.planning = planning.map(p => mapSupabaseToPlanning(p));

    const { data: timesheets } = await supabase.from('timesheets').select('*');
    if (timesheets) results.timesheets = timesheets.map(t => mapSupabaseToTimesheet(t));

    if (results.globalFY) {
      const { data: budget } = await supabase.from('budget_data').select('*').eq('fy', results.globalFY).single();
      if (budget) {
        results.manualExpenses = { [results.globalFY]: budget.manual_expenses || {} };
        results.budgetFamilies = { [results.globalFY]: budget.budget_families || {} };
        results.budgetValues = { [results.globalFY]: budget.budget_values || {} };
      }
    }
    return results;
  } catch (e) {
    console.warn('Supabase load failed', e);
    return results;
  }
};

export const createDailyBackup = async (state: AppState) => {
  // Supabase backups are handled by the DB itself usually, 
  // but we could store a snapshot if needed.
};

export const getBackups = async (): Promise<any[]> => {
  return [];
};


const getHolidays = (): Holiday[] => {
  const h: Holiday[] = [];
  const years = [2025, 2026, 2027, 2028];

  years.forEach(year => {
    // Variable Holidays logic (approximated based on known dates)
    let easterMon = "";
    let ascension = "";
    let pentecostMon = "";
    let goodFridayES = "";

    if (year === 2025) {
      easterMon = "2025-04-21"; ascension = "2025-05-29"; pentecostMon = "2025-06-09"; goodFridayES = "2025-04-18";
    } else if (year === 2026) {
      easterMon = "2026-04-06"; ascension = "2026-05-14"; pentecostMon = "2026-05-25"; goodFridayES = "2026-04-03";
    } else if (year === 2027) {
      easterMon = "2027-03-29"; ascension = "2027-05-06"; pentecostMon = "2027-05-17"; goodFridayES = "2027-03-26";
    } else if (year === 2028) {
      easterMon = "2028-04-17"; ascension = "2028-05-25"; pentecostMon = "2028-06-05"; goodFridayES = "2028-04-14";
    }

    // FRANCE
    h.push({ id: `fr-${year}-1`, country: Country.FRANCE, date: `${year}-01-01`, label: "Jour de l'An" });
    h.push({ id: `fr-${year}-2`, country: Country.FRANCE, date: easterMon, label: "Lundi de Pâques" });
    h.push({ id: `fr-${year}-3`, country: Country.FRANCE, date: `${year}-05-01`, label: "Fête du Travail" });
    h.push({ id: `fr-${year}-4`, country: Country.FRANCE, date: `${year}-05-08`, label: "Victoire 1945" });
    h.push({ id: `fr-${year}-5`, country: Country.FRANCE, date: ascension, label: "Ascension" });
    h.push({ id: `fr-${year}-6`, country: Country.FRANCE, date: pentecostMon, label: "Lundi de Pentecôte" });
    h.push({ id: `fr-${year}-7`, country: Country.FRANCE, date: `${year}-07-14`, label: "Fête Nationale" });
    h.push({ id: `fr-${year}-8`, country: Country.FRANCE, date: `${year}-08-15`, label: "Assomption" });
    h.push({ id: `fr-${year}-9`, country: Country.FRANCE, date: `${year}-11-01`, label: "Toussaint" });
    h.push({ id: `fr-${year}-10`, country: Country.FRANCE, date: `${year}-11-11`, label: "Armistice 1918" });
    h.push({ id: `fr-${year}-11`, country: Country.FRANCE, date: `${year}-12-25`, label: "Noël" });

    // ESPAGNE
    h.push({ id: `es-${year}-1`, country: Country.SPAIN, date: `${year}-01-01`, label: "Año Nuevo" });
    h.push({ id: `es-${year}-2`, country: Country.SPAIN, date: `${year}-01-06`, label: "Epifanía del Señor" });
    h.push({ id: `es-${year}-3`, country: Country.SPAIN, date: goodFridayES, label: "Viernes Santo" });
    h.push({ id: `es-${year}-4`, country: Country.SPAIN, date: `${year}-05-01`, label: "Fiesta del Trabajo" });
    h.push({ id: `es-${year}-5`, country: Country.SPAIN, date: `${year}-08-15`, label: "Asunción de la Virgen" });
    h.push({ id: `es-${year}-6`, country: Country.SPAIN, date: `${year}-10-12`, label: "Fiesta Nacional de España" });
    h.push({ id: `es-${year}-7`, country: Country.SPAIN, date: `${year}-11-01`, label: "Todos los Santos" });
    h.push({ id: `es-${year}-8`, country: Country.SPAIN, date: `${year}-12-06`, label: "Día de la Constitución" });
    h.push({ id: `es-${year}-9`, country: Country.SPAIN, date: `${year}-12-08`, label: "Inmaculada Concepción" });
    h.push({ id: `es-${year}-10`, country: Country.SPAIN, date: `${year}-12-25`, label: "Natividad del Señor" });

    // ITALIE
    h.push({ id: `it-${year}-1`, country: Country.ITALY, date: `${year}-01-01`, label: "Capodanno" });
    h.push({ id: `it-${year}-2`, country: Country.ITALY, date: `${year}-01-06`, label: "Epifania" });
    h.push({ id: `it-${year}-3`, country: Country.ITALY, date: easterMon, label: "Lunedì dell'Angelo" });
    h.push({ id: `it-${year}-4`, country: Country.ITALY, date: `${year}-04-25`, label: "Festa della Liberazione" });
    h.push({ id: `it-${year}-5`, country: Country.ITALY, date: `${year}-05-01`, label: "Festa del Lavoro" });
    h.push({ id: `it-${year}-6`, country: Country.ITALY, date: `${year}-06-02`, label: "Festa della Repubblica" });
    h.push({ id: `it-${year}-7`, country: Country.ITALY, date: `${year}-08-15`, label: "Ferragosto" });
    h.push({ id: `it-${year}-8`, country: Country.ITALY, date: `${year}-11-01`, label: "Ognissanti" });
    h.push({ id: `it-${year}-9`, country: Country.ITALY, date: `${year}-12-08`, label: "Immacolata Concezione" });
    h.push({ id: `it-${year}-10`, country: Country.ITALY, date: `${year}-12-25`, label: "Natale" });
    h.push({ id: `it-${year}-11`, country: Country.ITALY, date: `${year}-12-26`, label: "Santo Stefano" });
  });

  return h;
};

export const getInitialState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);

  const users = parseCSVUsers();
  const missionLines = SEED_MISSIONS_RAW.split('\n');
  const missions: Mission[] = missionLines.slice(1).map((line, idx) => {
    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cleanParts = parts.map(p => p.trim().replace(/^"|$/g, ''));
    const [client, country, name, fy25, fy26, email, type, mode, typology, start, end, status] = cleanParts;
    const manager = users.find(u => u.email === email);
    let newStatus = MissionStatus.EN_COURS;
    if (status === 'Clôturée' || status === 'Terminée') {
      newStatus = MissionStatus.TERMINEE;
    }
    return {
      id: `m-${idx}`,
      clientId: `c-${idx}`,
      clientName: client,
      name: name,
      managerId: manager?.id || users[0].id,
      billingMode: mode === 'Forfait' ? BillingMode.FORFAIT : BillingMode.REGIE,
      type: type,
      typology: typology,
      country: country as Country,
      startDate: parseCSVDate(start),
      endDate: parseCSVDate(end),
      status: newStatus,
      managerCollaboratorId: '', 
      forfaitAmountCurrentFY: parseInt(fy25) || 0,
      forfaitAmountNextFY: parseInt(fy26) || 0,
      active: true,
      internalStaffing: []
    };
  });

  const planning: PlanningEntry[] = [];
  const activeMissions = missions.filter(m => m.status === MissionStatus.EN_COURS);
  const consultants = users.filter(u => ['Consultant', 'Delivery Manager', 'Principal'].includes(u.grade));

  consultants.forEach((user, uIdx) => {
    const myMissionsCount = (uIdx % 2) + 1;
    const startIndex = (uIdx * 2) % activeMissions.length;
    const myMissions = activeMissions.slice(startIndex, startIndex + myMissionsCount);
    myMissions.forEach((mission, mIdx) => {
      const start = parseISO(mission.startDate);
      const end = parseISO(mission.endDate);
      const staffingRow: InternalStaffing = {
        id: generateId(),
        userId: user.id,
        collaboratorId: user.id,
        startDate: mission.startDate,
        endDate: mission.endDate,
        percentage: 30 + (mIdx * 10),
        cjm: user.cjm,
        tjm: 800
      };
      if (!mission.internalStaffing) mission.internalStaffing = [];
      mission.internalStaffing.push(staffingRow);
      try {
        const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
        weeks.forEach(w => {
          planning.push({
            id: generateId(),
            userId: user.id,
            collaboratorId: user.id,
            missionId: mission.id,
            weekStart: format(w, 'yyyy-MM-dd'),
            percentage: staffingRow.percentage,
            tjm: staffingRow.tjm,
            costDay: staffingRow.cjm
          });
        });
      } catch (e) {}
    });
  });

  const now = new Date();
  const currentFY = getFiscalYear(now);

  const referenceFamilies = [
    { id: 'fam-p1', label: 'Salaires, primes, indemnités de transport et congés payés (641…)', categoryId: 'personnel' },
    { id: 'fam-p2', label: 'Charges patronales (645…)', categoryId: 'personnel' },
    { id: 'fam-p3', label: 'Versement CSE, médecine du travail (647…)', categoryId: 'personnel' },
    { id: 'fam-p4', label: 'Taxes de personnel', categoryId: 'personnel' },
    { id: 'fam-p5', label: 'Congés payés', categoryId: 'personnel' },
    { id: 'fam-c1', label: 'Ext. (entité externe) => Transfo', categoryId: 'contractors' },
    { id: 'fam-c2', label: 'ESPAGNE => France', categoryId: 'contractors' },
    { id: 'fam-c3', label: 'Transfo => Ext (entité externe)', categoryId: 'contractors' },
    { id: 'fam-c4', label: 'Transfo => Proc (EPSA SAS)', categoryId: 'contractors' },
    { id: 'fam-c5', label: 'Proc (EPSA SAS) => Transfo', categoryId: 'contractors' },
    { id: 'fam-o1', label: 'Office Expenses (loc. bureau, taxe, ménage, services, etc…)', categoryId: 'opex' },
    { id: 'fam-o2', label: 'Vehicle expenses (loc véh. Maintenance, essence…)', categoryId: 'opex' },
    { id: 'fam-o3', label: 'Travel expenses (NDF)', categoryId: 'opex' },
    { id: 'fam-o4', label: 'Prestation externalisées (Corpo : avocat, cac, compta…)', categoryId: 'opex' },
    { id: 'fam-o5', label: 'IT Expenses (PC, licences, outils, internet, TMA…)', categoryId: 'opex' },
    { id: 'fam-o6', label: 'HR & Social Expenses (recrutement, formations, avocats…)', categoryId: 'opex' },
    { id: 'fam-o7', label: 'Sales & Marketing expenses (Business event, comm, RP, salons…)', categoryId: 'opex' },
    { id: 'fam-o8', label: 'Internal event (séminaire, évènements internes…)', categoryId: 'opex' },
    { id: 'fam-o9', label: 'Others Expenses (cadeaux clients, prestations externes…)', categoryId: 'opex' },
    { id: 'fam-o10', label: 'Impôts et Taxes', categoryId: 'opex' },
  ];

  const budgetFamilies: Record<string, Record<string, BudgetFamily[]>> = {};
  const manualExpenses: Record<string, Record<string, ManualExpense[]>> = {};
  const budgetValues: Record<string, Record<string, Record<string, number>>> = {};
  
  for (let year = 2023; year <= 2030; year++) {
    const fyKey = `FY${year}`;
    budgetFamilies[fyKey] = {};
    manualExpenses[fyKey] = {};
    budgetValues[fyKey] = {};
    
    Object.values(Country).forEach(c => {
      budgetFamilies[fyKey][c] = [...referenceFamilies];
      manualExpenses[fyKey][c] = [];
      
      const defaultValues: Record<string, number> = {};
      
      // Configuration des budgets CA (revenue_total) par pays et par exercice
      if (year === 2025) {
        if (c === Country.FRANCE) defaultValues['revenue_total'] = 5400000;
        if (c === Country.SPAIN) defaultValues['revenue_total'] = 1000000;
        if (c === Country.ITALY) defaultValues['revenue_total'] = 500000;
      } else if (year === 2026) {
        if (c === Country.FRANCE) defaultValues['revenue_total'] = 6000000;
        if (c === Country.SPAIN) defaultValues['revenue_total'] = 800000;
        if (c === Country.ITALY) defaultValues['revenue_total'] = 600000;
      } else {
        // Valeurs par défaut pour les autres années si non spécifiées
        if (c === Country.FRANCE) defaultValues['revenue_total'] = 4000000;
        if (c === Country.SPAIN) defaultValues['revenue_total'] = 600000;
        if (c === Country.ITALY) defaultValues['revenue_total'] = 400000;
      }
      
      budgetValues[fyKey][c] = defaultValues;
    });
  }
  
  return {
    users,
    collaborators: [],
    missions,
    planning,
    timesheets: [],
    holidays: getHolidays(),
    currentUser: users[0],
    globalFY: currentFY,
    globalCountry: Country.FRANCE,
    globalLanguage: 'FR',
    isMonthlyClosed: false,
    manualExpenses,
    budgetFamilies,
    budgetValues
  };
};

export const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
