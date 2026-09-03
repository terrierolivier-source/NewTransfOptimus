import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, X, Save, AlertTriangle, 
  Download, Upload, FileJson, FileSpreadsheet, 
  CheckCircle, XCircle, Info, ChevronRight,
  Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX,
  User as UserIcon, CalendarDays, LogOut, Database, Clock,
  ShieldAlert, List, Server, RefreshCw,
  TrendingUp, Loader2, Check, AlertCircle,
  History, RotateCcw, FileDown, Sparkles
} from 'lucide-react';
import { AppState, Country, Holiday, User, Mission, MissionStatus, BillingMode, Role, Collaborator, CollaboratorType } from '../types';
import { generateId, formatDateDisplay } from '../utils';
import { getBackups, syncCollaboratorToCloud, deleteCollaboratorFromCloud, loadStateFromCloud } from '../services/dataService';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { XsellOpportunity } from './XsellOpportunities';
import { 
  exportFullBackupJson, 
  exportFullBackupExcel, 
  validateBackupJson, 
  getImportPreview, 
  importBackupJson, 
  validateAndParseExcel,
  FullBackup,
  ImportPreview,
  ImportMode,
  RestorePoint,
  getRestorePoints,
  createRestorePoint,
  deleteRestorePoint
} from '../services/backupService';

interface AdminProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

// Xsell Import Utilities
const parseYearXsell = (val: any): number | null => {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  if (typeof val === 'number') return val;
  const matches = String(val).match(/\d+/);
  if (matches) return parseInt(matches[0]);
  return null;
};

const parseNumberXsell = (val: any): number | null => {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  if (typeof val === 'number') return val;
  const cleanStr = String(val).replace(/[\s€$kK]/g, '').replace(',', '.');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? null : parsed;
};

const findHeaderKeyXsell = (rawHeader: string): keyof XsellOpportunity | null => {
  const clean = rawHeader.toLowerCase().trim();
  const norm = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (norm === 'anneedulead' || norm === 'annee') return 'year';
  if (norm === 'responsablelead' || norm === 'responablelead' || norm === 'responsable' || norm === 'responable') return 'account_owner';
  if (norm === 'compteclient' || norm === 'client' || norm === 'compte') return 'account_name';
  if (norm === 'entitebeneficiaire' || norm === 'entite') return 'beneficiary_entity';
  if (norm === 'contactdelentitebeneficiaire' || norm === 'contactdentitebeneficiaire' || norm === 'contact') return 'beneficiary_contact';
  if (norm === 'sujetsxsell' || norm === 'sujet' || norm === 'sujets') return 'subject';
  if (norm === 'statutmission' || norm === 'statut') return 'status';
  if (norm === 'typederefacturation' || norm === 'typerefacturation' || norm === 'billingmodel') return 'billing_model';
  if (norm === 'economiesclientestimees' || norm === 'economiesestimees' || norm === 'economies') return 'estimated_client_savings';
  if (norm === 'desfdelentitebeneficiaire' || norm === 'sfentitebeneficiaire' || norm === 'beneficiarysfpercentage') return 'beneficiary_sf_percentage';
  if (norm === 'caentitebeneficiaireestime' || norm === 'caestime' || norm === 'ca') return 'estimated_revenue';
  if (norm === 'derefactransfo' || norm === 'refactransfo' || norm === 'refacpercentage') return 'refac_percentage';
  if (norm === 'montantafacturertransfo' || norm === 'montantafacturer' || norm === 'amounttoinvoice') return 'amount_to_invoice';
  if (norm === 'statutdefacturationtransfo' || norm === 'statutfacturation' || norm === 'transfoinvoiced') return 'transfo_invoiced';
  if (norm === 'datedefacturationtransfo' || norm === 'datedefacturation' || norm === 'transfoinvoicedate') return 'transfo_invoice_date';
  if (norm === 'commentaires' || norm === 'commentaire' || norm === 'comments') return 'comments';

  if (clean.includes('annee') && clean.includes('lead')) return 'year';
  if (clean.includes('responsable') || clean.includes('responable')) return 'account_owner';
  if (clean.includes('compte') && clean.includes('client')) return 'account_name';
  if (clean.includes('contact')) return 'beneficiary_contact';
  if (clean.includes('entite') && clean.includes('beneficiaire') && !clean.includes('sf') && !clean.includes('ca')) {
    return 'beneficiary_entity';
  }
  if (clean.includes('sujet')) return 'subject';
  if (clean.includes('statut') && clean.includes('mission')) return 'status';
  if (clean.includes('refacturation') || clean.includes('billing')) return 'billing_model';
  if (clean.includes('economie')) return 'estimated_client_savings';
  if (clean.includes('sf') || (clean.includes('beneficiaire') && clean.includes('sf'))) return 'beneficiary_sf_percentage';
  if (clean.includes('ca entite') || (clean.includes('ca') && clean.includes('estime'))) return 'estimated_revenue';
  if (clean.includes('refac') || clean.includes('% de refac')) return 'refac_percentage';
  if (clean.includes('montant') && clean.includes('facturer')) return 'amount_to_invoice';
  if (clean.includes('statut') && clean.includes('facturation') && clean.includes('transfo')) return 'transfo_invoiced';
  if (clean.includes('date') && clean.includes('facturation') && clean.includes('transfo')) return 'transfo_invoice_date';
  if (clean.includes('comment')) return 'comments';

  return null;
};

const formatCurrencyXsell = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '-';
  const rounded = Math.round(val);
  const formattedNum = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedNum}\u00A0€`;
};

type CollaboratorSortKey = keyof Collaborator | 'fullName';

const Admin: React.FC<AdminProps> = ({ state, updateState }) => {
  const [activeTab, setActiveTab] = useState<'collaborators' | 'holidays' | 'import_export' | 'backups'>('collaborators');
  
  // Backup States
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // Fetch backups when tab changes
  useEffect(() => {
    if (activeTab === 'backups') {
      setIsLoadingBackups(true);
      getBackups().then(data => {
        setBackups(data);
        setIsLoadingBackups(false);
      });
    }
  }, [activeTab]);

  const [editingHoliday, setEditingHoliday] = useState<Partial<Holiday> | null>(null);
  const [holidayToDelete, setHolidayToDelete] = useState<string | null>(null);

  // New Backup/Import States
  const [pendingBackup, setPendingBackup] = useState<FullBackup | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('fusion');
  const [restoreConfirmationText, setRestoreConfirmationText] = useState('');
  const [isRestoreConfirmed, setIsRestoreConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; report: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1-Month Rolling Restore Points States
  const [restorePoints, setRestorePoints] = useState<RestorePoint[]>([]);
  const [isLoadingRestorePoints, setIsLoadingRestorePoints] = useState(false);
  const [isCreatingRestorePoint, setIsCreatingRestorePoint] = useState(false);
  const [selectedPointToRestore, setSelectedPointToRestore] = useState<RestorePoint | null>(null);
  const [pointRestoreConfirmText, setPointRestoreConfirmText] = useState('');
  const [isPointRestoreChecked, setIsPointRestoreChecked] = useState(false);
  const [isPointRestoring, setIsPointRestoring] = useState(false);
  const [pointActionFeedback, setPointActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRestorePointsList = async () => {
    setIsLoadingRestorePoints(true);
    try {
      const points = await getRestorePoints();
      setRestorePoints(points);
    } catch (e) {
      console.error("Erreur chargement points de restauration", e);
    } finally {
      setIsLoadingRestorePoints(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchRestorePointsList();
    }
  }, [activeTab]);

  // Xsell Specific Import States
  const [xsellImportPreview, setXsellImportPreview] = useState<Partial<XsellOpportunity>[]>([]);
  const [xsellImportFilename, setXsellImportFilename] = useState('');
  const [xsellImportMode, setXsellImportMode] = useState<'add' | 'replace'>('add');
  const [isXsellImporting, setIsXsellImporting] = useState(false);
  const [xsellImportError, setXsellImportError] = useState<string | null>(null);
  const [xsellImportSuccess, setXsellImportSuccess] = useState<string | null>(null);
  const xsellFileInputRef = useRef<HTMLInputElement>(null);

  const processXsellExcelFile = (file: File) => {
    setXsellImportError(null);
    setXsellImportSuccess(null);
    setXsellImportFilename(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'suivi xsell' || name.toLowerCase().includes('xsell'));
        if (!sheetName && workbook.SheetNames.length > 0) {
          sheetName = workbook.SheetNames[0];
        }
        
        if (!sheetName) {
          throw new Error('Aucune feuille trouvée dans le fichier.');
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rows.length === 0) {
          throw new Error('La feuille de calcul sélectionnée est vide.');
        }

        let headerRowIdx = 0;
        let bestHeaderMatchCount = 0;
        
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          let matches = 0;
          const r = rows[i];
          if (Array.isArray(r)) {
            r.forEach(cell => {
              if (cell && findHeaderKeyXsell(String(cell))) {
                matches++;
              }
            });
          }
          if (matches > bestHeaderMatchCount) {
            bestHeaderMatchCount = matches;
            headerRowIdx = i;
          }
        }

        const headers = rows[headerRowIdx];
        if (!headers || !Array.isArray(headers)) {
          throw new Error('Impossible de localiser la ligne d\'en-têtes dans le fichier Excel.');
        }

        const parsedOpps: Partial<XsellOpportunity>[] = [];
        
        for (let j = headerRowIdx + 1; j < rows.length; j++) {
          const rowData = rows[j];
          if (!rowData || !Array.isArray(rowData)) continue;
          
          const isEmpty = rowData.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
          if (isEmpty) continue;

          const opp: Partial<XsellOpportunity> = {};
          let hasAnyData = false;

          headers.forEach((h, colIdx) => {
            const key = findHeaderKeyXsell(String(h));
            if (key) {
              const rawVal = rowData[colIdx];
              hasAnyData = true;
              
              if (key === 'year') {
                opp[key] = parseYearXsell(rawVal);
              } else if (key === 'refac_percentage' || key === 'beneficiary_sf_percentage') {
                opp[key] = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : null;
              } else if (key === 'estimated_revenue' || key === 'amount_to_invoice' || key === 'estimated_client_savings') {
                opp[key] = parseNumberXsell(rawVal);
              } else if (key === 'transfo_invoice_date') {
                if (typeof rawVal === 'number' && rawVal > 10000) {
                  const d = XLSX.SSF.parse_date_code(rawVal);
                  const m = String(d.m).padStart(2, '0');
                  const day = String(d.d).padStart(2, '0');
                  opp[key] = `${d.y}-${m}-${day}`;
                } else {
                  opp[key] = rawVal ? String(rawVal).trim() : '';
                }
              } else {
                opp[key] = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
              }
            }
          });

          if (hasAnyData) {
            opp.id = crypto.randomUUID();
            opp.source_import_filename = file.name;
            opp.imported_at = new Date().toISOString();
            
            opp.signature_date = '';
            opp.january_2026_invoice = '';
            opp.include_in_staffing_followup = '';
            opp.beneficiary_invoice_date = '';

            opp.year = opp.year !== undefined ? opp.year : null;
            opp.account_owner = opp.account_owner || '';
            opp.account_name = opp.account_name || '';
            opp.beneficiary_entity = opp.beneficiary_entity || '';
            opp.beneficiary_contact = opp.beneficiary_contact || '';
            opp.subject = opp.subject || '';
            opp.status = opp.status || '';
            opp.billing_model = opp.billing_model || '';
            opp.estimated_client_savings = opp.estimated_client_savings !== undefined ? opp.estimated_client_savings : null;
            opp.beneficiary_sf_percentage = opp.beneficiary_sf_percentage !== undefined ? opp.beneficiary_sf_percentage : null;
            opp.estimated_revenue = opp.estimated_revenue !== undefined ? opp.estimated_revenue : null;
            opp.refac_percentage = opp.refac_percentage !== undefined ? opp.refac_percentage : null;
            opp.amount_to_invoice = opp.amount_to_invoice !== undefined ? opp.amount_to_invoice : null;
            opp.transfo_invoiced = opp.transfo_invoiced || '';
            opp.transfo_invoice_date = opp.transfo_invoice_date || '';
            opp.comments = opp.comments || '';

            parsedOpps.push(opp);
          }
        }

        setXsellImportPreview(parsedOpps);
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        setXsellImportError(err.message || 'Erreur lors du traitement du fichier.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const executeXsellImport = async () => {
    if (xsellImportPreview.length === 0) return;
    
    if (xsellImportMode === 'replace') {
      const confirmText = 'Cette action supprimera uniquement les données Xsell de la table public.xsell_opportunities. Les autres modules ne seront pas modifiés. Êtes-vous sûr de vouloir remplacer toutes les opportunités ?';
      if (!window.confirm(confirmText)) {
        return;
      }
    }

    setIsXsellImporting(true);
    setXsellImportError(null);
    setXsellImportSuccess(null);

    try {
      if (xsellImportMode === 'replace') {
        const { error: deleteError } = await supabase
          .from('xsell_opportunities')
          .delete()
          .not('id', 'is', null);

        if (deleteError) throw deleteError;
      }

      const payload = xsellImportPreview.map(opp => ({
        id: opp.id,
        year: opp.year,
        account_owner: opp.account_owner,
        account_name: opp.account_name,
        beneficiary_entity: opp.beneficiary_entity,
        beneficiary_contact: opp.beneficiary_contact,
        subject: opp.subject,
        signature_date: opp.signature_date || '',
        status: opp.status,
        january_2026_invoice: opp.january_2026_invoice || '',
        include_in_staffing_followup: opp.include_in_staffing_followup || '',
        billing_model: opp.billing_model,
        refac_percentage: opp.refac_percentage,
        estimated_revenue: opp.estimated_revenue,
        amount_to_invoice: opp.amount_to_invoice,
        beneficiary_invoice_date: opp.beneficiary_invoice_date || '',
        transfo_invoiced: opp.transfo_invoiced,
        transfo_invoice_date: opp.transfo_invoice_date || '',
        comments: opp.comments,
        estimated_client_savings: opp.estimated_client_savings,
        beneficiary_sf_percentage: opp.beneficiary_sf_percentage,
        source_import_filename: xsellImportFilename,
        imported_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const chunkSize = 100;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('xsell_opportunities')
          .insert(chunk);

        if (insertError) throw insertError;
      }

      setXsellImportSuccess(`Importation réussie de ${xsellImportPreview.length} opportunités Xsell.`);
      setXsellImportPreview([]);
      setXsellImportFilename('');
    } catch (err: any) {
      console.error('Import failed:', err);
      setXsellImportError(err.message || 'La synchronisation avec la base de données a échoué.');
    } finally {
      setIsXsellImporting(false);
    }
  };

  // Collaborator Management States
  const [editingCollaborator, setEditingCollaborator] = useState<Partial<Collaborator> | null>(null);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<string | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [collaboratorStatusFilter, setCollaboratorStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [collaboratorSortConfig, setCollaboratorSortConfig] = useState<{ key: CollaboratorSortKey; direction: 'asc' | 'desc' }>({ 
    key: 'lastName', 
    direction: 'asc' 
  });

  // Holiday Logic
  const confirmDeleteHoliday = () => {
    if (holidayToDelete) {
      updateState({ holidays: state.holidays.filter(h => h.id !== holidayToDelete) });
      setHolidayToDelete(null);
    }
  };

  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHoliday) return;

    if (editingHoliday.id) {
      const newHolidays = state.holidays.map(h => 
        h.id === editingHoliday.id ? { ...h, ...editingHoliday } as Holiday : h
      );
      updateState({ holidays: newHolidays });
    } else {
      const newHoliday: Holiday = {
        ...editingHoliday,
        id: generateId(),
      } as Holiday;
      updateState({ holidays: [...state.holidays, newHoliday] });
    }
    setEditingHoliday(null);
  };

  const processedHolidays = useMemo(() => {
    let result = [...state.holidays];
    if (state.globalCountry !== 'Global') {
      result = result.filter(h => h.country === state.globalCountry);
    }
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return result;
  }, [state.holidays, state.globalCountry]);

  // Collaborator Logic
  const confirmDeleteCollaborator = async () => {
    if (collaboratorToDelete) {
      await deleteCollaboratorFromCloud(collaboratorToDelete);
      updateState({ collaborators: state.collaborators.filter(c => c.id !== collaboratorToDelete) });
      setCollaboratorToDelete(null);
    }
  };

  const handleSaveCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollaborator) return;

    const collaboratorToSave = {
      ...editingCollaborator,
      id: editingCollaborator.id || crypto.randomUUID(),
    } as Collaborator;

    await syncCollaboratorToCloud(collaboratorToSave);

    if (editingCollaborator.id) {
      const newCollaborators = state.collaborators.map(c => 
        c.id === editingCollaborator.id ? collaboratorToSave : c
      );
      updateState({ collaborators: newCollaborators });
    } else {
      updateState({ collaborators: [...state.collaborators, collaboratorToSave] });
    }
    setEditingCollaborator(null);
  };

  const handleCollaboratorSort = (key: CollaboratorSortKey) => {
    setCollaboratorSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const CollaboratorSortIcon = ({ column }: { column: CollaboratorSortKey }) => {
    if (collaboratorSortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-20" />;
    return collaboratorSortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1 text-yellow-accent" /> : <ChevronDown size={12} className="ml-1 text-yellow-accent" />;
  };

  const processedCollaborators = useMemo(() => {
    let result = [...state.collaborators];
    if (state.globalCountry !== 'Global') {
      result = result.filter(c => c.country === state.globalCountry);
    }
    if (collaboratorStatusFilter !== 'all') {
      result = result.filter(c => collaboratorStatusFilter === 'active' ? c.active : !c.active);
    }
    if (collaboratorSearch) {
      const term = collaboratorSearch.toLowerCase();
      result = result.filter(c => 
        c.firstName.toLowerCase().includes(term) || 
        c.lastName.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.grade.toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => {
      let valA: any = a[collaboratorSortConfig.key as keyof Collaborator];
      let valB: any = b[collaboratorSortConfig.key as keyof Collaborator];
      if (collaboratorSortConfig.key === 'fullName') {
        valA = `${a.firstName} ${a.lastName}`;
        valB = `${b.firstName} ${b.lastName}`;
      }
      if (valA < valB) return collaboratorSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return collaboratorSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [state.collaborators, collaboratorSearch, collaboratorStatusFilter, collaboratorSortConfig, state.globalCountry]);

  const getInitialCollaborator = (): Partial<Collaborator> => ({
    firstName: '',
    lastName: '',
    email: '',
    grade: Role.CONSULTANT,
    country: state.globalCountry !== 'Global' ? state.globalCountry as Country : Country.FRANCE,
    collaboratorType: CollaboratorType.INTERNAL,
    active: true,
    cjm: 500,
    joiningDate: new Date().toISOString().split('T')[0],
  });

  const handleTableExportJSON = (type: 'collaborators' | 'missions') => {
    const data = type === 'collaborators' ? state.collaborators : state.missions;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTableExportExcel = (type: 'collaborators' | 'missions') => {
    const data = type === 'collaborators' ? state.collaborators : state.missions;
    if (data.length === 0) return;
    const processedData = data.map(item => {
      const flat: any = { ...item };
      Object.keys(flat).forEach(key => {
        if (typeof flat[key] === 'object' && flat[key] !== null) {
          flat[key] = JSON.stringify(flat[key]);
        }
      });
      return flat;
    });
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, type === 'collaborators' ? "Collaborateurs" : "Missions");
    XLSX.writeFile(workbook, `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Full Export Logics
  const handleFullExportJSON = async () => {
    try {
      const backup = await exportFullBackupJson();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OptimusPlan_FullBackup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur lors de l'export JSON complet");
    }
  };

  const handleFullExportExcel = async () => {
    try {
      const wb = await exportFullBackupExcel();
      XLSX.writeFile(wb, `OptimusPlan_FullBackup_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      alert("Erreur lors de l'export Excel complet");
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const backup = validateAndParseExcel(workbook);
          setPendingBackup(backup);
          setImportPreview(getImportPreview(backup));
        } catch (err) {
          alert('Erreur lors de la lecture du fichier Excel.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const content = JSON.parse(event.target?.result as string);
          const { valid, error, backup } = validateBackupJson(content);
          if (valid && backup) {
            setPendingBackup(backup);
            setImportPreview(getImportPreview(backup));
          } else {
            alert(`Fichier JSON invalide: ${error}`);
          }
        } catch (err) {
          alert('Erreur lors du parsing du fichier JSON.');
        }
      };
      reader.readAsText(file);
    } else {
      alert('Format de fichier non supporté. Veuillez utiliser JSON ou Excel.');
    }
  };

  const executeImport = async () => {
    if (!pendingBackup) return;

    if (importMode === 'restore') {
      if (restoreConfirmationText !== 'RESTAURER' || !isRestoreConfirmed) {
        alert("Veuillez remplir les confirmations pour la restauration complète.");
        return;
      }
    }

    setIsImporting(true);
    setImportResult(null);

    const result = await importBackupJson(pendingBackup, importMode);
    
    setImportResult(result);
    setIsImporting(false);

    if (result.success) {
      // Refresh the local state from the newly imported cloud data
      const cloudState = await loadStateFromCloud();
      updateState(cloudState);
      
      // Reset after success
      setPendingBackup(null);
      setImportPreview(null);
      setRestoreConfirmationText('');
      setIsRestoreConfirmed(false);
      // Refresh restore points list
      fetchRestorePointsList();
    }
  };

  // 1-Month Rolling Restore Point Handlers
  const handleCreateManualPoint = async () => {
    setIsCreatingRestorePoint(true);
    setPointActionFeedback(null);
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('fr-FR');
      const res = await createRestorePoint('manual', `Sauvegarde manuelle du ${dateStr} à ${timeStr}`);
      if (res.success && res.point) {
        setRestorePoints(prev => [res.point!, ...prev]);
        setPointActionFeedback({
          type: 'success',
          message: `Nouveau point de restauration enregistré avec succès (${res.point.summary.missions} missions, ${res.point.summary.budget_data} exercices budgétaires, ${res.point.summary.xsell_opportunities} opportunités Xsell).`
        });
      } else {
        setPointActionFeedback({
          type: 'error',
          message: res.error || "Erreur lors de la création du point de restauration."
        });
      }
    } catch (err: any) {
      setPointActionFeedback({
        type: 'error',
        message: err?.message || "Une exception s'est produite lors de la sauvegarde."
      });
    } finally {
      setIsCreatingRestorePoint(false);
    }
  };

  const handleExecutePointRestore = async () => {
    if (!selectedPointToRestore) return;
    if (pointRestoreConfirmText !== 'RESTAURER' || !isPointRestoreChecked) {
      alert("Veuillez cocher la case et taper 'RESTAURER' pour confirmer l'opération.");
      return;
    }

    setIsPointRestoring(true);
    try {
      // 1. Créer d'abord un point de sécurité automatique avant écrasement
      await createRestorePoint('auto', `Point de sécurité avant restauration de "${selectedPointToRestore.label}"`);

      // 2. Exécuter la restauration intégrale
      const result = await importBackupJson(selectedPointToRestore.backup, 'restore');
      if (result.success) {
        const cloudState = await loadStateFromCloud();
        updateState(cloudState);
        
        setPointActionFeedback({
          type: 'success',
          message: `Restauration réussie de la version du ${new Date(selectedPointToRestore.createdAt).toLocaleDateString('fr-FR')} à ${new Date(selectedPointToRestore.createdAt).toLocaleTimeString('fr-FR')}. Toutes les données et calculs (missions, staffing, budgets multi-années, temps, Xsell) ont été rétablis avec succès.`
        });
        setSelectedPointToRestore(null);
        setPointRestoreConfirmText('');
        setIsPointRestoreChecked(false);
        // Rafraîchir la liste des points
        await fetchRestorePointsList();
      } else {
        setPointActionFeedback({
          type: 'error',
          message: result.report
        });
      }
    } catch (err: any) {
      setPointActionFeedback({
        type: 'error',
        message: err?.message || "Erreur lors de la restauration du point."
      });
    } finally {
      setIsPointRestoring(false);
    }
  };

  const handleDownloadPointJson = (point: RestorePoint) => {
    try {
      const blob = new Blob([JSON.stringify(point.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OptimusPlan_Restauration_${point.createdAt.replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erreur lors du téléchargement du fichier JSON");
    }
  };

  const handleDeletePoint = async (pointId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce point de restauration ?")) return;
    const ok = await deleteRestorePoint(pointId);
    if (ok) {
      setRestorePoints(prev => prev.filter(p => p.id !== pointId));
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 xl:gap-4 border-b overflow-x-auto no-scrollbar whitespace-nowrap -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => setActiveTab('collaborators')}
          className={`pb-4 px-3 xl:px-4 text-[10px] md:text-sm font-medium transition-colors ${
            activeTab === 'collaborators' ? 'border-b-2 border-yellow-accent text-navy' : 'text-gray-500 hover:text-navy'
          }`}
        >
          Collaborateurs
        </button>
        <button
          onClick={() => setActiveTab('holidays')}
          className={`pb-4 px-3 xl:px-4 text-[10px] md:text-sm font-medium transition-colors ${
            activeTab === 'holidays' ? 'border-b-2 border-yellow-accent text-navy' : 'text-gray-500 hover:text-navy'
          }`}
        >
          Jours Fériés
        </button>
        <button
          onClick={() => setActiveTab('import_export')}
          className={`pb-4 px-3 xl:px-4 text-[10px] md:text-sm font-medium transition-colors ${
            activeTab === 'import_export' ? 'border-b-2 border-yellow-accent text-navy' : 'text-gray-500 hover:text-navy'
          }`}
        >
          Import / Export
        </button>
        <button
          onClick={() => setActiveTab('backups')}
          className={`pb-4 px-3 xl:px-4 text-[10px] md:text-sm font-medium transition-colors ${
            activeTab === 'backups' ? 'border-b-2 border-yellow-accent text-navy' : 'text-gray-500 hover:text-navy'
          }`}
        >
          Sauvegardes
        </button>
      </div>

      {activeTab === 'collaborators' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
              <div className="flex items-center justify-between w-full md:w-auto gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-700 uppercase text-[10px] md:text-xs tracking-wider shrink-0">
                    Collaborateurs
                  </h2>
                  <span className="bg-navy/10 text-navy px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {processedCollaborators.length}
                  </span>
                </div>
                
                <button 
                  onClick={() => setEditingCollaborator(getInitialCollaborator())}
                  className="flex xl:hidden items-center gap-2 bg-navy text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-navy/90 transition-colors shrink-0"
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
              
              <div className="flex items-center gap-2 w-full">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Nom, Email, Grade..." 
                    className="w-full pl-9 pr-4 py-1.5 text-[11px] md:text-xs border rounded-lg focus:ring-2 focus:ring-yellow-accent outline-none"
                    value={collaboratorSearch}
                    onChange={(e) => setCollaboratorSearch(e.target.value)}
                  />
                </div>

                <select
                  value={collaboratorStatusFilter}
                  onChange={(e) => setCollaboratorStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="text-[10px] font-bold border rounded-lg px-2.5 py-1.5 outline-none bg-white text-navy uppercase tracking-tighter shrink-0 cursor-pointer focus:ring-2 focus:ring-yellow-accent"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>

                {(collaboratorSearch !== '' || collaboratorStatusFilter !== 'all') && (
                  <button 
                    onClick={() => {
                      setCollaboratorSearch('');
                      setCollaboratorStatusFilter('all');
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-100 uppercase shrink-0"
                  >
                    <FilterX size={12} />
                    <span className="hidden sm:inline">Effacer</span>
                  </button>
                )}
              </div>
            </div>

            <button 
              onClick={() => setEditingCollaborator(getInitialCollaborator())}
              className="hidden xl:flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-navy/90 transition-colors shrink-0"
            >
              <Plus size={16} />
              Ajouter
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase text-gray-400 font-bold border-b">
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('fullName')}>
                    <div className="flex items-center">Collaborateur <CollaboratorSortIcon column="fullName" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('grade')}>
                    <div className="flex items-center">Grade <CollaboratorSortIcon column="grade" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('collaboratorType')}>
                    <div className="flex items-center">Type <CollaboratorSortIcon column="collaboratorType" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('joiningDate')}>
                    <div className="flex items-center">Arrivée <CollaboratorSortIcon column="joiningDate" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('country')}>
                    <div className="flex items-center">Pays <CollaboratorSortIcon column="country" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleCollaboratorSort('active')}>
                    <div className="flex items-center">Statut <CollaboratorSortIcon column="active" /></div>
                  </th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {processedCollaborators.map((collaborator) => (
                  <tr key={collaborator.id} className="text-sm hover:bg-gray-50 cursor-pointer group" onClick={() => setEditingCollaborator(collaborator)}>
                    <td className="p-4">
                      <div className="font-bold text-navy">{collaborator.firstName} {collaborator.lastName}</div>
                      <div className="text-[10px] text-gray-500">{collaborator.email}</div>
                    </td>
                    <td className="p-4 text-xs">{collaborator.grade}</td>
                    <td className="p-4 text-xs capitalize">{collaborator.collaboratorType}</td>
                    <td className="p-4 text-xs font-mono text-navy/70">
                      {collaborator.joiningDate ? formatDateDisplay(collaborator.joiningDate) : '--'}
                    </td>
                    <td className="p-4 text-xs">{collaborator.country}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${collaborator.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {collaborator.active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setCollaboratorToDelete(collaborator.id); }} className="p-1.5 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Jours Fériés Tab */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-700 uppercase text-xs tracking-wider shrink-0">Gestion des Jours Fériés</h2>
              <span className="bg-navy/10 text-navy px-2 py-0.5 rounded-full text-[10px] font-bold">{processedHolidays.length}</span>
            </div>
            <button 
              onClick={() => setEditingHoliday({
                date: new Date().toISOString().split('T')[0],
                label: '',
                country: state.globalCountry !== 'Global' ? state.globalCountry as Country : Country.FRANCE
              })}
              className="flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-navy/90 transition-colors"
            >
              <Plus size={16} /> Ajouter
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase text-gray-400 font-bold border-b">
                  <th className="p-4">Date</th>
                  <th className="p-4">Libellé</th>
                  <th className="p-4">Pays</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {processedHolidays.map((holiday) => (
                  <tr key={holiday.id} className="text-sm hover:bg-gray-50 cursor-pointer group" onClick={() => setEditingHoliday(holiday)}>
                    <td className="p-4 font-bold text-navy">{formatDateDisplay(holiday.date)}</td>
                    <td className="p-4">{holiday.label}</td>
                    <td className="p-4">
                       <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold uppercase">{holiday.country}</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setHolidayToDelete(holiday.id); }} className="p-1.5 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import / Export Tab */}
      {activeTab === 'import_export' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Export Section */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-navy/5 rounded-lg text-navy">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy leading-none">Sauvegarde Complète</h3>
                  <p className="text-xs text-gray-400 mt-1">Exportez l'intégralité des données métier de l'application.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button 
                  onClick={handleFullExportJSON}
                  className="flex flex-col items-start p-4 border border-gray-100 rounded-xl hover:border-navy hover:bg-navy/5 transition-all text-left group"
                >
                  <FileJson size={20} className="text-navy/40 mb-2 group-hover:text-navy transition-colors" />
                  <span className="font-bold text-sm text-navy uppercase tracking-wider">Format JSON</span>
                  <span className="text-[10px] text-gray-400 mt-1 leading-tight">Recommandé pour les restaurations complètes. Contient toutes les tables.</span>
                </button>

                <button 
                  onClick={handleFullExportExcel}
                  className="flex flex-col items-start p-4 border border-gray-100 rounded-xl hover:border-emerald-600 hover:bg-emerald-50 transition-all text-left group"
                >
                  <FileSpreadsheet size={20} className="text-emerald-500/40 mb-2 group-hover:text-emerald-500 transition-colors" />
                  <span className="font-bold text-sm text-emerald-700 uppercase tracking-wider">Format Excel</span>
                  <span className="text-[10px] text-gray-400 mt-1 leading-tight">Fichier .xlsx multi-onglets. Idéal pour consultation et corrections manuelles.</span>
                </button>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Exports Spécifiques</h4>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-navy/70">Collaborateurs</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleTableExportJSON('collaborators')} className="p-1.5 bg-white border border-gray-100 rounded hover:bg-gray-50 text-navy transition-colors" title="JSON"><FileJson size={14} /></button>
                      <button onClick={() => handleTableExportExcel('collaborators')} className="p-1.5 bg-emerald-50 border border-emerald-100 rounded hover:bg-emerald-100 text-emerald-700 transition-colors" title="Excel"><FileSpreadsheet size={14} /></button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-navy/70">Missions & Staffing</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleTableExportJSON('missions')} className="p-1.5 bg-white border border-gray-100 rounded hover:bg-gray-50 text-navy transition-colors" title="JSON"><FileJson size={14} /></button>
                      <button onClick={() => handleTableExportExcel('missions')} className="p-1.5 bg-emerald-50 border border-emerald-100 rounded hover:bg-emerald-100 text-emerald-700 transition-colors" title="Excel"><FileSpreadsheet size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Tables incluses dans le Full Backup</h4>
                <div className="flex flex-wrap gap-2">
                  {['Collaborateurs', 'Missions', 'Planning', 'Temps', 'Budgets', 'Configuration', 'Utilisateurs (legacy)'].map(t => (
                    <span key={t} className="px-2 py-1 bg-white border border-gray-100 rounded text-[9px] font-bold text-navy/60 uppercase tracking-tighter">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Import Section */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-yellow-accent/10 rounded-lg text-yellow-600">
                  <Upload size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy leading-none">Restauration & Import</h3>
                  <p className="text-xs text-gray-400 mt-1">Importez des données au format JSON ou Excel.</p>
                </div>
              </div>

              {!pendingBackup ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-navy hover:bg-navy/5 transition-all group bg-gray-50"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload size={32} className="text-navy/20 group-hover:text-navy transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-navy">Sélectionnez un fichier</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">JSON ou .xlsx</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json,.xlsx,.xls" className="hidden" />
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {/* Preview UI */}
                  <div className="bg-navy rounded-xl overflow-hidden shadow-xl text-white">
                    <div className="p-4 bg-navy-light flex items-center justify-between border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <List size={18} className="text-yellow-accent" />
                        <h4 className="text-sm font-bold uppercase tracking-wider">Prévisualisation de l'import</h4>
                      </div>
                      <button onClick={() => { setPendingBackup(null); setImportPreview(null); }} className="hover:text-yellow-accent transition-colors">
                        <X size={18} />
                      </button>
                    </div>
                    
                    <div className="p-5 space-y-4">
                      {importPreview && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Collabs</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.collaborators}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Missions</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.missions}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Planning</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.planning}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Timesheets</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.timesheets}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Budgets</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.budget_data}</span>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[10px] text-white/40 uppercase font-black">Config</span>
                              <span className="text-lg font-black text-yellow-accent">{importPreview.summary.config}</span>
                            </div>
                          </div>

                          {importPreview.warnings.length > 0 && (
                            <div className="bg-yellow-accent/10 border border-yellow-accent/20 rounded-lg p-3 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-yellow-accent">
                                <AlertTriangle size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Avertissements ({importPreview.warnings.length})</span>
                              </div>
                              <div className="max-h-24 overflow-y-auto no-scrollbar space-y-1">
                                {importPreview.warnings.slice(0, 10).map((w, i) => (
                                  <p key={i} className="text-[9px] text-yellow-accent/80 leading-tight">• {w}</p>
                                ))}
                                {importPreview.warnings.length > 10 && <p className="text-[9px] text-yellow-accent/60">...et {importPreview.warnings.length - 10} autres</p>}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="pt-2">
                        <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Méthode d'importation</label>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setImportMode('fusion')}
                            className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition-all ${importMode === 'fusion' ? 'bg-navy-light border-yellow-accent text-yellow-accent' : 'bg-white/5 border-white/10 text-white/40 grayscale hover:grayscale-0'}`}
                          >
                            <RefreshCw size={20} className="mb-1" />
                            <span className="text-xs font-bold uppercase tracking-wide">Fusion</span>
                            <span className="text-[9px] opacity-60">Mise à jour (Upsert)</span>
                          </button>
                          <button 
                            onClick={() => setImportMode('restore')}
                            className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition-all ${importMode === 'restore' ? 'bg-red-500/20 border-red-500 text-red-100' : 'bg-white/5 border-white/10 text-white/40 grayscale hover:grayscale-0'}`}
                          >
                            <ShieldAlert size={20} className="mb-1" />
                            <span className="text-xs font-bold uppercase tracking-wide">Restauration</span>
                            <span className="text-[9px] opacity-60">Remplacement complet</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Destructive Confirmation UI */}
                  {importMode === 'restore' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4 animate-in zoom-in duration-300">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-100 rounded-lg text-red-600">
                          <ShieldAlert size={24} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-red-800 uppercase tracking-wider">Avertissement Critique</h4>
                          <p className="text-xs text-red-700 leading-relaxed mt-1">
                            La restauration complète supprimera TOUTES les données métier existantes (missions, planning, collaborateurs, budgets) pour les remplacer par celles du fichier.
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            id="understand-replacement" 
                            checked={isRestoreConfirmed} 
                            onChange={e => setIsRestoreConfirmed(e.target.checked)}
                            className="w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500" 
                          />
                          <label htmlFor="understand-replacement" className="text-xs font-bold text-red-800 select-none">
                            J'ai compris que cette action remplace les données métier existantes.
                          </label>
                        </div>

                        {isRestoreConfirmed && (
                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-red-400 uppercase tracking-widest pl-1">Tapez "RESTAURER" pour confirmer</label>
                            <input 
                              type="text"
                              value={restoreConfirmationText}
                              onChange={e => setRestoreConfirmationText(e.target.value)}
                              placeholder="RESTAURER"
                              className="w-full bg-white border border-red-200 text-red-600 font-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-center"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => { setPendingBackup(null); setImportPreview(null); setRestoreConfirmationText(''); setIsRestoreConfirmed(false); }}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase text-xs tracking-widest"
                      disabled={isImporting}
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={executeImport}
                      disabled={isImporting || (importMode === 'restore' && (restoreConfirmationText !== 'RESTAURER' || !isRestoreConfirmed))}
                      className={`flex-3 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest ${
                        isImporting ? 'bg-gray-400' : importMode === 'restore' ? 'bg-red-600 hover:bg-red-700' : 'bg-navy hover:bg-navy-light'
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" />
                          Importation en cours...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={18} />
                          Confirmer l'importation
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Import Result Feedback */}
          {importResult && (
            <div className={`p-6 rounded-2xl border flex items-start gap-4 animate-in slide-in-from-top-4 duration-500 ${
              importResult.success ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'
            }`}>
              <div className={`p-2 rounded-xl ${importResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                {importResult.success ? <CheckCircle size={24} /> : <XCircle size={24} />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-black uppercase tracking-widest text-sm mb-2">{importResult.success ? 'Importation Terminée' : 'Erreur d\'Importation'}</h4>
                  <button onClick={() => setImportResult(null)} className="opacity-40 hover:opacity-100"><X size={20} /></button>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap opacity-80 leading-relaxed bg-white/50 p-4 rounded-xl border border-current/10">
                  {importResult.report}
                </pre>
              </div>
            </div>
          )}

          {/* Box dédié au Xsell */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                <TrendingUp size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-navy leading-none">Importation Spécifique Xsell</h3>
                <p className="text-xs text-gray-400 mt-1">Gérez et importez de manière autonome les opportunités de vente croisée (cross-selling) depuis un fichier Excel.</p>
              </div>
            </div>

            {xsellImportPreview.length === 0 ? (
              <div 
                onClick={() => xsellFileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/10 transition-all group bg-gray-50 bg-opacity-50"
              >
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload size={32} className="text-emerald-500/40 group-hover:text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-navy">Sélectionnez le fichier Excel Xsell</p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Fichier .xlsx ou .xls</p>
                </div>
                <input 
                  type="file" 
                  ref={xsellFileInputRef} 
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      processXsellExcelFile(files[0]);
                    }
                  }} 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                  <CheckCircle className="text-emerald-600 shrink-0" size={18} />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-navy">Fichier chargé : <span className="font-mono text-emerald-800">{xsellImportFilename}</span></p>
                    <p className="text-[10px] text-gray-400">
                      Nombre de lignes détectées : <span className="font-extrabold text-navy">{xsellImportPreview.length} opportunités</span>.
                      {xsellImportPreview.length === 124 ? (
                        <span className="text-emerald-600 font-extrabold"> (Format attendu de 124 lignes validé !)</span>
                      ) : (
                        <span className="text-gray-500"> (Contient {xsellImportPreview.length} lignes)</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-150">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Option d'importation</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      type="button"
                      onClick={() => setXsellImportMode('add')}
                      className={`block text-left border p-3 rounded-xl cursor-pointer transition-all ${xsellImportMode === 'add' ? 'bg-white border-navy ring-2 ring-navy/10' : 'bg-transparent border-gray-200 hover:bg-white'}`}
                    >
                      <span className="text-xs font-bold text-navy block mb-1">Ajouter (Append)</span>
                      <span className="text-[9px] text-gray-400">Ajoute les {xsellImportPreview.length} lignes aux opportunités existantes.</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => setXsellImportMode('replace')}
                      className={`block text-left border p-3 rounded-xl cursor-pointer transition-all ${xsellImportMode === 'replace' ? 'bg-white border-red-500 ring-2 ring-red-500/10' : 'bg-transparent border-gray-200 hover:bg-white'}`}
                    >
                      <span className="text-xs font-bold text-red-600 block mb-1">Remplacer (Overwrite)</span>
                      <span className="text-[9px] text-gray-400">Vide la table Xsell, puis insère les {xsellImportPreview.length} lignes.</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Aperçu des 5 premières lignes</span>
                  <div className="border border-gray-150 rounded-xl overflow-x-auto bg-white">
                    <table className="w-full text-left text-[10px] border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-gray-50 border-b font-extrabold text-gray-400">
                          <th className="p-2 border-b whitespace-nowrap">Année</th>
                          <th className="p-2 border-b whitespace-nowrap">Responsable Lead</th>
                          <th className="p-2 border-b whitespace-nowrap">Compte Client</th>
                          <th className="p-2 border-b whitespace-nowrap">Entité Bénéf.</th>
                          <th className="p-2 border-b whitespace-nowrap">Sujets Xsell</th>
                          <th className="p-2 border-b whitespace-nowrap text-right">CA Estimé</th>
                          <th className="p-2 border-b whitespace-nowrap text-right">À Facturer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y font-bold text-navy">
                        {xsellImportPreview.slice(0, 5).map((opp, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="p-2 whitespace-nowrap font-mono">{opp.year}</td>
                            <td className="p-2 max-w-[100px] truncate">{opp.account_owner}</td>
                            <td className="p-2 max-w-[100px] truncate">{opp.account_name}</td>
                            <td className="p-2 max-w-[100px] truncate">{opp.beneficiary_entity}</td>
                            <td className="p-2 max-w-[100px] truncate">{opp.subject}</td>
                            <td className="p-2 text-right whitespace-nowrap font-mono">{formatCurrencyXsell(opp.estimated_revenue || 0)}</td>
                            <td className="p-2 text-right whitespace-nowrap font-mono">{formatCurrencyXsell(opp.amount_to_invoice || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => { setXsellImportPreview([]); setXsellImportFilename(''); }}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase text-xs tracking-widest"
                    disabled={isXsellImporting}
                  >
                    Annuler
                  </button>
                  <button 
                    type="button"
                    onClick={executeXsellImport}
                    disabled={isXsellImporting}
                    className={`flex-3 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest ${
                      isXsellImporting ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {isXsellImporting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Importation en cours...
                      </>
                    ) : (
                      <>
                        <Check size={18} />
                        Confirmer l'importation Xsell
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {xsellImportError && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs flex items-center gap-2.5 font-bold">
                <AlertCircle size={16} className="shrink-0 text-red-500" />
                <span>{xsellImportError}</span>
              </div>
            )}

            {xsellImportSuccess && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-xs flex items-center gap-2.5 font-bold">
                <CheckCircle size={16} className="shrink-0 text-green-600" />
                <span>{xsellImportSuccess}</span>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Backups Tab - 1 Month Rolling Restore Points */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {/* Action Feedback Banner */}
          {pointActionFeedback && (
            <div className={`p-4 rounded-xl border flex items-start justify-between gap-3 animate-in fade-in duration-300 ${
              pointActionFeedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <div className="flex items-start gap-3">
                {pointActionFeedback.type === 'success' ? (
                  <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-bold">
                    {pointActionFeedback.type === 'success' ? 'Opération effectuée' : 'Erreur'}
                  </p>
                  <p className="text-xs mt-0.5 whitespace-pre-line opacity-90">{pointActionFeedback.message}</p>
                </div>
              </div>
              <button 
                onClick={() => setPointActionFeedback(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 bg-gradient-to-r from-navy via-navy to-navy-light text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/10 rounded-xl text-yellow-accent backdrop-blur-sm">
                  <History size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-base md:text-lg text-white tracking-wide">
                      Points de Restauration
                    </h2>
                    <span className="px-2.5 py-0.5 bg-yellow-accent/20 border border-yellow-accent/40 text-yellow-accent rounded-full text-[10px] font-black uppercase tracking-wider">
                      Rotation 24h (2 sauvegardes)
                    </span>
                  </div>
                  <p className="text-xs text-white/70 mt-1 max-w-2xl leading-relaxed">
                    Restaurez l'intégralité de votre application à une date et heure précise (Missions, Staffing, Budgets multi-années & automatisations, Feuilles de temps, Xsell).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                <button
                  onClick={fetchRestorePointsList}
                  disabled={isLoadingRestorePoints}
                  className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors border border-white/10 flex items-center gap-1.5 text-xs font-bold"
                  title="Actualiser la liste"
                >
                  <RefreshCw size={15} className={isLoadingRestorePoints ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Actualiser</span>
                </button>
                <button
                  onClick={handleCreateManualPoint}
                  disabled={isCreatingRestorePoint}
                  className="flex-1 md:flex-none px-4 py-2.5 bg-yellow-accent hover:bg-yellow-accent/90 text-navy font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  {isCreatingRestorePoint ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Créer un point maintenant</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Content List */}
            {isLoadingRestorePoints ? (
              <div className="py-24 text-center text-gray-400 font-medium flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="animate-spin text-navy/40" />
                <p className="text-sm">Chargement des points de restauration...</p>
              </div>
            ) : restorePoints.length === 0 ? (
              <div className="py-20 px-4 text-center space-y-4">
                <div className="w-16 h-16 bg-navy/5 text-navy/30 rounded-2xl flex items-center justify-center mx-auto">
                  <Database size={32} />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-bold text-navy">Aucun point de restauration enregistré</h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Cliquez sur "Créer un point maintenant" pour enregistrer un instantané complet de votre application. Une sauvegarde automatique est également déclenchée quotidiennement.
                  </p>
                </div>
                <button
                  onClick={handleCreateManualPoint}
                  disabled={isCreatingRestorePoint}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-navy text-white rounded-xl text-xs font-bold hover:bg-navy-light transition-all shadow-sm"
                >
                  <Plus size={16} /> Créer le premier point
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                <div className="bg-gray-50/80 px-6 py-3 flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b">
                  <span>{restorePoints.length} point(s) de sauvegarde disponible(s)</span>
                  <span className="hidden md:inline text-[10px] text-gray-400">Purge automatique : 2 dernières sauvegardes conservées</span>
                </div>
                {restorePoints.map((point) => {
                  const pDate = new Date(point.createdAt);
                  const isAuto = point.type === 'auto';
                  return (
                    <div 
                      key={point.id} 
                      className="p-5 md:p-6 hover:bg-gray-50/70 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 group"
                    >
                      {/* Left: Info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="flex items-center gap-1.5 font-black text-navy text-sm md:text-base">
                            <Clock size={16} className="text-gray-400 shrink-0" />
                            <span>
                              {pDate.toLocaleDateString('fr-FR', {
                                weekday: 'short',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="text-yellow-600 font-mono">
                              à {pDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>

                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isAuto 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {isAuto ? 'Automatique' : 'Manuelle'}
                          </span>
                        </div>

                        <p className="text-xs text-gray-600 font-medium">
                          {point.label}
                        </p>

                        {/* Summary Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-bold">
                            📊 {point.summary.missions} missions
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-bold">
                            👥 {point.summary.collaborators} consultants
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-bold">
                            🕒 {point.summary.timesheets} temps
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[11px] font-bold">
                            💰 {point.summary.budget_data} ex. budget & calculs
                          </span>
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded text-[11px] font-bold">
                            🚀 {point.summary.xsell_opportunities} Xsell
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                        <button
                          onClick={() => handleDownloadPointJson(point)}
                          className="p-2.5 text-gray-500 hover:text-navy hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 text-xs font-bold flex items-center gap-1.5"
                          title="Télécharger l'instantané JSON"
                        >
                          <FileDown size={15} />
                          <span className="hidden sm:inline">JSON</span>
                        </button>
                        
                        <button
                          onClick={() => handleDeletePoint(point.id)}
                          className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-gray-200 text-xs font-bold"
                          title="Supprimer ce point"
                        >
                          <Trash2 size={15} />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedPointToRestore(point);
                            setPointRestoreConfirmText('');
                            setIsPointRestoreChecked(false);
                          }}
                          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 uppercase tracking-wider"
                        >
                          <RotateCcw size={15} />
                          <span>Restaurer cette version</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Info Banner */}
            <div className="p-4 bg-yellow-50/80 border-t border-yellow-100 flex items-start gap-3">
              <Info className="text-yellow-600 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-yellow-900 leading-relaxed">
                <p className="font-bold">Fonctionnement de la restauration :</p>
                <p className="mt-0.5">
                  La restauration remplace les données de l'application par l'instantané sélectionné. Les calculs budgétaires automatisés, les pointages de dépenses, les affectations staffing et les opportunités Xsell sont réintégrés fidèlement. Un point de sécurité automatique est également généré juste avant chaque restauration pour vous permettre de revenir en arrière à tout moment.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Restore Point */}
      {selectedPointToRestore && (
        <div className="fixed inset-0 bg-navy/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-red-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold uppercase tracking-wider">
                    Confirmer la restauration
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    Restauration complète de l'application
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPointToRestore(null)} 
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-red-900 uppercase tracking-wider">
                  ⚠️ Action de remplacement intégral
                </p>
                <p className="text-xs text-red-800 leading-relaxed">
                  Vous vous apprêtez à restaurer l'état complet de l'application à la date du :
                </p>
                <div className="p-2.5 bg-white rounded-lg border border-red-200 text-xs font-bold text-navy flex items-center justify-between">
                  <span>📅 {new Date(selectedPointToRestore.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  <span className="text-red-600 font-mono font-bold">⏰ {new Date(selectedPointToRestore.createdAt).toLocaleTimeString('fr-FR')}</span>
                </div>
              </div>

              {/* Data Summary to be restored */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200">
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Données qui seront rétablies :
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-white rounded border border-gray-100 font-semibold text-navy">
                    📊 <span className="font-bold">{selectedPointToRestore.summary.missions}</span> Missions
                  </div>
                  <div className="p-2 bg-white rounded border border-gray-100 font-semibold text-navy">
                    👥 <span className="font-bold">{selectedPointToRestore.summary.collaborators}</span> Collaborateurs
                  </div>
                  <div className="p-2 bg-white rounded border border-gray-100 font-semibold text-navy">
                    🕒 <span className="font-bold">{selectedPointToRestore.summary.timesheets}</span> Feuilles de temps
                  </div>
                  <div className="p-2 bg-white rounded border border-gray-100 font-semibold text-navy">
                    💰 <span className="font-bold">{selectedPointToRestore.summary.budget_data}</span> Budgets & formules
                  </div>
                  <div className="col-span-2 p-2 bg-white rounded border border-gray-100 font-semibold text-purple-700">
                    🚀 <span className="font-bold">{selectedPointToRestore.summary.xsell_opportunities}</span> Opportunités Xsell
                  </div>
                </div>
              </div>

              {/* Checkbox and Input Confirmations */}
              <div className="space-y-4 pt-1">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPointRestoreChecked}
                    onChange={e => setIsPointRestoreChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                  />
                  <span className="text-xs font-bold text-gray-700">
                    Je comprends que cette opération écrasera les données actuelles pour restaurer fidèlement cette version.
                  </span>
                </label>

                {isPointRestoreChecked && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <label className="block text-[10px] font-bold text-red-600 uppercase tracking-widest">
                      Tapez <span className="underline">RESTAURER</span> pour confirmer :
                    </label>
                    <input
                      type="text"
                      value={pointRestoreConfirmText}
                      onChange={e => setPointRestoreConfirmText(e.target.value)}
                      placeholder="RESTAURER"
                      className="w-full bg-white border-2 border-red-300 text-red-700 font-black px-4 py-2.5 rounded-xl outline-none focus:border-red-600 text-center tracking-widest text-sm uppercase placeholder:font-normal placeholder:normal-case"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedPointToRestore(null)}
                disabled={isPointRestoring}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors uppercase tracking-wider"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecutePointRestore}
                disabled={isPointRestoring || !isPointRestoreChecked || pointRestoreConfirmText !== 'RESTAURER'}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 uppercase tracking-wider"
              >
                {isPointRestoring ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Restauration en cours...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    <span>Confirmer la restauration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {collaboratorToDelete && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
            <h3 className="text-lg font-bold text-navy">Confirmer la suppression</h3>
            <p className="text-sm text-gray-500">Supprimer le collaborateur <span className="font-bold text-navy">{state.collaborators.find(c => c.id === collaboratorToDelete)?.firstName}</span> ?</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCollaboratorToDelete(null)} className="flex-1 px-4 py-2 border rounded-lg font-bold text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={confirmDeleteCollaborator} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Collaborator Edit Modal */}
      {editingCollaborator && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold text-navy">{editingCollaborator.id ? 'Modifier le collaborateur' : 'Nouveau collaborateur'}</h3>
              <button onClick={() => setEditingCollaborator(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveCollaborator} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prénom</label>
                  <input required type="text" value={editingCollaborator.firstName} onChange={e => setEditingCollaborator({...editingCollaborator, firstName: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nom</label>
                  <input required type="text" value={editingCollaborator.lastName} onChange={e => setEditingCollaborator({...editingCollaborator, lastName: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                  <input required type="email" value={editingCollaborator.email} onChange={e => setEditingCollaborator({...editingCollaborator, email: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grade</label>
                  <select value={editingCollaborator.grade} onChange={e => setEditingCollaborator({...editingCollaborator, grade: e.target.value as Role})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent">
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                  <select value={editingCollaborator.collaboratorType} onChange={e => setEditingCollaborator({...editingCollaborator, collaboratorType: e.target.value as CollaboratorType})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent">
                    {Object.values(CollaboratorType).map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pays</label>
                  <select value={editingCollaborator.country} onChange={e => setEditingCollaborator({...editingCollaborator, country: e.target.value as Country})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent">
                    {Object.values(Country).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                
                {/* Dates de contrat */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-navy/40" /> Date d'arrivée
                  </label>
                  <input 
                    type="date" 
                    required
                    value={editingCollaborator.joiningDate || ''} 
                    onChange={e => setEditingCollaborator({...editingCollaborator, joiningDate: e.target.value})} 
                    className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent font-bold" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1.5">
                    <LogOut size={14} className="text-red-400/40" /> Date de départ (Optionnelle)
                  </label>
                  <input 
                    type="date" 
                    value={editingCollaborator.leavingDate || ''} 
                    onChange={e => setEditingCollaborator({...editingCollaborator, leavingDate: e.target.value || undefined})} 
                    className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent font-bold text-red-500" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CJM (Coût/Jour)</label>
                  <input type="number" value={editingCollaborator.cjm} onChange={e => setEditingCollaborator({...editingCollaborator, cjm: parseInt(e.target.value) || 0})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                
                <div className="flex flex-col gap-4 pt-4">
                   <div className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" id="user-active" checked={editingCollaborator.active} onChange={e => setEditingCollaborator({...editingCollaborator, active: e.target.checked})} className="w-4 h-4 rounded text-navy" />
                      <label htmlFor="user-active" className="text-sm font-bold text-gray-700 cursor-pointer">Actif</label>
                   </div>
                </div>

                <div className="col-span-2 pt-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                  <textarea 
                    value={editingCollaborator.notes || ''} 
                    onChange={e => setEditingCollaborator({...editingCollaborator, notes: e.target.value})} 
                    className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent min-h-[100px]"
                    placeholder="Commentaires, informations RH..."
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onClick={() => setEditingCollaborator(null)} className="px-6 py-2 border rounded-lg font-bold text-gray-500 hover:bg-gray-50">Annuler</button>
                <button type="submit" className="flex items-center gap-2 px-6 py-2 bg-navy text-white rounded-lg font-bold hover:bg-navy/90 shadow-lg">
                  <Save size={18} /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;