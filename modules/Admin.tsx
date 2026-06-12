import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, X, Save, AlertTriangle, 
  Download, Upload, FileJson, FileSpreadsheet, 
  CheckCircle, XCircle, Info, ChevronRight,
  Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX,
  User as UserIcon, CalendarDays, LogOut, Database, Clock,
  ShieldAlert, List, Server, RefreshCw
} from 'lucide-react';
import { AppState, Country, Holiday, User, Mission, MissionStatus, BillingMode, Role, Collaborator, CollaboratorType } from '../types';
import { generateId, formatDateDisplay } from '../utils';
import { getBackups, syncCollaboratorToCloud, deleteCollaboratorFromCloud, loadStateFromCloud } from '../services/dataService';
import * as XLSX from 'xlsx';
import { 
  exportFullBackupJson, 
  exportFullBackupExcel, 
  validateBackupJson, 
  getImportPreview, 
  importBackupJson, 
  validateAndParseExcel,
  FullBackup,
  ImportPreview,
  ImportMode
} from '../services/backupService';

interface AdminProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

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
        </div>
      )}


      {/* Backups Tab */}
      {activeTab === 'backups' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Database className="text-navy" size={20} />
              <h2 className="font-bold text-gray-700 uppercase text-xs tracking-wider">
                Système de Sauvegarde Automatique
              </h2>
            </div>
            <div className="text-[10px] text-gray-400 font-medium">
              Dernières 15 sauvegardes (1 par jour max)
            </div>
          </div>

          {isLoadingBackups ? (
            <div className="p-20 text-center text-gray-400 font-medium">Chargement des sauvegardes...</div>
          ) : backups.length === 0 ? (
            <div className="p-20 text-center text-gray-400 italic font-medium">Aucune sauvegarde trouvée.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-400 font-bold border-b">
                    <th className="p-4">Date de sauvegarde</th>
                    <th className="p-4">Heure</th>
                    <th className="p-4">Créé par</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backups.map((backup) => (
                    <tr key={backup.id} className="text-sm hover:bg-gray-50 group">
                      <td className="p-4 font-bold text-navy flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        {formatDateDisplay(backup.date)}
                      </td>
                      <td className="p-4 text-gray-500 font-mono text-xs">
                        {new Date(backup.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-4 text-xs text-navy/70 italic">
                        {backup.createdBy || 'Système'}
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(backup.state, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `backup_${backup.date}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }} 
                          className="flex items-center gap-2 px-3 py-1.5 bg-navy text-white rounded-lg text-xs font-bold hover:bg-navy/90 transition-colors ml-auto shadow-sm"
                        >
                          <Download size={14} /> Télécharger JSON
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="p-4 bg-yellow-50 border-t border-yellow-100 flex items-start gap-3">
             <Info className="text-yellow-600 shrink-0 mt-0.5" size={16} />
             <p className="text-[10px] text-yellow-800 leading-relaxed">
               Une sauvegarde complète de l'application est effectuée automatiquement chaque jour lors de la première connexion d'un administrateur à partir de minuit.
               Ces sauvegardes contiennent l'intégralité de l'état de l'application (utilisateurs, missions, planning, budgets) et peuvent être extraites en JSON pour archivage.
             </p>
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