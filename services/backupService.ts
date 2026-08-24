import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { 
  Collaborator, 
  Mission, 
  PlanningEntry, 
  TimesheetEntry, 
  AppState
} from '../types';

export interface BackupMetadata {
  app: string;
  exportVersion: string;
  exportedAt: string;
  environment: string;
  schema: string;
  description: string;
}

export interface FullBackup {
  metadata: BackupMetadata;
  data: {
    collaborators: any[];
    missions: any[];
    planning: any[];
    timesheets: any[];
    budget_data: any[];
    config: any[];
    xsell_opportunities?: any[];
    pointed_expenses?: string[];
  };
  technical: {
    legacy_users: any[];
    control_summary?: any[];
  };
}

export interface RestorePoint {
  id: string;
  createdAt: string; // ISO string
  type: 'auto' | 'manual';
  label: string;
  summary: {
    collaborators: number;
    missions: number;
    planning: number;
    timesheets: number;
    budget_data: number;
    config: number;
    legacy_users: number;
    xsell_opportunities: number;
  };
  backup: FullBackup;
}

export type ImportMode = 'fusion' | 'restore';

export interface ImportPreview {
  metadata: BackupMetadata;
  summary: {
    collaborators: number;
    missions: number;
    planning: number;
    timesheets: number;
    budget_data: number;
    config: number;
    legacy_users: number;
    xsell_opportunities: number;
  };
  warnings: string[];
}

const LOCAL_STORAGE_RESTORE_POINTS_KEY = 'optimus_restore_points_v1';
const SUPABASE_CONFIG_RESTORE_POINTS_KEY = 'system_restore_points';
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours glissants (1 mois)

/**
 * Validates if a string is a valid UUID
 */
export const isValidUuid = (uuid: any): boolean => {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
};

/**
 * Fetches all rows from a Supabase table using pagination.
 */
export const fetchAllRows = async (table: string): Promise<any[]> => {
  let allData: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Error fetching all rows from ${table}:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }
  
  return allData;
};

/**
 * EXPORT JSON COMPLET
 * Extrait l'intégralité des tables (Missions, Collaborateurs, Planning, Timesheets, Budgets, Xsell, Config, Users)
 */
export const exportFullBackupJson = async (): Promise<FullBackup> => {
  const tables = ['collaborators', 'missions', 'planning', 'timesheets', 'budget_data', 'config', 'users', 'xsell_opportunities'];
  
  const results = await Promise.all(tables.map(async table => {
    try {
      const data = await fetchAllRows(table);
      // Filter out restore points stored inside config to avoid recursive bloat
      const filteredData = table === 'config' 
        ? data.filter(c => c.key !== SUPABASE_CONFIG_RESTORE_POINTS_KEY && !c.key?.startsWith('rp_item_'))
        : data;
      return { table, data: filteredData, success: true };
    } catch (error: any) {
      console.warn(`Could not export table ${table}:`, error?.message || error);
      return { table, data: [], success: false, error: error.message };
    }
  }));

  const collaborators = results.find(r => r.table === 'collaborators')?.data || [];
  const missions = results.find(r => r.table === 'missions')?.data || [];
  const planning = results.find(r => r.table === 'planning')?.data || [];
  const timesheets = results.find(r => r.table === 'timesheets')?.data || [];
  const budget_data = results.find(r => r.table === 'budget_data')?.data || [];
  const config = results.find(r => r.table === 'config')?.data || [];
  const users = results.find(r => r.table === 'users')?.data || [];
  const xsell_opportunities = results.find(r => r.table === 'xsell_opportunities')?.data || [];

  // Pointed expenses from local storage
  let pointedExpenses: string[] = [];
  try {
    const stored = localStorage.getItem('optimus_pointed_expenses');
    if (stored) pointedExpenses = JSON.parse(stored);
  } catch (e) {
    // Ignore error
  }

  const backup: FullBackup = {
    metadata: {
      app: "OptimusPlan",
      exportVersion: "2.0.0",
      exportedAt: new Date().toISOString(),
      environment: "production",
      schema: "supabase",
      description: "Sauvegarde intégrale OptimusPlan (Missions, Budgets, Collaborateurs, Timesheets, Xsell)"
    },
    data: {
      collaborators,
      missions,
      planning,
      timesheets,
      budget_data,
      config,
      xsell_opportunities,
      pointed_expenses: pointedExpenses
    },
    technical: {
      legacy_users: users,
      control_summary: results.map(r => ({
        table: r.table,
        count: r.data.length,
        status: r.success ? 'OK' : 'ERROR',
        error: r.error
      }))
    }
  };

  return backup;
};

/**
 * EXPORT EXCEL
 */
export const exportFullBackupExcel = async (): Promise<XLSX.WorkBook> => {
  const backup = await exportFullBackupJson();
  const wb = XLSX.utils.book_new();

  const sheets = [
    { name: 'collaborators', data: backup.data.collaborators },
    { name: 'missions', data: backup.data.missions },
    { name: 'planning', data: backup.data.planning },
    { name: 'timesheets', data: backup.data.timesheets },
    { name: 'budget_data', data: backup.data.budget_data },
    { name: 'config', data: backup.data.config },
    { name: 'xsell_opportunities', data: backup.data.xsell_opportunities || [] },
    { name: 'legacy_users', data: backup.technical.legacy_users },
  ];

  sheets.forEach(sheet => {
    // Process JSONB columns to string for Excel
    const processedData = sheet.data.map(item => {
      const flat: any = { ...item };
      Object.keys(flat).forEach(key => {
        if (flat[key] !== null && typeof flat[key] === 'object') {
          flat[key] = JSON.stringify(flat[key]);
        }
      });
      return flat;
    });

    const ws = XLSX.utils.json_to_sheet(processedData);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });

  return wb;
};

/**
 * VALIDATION DU FORMAT DE SAUVEGARDE
 */
export const validateBackupJson = (content: any): { valid: boolean; error?: string; backup?: FullBackup } => {
  if (!content || typeof content !== 'object') return { valid: false, error: "Format JSON invalide" };
  
  if (!content.data) return { valid: false, error: "Section 'data' absente" };
  
  const requiredTables = ['collaborators', 'missions', 'planning', 'timesheets', 'budget_data', 'config'];
  for (const table of requiredTables) {
    if (!content.data[table] || !Array.isArray(content.data[table])) {
      return { valid: false, error: `Table '${table}' absente ou format invalide` };
    }
  }

  return { valid: true, backup: content as FullBackup };
};

export const getImportPreview = (backup: FullBackup): ImportPreview => {
  const warnings: string[] = [];
  
  if (!backup.metadata) warnings.push("Métadonnées absentes du fichier");

  // Relations check
  const collIds = new Set(backup.data.collaborators.map(c => c.id));
  const missionIds = new Set(backup.data.missions.map(m => m.id));

  backup.data.planning.forEach((p, idx) => {
    if (p.mission_id && !missionIds.has(p.mission_id)) {
      warnings.push(`Planning [${idx}]: Mission ID '${p.mission_id}' introuvable dans le fichier`);
    }
    if (p.collaborator_id && !collIds.has(p.collaborator_id)) {
      warnings.push(`Planning [${idx}]: Collaborateur ID '${p.collaborator_id}' introuvable dans le fichier`);
    }
  });

  backup.data.timesheets.forEach((t, idx) => {
    if (t.mission_id && !missionIds.has(t.mission_id)) {
      warnings.push(`Timesheet [${idx}]: Mission ID '${t.mission_id}' introuvable dans le fichier`);
    }
    if (t.collaborator_id && !collIds.has(t.collaborator_id)) {
      warnings.push(`Timesheet [${idx}]: Collaborateur ID '${t.collaborator_id}' introuvable dans le fichier`);
    }
  });

  backup.data.missions.forEach((m, idx) => {
    if (m.manager_collaborator_id && !collIds.has(m.manager_collaborator_id)) {
      warnings.push(`Mission '${m.name}': Manager ID '${m.manager_collaborator_id}' introuvable dans le fichier`);
    }
  });

  return {
    metadata: backup.metadata,
    summary: {
      collaborators: backup.data.collaborators.length,
      missions: backup.data.missions.length,
      planning: backup.data.planning.length,
      timesheets: backup.data.timesheets.length,
      budget_data: backup.data.budget_data.length,
      config: backup.data.config.length,
      legacy_users: backup.technical?.legacy_users?.length || 0,
      xsell_opportunities: backup.data.xsell_opportunities?.length || 0
    },
    warnings
  };
};

/**
 * IMPORT ET RESTAURATION COMPLÈTE
 * Applique fidèlement les données de la sauvegarde dans la base et le stockage local
 */
export const importBackupJson = async (backup: FullBackup, mode: ImportMode): Promise<{ success: boolean; report: string }> => {
  try {
    if (mode === 'restore') {
      // 1. Suppression ordonnée (pour respecter les contraintes d'intégrité relationnelle)
      try { await supabase.from('timesheets').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
      try { await supabase.from('planning').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
      try { await supabase.from('missions').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
      try { await supabase.from('collaborators').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
      try { await supabase.from('budget_data').delete().neq('fy', 'NONE'); } catch (e) {}
      try { await supabase.from('config').delete().neq('key', 'NONE'); } catch (e) {}
      try { await supabase.from('xsell_opportunities').delete().not('id', 'is', null); } catch (e) {}
    }

    // 2. Insertion / Upsert par lots (chunks de 50)
    const CHUNK_SIZE = 50;

    const upsertTable = async (table: string, data: any[]) => {
      if (!data || data.length === 0) return;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) {
          console.error(`Erreur lors de l'upsert dans ${table}:`, error);
          throw new Error(`Erreur lors de l'upsert dans ${table}: ${error.message}`);
        }
      }
    };

    if (backup.data.collaborators?.length) await upsertTable('collaborators', backup.data.collaborators);
    if (backup.data.missions?.length) await upsertTable('missions', backup.data.missions);
    if (backup.data.planning?.length) await upsertTable('planning', backup.data.planning);
    if (backup.data.timesheets?.length) await upsertTable('timesheets', backup.data.timesheets);
    if (backup.data.budget_data?.length) await upsertTable('budget_data', backup.data.budget_data);
    if (backup.data.config?.length) await upsertTable('config', backup.data.config);
    if (backup.data.xsell_opportunities?.length) await upsertTable('xsell_opportunities', backup.data.xsell_opportunities);

    // 3. Restauration des pointages de dépenses budgétaires
    if (backup.data.pointed_expenses) {
      try {
        localStorage.setItem('optimus_pointed_expenses', JSON.stringify(backup.data.pointed_expenses));
      } catch (e) {}
    }

    const report = `Restauration réussie (${mode === 'restore' ? 'Remplacement intégral' : 'Fusion'}) :
• ${backup.data.collaborators?.length || 0} collaborateurs
• ${backup.data.missions?.length || 0} missions
• ${backup.data.planning?.length || 0} allocations planning
• ${backup.data.timesheets?.length || 0} feuilles de temps
• ${backup.data.budget_data?.length || 0} exercices budgétaires
• ${backup.data.xsell_opportunities?.length || 0} opportunités Xsell
• Configuration générale & pointages réintégrés`;

    return { success: true, report };
  } catch (error: any) {
    return { success: false, report: `Erreur d'importation: ${error.message}` };
  }
};

/**
 * GESTION DES POINTS DE RESTAURATION (1 MOIS GLISSANT = 30 JOURS)
 * Sauvegarde bi-quotidienne automatique :
 * - Créneau 1 : 00h01 (Nuit)
 * - Créneau 2 : 12h00 (Midi)
 */

export interface RestorePointHeader {
  id: string;
  createdAt: string;
  type: 'auto' | 'manual';
  label: string;
  slotKey?: string; // e.g. "2026-08-24_00h01" or "2026-08-24_12h00"
  summary: {
    collaborators: number;
    missions: number;
    planning: number;
    timesheets: number;
    budget_data: number;
    config: number;
    legacy_users: number;
    xsell_opportunities: number;
  };
}

/**
 * Récupère la liste des points de restauration actifs (purgés au-delà de 30 jours)
 */
export const getRestorePoints = async (): Promise<RestorePoint[]> => {
  const cutoffTime = Date.now() - RETENTION_PERIOD_MS;
  let points: RestorePoint[] = [];

  // 1. Essayer depuis Supabase config
  try {
    const { data, error } = await supabase
      .from('config')
      .select('data')
      .eq('key', SUPABASE_CONFIG_RESTORE_POINTS_KEY)
      .maybeSingle();

    if (!error && data?.data && Array.isArray(data.data)) {
      points = data.data;
    }
  } catch (e) {
    console.warn("Impossible de charger les sauvegardes depuis Supabase config", e);
  }

  // 2. Fallback / Merge avec LocalStorage
  try {
    const localStored = localStorage.getItem(LOCAL_STORAGE_RESTORE_POINTS_KEY);
    if (localStored) {
      const localPoints: RestorePoint[] = JSON.parse(localStored);
      const existingIds = new Set(points.map(p => p.id));
      localPoints.forEach(lp => {
        if (!existingIds.has(lp.id)) {
          points.push(lp);
        }
      });
    }
  } catch (e) {
    console.warn("Erreur lecture LocalStorage restore points", e);
  }

  // 3. Purge des points plus anciens que 30 jours (1 mois glissant)
  const validPoints = points.filter(p => {
    const pointTime = new Date(p.createdAt).getTime();
    return !isNaN(pointTime) && pointTime >= cutoffTime;
  });

  // Tri par date décroissante (le plus récent en premier)
  validPoints.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Si des points ont été purgés, on met à jour les stockages
  if (validPoints.length !== points.length) {
    await persistRestorePointsList(validPoints);
  }

  return validPoints;
};

/**
 * Sauvegarde la liste des points de restauration
 */
const persistRestorePointsList = async (points: RestorePoint[]) => {
  // Limiter la taille max à 65 points (soit > 30 jours * 2 sauvegardes par jour)
  const trimmed = points.slice(0, 65);

  // Sauvegarde Supabase en premier
  try {
    await supabase.from('config').upsert({
      key: SUPABASE_CONFIG_RESTORE_POINTS_KEY,
      data: trimmed,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn("Erreur écriture Supabase config restore points", e);
  }

  // Sauvegarde LocalStorage avec fallback gracieux si quota plein
  try {
    localStorage.setItem(LOCAL_STORAGE_RESTORE_POINTS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // Si quota dépassé, on stocke les 10 plus récents
    try {
      localStorage.setItem(LOCAL_STORAGE_RESTORE_POINTS_KEY, JSON.stringify(trimmed.slice(0, 10)));
    } catch (err) {
      console.warn("Erreur écriture LocalStorage restore points", err);
    }
  }
};

/**
 * Crée un point de restauration instantané
 */
export const createRestorePoint = async (
  type: 'auto' | 'manual' = 'manual', 
  customLabel?: string
): Promise<{ success: boolean; point?: RestorePoint; error?: string }> => {
  try {
    // 1. Génération de l'instantané complet
    const backup = await exportFullBackupJson();
    const now = new Date();
    
    const formattedDate = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const defaultLabel = type === 'auto' 
      ? `Sauvegarde automatique (${formattedDate})` 
      : `Sauvegarde manuelle (${formattedDate})`;

    const pointId = `rp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newPoint: RestorePoint = {
      id: pointId,
      createdAt: now.toISOString(),
      type,
      label: customLabel || defaultLabel,
      summary: {
        collaborators: backup.data.collaborators.length,
        missions: backup.data.missions.length,
        planning: backup.data.planning.length,
        timesheets: backup.data.timesheets.length,
        budget_data: backup.data.budget_data.length,
        config: backup.data.config.length,
        legacy_users: backup.technical?.legacy_users?.length || 0,
        xsell_opportunities: backup.data.xsell_opportunities?.length || 0
      },
      backup
    };

    // 2. Récupération des points existants
    const existingPoints = await getRestorePoints();
    const updatedPoints = [newPoint, ...existingPoints];

    // 3. Enregistrement avec purge 30 jours
    await persistRestorePointsList(updatedPoints);

    return { success: true, point: newPoint };
  } catch (err: any) {
    console.error("Erreur création point de restauration:", err);
    return { success: false, error: err.message || "Erreur inconnue" };
  }
};

/**
 * Supprime un point de restauration spécifique
 */
export const deleteRestorePoint = async (pointId: string): Promise<boolean> => {
  try {
    const points = await getRestorePoints();
    const filtered = points.filter(p => p.id !== pointId);
    await persistRestorePointsList(filtered);
    return true;
  } catch (e) {
    console.error("Erreur suppression restore point:", e);
    return false;
  }
};

/**
 * Renvoie la clé de slot pour le créneau en cours :
 * - Créneau 00h01 : De 00h01 à 11h59m59s
 * - Créneau 12h00 : De 12h00 à 23h59m59s
 */
export const getCurrentBackupSlot = (date: Date = new Date()): { slotKey: string; slotLabel: string; slotTime: string; startTime: number } => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateIso = `${year}-${month}-${day}`;

  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Si on est à 00h00 pile (avant 00h01), on se réfère au slot 12h00 de la veille
  if (hours === 0 && minutes < 1) {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const yYear = yesterday.getFullYear();
    const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yDay = String(yesterday.getDate()).padStart(2, '0');
    const yDateIso = `${yYear}-${yMonth}-${yDay}`;
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 12, 0, 0).getTime();
    return {
      slotKey: `${yDateIso}_12h00`,
      slotLabel: `12h00 (Midi) - ${yesterday.toLocaleDateString('fr-FR')}`,
      slotTime: '12h00',
      startTime: start
    };
  }

  // De 00h01 à 11h59 -> Créneau 00h01
  if (hours < 12) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 1, 0).getTime();
    return {
      slotKey: `${dateIso}_00h01`,
      slotLabel: `00h01 (Nuit) - ${date.toLocaleDateString('fr-FR')}`,
      slotTime: '00h01',
      startTime: start
    };
  }

  // De 12h00 à 23h59 -> Créneau 12h00
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0).getTime();
  return {
    slotKey: `${dateIso}_12h00`,
    slotLabel: `12h00 (Midi) - ${date.toLocaleDateString('fr-FR')}`,
    slotTime: '12h00',
    startTime: start
  };
};

/**
 * Vérifie et déclenche les 2 sauvegardes automatiques quotidiennes (00h01 et 12h00).
 * Pour le créneau actuel :
 * - Si aucune sauvegarde automatique n'a encore été enregistrée depuis le début du créneau, elle est créée immédiatement.
 */
export const checkAndTriggerDailyAutoBackup = async () => {
  try {
    const now = new Date();
    const slot = getCurrentBackupSlot(now);

    // 1. Vérification dans les points de restauration existants
    const points = await getRestorePoints();
    
    // Y a-t-il déjà un point automatique créé dans ce créneau ?
    const hasBackupInCurrentSlot = points.some(p => {
      if (p.type !== 'auto') return false;
      const pTime = new Date(p.createdAt).getTime();
      return pTime >= slot.startTime && pTime <= now.getTime();
    });

    if (!hasBackupInCurrentSlot) {
      console.log(`[Backup 2x/jour] Déclenchement de la sauvegarde automatique pour le créneau ${slot.slotLabel}...`);
      const dateFormatted = now.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const res = await createRestorePoint(
        'auto', 
        `Sauvegarde automatique de ${slot.slotTime} - ${dateFormatted}`
      );
      if (res.success) {
        console.log(`[Backup 2x/jour] Sauvegarde automatique de ${slot.slotTime} créée avec succès !`);
      } else {
        console.error(`[Backup 2x/jour] Échec de la création:`, res.error);
      }
    } else {
      console.log(`[Backup 2x/jour] Sauvegarde automatique déjà existante pour le créneau ${slot.slotLabel}.`);
    }
  } catch (e) {
    console.warn("[Backup 2x/jour] Erreur lors du contrôle des sauvegardes bi-quotidiennes", e);
  }
};

/**
 * IMPORT EXCEL
 */
export const validateAndParseExcel = (workbook: XLSX.WorkBook): FullBackup => {
  const data: any = {};
  const technical: any = { legacy_users: [] };

  const tables = ['collaborators', 'missions', 'planning', 'timesheets', 'budget_data', 'config', 'xsell_opportunities'];
  
  tables.forEach(table => {
    const ws = workbook.Sheets[table];
    if (ws) {
      let json = XLSX.utils.sheet_to_json(ws);
      // Try to parse JSONB strings back to objects
      json = json.map((item: any) => {
        const processed = { ...item };
        Object.keys(processed).forEach(key => {
          const val = processed[key];
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try {
              processed[key] = JSON.parse(val);
            } catch (e) {
              // Ignore if not valid JSON
            }
          }
        });
        return processed;
      });
      data[table] = json;
    } else {
      data[table] = [];
    }
  });

  const usersWs = workbook.Sheets['legacy_users'];
  if (usersWs) {
    technical.legacy_users = XLSX.utils.sheet_to_json(usersWs);
  }

  return {
    metadata: {
      app: "OptimusPlan",
      exportVersion: "2.0.0 (from Excel)",
      exportedAt: new Date().toISOString(),
      environment: "production",
      schema: "supabase",
      description: "Import depuis fichier Excel"
    },
    data: data as any,
    technical
  };
};

