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
  };
  technical: {
    legacy_users: any[];
  };
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
  };
  warnings: string[];
}

/**
 * Validates if a string is a valid UUID
 */
const isValidUuid = (uuid: any): boolean => {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
};

/**
 * EXPORT JSON
 */
export const exportFullBackupJson = async (): Promise<FullBackup> => {
  const [
    { data: collaborators },
    { data: missions },
    { data: planning },
    { data: timesheets },
    { data: budget_data },
    { data: config },
    { data: users }
  ] = await Promise.all([
    supabase.from('collaborators').select('*'),
    supabase.from('missions').select('*'),
    supabase.from('planning').select('*'),
    supabase.from('timesheets').select('*'),
    supabase.from('budget_data').select('*'),
    supabase.from('config').select('*'),
    supabase.from('users').select('*'),
  ]);

  const backup: FullBackup = {
    metadata: {
      app: "OptimusPlan",
      exportVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      environment: "production",
      schema: "supabase",
      description: "Full OptimusPlan business backup"
    },
    data: {
      collaborators: collaborators || [],
      missions: missions || [],
      planning: planning || [],
      timesheets: timesheets || [],
      budget_data: budget_data || [],
      config: config || []
    },
    technical: {
      legacy_users: users || []
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
 * VALIDATE & PREVIEW
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

  // Basic check for IDs and relations
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
      legacy_users: backup.technical?.legacy_users?.length || 0
    },
    warnings
  };
};

/**
 * IMPORT JSON
 */
export const importBackupJson = async (backup: FullBackup, mode: ImportMode): Promise<{ success: boolean; report: string }> => {
  try {
    if (mode === 'restore') {
      // 1. Delete in order
      await supabase.from('timesheets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('planning').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('missions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('collaborators').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('budget_data').delete().neq('fy', 'NONE');
      await supabase.from('config').delete().neq('key', 'NONE');
    }

    // 2. Insert/Upsert in order
    // Chunking to avoid large payload errors
    const CHUNK_SIZE = 50;

    const upsertTable = async (table: string, data: any[]) => {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) throw new Error(`Erreur lors de l'upsert dans ${table}: ${error.message}`);
      }
    };

    await upsertTable('collaborators', backup.data.collaborators);
    await upsertTable('missions', backup.data.missions);
    await upsertTable('planning', backup.data.planning);
    await upsertTable('timesheets', backup.data.timesheets);
    await upsertTable('budget_data', backup.data.budget_data);
    await upsertTable('config', backup.data.config);

    const report = `Importation réussie (${mode}):
- ${backup.data.collaborators.length} collaborateurs
- ${backup.data.missions.length} missions
- ${backup.data.planning.length} planning rows
- ${backup.data.timesheets.length} timesheets
- ${backup.data.budget_data.length} budget records
- ${backup.data.config.length} configuration items`;

    return { success: true, report };
  } catch (error: any) {
    return { success: false, report: `Erreur d'importation: ${error.message}` };
  }
};

/**
 * IMPORT EXCEL
 */
export const validateAndParseExcel = (workbook: XLSX.WorkBook): FullBackup => {
  const data: any = {};
  const technical: any = { legacy_users: [] };

  const tables = ['collaborators', 'missions', 'planning', 'timesheets', 'budget_data', 'config'];
  
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
      exportVersion: "1.0.0 (from Excel)",
      exportedAt: new Date().toISOString(),
      environment: "production",
      schema: "supabase",
      description: "Import from Excel"
    },
    data: data as any,
    technical
  };
};
