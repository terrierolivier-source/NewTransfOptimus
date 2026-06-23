import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  ChevronRight, 
  FilterX, 
  Download, 
  Upload, 
  Check, 
  AlertCircle, 
  Info, 
  Edit2, 
  Coins, 
  Briefcase, 
  Users, 
  Loader2,
  Euro,
  Layers,
  ArrowUpDown,
  Eye,
  EyeOff
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { MultiSelect } from '../components/MultiSelect';

// Strict Type Definition requested by the user
export interface XsellOpportunity {
  id: string;
  year: number | null;
  account_owner: string;
  account_name: string;
  beneficiary_entity: string;
  subject: string;
  signature_date: string;
  beneficiary_contact: string;
  status: string;
  january_2026_invoice: string;
  include_in_staffing_followup: string;
  billing_model: string;
  refac_percentage: string | null;
  estimated_revenue: number | null;
  amount_to_invoice: number | null;
  beneficiary_invoice_date: string;
  transfo_invoiced: string;
  transfo_invoice_date: string;
  comments: string;
  estimated_client_savings: number | null;
  beneficiary_sf_percentage: string | null;
  source_import_filename?: string;
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

const extractYearFromInvoiceDate = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const mYmd = s.match(/^(\d{4})[-/]/);
  if (mYmd) return parseInt(mYmd[1], 10);
  const mDmy = s.match(/[-/](\d{4})$/);
  if (mDmy) return parseInt(mDmy[1], 10);
  const mAny = s.match(/\b(20\d{2})\b/);
  if (mAny) return parseInt(mAny[1], 10);
  return null;
};

const getOpportunityRefYear = (o: XsellOpportunity): number | null => {
  const invoiceYear = extractYearFromInvoiceDate(o.transfo_invoice_date);
  if (invoiceYear !== null) return invoiceYear;
  return o.year;
};

const parseRefacPercentageToRatio = (val: string | null | undefined): number => {
  if (!val) return 0;
  const clean = String(val).trim().replace(',', '.');
  if (!clean || clean.toLowerCase() === 'na') return 0;
  
  const hasPercent = clean.includes('%');
  const numValue = parseFloat(clean.replace('%', ''));
  if (isNaN(numValue)) return 0;
  
  if (hasPercent) {
    return numValue / 100;
  }
  
  if (numValue > 1) {
    return numValue / 100;
  }
  return numValue;
};

const getStatusBadgeStyles = (status: string | null | undefined) => {
  const norm = (status || '').trim();
  switch (norm) {
    case '01 - RDV à venir':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case '02 - RDV réalisé':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case '03 - Contrat signé':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case '04 - mission en cours':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case '05 - mission terminée':
      return 'bg-green-500 text-white border-green-600 font-extrabold shadow-[0_0_8px_rgba(34,197,94,0.5)]';
    case 'KO':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      if (norm.includes('cours') || norm.includes('Active')) return 'bg-orange-50 text-orange-700 border-orange-100';
      if (norm.includes('Gagné') || norm.includes('Signé')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      if (norm.includes('Perdu') || norm === 'KO') return 'bg-red-50 text-red-700 border-red-100';
      return 'bg-gray-50 text-gray-600 border-gray-100';
  }
};

const getStatusProgressBarColor = (status: string | null | undefined) => {
  const norm = (status || '').trim();
  switch (norm) {
    case '01 - RDV à venir':
      return 'bg-blue-500';
    case '02 - RDV réalisé':
      return 'bg-amber-500';
    case '03 - Contrat signé':
      return 'bg-emerald-500';
    case '04 - mission en cours':
      return 'bg-indigo-500';
    case '05 - mission terminée':
      return 'bg-green-500 shadow-[0_0_8px_#22c55e]';
    case 'KO':
      return 'bg-red-500';
    default:
      if (norm.includes('cours') || norm.includes('Active')) return 'bg-orange-500';
      if (norm.includes('Gagné') || norm.includes('Signé')) return 'bg-emerald-500';
      if (norm.includes('Perdu') || norm === 'KO') return 'bg-red-500';
      return 'bg-navy';
  }
};

const getTransfoInvoicedBadgeStyles = (val: string | null | undefined) => {
  const norm = (val || '').trim();
  switch (norm) {
    case '01 - Non prêt à facturer':
      return 'bg-red-50 text-red-700 border-red-100';
    case '02 - Prêt à facturer':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case '03 - Facturé':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    default:
      if (norm === 'Oui' || norm === 'Facturé' || norm.includes('Facturé')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      }
      return 'bg-red-50 text-red-700 border-red-100';
  }
};

interface XsellOpportunitiesProps {
  globalFY?: string;
}

const XsellOpportunities: React.FC<XsellOpportunitiesProps> = ({ globalFY = 'FY26' }) => {
  // DB & State management
  const [opportunities, setOpportunities] = useState<XsellOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(['Except KO']);
  const [yearFilter, setYearFilter] = useState<string[]>(['All']);
  const [ownerFilter, setOwnerFilter] = useState<string[]>(['All']);
  const [accountFilter, setAccountFilter] = useState<string[]>(['All']);
  const [entityFilter, setEntityFilter] = useState<string[]>(['All']);
  const [billingModelFilter, setBillingModelFilter] = useState<string[]>(['All']);
  const [invoicedFilter, setInvoicedFilter] = useState<string[]>(['All']);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof XsellOpportunity | ''; direction: 'asc' | 'desc' }>({
    key: 'account_name',
    direction: 'asc'
  });

  // Lateral detail & edit panel
  const [selectedOpp, setSelectedOpp] = useState<XsellOpportunity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<XsellOpportunity>>({});
  const [savingAction, setSavingAction] = useState(false);

  // Manual Creation modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<XsellOpportunity>>({
    year: new Date().getFullYear(),
    account_owner: '',
    account_name: '',
    beneficiary_entity: '',
    beneficiary_contact: '',
    subject: '',
    status: '',
    billing_model: '',
    estimated_client_savings: null,
    beneficiary_sf_percentage: null,
    estimated_revenue: null,
    refac_percentage: null,
    amount_to_invoice: null,
    transfo_invoiced: '',
    transfo_invoice_date: '',
    comments: ''
  });

  // Analytics display state
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Import Modal & File preview
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Partial<XsellOpportunity>[]>([]);
  const [importFilename, setImportFilename] = useState('');
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Confirm Modal
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [oppToDelete, setOppToDelete] = useState<string | null>(null);

  // Load from Supabase on mount
  const fetchOpportunities = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const { data, error } = await supabase
        .from('xsell_opportunities')
        .select('*');

      if (error) {
        throw error;
      }

      setOpportunities(data || []);
    } catch (err: any) {
      console.error('Error fetching xsell opportunities:', err);
      setDbError(err.message || 'Une erreur est survenue lors de la récupération des opportunités Xsell.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const [collabOptions, setCollabOptions] = useState<string[]>([]);

  useEffect(() => {
    const fetchCollabs = async () => {
      try {
        const { data: usersData } = await supabase.from('users').select('first_name, last_name, grade');
        const { data: collabsData } = await supabase.from('collaborators').select('first_name, last_name, grade');
        
        const combined = [
          ...(usersData || []).map(u => ({ first_name: u.first_name, last_name: u.last_name, grade: u.grade })),
          ...(collabsData || []).map(c => ({ first_name: c.first_name, last_name: c.last_name, grade: c.grade }))
        ];

        // Deduplicate by name
        const namesMap = new Map<string, { first_name: string; last_name: string; grade: string }>();
        combined.forEach(p => {
          const fName = (p.first_name || '').trim();
          const lName = (p.last_name || '').trim();
          if (!fName && !lName) return;
          const fullName = `${fName} ${lName}`.trim();
          if (!namesMap.has(fullName)) {
            namesMap.set(fullName, p);
          }
        });

        // Filter out Consultant and Delivery Manager
        const filtered = Array.from(namesMap.values()).filter(p => {
          const g = p.grade || '';
          return g !== 'Consultant' && g !== 'Delivery Manager';
        });

        const sorted = filtered
          .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
          .sort((a, b) => a.localeCompare(b));

        setCollabOptions(sorted);
      } catch (err) {
        console.error('Error loading collabs for Xsell:', err);
      }
    };
    fetchCollabs();
  }, []);

  // Auto-calculate creation form estimated_revenue
  useEffect(() => {
    const savings = createForm.estimated_client_savings;
    const sfPercentage = createForm.beneficiary_sf_percentage;
    if (savings !== undefined && savings !== null && sfPercentage !== undefined && sfPercentage !== null && sfPercentage !== '') {
      const ratio = parseRefacPercentageToRatio(sfPercentage);
      const calculatedRevenue = Math.round(savings * ratio);
      if (createForm.estimated_revenue !== calculatedRevenue) {
        setCreateForm(prev => ({ ...prev, estimated_revenue: calculatedRevenue }));
      }
    }
  }, [createForm.estimated_client_savings, createForm.beneficiary_sf_percentage]);

  // Auto-calculate edit form estimated_revenue
  useEffect(() => {
    const savings = editForm.estimated_client_savings;
    const sfPercentage = editForm.beneficiary_sf_percentage;
    if (savings !== undefined && savings !== null && sfPercentage !== undefined && sfPercentage !== null && sfPercentage !== '') {
      const ratio = parseRefacPercentageToRatio(sfPercentage);
      const calculatedRevenue = Math.round(savings * ratio);
      if (editForm.estimated_revenue !== calculatedRevenue) {
        setEditForm(prev => ({ ...prev, estimated_revenue: calculatedRevenue }));
      }
    }
  }, [editForm.estimated_client_savings, editForm.beneficiary_sf_percentage]);

  // Auto-calculate creation form amount_to_invoice
  useEffect(() => {
    const rev = createForm.estimated_revenue;
    const pct = createForm.refac_percentage;
    if (rev !== undefined && rev !== null && pct !== undefined && pct !== null) {
      const ratio = parseRefacPercentageToRatio(pct);
      const calculated = Math.round(rev * ratio);
      if (createForm.amount_to_invoice !== calculated) {
        setCreateForm(prev => ({ ...prev, amount_to_invoice: calculated }));
      }
    }
  }, [createForm.estimated_revenue, createForm.refac_percentage]);

  // Auto-calculate edit form amount_to_invoice
  useEffect(() => {
    const rev = editForm.estimated_revenue;
    const pct = editForm.refac_percentage;
    if (rev !== undefined && rev !== null && pct !== undefined && pct !== null) {
      const ratio = parseRefacPercentageToRatio(pct);
      const calculated = Math.round(rev * ratio);
      if (editForm.amount_to_invoice !== calculated) {
        setEditForm(prev => ({ ...prev, amount_to_invoice: calculated }));
      }
    }
  }, [editForm.estimated_revenue, editForm.refac_percentage]);

  // Format Helper for Currencies
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    const rounded = Math.round(val);
    const formattedNum = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formattedNum}\u00A0€`;
  };

  const formatPercentage = (val: string | null | undefined) => {
    if (!val) return '-';
    const cleanStr = String(val).trim();
    if (cleanStr === '' || cleanStr.toLowerCase() === 'na') return cleanStr;
    if (cleanStr.endsWith('%')) return cleanStr;
    
    // Check if it is a float like 0.11 -> 11%
    const num = parseFloat(cleanStr.replace(',', '.'));
    if (!isNaN(num)) {
      if (num > 0 && num < 1 && !cleanStr.includes('%')) {
        return `${Math.round(num * 1000) / 10}%`;
      }
    }
    return cleanStr;
  };

  // String parser helper for year
  const parseYear = (val: any): number | null => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    if (typeof val === 'number') return val;
    const matches = String(val).match(/\d+/);
    if (matches) return parseInt(matches[0]);
    return null;
  };

  // String parser helper for numbers as requested
  const parseNumber = (val: any): number | null => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(/[\s€$kK]/g, '').replace(',', '.');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? null : parsed;
  };

  // Header matching algorithm with robust checks and substring prevention of mix-ups
  const findHeaderKey = (rawHeader: string): keyof XsellOpportunity | null => {
    const clean = rawHeader.toLowerCase().trim();
    // Normalize string (remove accents, keep only letters and numbers)
    const norm = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

    // Exact or direct matches take supreme priority to prevent misclassification
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

    // Substring searches as robust fallback
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

  // File Upload Handlers (Supports both drag-and-drop & manual selection)
  const processExcelFile = (file: File) => {
    setImportError(null);
    setImportFilename(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Find sheet named "Suivi xsell" or fallback to first sheet
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

        // Detect header row (first line with valid column matches)
        let headerRowIdx = 0;
        let bestHeaderMatchCount = 0;
        
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          let matches = 0;
          const r = rows[i];
          if (Array.isArray(r)) {
            r.forEach(cell => {
              if (cell && findHeaderKey(String(cell))) {
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

        // Map data rows
        const parsedOpps: Partial<XsellOpportunity>[] = [];
        
        for (let j = headerRowIdx + 1; j < rows.length; j++) {
          const rowData = rows[j];
          if (!rowData || !Array.isArray(rowData)) continue;
          
          // Check if row is completely empty
          const isEmpty = rowData.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
          if (isEmpty) continue;

          const opp: Partial<XsellOpportunity> = {};
          let hasAnyData = false;

          headers.forEach((h, colIdx) => {
            const key = findHeaderKey(String(h));
            if (key) {
              const rawVal = rowData[colIdx];
              hasAnyData = true;
              
              if (key === 'year') {
                opp[key] = parseYear(rawVal);
              } else if (key === 'refac_percentage' || key === 'beneficiary_sf_percentage') {
                // Percentages remain as string | null without parsePercent conversion to floats
                opp[key] = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : null;
              } else if (key === 'estimated_revenue' || key === 'amount_to_invoice' || key === 'estimated_client_savings') {
                opp[key] = parseNumber(rawVal);
              } else if (key === 'transfo_invoice_date') {
                // Formatting dates safely if imported as excel serial format
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
            // Apply unique ID
            opp.id = crypto.randomUUID();
            opp.source_import_filename = file.name;
            opp.imported_at = new Date().toISOString();
            
            // Set defaults and blank values strictly without inventing words
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

        setImportPreview(parsedOpps);
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        setImportError(err.message || 'Erreur lors du traitement du fichier.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processExcelFile(files[0]);
    }
  };

  // Perform actual Database Sync for Import
  const executeImport = async () => {
    if (importPreview.length === 0) return;
    
    // Explicit confirm for replace mode
    if (importMode === 'replace') {
      const confirmText = 'Cette action supprimera uniquement les données Xsell de la table public.xsell_opportunities. Les autres modules ne seront pas modifiés. Êtes-vous sûr de vouloir remplacer toutes les opportunités ?';
      if (!window.confirm(confirmText)) {
        return;
      }
    }

    setIsImporting(true);
    setImportError(null);

    try {
      if (importMode === 'replace') {
        const { error: deleteError } = await supabase
          .from('xsell_opportunities')
          .delete()
          .not('id', 'is', null); // clear all records

        if (deleteError) throw deleteError;
      }

      // Convert preview objects fully to fit database payload
      const payload = importPreview.map(opp => ({
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
        source_import_filename: importFilename,
        imported_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      // Supabase supports bulk inserts in chunks to safety proof against payload size limits
      const chunkSize = 100;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('xsell_opportunities')
          .insert(chunk);

        if (insertError) throw insertError;
      }

      // Refresh list
      await fetchOpportunities();
      setIsImportOpen(false);
      setImportPreview([]);
      setImportFilename('');
    } catch (err: any) {
      console.error('Import failed:', err);
      setImportError(err.message || 'La synchronisation avec la base de données a échoué.');
    } finally {
      setIsImporting(false);
    }
  };

  // Perform manual Row Creation
  const handleCreateOpp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAction(true);
    try {
      const oppId = crypto.randomUUID();
      const payload = {
        ...createForm,
        id: oppId,
        signature_date: '',
        january_2026_invoice: '',
        include_in_staffing_followup: '',
        beneficiary_invoice_date: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('xsell_opportunities')
        .insert(payload)
        .select('*');

      if (error) throw error;

      if (data && data[0]) {
        setOpportunities(prev => [data[0] as XsellOpportunity, ...prev]);
      } else {
        await fetchOpportunities();
      }

      setIsCreateOpen(false);
      // Reset
      setCreateForm({
        year: new Date().getFullYear(),
        account_owner: '',
        account_name: '',
        beneficiary_entity: '',
        beneficiary_contact: '',
        subject: '',
        status: '',
        billing_model: '',
        estimated_client_savings: null,
        beneficiary_sf_percentage: null,
        estimated_revenue: null,
        refac_percentage: null,
        amount_to_invoice: null,
        transfo_invoiced: '',
        transfo_invoice_date: '',
        comments: ''
      });
    } catch (err: any) {
      console.error('Manual construction failed:', err);
      alert('Erreur de création: ' + (err.message || err));
    } finally {
      setSavingAction(false);
    }
  };

  // Perform Row Detail Saving
  const handleSaveEdit = async () => {
    if (!selectedOpp) return;
    setSavingAction(true);
    try {
      const payload = {
        ...editForm,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('xsell_opportunities')
        .update(payload)
        .eq('id', selectedOpp.id);

      if (error) throw error;

      // Update state
      const updatedList = opportunities.map(o => {
        if (o.id === selectedOpp.id) {
          return { ...o, ...payload } as XsellOpportunity;
        }
        return o;
      });

      setOpportunities(updatedList);
      const fullyUpdated = updatedList.find(o => o.id === selectedOpp.id);
      if (fullyUpdated) {
        setSelectedOpp(fullyUpdated);
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error('Update failed:', err);
      alert('Erreur lors de la sauvegarde: ' + (err.message || err));
    } finally {
      setSavingAction(false);
    }
  };

  // Perform Row Deletion
  const handleDeleteOpp = async () => {
    if (!oppToDelete) return;
    try {
      const { error } = await supabase
        .from('xsell_opportunities')
        .delete()
        .eq('id', oppToDelete);

      if (error) throw error;

      setOpportunities(prev => prev.filter(o => o.id !== oppToDelete));
      setSelectedOpp(null);
      setIsEditing(false);
    } catch (err: any) {
      console.error('Deletion failed:', err);
      alert('Erreur lors de la suppression: ' + (err.message || err));
    } finally {
      setIsDeleteConfirmOpen(false);
      setOppToDelete(null);
    }
  };

  const triggerDeleteConfirm = (id: string) => {
    setOppToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  // Excel Export generated row mapping in exact requested labels and order
  const handleExportExcel = () => {
    const exportData = filteredAndSortedOpportunities.map(opp => ({
      "Année du Lead": opp.year,
      "Responable Lead": opp.account_owner,
      "Compte Client": opp.account_name,
      "Entité Bénéficiaire": opp.beneficiary_entity,
      "Contact de l'entité Bénéficiaire": opp.beneficiary_contact,
      "Sujets Xsell": opp.subject,
      "Statut Mission": opp.status,
      "Type de refacturation": opp.billing_model,
      "Economies client estimées": opp.estimated_client_savings,
      "% de SF de l'entité bénéficiaire": opp.beneficiary_sf_percentage,
      "CA entité bénéficiaire estimé": opp.estimated_revenue,
      "% de refac Transfo": opp.refac_percentage,
      "Montant à facturer Transfo": opp.amount_to_invoice,
      "Statut de facturation TRANSFO": opp.transfo_invoiced,
      "Date de facturation Transfo": opp.transfo_invoice_date || '',
      "COMMENTAIRES": opp.comments
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Suivi xsell');
    XLSX.writeFile(workbook, `Export_Suivi_Xsell_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Dynamic filter lists
  const filterOptions = useMemo(() => {
    const statuses = Array.from(new Set(opportunities.map(o => o.status).filter(Boolean))) as string[];
    const years = Array.from(new Set(opportunities.map(o => {
      const yr = getOpportunityRefYear(o);
      return yr ? String(yr) : null;
    }).filter(Boolean))) as string[];
    const owners = Array.from(new Set(opportunities.map(o => o.account_owner).filter(Boolean))) as string[];
    const accounts = Array.from(new Set(opportunities.map(o => o.account_name).filter(Boolean))) as string[];
    const entities = Array.from(new Set(opportunities.map(o => o.beneficiary_entity).filter(Boolean))) as string[];
    const billingModels = Array.from(new Set(opportunities.map(o => o.billing_model).filter(Boolean))) as string[];
    const invoicedCodes = Array.from(new Set(opportunities.map(o => o.transfo_invoiced).filter(Boolean))) as string[];

    return {
      statuses: statuses.sort(),
      years: years.sort((a, b) => b.localeCompare(a)),
      owners: owners.sort(),
      accounts: accounts.sort(),
      entities: entities.sort(),
      billingModels: billingModels.sort(),
      invoicedCodes: invoicedCodes.sort()
    };
  }, [opportunities]);

  // Combined Searching, Filtering and Sorting logic
  const filteredAndSortedOpportunities = useMemo(() => {
    let result = [...opportunities];

    // Global text search across multiple fields
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(opp => 
        (opp.account_owner || '').toLowerCase().includes(q) ||
        (opp.account_name || '').toLowerCase().includes(q) ||
        (opp.beneficiary_entity || '').toLowerCase().includes(q) ||
        (opp.subject || '').toLowerCase().includes(q) ||
        (opp.comments || '').toLowerCase().includes(q)
      );
    }

    // Quick filters
    if (statusFilter.includes('Except KO')) {
      result = result.filter(opp => (opp.status || '').trim().toUpperCase() !== 'KO');
    } else if (statusFilter.length > 0 && !statusFilter.includes('All')) {
      result = result.filter(opp => statusFilter.includes(opp.status || ''));
    }
    
    if (yearFilter.length > 0 && !yearFilter.includes('All')) {
      result = result.filter(opp => {
        const refYear = getOpportunityRefYear(opp);
        return refYear !== null && yearFilter.includes(String(refYear));
      });
    }

    if (ownerFilter.length > 0 && !ownerFilter.includes('All')) {
      result = result.filter(opp => ownerFilter.includes(opp.account_owner || ''));
    }

    if (accountFilter.length > 0 && !accountFilter.includes('All')) {
      result = result.filter(opp => accountFilter.includes(opp.account_name || ''));
    }

    if (entityFilter.length > 0 && !entityFilter.includes('All')) {
      result = result.filter(opp => entityFilter.includes(opp.beneficiary_entity || ''));
    }

    if (billingModelFilter.length > 0 && !billingModelFilter.includes('All')) {
      result = result.filter(opp => billingModelFilter.includes(opp.billing_model || ''));
    }

    if (invoicedFilter.length > 0 && !invoicedFilter.includes('All')) {
      result = result.filter(opp => invoicedFilter.includes(opp.transfo_invoiced || ''));
    }

    // Sorting
    if (sortConfig.key !== '') {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        
        if (valA === undefined || valA === null) return direction === 'asc' ? 1 : -1;
        if (valB === undefined || valB === null) return direction === 'asc' ? -1 : 1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return direction === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return result;
  }, [opportunities, searchQuery, statusFilter, yearFilter, ownerFilter, accountFilter, entityFilter, billingModelFilter, invoicedFilter, sortConfig]);

  const handleSort = (key: keyof XsellOpportunity) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter(['Except KO']);
    setYearFilter(['All']);
    setOwnerFilter(['All']);
    setAccountFilter(['All']);
    setEntityFilter(['All']);
    setBillingModelFilter(['All']);
    setInvoicedFilter(['All']);
  };

  const isAnyFilterActive = useMemo(() => {
    return searchQuery !== '' ||
      !(statusFilter.length === 1 && statusFilter.includes('Except KO')) ||
      !(yearFilter.length === 1 && yearFilter.includes('All')) ||
      !(ownerFilter.length === 1 && ownerFilter.includes('All')) ||
      !(accountFilter.length === 1 && accountFilter.includes('All')) ||
      !(entityFilter.length === 1 && entityFilter.includes('All')) ||
      !(billingModelFilter.length === 1 && billingModelFilter.includes('All')) ||
      !(invoicedFilter.length === 1 && invoicedFilter.includes('All'));
  }, [searchQuery, statusFilter, yearFilter, ownerFilter, accountFilter, entityFilter, billingModelFilter, invoicedFilter]);

  // Bento-Dashboard Analytics
  const metrics = useMemo(() => {
    // We compute metrics that ignore the year filter.
    let listIgnoreYear = [...opportunities];
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      listIgnoreYear = listIgnoreYear.filter(opp => 
        (opp.account_owner || '').toLowerCase().includes(q) ||
        (opp.account_name || '').toLowerCase().includes(q) ||
        (opp.beneficiary_entity || '').toLowerCase().includes(q) ||
        (opp.subject || '').toLowerCase().includes(q) ||
        (opp.comments || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter.includes('Except KO')) {
      listIgnoreYear = listIgnoreYear.filter(opp => (opp.status || '').trim().toUpperCase() !== 'KO');
    } else if (statusFilter.length > 0 && !statusFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => statusFilter.includes(opp.status || ''));
    }
    if (ownerFilter.length > 0 && !ownerFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => ownerFilter.includes(opp.account_owner || ''));
    }
    if (accountFilter.length > 0 && !accountFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => accountFilter.includes(opp.account_name || ''));
    }
    if (entityFilter.length > 0 && !entityFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => entityFilter.includes(opp.beneficiary_entity || ''));
    }
    if (billingModelFilter.length > 0 && !billingModelFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => billingModelFilter.includes(opp.billing_model || ''));
    }
    if (invoicedFilter.length > 0 && !invoicedFilter.includes('All')) {
      listIgnoreYear = listIgnoreYear.filter(opp => invoicedFilter.includes(opp.transfo_invoiced || ''));
    }

    // Filtered by globalFY for the CA indicators
    const currentFYYear = parseInt(globalFY.replace('FY', ''), 10);
    const listCurrentFY = listIgnoreYear.filter(o => {
      const refYear = getOpportunityRefYear(o);
      return refYear !== null && refYear === currentFYYear;
    });

    const totalEstRevenue = listCurrentFY.reduce((sum, o) => sum + (o.estimated_revenue || 0), 0);
    const totalInvoiceTransfo = listCurrentFY.reduce((sum, o) => sum + (o.amount_to_invoice || 0), 0);
    const totalSavings = listCurrentFY.reduce((sum, o) => sum + (o.estimated_client_savings || 0), 0);

    // Distribution of Status
    const statusCount: Record<string, number> = {
      '01 - RDV à venir': 0,
      '02 - RDV réalisé': 0,
      '03 - Contrat signé': 0,
      '04 - mission en cours': 0,
      '05 - mission terminée': 0,
      'KO': 0
    };
    listIgnoreYear.forEach(o => {
      const s = o.status || 'Non renseigné';
      statusCount[s] = (statusCount[s] || 0) + 1;
    });

    const transfoInProgress = listCurrentFY
      .filter(o => o.status === '04 - mission en cours')
      .reduce((sum, o) => sum + (o.amount_to_invoice || 0), 0);

    const countInProgress = listIgnoreYear.filter(o => o.status === '04 - mission en cours').length;

    const transfoCompleted = listCurrentFY
      .filter(o => {
        const transValue = (o.transfo_invoiced || '').trim().toLowerCase();
        return transValue.includes('03 - facturé') || transValue === '03 - facturé';
      })
      .reduce((sum, o) => {
        const amount = o.amount_to_invoice !== null && o.amount_to_invoice !== undefined
          ? o.amount_to_invoice
          : Math.round((o.estimated_revenue || 0) * parseRefacPercentageToRatio(o.refac_percentage));
        return sum + amount;
      }, 0);

    const epsaRevenue = listCurrentFY
      .filter(o => (o.beneficiary_entity || '').toLowerCase().includes('epsa'))
      .reduce((sum, o) => sum + (o.estimated_revenue || 0), 0);

    // Top Owner
    const ownerRevenue: Record<string, number> = {};
    listCurrentFY.forEach(o => {
      const ow = o.account_owner || 'Non renseigné';
      ownerRevenue[ow] = (ownerRevenue[ow] || 0) + (o.estimated_revenue || 0);
    });
    const topOwners = Object.entries(ownerRevenue)
      .map(([name, val]) => ({ name, value: val }))
      .sort((a, b) => b.value - a.value);

    // Top Entity
    const entityRevenue: Record<string, number> = {};
    listCurrentFY.forEach(o => {
      const ent = o.beneficiary_entity || 'Non renseigné';
      entityRevenue[ent] = (entityRevenue[ent] || 0) + (o.estimated_revenue || 0);
    });
    const topEntities = Object.entries(entityRevenue)
      .map(([name, val]) => ({ name, value: val }))
      .sort((a, b) => b.value - a.value);

    return {
      totalCount: listIgnoreYear.length,
      totalEstRevenue,
      totalInvoiceTransfo,
      totalSavings,
      statusCount,
      topOwners,
      topEntities,
      countInProgress,
      countCompleted: statusCount['05 - mission terminée'] || 0,
      transfoInProgress,
      transfoCompleted,
      epsaRevenue
    };
  }, [
    opportunities,
    searchQuery,
    statusFilter,
    ownerFilter,
    accountFilter,
    entityFilter,
    billingModelFilter,
    invoicedFilter,
    globalFY
  ]);

  const testAppBadge = (import.meta as any).env.VITE_APP_ENV === 'TEST' ? (
    <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2.5 py-1 rounded border border-amber-200 tracking-wider">
      ENV TEST - SANDBOX
    </span>
  ) : null;

  return (
    <div className="h-[calc(100vh-8.5rem)] md:h-[calc(100vh-10.5rem)] flex flex-col overflow-hidden gap-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-sans tracking-tight text-navy uppercase select-none">Suivi Xsell</h2>
            {testAppBadge}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button 
            type="button" 
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="flex items-center gap-2 px-3 py-1.5 border border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors rounded-lg text-xs font-bold uppercase tracking-tight font-sans"
            id="xsell-btn-toggle-analytics"
          >
            {showAnalytics ? <EyeOff size={14} /> : <Eye size={14} />}
            {showAnalytics ? "Masquer indicateurs" : "Afficher indicateurs"}
          </button>
          <button 
            type="button" 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3 py-1.5 border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors rounded-lg text-xs font-bold uppercase tracking-tight font-sans"
            id="xsell-btn-export"
          >
            <Download size={14} /> Exporter Excel
          </button>
          <button 
            type="button" 
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-navy hover:bg-navy-light text-white transition-colors rounded-lg text-xs font-extrabold uppercase tracking-tight ml-auto sm:ml-0 font-sans"
            id="xsell-btn-new"
          >
            <Plus size={14} /> Nouvelle opportunité
          </button>
        </div>
      </div>

      {dbError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs flex items-center gap-3 font-bold shrink-0">
          <AlertCircle size={18} className="shrink-0 text-red-500" />
          <span>{dbError}</span>
          <button onClick={fetchOpportunities} className="ml-auto underline hover:text-red-800">Réessayer</button>
        </div>
      )}

      {/* Bento Analytics Grid */}
      {showAnalytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 shrink-0" id="xsell-analytics-grid">
        {/* Total Metric Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden" id="xsell-card-total">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Total Opportunités</span>
            <div className="text-xl font-black text-navy">{metrics.totalCount}</div>
            <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
              <span>dont {metrics.statusCount['KO'] || 0} KO</span>
            </div>
          </div>
          <div className="absolute right-4 top-4 bg-navy/5 text-navy p-3 rounded-full">
            <Briefcase size={20} />
          </div>
        </div>

        {/* Missions En Cours & Terminées Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden" id="xsell-card-in-progress">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Missions En Cours</span>
            <div className="text-xl font-black text-amber-600">{metrics.countInProgress}</div>
            <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
              <span>{metrics.countCompleted} terminées</span>
            </div>
          </div>
          <div className="absolute right-4 top-4 bg-amber-50 text-amber-600 p-3 rounded-full">
            <Layers size={20} />
          </div>
        </div>

        {/* Estimated Revenue Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden" id="xsell-card-estimated-rev">
          <div className="space-y-1 z-10 font-sans">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA Bénéficiaire Estimé</span>
            <div className="text-xl font-medium text-black truncate">{formatCurrency(metrics.totalEstRevenue)}</div>
            <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-black inline-block"></span>
              <span>Entités Groupe EPSA</span>
            </div>
          </div>
          <div className="absolute right-4 top-4 bg-black/5 text-black p-3 rounded-full">
            <Coins size={20} />
          </div>
        </div>

        {/* Invoiced Transfo Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden" id="xsell-card-invoiced-trans">
          <div className="space-y-1 z-10 font-sans">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA prév. Transfo à facturer</span>
            <div className="text-xl font-medium text-emerald-600 truncate">{formatCurrency(metrics.transfoInProgress)}</div>
            <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              <span>mission en cours</span>
            </div>
          </div>
          <div className="absolute right-4 top-4 bg-emerald-50 text-emerald-600 p-3 rounded-full">
            <Euro size={20} />
          </div>
        </div>

        {/* Client Savings Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden" id="xsell-card-savings">
          <div className="space-y-1 z-10 font-sans">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA Transfo facturé</span>
            <div className="text-xl font-medium text-green-500 truncate">{formatCurrency(metrics.transfoCompleted)}</div>
            <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
              <span>mission terminée</span>
            </div>
          </div>
          <div className="absolute right-4 top-4 bg-green-50 text-green-500 p-3 rounded-full">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Breakdowns Row (Bento lists) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="xsell-breakdown-row">
        {/* Distribution by Status */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
            <Layers size={14} className="text-navy" /> Répartition par Statut
          </h3>
          {Object.keys(metrics.statusCount).length === 0 ? (
            <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
          ) : (
            <div className="flex flex-col flex-1 h-[160px] justify-between">
              {/* Graphic area */}
              <div className="flex items-end justify-between h-[155px] pb-1 border-b border-gray-100 relative px-1">
                {/* Y-Axis Guideline grid */}
                <div className="absolute inset-x-0 bottom-1/4 border-b border-gray-50 border-dashed pointer-events-none"></div>
                <div className="absolute inset-x-0 bottom-2/4 border-b border-gray-50 border-dashed pointer-events-none"></div>
                <div className="absolute inset-x-0 bottom-3/4 border-b border-gray-50 border-dashed pointer-events-none"></div>

                {(() => {
                  const statusesToDisplay = Object.entries(metrics.statusCount)
                    .filter(([status]) => status !== 'KO' && status !== 'Non renseigné')
                    .sort((a, b) => a[0].localeCompare(b[0]));
                  
                  const maxDisplayCount = Math.max(...statusesToDisplay.map(([_, count]) => count as number), 1);

                  return statusesToDisplay.map(([status, count]) => {
                    const pct = Math.round(((count as number) / (metrics.totalCount || 1)) * 100) || 0;
                    const heightPct = ((count as number) / maxDisplayCount) * 100;
                    const barColorClass = getStatusProgressBarColor(status);
                    
                    // Clean up label for short print
                    const parts = status.split(' - ');
                    const name = parts[parts.length - 1] || status;
                    let shortName = name;
                    if (name.toLowerCase().includes('rdv à venir')) shortName = 'RDV à ven.';
                    if (name.toLowerCase().includes('rdv réalisé')) shortName = 'RDV réal.';
                    if (name.toLowerCase().includes('contrat signé')) shortName = 'Contrat';
                    if (name.toLowerCase().includes('cours')) shortName = 'En cours';
                    if (name.toLowerCase().includes('terminée')) shortName = 'Terminée';

                    return (
                      <div key={status} className="flex flex-col items-center flex-1 group relative">
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                          <div className="bg-navy text-white text-[9px] font-bold py-1 px-2 rounded shadow-lg whitespace-nowrap">
                            {status}: <span className="font-extrabold text-amber-300">{count}</span> ({pct}%)
                          </div>
                          <div className="w-1.5 h-1.5 bg-navy rotate-45 -mt-0.5"></div>
                        </div>

                        {/* Direct count label on top of the bar */}
                        <span className="text-[10px] font-extrabold text-navy/80 mb-1 transition-all group-hover:scale-110 group-hover:text-navy">
                          {count}
                        </span>

                        {/* Bar body */}
                        <div className="w-7 sm:w-9 bg-gray-50/50 rounded-t-md relative overflow-hidden flex items-end h-[105px] border border-gray-100/50 hover:border-gray-200 hover:shadow-xs transition-all duration-200">
                          <div 
                            className={`w-full rounded-t-sm transition-all duration-700 ease-out origin-bottom ${barColorClass}`}
                            style={{ height: `${heightPct}%` }}
                          ></div>
                        </div>

                        {/* Short axis text label */}
                        <span className="text-[8px] font-black tracking-tight text-gray-400 mt-1.5 text-center leading-none truncate max-w-full group-hover:text-navy transition-colors">
                          {shortName}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Top Responsables Lead */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
            <Users size={14} className="text-blue-500" /> Top Responsables Lead
          </h3>
          {metrics.topOwners.length === 0 ? (
            <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[160px] pr-1.5 small-scrollbar">
              {metrics.topOwners.map((item) => {
                const maxVal = metrics.topOwners[0]?.value || 1;
                const pct = Math.round((item.value / maxVal) * 100) || 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold text-navy tracking-tight">
                      <span className="truncate">{item.name}</span>
                      <span>{formatCurrency(item.value)}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Entités Bénéficiaires */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-500" /> Top Entités Bénéficiaires
          </h3>
          {metrics.topEntities.length === 0 ? (
            <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[160px] pr-1.5 small-scrollbar">
              {metrics.topEntities.map((item) => {
                const maxVal = metrics.topEntities[0]?.value || 1;
                const pct = Math.round((item.value / maxVal) * 100) || 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold text-navy tracking-tight">
                      <span className="truncate">{item.name}</span>
                      <span>{formatCurrency(item.value)}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Filter Toolbar Controls */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 shrink-0" id="xsell-toolbar">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Global Searchbox */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              placeholder="Recherche globale..." 
              className="pl-9 pr-4 py-1.5 text-xs border rounded-lg outline-none w-full bg-white focus:ring-2 focus:ring-navy/20 font-bold"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {isAnyFilterActive && (
            <button
              onClick={clearAllFilters}
              className="text-[10px] font-black uppercase text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-colors flex items-center gap-1 shrink-0 w-full md:w-auto justify-center"
              id="xsell-btn-clear-filters"
            >
              <FilterX size={12} /> Effacer les filtres
            </button>
          )}
        </div>

        {/* Quick Filter Selection Dropdowns */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {/* Year select */}
          <MultiSelect
            label="Année"
            options={filterOptions.years}
            selectedValues={yearFilter}
            onChange={setYearFilter}
            placeholder="Toutes"
            presetAllLabel="Toutes"
          />

          {/* Owner select */}
          <MultiSelect
            label="Responsable Lead"
            options={filterOptions.owners}
            selectedValues={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Tous"
            presetAllLabel="Tous"
          />

          {/* Account select */}
          <MultiSelect
            label="Compte Client"
            options={filterOptions.accounts}
            selectedValues={accountFilter}
            onChange={setAccountFilter}
            placeholder="Tous"
            presetAllLabel="Tous"
          />

          {/* Entity select */}
          <MultiSelect
            label="Entité Bénéf."
            options={filterOptions.entities}
            selectedValues={entityFilter}
            onChange={setEntityFilter}
            placeholder="Toutes"
            presetAllLabel="Toutes"
          />

          {/* Status select */}
          <MultiSelect
            label="Statut Mission"
            options={filterOptions.statuses}
            selectedValues={statusFilter}
            onChange={setStatusFilter}
            placeholder="Tous sauf KO"
            presetAllLabel="Tous"
            presetExceptKo={true}
          />

          {/* Billing select */}
          <MultiSelect
            label="Type Refac."
            options={filterOptions.billingModels}
            selectedValues={billingModelFilter}
            onChange={setBillingModelFilter}
            placeholder="Tous"
            presetAllLabel="Tous"
          />

          {/* Invoiced select */}
          <MultiSelect
            label="Facturé Transfo"
            options={filterOptions.invoicedCodes}
            selectedValues={invoicedFilter}
            onChange={setInvoicedFilter}
            placeholder="Tous"
            presetAllLabel="Tous"
          />
        </div>
      </div>

      {/* Main Tableau de Bord Viewport list table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col" id="xsell-table-wrapper">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <Loader2 className="w-8 h-8 text-navy animate-spin" />
            <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Chargement des données...</span>
          </div>
        ) : filteredAndSortedOpportunities.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400 space-y-2 uppercase tracking-wide">
            <p className="text-sm font-bold">Aucune opportunité recensée.</p>
            <p className="text-[10px] text-gray-300 font-bold tracking-tight">Utilisez l'import ou créez une opportunité pour l'ajouter.</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1 relative" id="xsell-table-scroll-container">
            <table className="w-full text-left border-separate border-spacing-0" id="xsell-main-table">
              <thead className="sticky top-0 z-20 bg-white">
                <tr className="text-[9px] uppercase text-gray-400 font-bold select-none border-b">
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('year')}>Année <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('account_owner')}>Responsable <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('account_name')}>Compte Client <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('beneficiary_entity')}>Entité Bénéf. <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('subject')}>Sujet Xsell <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('status')}>Statut <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer text-right min-w-[100px]" onClick={() => handleSort('estimated_revenue')}>CA Estimé <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('refac_percentage')}>% Refac. <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer text-right min-w-[110px]" onClick={() => handleSort('amount_to_invoice')}>Montant Transfo <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white">Facturé</th>
                  <th className="p-3 border-b bg-white hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleSort('transfo_invoice_date')}>Date Facture <ArrowUpDown size={10} className="inline ml-1 opacity-20" /></th>
                  <th className="p-3 border-b bg-white text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y text-navy">
                {filteredAndSortedOpportunities.map((opp) => (
                  <tr 
                    key={opp.id} 
                    className="hover:bg-gray-50/50 text-[11px] font-bold group transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedOpp(opp);
                      setEditForm(opp);
                      setIsEditing(false);
                    }}
                  >
                    <td className="p-3 whitespace-nowrap text-gray-500 font-mono text-[10px]">{getOpportunityRefYear(opp) || '-'}</td>
                    <td className="p-3 truncate max-w-[120px]">{opp.account_owner}</td>
                    <td className="p-3 truncate max-w-[130px] font-black text-navy">{opp.account_name}</td>
                    <td className="p-3 truncate max-w-[120px]">{opp.beneficiary_entity}</td>
                    <td className="p-3 truncate max-w-[140px] text-gray-500 font-medium">{opp.subject || '-'}</td>
                    <td className="p-3 whitespace-nowrap">
                      {opp.status ? (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-center border ${getStatusBadgeStyles(opp.status)}`}>
                          {opp.status}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-navy font-mono">
                      {formatCurrency(opp.estimated_revenue)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-emerald-600 font-mono text-[10px]">
                      {formatPercentage(opp.refac_percentage)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-indigo-700 font-mono">
                      {formatCurrency(opp.amount_to_invoice)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {opp.transfo_invoiced ? (
                        <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded border ${getTransfoInvoicedBadgeStyles(opp.transfo_invoiced)}`}>
                          {opp.transfo_invoiced}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3 whitespace-nowrap text-gray-400 font-mono text-[10px]">
                      {opp.transfo_invoice_date || '-'}
                    </td>
                    <td className="p-3 text-right">
                      <button className="p-1 text-gray-300 hover:text-navy hover:bg-gray-100 rounded transition-colors" aria-label="Afficher les détails">
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Creation modal form */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <h3 className="font-sans font-black text-xs text-navy uppercase tracking-widest flex items-center gap-2">
                <Plus size={16} className="text-navy" /> Nouvelle opportunité
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors" aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOpp} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Année du Lead</label>
                  <input 
                    type="number" 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.year === null || createForm.year === undefined ? '' : createForm.year}
                    onChange={e => setCreateForm({...createForm, year: e.target.value === '' ? null : parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Responsable Lead</label>
                  <select 
                    required
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                    value={createForm.account_owner || ''}
                    onChange={e => setCreateForm({...createForm, account_owner: e.target.value})}
                  >
                    <option value="">Sélectionner un collaborateur</option>
                    {collabOptions.map(collab => (
                      <option key={collab} value={collab}>{collab}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Compte Client</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Nom du client"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.account_name || ''}
                    onChange={e => setCreateForm({...createForm, account_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Entité Bénéficiaire</label>
                  <input 
                    type="text" 
                    placeholder="Entité bénéficiaire"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.beneficiary_entity || ''}
                    onChange={e => setCreateForm({...createForm, beneficiary_entity: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Contact Entité Bénéficiaire</label>
                  <input 
                    type="text" 
                    placeholder="Nom du contact"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.beneficiary_contact || ''}
                    onChange={e => setCreateForm({...createForm, beneficiary_contact: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Sujets Xsell</label>
                  <input 
                    type="text" 
                    placeholder="Sujet d'opportunité"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.subject || ''}
                    onChange={e => setCreateForm({...createForm, subject: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Statut Mission</label>
                  <select 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                    value={createForm.status || ''}
                    onChange={e => setCreateForm({...createForm, status: e.target.value})}
                  >
                    <option value="">Sélectionner un statut</option>
                    <option value="01 - RDV à venir">01 - RDV à venir</option>
                    <option value="02 - RDV réalisé">02 - RDV réalisé</option>
                    <option value="03 - Contrat signé">03 - Contrat signé</option>
                    <option value="04 - mission en cours">04 - mission en cours</option>
                    <option value="05 - mission terminée">05 - mission terminée</option>
                    <option value="KO">KO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Type de refacturation</label>
                  <select 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                    value={createForm.billing_model || ''}
                    onChange={e => setCreateForm({...createForm, billing_model: e.target.value})}
                  >
                    <option value="">Sélectionner un type</option>
                    <option value="Refacturable">Refacturable</option>
                    <option value="Marge intégrée">Marge intégrée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Économies client estimées (€)</label>
                  <input 
                    type="number" 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.estimated_client_savings === null ? '' : createForm.estimated_client_savings}
                    onChange={e => setCreateForm({...createForm, estimated_client_savings: e.target.value === '' ? null : parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">% de SF de l'entité bénéficiaire</label>
                  <input 
                    type="text" 
                    placeholder="ex: 11% ou 0.11"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.beneficiary_sf_percentage || ''}
                    onChange={e => setCreateForm({...createForm, beneficiary_sf_percentage: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">CA entité bénéficiaire estimé (€)</label>
                  <input 
                    type="number" 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.estimated_revenue === null ? '' : createForm.estimated_revenue}
                    onChange={e => setCreateForm({...createForm, estimated_revenue: e.target.value === '' ? null : parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">% de refac Transfo</label>
                  <input 
                    type="text" 
                    placeholder="ex: 11% ou 0.11"
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.refac_percentage || ''}
                    onChange={e => setCreateForm({...createForm, refac_percentage: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Montant à facturer Transfo (€)</label>
                  <input 
                    type="number" 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.amount_to_invoice === null ? '' : createForm.amount_to_invoice}
                    onChange={e => setCreateForm({...createForm, amount_to_invoice: e.target.value === '' ? null : parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Statut de facturation TRANSFO</label>
                  <select 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                    value={createForm.transfo_invoiced || ''}
                    onChange={e => setCreateForm({...createForm, transfo_invoiced: e.target.value})}
                  >
                    <option value="">Sélectionner un statut</option>
                    <option value="01 - Non prêt à facturer">01 - Non prêt à facturer</option>
                    <option value="02 - Prêt à facturer">02 - Prêt à facturer</option>
                    <option value="03 - Facturé">03 - Facturé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date de facturation Transfo</label>
                  <input 
                    type="date" 
                    className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                    value={createForm.transfo_invoice_date || ''}
                    onChange={e => setCreateForm({...createForm, transfo_invoice_date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Commentaires</label>
                <textarea 
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                  value={createForm.comments || ''}
                  onChange={e => setCreateForm({...createForm, comments: e.target.value})}
                  placeholder="Notes et commentaires additionnels..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  type="button" 
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors uppercase tracking-tight"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  disabled={savingAction}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-navy hover:bg-navy-light disabled:opacity-50 transition-colors rounded-xl flex items-center gap-2 uppercase tracking-tight"
                >
                  {savingAction ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />} Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slideout Detail & Edit Drawer Panel */}
      {selectedOpp && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          id="xsell-drawer-backdrop"
          onClick={() => {
            setSelectedOpp(null);
            setIsEditing(false);
          }}
        >
          <div 
            className="fixed inset-y-0 right-0 w-full sm:max-w-xl bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300"
            style={{ transform: selectedOpp ? 'translateX(0)' : 'translateX(100%)' }}
            onClick={(e) => e.stopPropagation()}
            id="xsell-detail-drawer"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-navy text-white px-2 py-0.5 rounded font-mono">{selectedOpp.year || '-'}</span>
                <h4 className="font-sans font-black text-xs text-navy uppercase tracking-widest">Détails de l'opportunité</h4>
              </div>
              <div className="flex items-center gap-1.5">
                {!isEditing && (
                  <button 
                    onClick={() => {
                      setEditForm(selectedOpp);
                      setIsEditing(true);
                    }}
                    className="p-1 px-2.5 bg-navy text-[10px] font-black text-white hover:bg-navy-light rounded-lg transition-colors flex items-center gap-1 uppercase"
                    id="xsell-drawer-btn-edit"
                  >
                    <Edit2 size={10} /> Modifier
                  </button>
                )}
                <button 
                  onClick={() => {
                    setSelectedOpp(null);
                    setIsEditing(false);
                  }} 
                  className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                  aria-label="Fermer"
                  id="xsell-drawer-close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {isEditing ? (
                // EDIT MODE FORM
                <div className="space-y-5" id="xsell-edit-form">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Année</label>
                      <input 
                        type="number"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.year === null || editForm.year === undefined ? '' : editForm.year}
                        onChange={e => setEditForm({...editForm, year: e.target.value === '' ? null : parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Responsable Lead</label>
                      <select 
                        required
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                        value={editForm.account_owner || ''}
                        onChange={e => setEditForm({...editForm, account_owner: e.target.value})}
                      >
                        <option value="">Sélectionner un collaborateur</option>
                        {collabOptions.map(collab => (
                          <option key={collab} value={collab}>{collab}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Compte Client</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.account_name || ''}
                        onChange={e => setEditForm({...editForm, account_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Entité Bénéficiaire</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.beneficiary_entity || ''}
                        onChange={e => setEditForm({...editForm, beneficiary_entity: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Contact Entité Bénéf.</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.beneficiary_contact || ''}
                        onChange={e => setEditForm({...editForm, beneficiary_contact: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Sujets Xsell</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.subject || ''}
                        onChange={e => setEditForm({...editForm, subject: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Statut Mission</label>
                      <select 
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                        value={editForm.status || ''}
                        onChange={e => setEditForm({...editForm, status: e.target.value})}
                      >
                        <option value="">Sélectionner un statut</option>
                        <option value="01 - RDV à venir">01 - RDV à venir</option>
                        <option value="02 - RDV réalisé">02 - RDV réalisé</option>
                        <option value="03 - Contrat signé">03 - Contrat signé</option>
                        <option value="04 - mission en cours">04 - mission en cours</option>
                        <option value="05 - mission terminée">05 - mission terminée</option>
                        <option value="KO">KO</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Type de refacturation</label>
                      <select 
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                        value={editForm.billing_model || ''}
                        onChange={e => setEditForm({...editForm, billing_model: e.target.value})}
                      >
                        <option value="">Sélectionner un type</option>
                        <option value="Refacturable">Refacturable</option>
                        <option value="Marge intégrée">Marge intégrée</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Economies client estimées (€)</label>
                      <input 
                        type="number"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.estimated_client_savings === null || editForm.estimated_client_savings === undefined ? '' : editForm.estimated_client_savings}
                        onChange={e => setEditForm({...editForm, estimated_client_savings: e.target.value === '' ? null : parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">% SF entité bénéficiaire</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.beneficiary_sf_percentage || ''}
                        onChange={e => setEditForm({...editForm, beneficiary_sf_percentage: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">CA bénéficiaire estimé (€)</label>
                      <input 
                        type="number"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.estimated_revenue === null || editForm.estimated_revenue === undefined ? '' : editForm.estimated_revenue}
                        onChange={e => setEditForm({...editForm, estimated_revenue: e.target.value === '' ? null : parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">% de refac Transfo</label>
                      <input 
                        type="text"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.refac_percentage || ''}
                        onChange={e => setEditForm({...editForm, refac_percentage: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Montant à facturer Transfo (€)</label>
                      <input 
                        type="number"
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                        value={editForm.amount_to_invoice === null || editForm.amount_to_invoice === undefined ? '' : editForm.amount_to_invoice}
                        onChange={e => setEditForm({...editForm, amount_to_invoice: e.target.value === '' ? null : parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Statut facturation Transfo</label>
                      <select 
                        className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20 bg-white"
                        value={editForm.transfo_invoiced || ''}
                        onChange={e => setEditForm({...editForm, transfo_invoiced: e.target.value})}
                      >
                        <option value="">Sélectionner un statut</option>
                        <option value="01 - Non prêt à facturer">01 - Non prêt à facturer</option>
                        <option value="02 - Prêt à facturer">02 - Prêt à facturer</option>
                        <option value="03 - Facturé">03 - Facturé</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Date facturation Transfo</label>
                    <input 
                      type="date"
                      className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                      value={editForm.transfo_invoice_date || ''}
                      onChange={e => setEditForm({...editForm, transfo_invoice_date: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Commentaires</label>
                    <textarea 
                      rows={3}
                      className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-navy/20"
                      value={editForm.comments || ''}
                      onChange={e => setEditForm({...editForm, comments: e.target.value})}
                    />
                  </div>

                  <div className="flex gap-2.5 pt-4 border-t">
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditForm(selectedOpp); // Reset edit fields
                        setIsEditing(false); // Disable edits
                      }}
                      className="px-4 py-2 border rounded-xl text-xs font-bold hover:bg-gray-50 uppercase tracking-tight"
                      id="xsell-edit-cancel"
                    >
                      Annuler
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSaveEdit}
                      disabled={savingAction}
                      className="px-5 py-2 bg-navy text-white hover:bg-navy-light text-xs font-extrabold rounded-xl flex items-center gap-1.5 uppercase ml-auto tracking-tight"
                      id="xsell-edit-submit"
                    >
                      {savingAction ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />} Valider
                    </button>
                  </div>
                </div>
              ) : (
                // DISPLAY MODE LIST DATA
                <div className="space-y-6" id="xsell-view-details">
                  {/* Subject and accounts metadata */}
                  <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 flex flex-col space-y-3 shadow-inner">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Compte Client</span>
                        <div className="text-base font-black text-navy">{selectedOpp.account_name}</div>
                      </div>
                      {selectedOpp.status && (
                        <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border ${getStatusBadgeStyles(selectedOpp.status)}`}>
                          {selectedOpp.status}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-dashed">
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Sujets Xsell</span>
                      <div className="text-xs font-black text-gray-700">{selectedOpp.subject}</div>
                    </div>
                  </div>

                  {/* General Informations block */}
                  <div className="space-y-3.5">
                    <h5 className="text-[10px] text-navy font-black uppercase tracking-widest border-b pb-1.5 flex items-center gap-1.5">
                      <Info size={12} className="text-indigo-500" /> Informations générales
                    </h5>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Année du Lead</span>
                        <p className="text-xs font-bold text-navy mt-1 pr-4">{selectedOpp.year || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Responsable Lead</span>
                        <p className="text-xs font-bold text-navy mt-1 truncate">{selectedOpp.account_owner}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Entité Bénéficiaire</span>
                        <p className="text-xs font-bold text-navy mt-1 truncate">{selectedOpp.beneficiary_entity || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-none">Contact</span>
                        <p className="text-xs font-medium text-gray-700 mt-1 truncate">{selectedOpp.beneficiary_contact || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Financial metrics block */}
                  <div className="space-y-3.5">
                    <h5 className="text-[10px] text-navy font-black uppercase tracking-widest border-b pb-1.5 flex items-center gap-1.5">
                      <Coins size={12} className="text-emerald-500" /> Financier & Rentabilité
                    </h5>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">Économies Client</span>
                        <p className="text-xs font-bold text-gray-600 mt-1 font-mono">{formatCurrency(selectedOpp.estimated_client_savings)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">% SF Entité Bénéficiaire</span>
                        <p className="text-xs font-bold text-gray-600 mt-1 font-mono">{formatPercentage(selectedOpp.beneficiary_sf_percentage)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">CA Bénéficiaire Estimé</span>
                        <p className="text-sm font-black text-navy mt-1 font-mono">{formatCurrency(selectedOpp.estimated_revenue)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">Type de refacturation</span>
                        <p className="text-sm font-black text-gray-600 mt-1">{selectedOpp.billing_model || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Facturation TRANSFO block */}
                  <div className="space-y-3.5">
                    <h5 className="text-[10px] text-navy font-black uppercase tracking-widest border-b pb-1.5 flex items-center gap-1.5">
                      <Euro size={12} className="text-indigo-500" /> Facturation Transfo
                    </h5>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">% de refac Transfo</span>
                        <p className="text-xs font-bold text-emerald-600 mt-1 font-mono">{formatPercentage(selectedOpp.refac_percentage)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">Montant à facturer Transfo</span>
                        <p className="text-sm font-black text-indigo-700 mt-1 font-mono">{formatCurrency(selectedOpp.amount_to_invoice)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">Facturé Transfo</span>
                        <p className="text-xs font-bold mt-1">
                          {selectedOpp.transfo_invoiced ? (
                            <span className={`px-2 py-0.5 rounded font-black text-[9px] border ${getTransfoInvoicedBadgeStyles(selectedOpp.transfo_invoiced)}`}>
                              {selectedOpp.transfo_invoiced}
                            </span>
                          ) : '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none">Date de facturation</span>
                        <p className="text-xs font-bold text-gray-500 mt-1 font-mono">{selectedOpp.transfo_invoice_date || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Comments notes */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block leading-none font-sans">Commentaires & Notes</span>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-medium leading-relaxed font-sans text-gray-600 whitespace-pre-line shadow-inner max-h-[120px] overflow-y-auto">
                      {selectedOpp.comments || "Aucun commentaire spécifié."}
                    </div>
                  </div>

                  {/* Metadata tracking log */}
                  <div className="pt-3 border-t text-[8px] font-black uppercase tracking-wider text-gray-400 space-y-1 text-right flex flex-col items-end">
                    {selectedOpp.source_import_filename && <p>Fichier: {selectedOpp.source_import_filename}</p>}
                    {selectedOpp.imported_at && <p>Importé le: {new Date(selectedOpp.imported_at).toLocaleString('fr-FR')}</p>}
                    {selectedOpp.created_at && <p>Créé le: {new Date(selectedOpp.created_at).toLocaleString('fr-FR')}</p>}
                    {selectedOpp.updated_at && <p>Modifié le: {new Date(selectedOpp.updated_at).toLocaleString('fr-FR')}</p>}
                  </div>

                  {/* Actions (Delete button) */}
                  <div className="pt-6 border-t flex justify-between">
                    <button 
                      type="button" 
                      onClick={() => triggerDeleteConfirm(selectedOpp.id)}
                      className="px-3 py-1.5 border border-red-100 hover:bg-red-50 rounded-lg text-red-500 text-[10px] font-bold uppercase transition-colors tracking-tight flex items-center gap-1.5"
                      id="xsell-drawer-btn-delete"
                    >
                      <Trash2 size={12} /> Supprimer l'opportunité
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedOpp(null)}
                      className="px-4 py-1.5 border rounded-lg text-[10px] font-bold uppercase hover:bg-gray-50 transition-colors tracking-tight text-gray-400"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-red-100 shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h4 className="text-sm font-black text-red-600 uppercase tracking-wider flex items-center gap-2 mb-3">
              <AlertCircle size={18} /> Confirmation requise ?
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed mb-6 font-medium">
              Voulez-vous vraiment supprimer cette opportunité Xsell ? Cette action est irréversible et modifiera uniquement la table Xsell de la base de données.
            </p>
            <div className="flex gap-2 justify-end">
              <button 
                type="button" 
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setOppToDelete(null);
                }}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 uppercase tracking-tight"
                id="xsell-delete-cancel"
              >
                Annuler
              </button>
              <button 
                type="button" 
                onClick={handleDeleteOpp}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 text-xs font-extrabold rounded-xl uppercase tracking-tight"
                id="xsell-delete-confirm"
              >
                Oui, Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <h3 className="font-sans font-black text-xs text-navy uppercase tracking-widest flex items-center gap-2">
                <Upload size={16} className="text-emerald-500" /> Importer un fichier Excel
              </h3>
              <button 
                onClick={() => {
                  setIsImportOpen(false);
                  setImportPreview([]);
                  setImportFilename('');
                }} 
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar" id="xsell-import-body">
              {/* Drag drop zone */}
              {importPreview.length === 0 ? (
                <div 
                  className="border-2 border-dashed border-gray-200 hover:border-emerald-500/50 bg-gray-50/50 hover:bg-emerald-50/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-3 select-none"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  id="xsell-drop-area"
                >
                  <div className="p-3 bg-white rounded-full border shadow-sm text-gray-400 transition-colors">
                    <Upload size={24} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-navy">Sélectionnez ou glissez-déposez le fichier Excel</p>
                    <p className="text-[10px] text-gray-400">Formats supportés : .xlsx ou .xls. Doit idéalement contenir un onglet nommé "Suivi xsell".</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx,.xls" 
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="space-y-5" id="xsell-import-preview-section">
                  {/* File Metadata Info */}
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                    <Check className="text-emerald-500 bg-white border border-emerald-300 rounded-full p-0.5 shrink-0" size={18} />
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-navy">Fichier chargé : <span className="font-mono text-emerald-800">{importFilename}</span></p>
                      <p className="text-[10px] text-gray-400">
                        Nombre de lignes détectées : <span className="font-extrabold text-navy">{importPreview.length} opportunités</span>. 
                        {importPreview.length === 124 ? (
                          <span className="text-emerald-600 font-extrabold"> (Format attendu de 124 lignes validé !)</span>
                        ) : (
                          <span className="text-gray-500"> (Contient {importPreview.length} lignes)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Mode choice (Append vs Replace) */}
                  <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Option de synchronisation</span>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`block border p-3 rounded-xl cursor-pointer transition-all ${importMode === 'add' ? 'bg-white border-navy ring-2 ring-navy/10' : 'bg-transparent border-gray-200 hover:bg-white'}`}>
                        <input 
                          type="radio" 
                          name="importMode" 
                          className="sr-only"
                          checked={importMode === 'add'} 
                          onChange={() => setImportMode('add')} 
                        />
                        <span className="text-xs font-extrabold text-navy block leading-none mb-1">Ajouter (Append)</span>
                        <span className="text-[9px] text-gray-400">Ajoute les {importPreview.length} lignes aux opportunités de sauts existantes.</span>
                      </label>

                      <label className={`block border p-3 rounded-xl cursor-pointer transition-all ${importMode === 'replace' ? 'bg-white border-red-500 ring-2 ring-red-500/10' : 'bg-transparent border-gray-200 hover:bg-white'}`}>
                        <input 
                          type="radio" 
                          name="importMode" 
                          className="sr-only"
                          checked={importMode === 'replace'} 
                          onChange={() => setImportMode('replace')} 
                        />
                        <span className="text-xs font-extrabold text-red-600 block leading-none mb-1">Remplacer (Overwrite)</span>
                        <span className="text-[9px] text-gray-400">Vide la table Xsell, puis insère les {importPreview.length} nouvelles lignes.</span>
                      </label>
                    </div>
                  </div>

                  {/* Column layout preview summary */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Aperçu des 5 premières lignes</span>
                    <div className="border border-gray-150 rounded-xl overflow-x-auto">
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
                          {importPreview.slice(0, 5).map((opp, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="p-2 whitespace-nowrap font-mono">{opp.year}</td>
                              <td className="p-2 truncate max-w-[100px]">{opp.account_owner}</td>
                              <td className="p-2 truncate max-w-[100px]">{opp.account_name}</td>
                              <td className="p-2 truncate max-w-[100px]">{opp.beneficiary_entity}</td>
                              <td className="p-2 truncate max-w-[100px]">{opp.subject}</td>
                              <td className="p-2 text-right whitespace-nowrap font-mono">{formatCurrency(opp.estimated_revenue || 0)}</td>
                              <td className="p-2 text-right whitespace-nowrap font-mono">{formatCurrency(opp.amount_to_invoice || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {importError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs flex items-center gap-2.5 font-bold">
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  <span>{importError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => {
                  setIsImportOpen(false);
                  setImportPreview([]);
                  setImportFilename('');
                }}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 uppercase tracking-tight"
                id="xsell-import-cancel"
              >
                Annuler
              </button>
              {importPreview.length > 0 && (
                <button 
                  type="button" 
                  disabled={isImporting}
                  onClick={executeImport}
                  className="px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-extrabold rounded-xl flex items-center gap-1.5 uppercase tracking-tight disabled:opacity-50"
                  id="xsell-import-submit"
                >
                  {isImporting ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />} Confirmer l'importation
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default XsellOpportunities;
