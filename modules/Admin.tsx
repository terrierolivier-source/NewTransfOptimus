import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, X, Save, AlertTriangle, 
  Download, Upload, FileJson, FileSpreadsheet, 
  CheckCircle, XCircle, Info, ChevronRight,
  Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX,
  User as UserIcon, CalendarDays, LogOut, Database, Clock
} from 'lucide-react';
import { AppState, Country, Holiday, User, Mission, MissionStatus, BillingMode, Role, Collaborator, CollaboratorType } from '../types';
import { generateId, formatDateDisplay } from '../utils';
import { getBackups, syncCollaboratorToCloud, deleteCollaboratorFromCloud } from '../services/dataService';
import * as XLSX from 'xlsx';

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

  // Import States
  const [importType, setImportType] = useState<'collaborators' | 'missions'>('collaborators');
  const [importData, setImportData] = useState<any[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collaborator Management States
  const [editingCollaborator, setEditingCollaborator] = useState<Partial<Collaborator> | null>(null);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<string | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
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
  }, [state.collaborators, collaboratorSearch, collaboratorSortConfig, state.globalCountry]);

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

  // Export Logic
  const handleExportJSON = (type: 'collaborators' | 'missions') => {
    const data = type === 'collaborators' ? state.collaborators : state.missions;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = (type: 'collaborators' | 'missions') => {
    const data = type === 'collaborators' ? state.collaborators : state.missions;
    if (data.length === 0) return;
    
    // Simplification : on exporte les objets à plat
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const val = (row as any)[header];
        return JSON.stringify(typeof val === 'object' ? JSON.stringify(val) : val);
      }).join(','))
    ];
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = (type: 'collaborators' | 'missions') => {
    const data = type === 'collaborators' ? state.collaborators : state.missions;
    if (data.length === 0) return;

    // Nettoyage des données pour l'export Excel (on aplatit les objets complexes)
    const processedData = data.map(item => {
      const flatItem: any = { ...item };
      Object.keys(flatItem).forEach(key => {
        if (typeof flatItem[key] === 'object' && flatItem[key] !== null) {
          flatItem[key] = JSON.stringify(flatItem[key]);
        }
      });
      return flatItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, type === 'collaborators' ? "Collaborateurs" : "Missions");
    
    XLSX.writeFile(workbook, `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Import Logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          validateAndSetImportData(json);
        } catch (err) {
          setImportErrors(['Erreur lors de la lecture du fichier Excel.']);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
          if (file.name.endsWith('.json')) {
            const parsed = JSON.parse(content);
            validateAndSetImportData(parsed);
          } else if (file.name.endsWith('.csv')) {
            const lines = content.split('\n').filter(l => l.trim() !== '');
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const data = lines.slice(1).map(line => {
              const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
              const obj: any = {};
              headers.forEach((header, i) => {
                let val = values[i];
                // Tentative de dé-sérialisation JSON pour les champs complexes
                try { if (val.startsWith('{') || val.startsWith('[')) val = JSON.parse(val); } catch(e) {}
                obj[header] = val;
              });
              return obj;
            });
            validateAndSetImportData(data);
          }
        } catch (err) {
          setImportErrors(['Erreur lors du parsing du fichier. Assurez-vous du format CSV ou JSON valide.']);
        }
      };
      reader.readAsText(file);
    }
  };

  const validateAndSetImportData = (data: any[]) => {
    const errors: string[] = [];
    const validData: any[] = [];

    if (!Array.isArray(data)) {
      errors.push('Le fichier doit contenir une liste d\'objets.');
    } else {
      data.forEach((item, index) => {
        if (importType === 'collaborators') {
          if (!item.firstName || !item.lastName || !item.email) {
            errors.push(`Ligne ${index + 1}: Champs obligatoires manquants (Prénom, Nom, Email).`);
          } else {
            validData.push({
              ...item,
              id: item.id || crypto.randomUUID(),
              active: item.active !== undefined ? (typeof item.active === 'boolean' ? item.active : item.active === 'true' || item.active === 1) : true,
              joiningDate: item.joiningDate || new Date().toISOString().split('T')[0],
              collaboratorType: item.collaboratorType || CollaboratorType.INTERNAL
            });
          }
        } else {
          if (!item.clientName || !item.name) {
            errors.push(`Ligne ${index + 1}: Champs obligatoires manquants (Client, Mission).`);
          } else {
            validData.push({
              ...item,
              id: item.id || generateId(),
              status: item.status || MissionStatus.EN_COURS,
              active: item.active !== undefined ? (typeof item.active === 'boolean' ? item.active : item.active === 'true' || item.active === 1) : true,
              billingMode: item.billingMode || BillingMode.FORFAIT
            });
          }
        }
      });
    }

    setImportErrors(errors);
    setImportData(validData);
  };

  const applyImport = () => {
    if (!importData) return;
    if (importType === 'collaborators') {
      updateState({ collaborators: [...state.collaborators, ...importData] });
    } else {
      updateState({ missions: [...state.missions, ...importData] });
    }
    setImportData(null);
    setImportErrors([]);
    alert('Importation réussie !');
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

                {collaboratorSearch !== '' && (
                  <button 
                    onClick={() => setCollaboratorSearch('')}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Export */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="text-navy" size={24} />
              <h3 className="text-lg font-bold text-navy">Exportation de données</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 border rounded-xl hover:border-navy transition-colors">
                <h4 className="font-bold text-navy mb-1">Collaborateurs</h4>
                <p className="text-xs text-gray-500 mb-4">Exportez la liste complète des collaborateurs.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleExportJSON('collaborators')} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors">
                    <FileJson size={14} /> JSON
                  </button>
                  <button onClick={() => handleExportCSV('collaborators')} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors">
                    <FileSpreadsheet size={14} /> CSV
                  </button>
                  <button onClick={() => handleExportExcel('collaborators')} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors border border-emerald-100">
                    <FileSpreadsheet size={14} /> EXCEL (XLSX)
                  </button>
                </div>
              </div>
              <div className="p-4 border rounded-xl hover:border-navy transition-colors">
                <h4 className="font-bold text-navy mb-1">Missions & Staffing</h4>
                <p className="text-xs text-gray-500 mb-4">Exportez toutes les missions.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleExportJSON('missions')} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors">
                    <FileJson size={14} /> JSON
                  </button>
                  <button onClick={() => handleExportCSV('missions')} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors">
                    <FileSpreadsheet size={14} /> CSV
                  </button>
                  <button onClick={() => handleExportExcel('missions')} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors border border-emerald-100">
                    <FileSpreadsheet size={14} /> EXCEL (XLSX)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Import */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="text-navy" size={24} />
              <h3 className="text-lg font-bold text-navy">Importation de données</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Type d'entité</label>
                <div className="flex gap-2">
                  <button onClick={() => { setImportType('collaborators'); setImportData(null); }} className={`flex-1 px-4 py-2 rounded-lg font-bold text-xs transition-colors ${importType === 'collaborators' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Collaborateurs</button>
                  <button onClick={() => { setImportType('missions'); setImportData(null); }} className={`flex-1 px-4 py-2 rounded-lg font-bold text-xs transition-colors ${importType === 'missions' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Missions</button>
                </div>
              </div>
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-navy hover:bg-navy/5 transition-all group">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center group-hover:bg-navy/10 transition-colors"><Upload size={24} className="text-gray-400 group-hover:text-navy" /></div>
                <div className="text-center">
                  <p className="text-sm font-bold text-navy">Cliquez pour importer</p>
                  <p className="text-[10px] text-gray-400">JSON, CSV ou EXCEL (.xlsx, .xls)</p>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json,.csv,.xlsx,.xls" className="hidden" />
              </div>
              {importData && (
                <div className="p-4 bg-gray-50 rounded-xl border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle size={18} />
                      <span className="text-xs font-bold uppercase">Prévisualisation ({importData.length})</span>
                    </div>
                    <button onClick={() => setImportData(null)} className="text-gray-400 hover:text-navy"><X size={16} /></button>
                  </div>
                  {importErrors.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-1">
                      {importErrors.map((err, i) => <p key={i} className="text-[9px] text-red-500">{err}</p>)}
                    </div>
                  )}
                  <button disabled={importErrors.length > 0} onClick={applyImport} className="w-full py-2 bg-navy text-white rounded-lg font-bold text-sm shadow-md hover:bg-navy/90">Confirmer l'importation</button>
                </div>
              )}
            </div>
          </div>
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