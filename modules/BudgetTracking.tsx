import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, Country, Mission, MonthlyBillingOverride, ManualExpense, BudgetFamily, ExpenseStatus } from '../types';
import { 
  parseISO, 
  eachMonthOfInterval, 
  isWithinInterval, 
  startOfMonth, 
  endOfMonth,
  isValid,
  startOfToday,
  differenceInDays,
  isAfter,
  isBefore
} from 'date-fns';
import { 
  ReceiptEuro, 
  Wallet, 
  BarChart3, 
  Users, 
  Plus, 
  Trash2, 
  Box, 
  Handshake, 
  Layers, 
  Zap, 
  Calculator, 
  PencilLine, 
  CheckCircle, 
  FileText, 
  Goal, 
  Percent, 
  MessageSquare, 
  Save, 
  X,
  AlertTriangle,
  Target,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  FileSearch,
  CheckCircle2,
  Clock,
  Link,
  Hash,
  Trash,
  Search
} from 'lucide-react';
import { getFiscalYear, generateId, getBusinessDays, calculateMonthlySmoothedRevenue, calculateTotalMissionRevenue, calculateSmoothedMissionRevenue } from '../utils';
import { syncMissionToCloud, syncBudgetDataToCloud } from '../services/dataService';

interface BudgetTrackingProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

const MONTHS = [
  { id: 1, label: 'Fév' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Avr' },
  { id: 4, label: 'Mai' },
  { id: 5, label: 'Juin' },
  { id: 6, label: 'Juil' },
  { id: 7, label: 'Août' },
  { id: 8, label: 'Sep' },
  { id: 9, label: 'Oct' },
  { id: 10, label: 'Nov' },
  { id: 11, label: 'Déc' },
  { id: 0, label: 'Jan' },
];

const CATEGORIES_CONFIG = [
  { id: 'personnel', label: 'PERSONNEL EXPENSES', icon: Users },
  { id: 'contractors', label: 'CONTRACTORS', icon: Handshake },
  { id: 'opex', label: 'OTHER OPEX', icon: Box },
  { id: 'extra', label: 'CHARGES EXCEPTIONNELLES (sous EBIT)', icon: AlertTriangle }
];

const BudgetTracking: React.FC<BudgetTrackingProps> = ({ state, updateState }) => {
  const [activeTab, setActiveTab] = useState<'billing' | 'expenses' | 'pl' | 'budget'>('billing');
  const [isBudgetEditMode, setIsBudgetEditMode] = useState(false);
  
  // Zone de recherche globale par onglet
  const [searchQueries, setSearchQueries] = useState({
    billing: '',
    expenses: '',
    pl: '',
    budget: ''
  });

  const currentSearchQuery = searchQueries[activeTab];
  const handleSearchChange = (query: string) => {
    setSearchQueries(prev => ({ ...prev, [activeTab]: query }));
  };
  const handleClearSearch = () => {
    setSearchQueries(prev => ({ ...prev, [activeTab]: '' }));
  };
  
  const [activeCommentCell, setActiveCommentCell] = useState<{
    type: 'billing' | 'expense';
    id: string;
    monthId: number;
    currentComment: string;
  } | null>(null);

  const [activePoMissionId, setActivePoMissionId] = useState<string | null>(null);
  const [tempPo, setTempPo] = useState<string>('');

  const [pointedExpenses, setPointedExpenses] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('optimus_pointed_expenses');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleTogglePointed = (expenseId: string) => {
    setPointedExpenses(prev => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
      } else {
        next.add(expenseId);
      }
      try {
        localStorage.setItem('optimus_pointed_expenses', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleToggleAllPointedExpenses = (allExpenseIds: string[], allSelected: boolean) => {
    setPointedExpenses(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allExpenseIds.forEach(id => next.delete(id));
      } else {
        allExpenseIds.forEach(id => next.add(id));
      }
      try {
        localStorage.setItem('optimus_pointed_expenses', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const [pointedBillings, setPointedBillings] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('optimus_pointed_billings');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleTogglePointedBilling = (missionId: string) => {
    setPointedBillings(prev => {
      const next = new Set(prev);
      if (next.has(missionId)) {
        next.delete(missionId);
      } else {
        next.add(missionId);
      }
      try {
        localStorage.setItem('optimus_pointed_billings', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleToggleAllPointedBilling = (allMissionIds: string[], allSelected: boolean) => {
    setPointedBillings(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allMissionIds.forEach(id => next.delete(id));
      } else {
        allMissionIds.forEach(id => next.add(id));
      }
      try {
        localStorage.setItem('optimus_pointed_billings', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const { missions, globalCountry, globalFY, manualExpenses, budgetFamilies, budgetValues, users } = state;

  // Affichage du détail des lignes de dépenses dans l'onglet Budget et P&L (masqué par défaut pour rester au cran au-dessus)
  const [showExpenseLinesInBudget, setShowExpenseLinesInBudget] = useState<boolean>(false);
  const [showDetailsInPL, setShowDetailsInPL] = useState<boolean>(false);

  // Référence persistante au state pour la synchronisation débouncée
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Synchronisation centralisée débouncée (2s) des données Budget vers Supabase
  const isInitialMount = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await syncBudgetDataToCloud(stateRef.current);
      } catch (e) {
        console.error('Error syncing budget data to cloud (debounced):', e);
      }
    }, 2000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [state.manualExpenses, state.budgetFamilies, state.budgetValues]);

  // Détection non-bloquante multi-onglets / multi-fenêtres
  const [hasMultipleTabs, setHasMultipleTabs] = useState(false);

  useEffect(() => {
    let tabId = sessionStorage.getItem('optimus_budget_tab_id');
    if (!tabId) {
      tabId = 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      sessionStorage.setItem('optimus_budget_tab_id', tabId);
    }

    const checkOtherTabs = () => {
      try {
        const stored = localStorage.getItem('optimus_budget_heartbeat');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.tabId !== tabId && Date.now() - parsed.timestamp < 10000) {
            setHasMultipleTabs(true);
            return;
          }
        }
        setHasMultipleTabs(false);
      } catch {
        setHasMultipleTabs(false);
      }
    };

    const emitHeartbeat = () => {
      try {
        localStorage.setItem(
          'optimus_budget_heartbeat',
          JSON.stringify({ tabId, timestamp: Date.now() })
        );
      } catch (e) {
        console.warn('Unable to emit budget heartbeat', e);
      }
    };

    emitHeartbeat();
    checkOtherTabs();

    const heartbeatInterval = setInterval(emitHeartbeat, 4000);
    const checkInterval = setInterval(checkOtherTabs, 5000);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'optimus_budget_heartbeat') {
        checkOtherTabs();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(checkInterval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);
  const currentYearInt = parseInt(globalFY?.replace('FY', '') || '2025');
  const fyStart = new Date(currentYearInt, 1, 1);
  const fyEnd = new Date(currentYearInt + 1, 0, 31);
  const today = startOfToday();
  const isGlobalView = globalCountry === 'Global';

  const relevantCountries = isGlobalView ? Object.values(Country) : [globalCountry as Country];

  /**
   * Calcule les montants théoriques automatiques basés sur les missions
   * EXCLUT désormais les INTERNES (Salaires gérés manuellement)
   */
  const calculateAutoStaffingDefaults = (): Record<string, Record<number, number>> => {
    const defaults: Record<string, Record<number, number>> = {};
    const fyYear = parseInt(globalFY.replace('FY', ''));

    missions.forEach(mission => {
      // 1. FREELANCES (Contractors)
      mission.freelanceStaffing?.forEach(f => {
        const id = `auto-f-${f.id}-${mission.id}`;
        defaults[id] = {};
        const start = parseISO(f.startDate);
        const end = parseISO(f.endDate);
        if (!isValid(start) || !isValid(end)) return;

        MONTHS.forEach(m => {
          const monthStart = startOfMonth(new Date(m.id === 0 ? fyYear + 1 : fyYear, m.id, 1));
          const monthEnd = endOfMonth(monthStart);
          const overlapStart = start > monthStart ? start : monthStart;
          const overlapEnd = end < monthEnd ? end : monthEnd;
          if (overlapStart <= overlapEnd) {
            const bDays = getBusinessDays(overlapStart, overlapEnd, state.holidays, mission.country);
            if (bDays.length > 0) defaults[id][m.id] = bDays.length * f.cjm * (f.percentage / 100);
          }
        });
      });

      // 2. SOUS-TRAITANTS (Contractors)
      mission.subcontractorStaffing?.forEach(s => {
        const id = `auto-s-${s.id}-${mission.id}`;
        defaults[id] = {};
        const start = parseISO(s.startDate);
        const end = parseISO(s.endDate);
        if (!isValid(start) || !isValid(end)) return;
        const totalDays = Math.max(1, differenceInDays(end, start) + 1);
        const dailyRate = s.amount / totalDays;

        MONTHS.forEach(m => {
          const monthStart = startOfMonth(new Date(m.id === 0 ? fyYear + 1 : fyYear, m.id, 1));
          const monthEnd = endOfMonth(monthStart);
          const overlapStart = start > monthStart ? start : monthStart;
          const overlapEnd = end < monthEnd ? end : monthEnd;
          if (overlapStart <= overlapEnd) {
            const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
            defaults[id][m.id] = overlapDays * dailyRate;
          }
        });
      });
    });
    return defaults;
  };

  const autoDefaults = useMemo(() => calculateAutoStaffingDefaults(), [missions, globalFY, state.holidays]);

  const currentFamilies = useMemo(() => {
    const templateCountry = isGlobalView ? Country.FRANCE : (globalCountry as Country);
    const fams = budgetFamilies[globalFY]?.[templateCountry] || [];
    if (!fams.some(f => f.categoryId === 'contractors')) {
      return [
        ...fams,
        { id: 'fam-c3', label: 'Transfo => Ext (entité externe)', categoryId: 'contractors' }
      ];
    }
    return fams;
  }, [budgetFamilies, globalFY, globalCountry, isGlobalView]);

  const defaultContractorFamily = useMemo(() => {
    const contractorFamilies = (currentFamilies || []).filter(f => f.categoryId === 'contractors');
    // Priorité 1 : Famille "Transfo => Ext (entité externe)" ou approchant
    const matchTransfoExt = contractorFamilies.find(f => {
      const l = f.label.toLowerCase();
      return l.includes('transfo => ext') || l.includes('transfo=>ext') || (l.includes('transfo') && l.includes('ext'));
    });
    if (matchTransfoExt) return matchTransfoExt;

    // Priorité 2 : Première famille de la catégorie contractors
    if (contractorFamilies.length > 0) return contractorFamilies[0];

    // Fallback par défaut
    return { id: 'fam-c3', label: 'Transfo => Ext (entité externe)', categoryId: 'contractors' };
  }, [currentFamilies]);

  /**
   * Source unique de vérité pour toutes les dépenses.
   * N'inclut plus les coûts internes automatiques (gérés manuellement dans PERSONNEL EXPENSES)
   */
  const currentManualExpenses = useMemo(() => {
    const combined: ManualExpense[] = [];
    const countryKey = globalCountry as string;

    const storedExpenses = !isGlobalView 
      ? (manualExpenses[globalFY]?.[countryKey] || [])
      : relevantCountries.flatMap(c => manualExpenses[globalFY]?.[c] || []);

    missions.forEach(mission => {
      if (globalCountry !== 'Global' && mission.country !== globalCountry) return;

      const processResource = (resId: string, resourceDescriptor: string, resType: 'f' | 's') => {
        const autoId = `auto-${resType}-${resId}-${mission.id}`;
        const stored = storedExpenses.find(e => e.id === autoId);
        
        const categoryId = 'contractors';
        // Utiliser la famille "Transfo => Ext (entité externe)"
        const familyId = defaultContractorFamily.id;

        const expense: ManualExpense = {
          id: autoId,
          label: `${mission.clientName} / ${mission.name} / ${resourceDescriptor}`,
          categoryId,
          familyId,
          monthlyAmounts: {},
          monthlyComments: stored?.monthlyComments || {},
          monthlyStatuses: stored?.monthlyStatuses || {}
        };

        MONTHS.forEach(m => {
          const manualVal = stored?.monthlyAmounts?.[m.id];
          if (manualVal !== undefined) {
            expense.monthlyAmounts[m.id] = manualVal;
          } else {
            const autoVal = autoDefaults[autoId]?.[m.id];
            if (autoVal !== undefined) expense.monthlyAmounts[m.id] = autoVal;
          }
        });

        if (Object.keys(expense.monthlyAmounts).length > 0 || stored) {
          combined.push(expense);
        }
      };

      mission.freelanceStaffing?.forEach(f => {
        const entity = f.entity?.trim();
        const fullName = `${f.firstName || ''} ${f.lastName || ''}`.trim();
        const descriptor = entity || fullName || 'Freelance';
        processResource(f.id, descriptor, 'f');
      });

      mission.subcontractorStaffing?.forEach(s => {
        const descriptor = s.entity?.trim() || 'Sous-traitant';
        processResource(s.id, descriptor, 's');
      });
    });

    // Classer systématiquement en ordre alphabétique hiérarchique : Client / Nom de mission / Entité Juridique ou Nom et Prénom
    combined.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));

    storedExpenses.filter(e => !e.id.startsWith('auto-')).forEach(e => combined.push(e));

    return combined;
  }, [manualExpenses, globalFY, globalCountry, isGlobalView, missions, autoDefaults, users, defaultContractorFamily]);

  const currentBudgetValues = useMemo(() => {
    const aggregated: Record<string, number> = {};
    relevantCountries.forEach(c => {
      const bucket = budgetValues[globalFY]?.[c] || {};
      Object.entries(bucket).forEach(([key, val]) => {
        aggregated[key] = (aggregated[key] || 0) + (val as number);
      });
    });
    return aggregated;
  }, [budgetValues, globalFY, relevantCountries]);

    const getMissionBillingData = (mission: Mission) => {
    const overrides = mission.billingOverrides?.[globalFY] || {};
    const mStart = parseISO(mission.startDate);
    const mEnd = parseISO(mission.endDate);
    const monthlyData: MonthlyBillingOverride[] = MONTHS.map(() => ({ amount: 0, isValidated: false }));

    const amountPerMonth = calculateMonthlySmoothedRevenue(mission);

    if (amountPerMonth > 0 && isValid(mStart) && isValid(mEnd)) {
        MONTHS.forEach((m, idx) => {
          // On considère qu'un mois fait partie de la facturation si le 15 du mois est dans l'intervalle de la mission
          // (C'est une approximation robuste pour compter les mois touchés)
          const targetMonthDate = new Date(m.id === 0 ? currentYearInt + 1 : currentYearInt, m.id, 15);
          if (isWithinInterval(targetMonthDate, { start: startOfMonth(mStart), end: endOfMonth(mEnd) })) {
            monthlyData[idx].amount = amountPerMonth;
          }
        });
    }
    MONTHS.forEach((m, idx) => { if (overrides[m.id]) monthlyData[idx] = { ...overrides[m.id] }; });
    
    const totalFY = monthlyData.reduce((acc, m) => acc + m.amount, 0);
    const totalMissionOverall = calculateTotalMissionRevenue(mission);

    return { monthlyData, totalFY, totalMissionOverall };
  };

  const sortedMissions = useMemo(() => {
    let filtered = missions.filter(m => {
      const matchBasic = m.active && (isGlobalView || m.country === globalCountry);
      if (!matchBasic) return false;
      
      const mStart = parseISO(m.startDate);
      const mEnd = parseISO(m.endDate);
      return !isAfter(mStart, fyEnd) && !isBefore(mEnd, fyStart);
    });
    return filtered.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [missions, globalCountry, isGlobalView, currentYearInt]);

  const billingRows = useMemo(() => sortedMissions.map(m => ({ mission: m, ...getMissionBillingData(m) })), [sortedMissions, globalFY]);
  
  // Lignes de facturation filtrées selon la recherche
  const filteredBillingRows = useMemo(() => {
    const query = searchQueries.billing.trim().toLowerCase();
    if (!query) return billingRows;
    return billingRows.filter(row => {
      const client = (row.mission.clientName || '').toLowerCase();
      const name = (row.mission.name || '').toLowerCase();
      const po = (row.mission.customerPo || '').toLowerCase();
      return client.includes(query) || name.includes(query) || po.includes(query);
    });
  }, [billingRows, searchQueries.billing]);
  
  const monthlyBillingTotals = useMemo(() => {
    const totals = Array(12).fill(0);
    billingRows.forEach(row => row.monthlyData.forEach((data, i) => totals[i] += (data.amount || 0)));
    return totals;
  }, [billingRows]);

  // Identifiants des dépenses actuellement visibles dans le tableau selon la recherche
  const visibleExpenseIds = useMemo(() => {
    const query = searchQueries.expenses.trim().toLowerCase();
    const ids: string[] = [];
    CATEGORIES_CONFIG.forEach(cat => {
      const catMatchesQuery = !query || cat.label.toLowerCase().includes(query);
      const familiesForCat = (currentFamilies || []).filter(f => f.categoryId === cat.id);

      familiesForCat.forEach(fam => {
        const famMatchesQuery = !query || catMatchesQuery || fam.label.toLowerCase().includes(query);
        const expensesForFam = currentManualExpenses.filter(e => e.familyId === fam.id);
        const filteredExpenses = expensesForFam.filter(exp => {
          if (!query || famMatchesQuery) return true;
          return exp.label.toLowerCase().includes(query);
        });
        filteredExpenses.forEach(exp => ids.push(exp.id));
      });
    });
    return ids;
  }, [searchQueries.expenses, currentFamilies, currentManualExpenses]);

  const handleUpdateAmount = async (missionId: string, monthId: number, value: string) => {
    if (isGlobalView) return;
    const cleanValue = value.replace(/[^\d-]/g, '');
    if (cleanValue === '-' || cleanValue === '') return;
    const amount = parseFloat(cleanValue) || 0;
    
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;

    const newOverrides = { ...(mission.billingOverrides || {}) };
    if (!newOverrides[globalFY]) newOverrides[globalFY] = {};

    // Freeze logic: to ensure "somme des montants mensuels" is the new truth
    // we need to lock all months of this mission in this FY to their current estimated values
    // if they don't have an override yet.
    const mStart = parseISO(mission.startDate);
    const mEnd = parseISO(mission.endDate);
    const amountPerMonth = calculateMonthlySmoothedRevenue(mission);
    const fyYearInt = parseInt(globalFY.replace('FY', ''));

    MONTHS.forEach((m) => {
      const targetMonthDate = new Date(m.id === 0 ? fyYearInt + 1 : fyYearInt, m.id, 15);
      if (isWithinInterval(targetMonthDate, { start: startOfMonth(mStart), end: endOfMonth(mEnd) })) {
        if (newOverrides[globalFY][m.id] === undefined) {
          newOverrides[globalFY][m.id] = { amount: amountPerMonth, isValidated: false };
        }
      }
    });

    // Apply actual change
    const existing = newOverrides[globalFY][monthId] || { amount: 0, isValidated: false };
    newOverrides[globalFY][monthId] = { ...existing, amount };

    // Recalculate total for this FY based on overrides ONLY (since we just froze others)
    const monthsIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
    const newFyTotal = monthsIds.reduce((acc, mid) => acc + (newOverrides[globalFY][mid]?.amount || 0), 0);

    let updatedMission = { ...mission, billingOverrides: newOverrides };
    
    const actualFYStr = getFiscalYear(new Date());
    const actualYear = parseInt(actualFYStr.replace('FY', ''));
    const nextFYStr = `FY${actualYear + 1}`;

    if (globalFY === actualFYStr) {
       updatedMission.forfaitAmountCurrentFY = newFyTotal;
       updatedMission.successFeesCurrentFY = 0;
    } else if (globalFY === nextFYStr) {
       updatedMission.forfaitAmountNextFY = newFyTotal;
       updatedMission.successFeesNextFY = 0;
    }

    updateState({ 
        missions: missions.map(m => m.id === missionId ? updatedMission : m) 
    });

    try {
      await syncMissionToCloud(updatedMission);
    } catch (e) {
      console.error(`Error syncing mission amount update for ${mission.name}:`, e);
    }
  };

  const toggleValidation = async (missionId: string, monthId: number) => {
    if (isGlobalView) return;
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;
    const { monthlyData } = getMissionBillingData(mission);
    const monthIndex = MONTHS.findIndex(m => m.id === monthId);
    if (monthIndex === -1) return;
    
    const currentVal = monthlyData[monthIndex];
    const newOverrides = { ...(mission.billingOverrides || {}) };
    if (!newOverrides[globalFY]) newOverrides[globalFY] = {};
    newOverrides[globalFY][monthId] = { ...currentVal, isValidated: !currentVal.isValidated };
    
    const updatedMission = { ...mission, billingOverrides: newOverrides };
    updateState({ missions: missions.map(m => m.id === missionId ? updatedMission : m) });

    try {
      await syncMissionToCloud(updatedMission);
    } catch (e) {
      console.error(`Error syncing mission validation toggle for ${mission.name}:`, e);
    }
  };

  const handleUpdateComment = async () => {
    if (!activeCommentCell || isGlobalView) return;
    const { type, id, monthId, currentComment } = activeCommentCell;

    if (type === 'billing') {
      const mission = missions.find(m => m.id === id);
      if (mission) {
        const { monthlyData } = getMissionBillingData(mission);
        const monthIndex = MONTHS.findIndex(m => m.id === monthId);
        const currentVal = monthlyData[monthIndex];
        const newOverrides = { ...(mission.billingOverrides || {}) };
        if (!newOverrides[globalFY]) newOverrides[globalFY] = {};
        newOverrides[globalFY][monthId] = { ...currentVal, comment: currentComment };
        
        const updatedMission = { ...mission, billingOverrides: newOverrides };
        updateState({ missions: missions.map(m => m.id === id ? updatedMission : m) });

        try {
          await syncMissionToCloud(updatedMission);
        } catch (e) {
          console.error(`Error syncing mission comment update for ${mission.name}:`, e);
        }
      }
    } else {
      const countryKey = globalCountry as string;
      const bucket = manualExpenses[globalFY]?.[countryKey] || [];
      const existingIdx = bucket.findIndex(e => e.id === id);
      
      let nextBucket = [...bucket];
      if (existingIdx !== -1) {
        nextBucket[existingIdx] = { 
          ...nextBucket[existingIdx], 
          monthlyComments: { ...(nextBucket[existingIdx].monthlyComments || {}), [monthId]: currentComment } 
        };
      } else {
        const expenseToFind = currentManualExpenses.find(e => e.id === id);
        if (expenseToFind) {
          nextBucket.push({ 
            ...expenseToFind, 
            monthlyAmounts: {}, 
            monthlyComments: { [monthId]: currentComment } 
          });
        }
      }
      
      const newManualExpenses = { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } };
      updateState({ manualExpenses: newManualExpenses });
    }
    setActiveCommentCell(null);
  };

  const handleUpdatePo = async () => {
    if (!activePoMissionId) return;
    const mission = missions.find(m => m.id === activePoMissionId);
    if (!mission) return;

    const updatedMission = { ...mission, customerPo: tempPo.trim() || undefined };
    const updatedMissions = missions.map(m => 
      m.id === activePoMissionId ? updatedMission : m
    );
    updateState({ missions: updatedMissions });
    
    try {
      await syncMissionToCloud(updatedMission);
    } catch (e) {
      console.error(`Error syncing mission PO update for ${mission.name}:`, e);
    }
    
    setActivePoMissionId(null);
  };

  const handleUpdateExpenseAmount = (id: string, monthId: number, value: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const cleanValue = value.replace(/[^\d-]/g, '');
    if (cleanValue === '-' || cleanValue === '') return;
    const amount = parseFloat(cleanValue) || 0;
    
    const bucket = manualExpenses[globalFY]?.[countryKey] || [];
    const existingIdx = bucket.findIndex(e => e.id === id);
    
    let nextBucket = [...bucket];
    if (existingIdx !== -1) {
      nextBucket[existingIdx] = { 
        ...nextBucket[existingIdx], 
        monthlyAmounts: { ...(nextBucket[existingIdx].monthlyAmounts || {}), [monthId]: amount } 
      };
    } else {
      const expenseToFind = currentManualExpenses.find(e => e.id === id);
      if (expenseToFind) {
        nextBucket.push({ 
          ...expenseToFind, 
          monthlyAmounts: { [monthId]: amount } 
        });
      }
    }

    const newManualExpenses = { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } };
    updateState({ manualExpenses: newManualExpenses });
  };

  const handleToggleExpenseStatus = (id: string, monthId: number) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const bucket = manualExpenses[globalFY]?.[countryKey] || [];
    const existingIdx = bucket.findIndex(e => e.id === id);
    
    let nextBucket = [...bucket];
    const currentStatus = (existingIdx !== -1 ? bucket[existingIdx].monthlyStatuses?.[monthId] : undefined) || 'NONE';
    let nextStatus: ExpenseStatus = 'NONE';
    if (currentStatus === 'NONE') nextStatus = 'FNP';
    else if (currentStatus === 'FNP') nextStatus = 'RECEIVED';
    else if (currentStatus === 'RECEIVED') nextStatus = 'VALIDATED';
    else nextStatus = 'NONE';

    if (existingIdx !== -1) {
      nextBucket[existingIdx] = { 
        ...nextBucket[existingIdx], 
        monthlyStatuses: { ...(nextBucket[existingIdx].monthlyStatuses || {}), [monthId]: nextStatus } 
      };
    } else {
      const expenseToFind = currentManualExpenses.find(e => e.id === id);
      if (expenseToFind) {
        nextBucket.push({ 
          ...expenseToFind, 
          monthlyAmounts: {}, 
          monthlyStatuses: { [monthId]: nextStatus } 
        });
      }
    }

    const newManualExpenses = { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } };
    updateState({ manualExpenses: newManualExpenses });
  };

  const handleAddFamily = (categoryId: string) => {
    if (isGlobalView) return;
    const newFam: BudgetFamily = { id: generateId(), label: 'Nouvelle Famille...', categoryId };
    const nextFamilies = { ...budgetFamilies };
    if (!nextFamilies[globalFY]) nextFamilies[globalFY] = {};
    nextFamilies[globalFY][globalCountry as string] = [...(nextFamilies[globalFY][globalCountry as string] || []), newFam];
    updateState({ budgetFamilies: nextFamilies });
  };

  const handleUpdateFamilyLabel = (id: string, label: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const nextFams = (budgetFamilies[globalFY][countryKey] || []).map(f => f.id === id ? { ...f, label } : f);
    const nextFamilies = { ...budgetFamilies, [globalFY]: { ...budgetFamilies[globalFY], [countryKey]: nextFams } };
    updateState({ budgetFamilies: nextFamilies });
  };

  const handleDeleteFamily = (id: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const nextFams = (budgetFamilies[globalFY][countryKey] || []).filter(f => f.id !== id);
    const nextExpenses = (manualExpenses[globalFY][countryKey] || []).filter(e => e.familyId !== id);
    
    const nextFamilies = { ...budgetFamilies, [globalFY]: { ...budgetFamilies[globalFY], [countryKey]: nextFams } };
    const nextManualExpenses = { ...manualExpenses, [globalFY]: { ...manualExpenses[globalFY], [countryKey]: nextExpenses } };

    updateState({ 
      budgetFamilies: nextFamilies,
      manualExpenses: nextManualExpenses
    });
  };

  const handleAddExpenseRow = (categoryId: string, familyId: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const newExpense: ManualExpense = { id: generateId(), label: 'Libellé ligne...', categoryId, familyId, monthlyAmounts: {}, monthlyComments: {}, monthlyStatuses: {} };
    const nextManual = { ...manualExpenses };
    if (!nextManual[globalFY]) nextManual[globalFY] = {};
    const nextBucket = [...(nextManual[globalFY][countryKey] || []), newExpense];
    nextManual[globalFY][countryKey] = nextBucket;
    updateState({ manualExpenses: nextManual });
  };

  const handleUpdateExpenseLabel = (id: string, label: string) => {
    if (isGlobalView || id.startsWith('auto-')) return;
    const countryKey = globalCountry as string;
    const next = (manualExpenses[globalFY][countryKey] || []).map(e => e.id === id ? { ...e, label } : e);
    const nextManualExpenses = { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: next } };
    updateState({ manualExpenses: nextManualExpenses });
  };

  const handleDeleteExpenseRow = (id: string) => {
    if (isGlobalView || id.startsWith('auto-')) return;
    const countryKey = globalCountry as string;
    const next = (manualExpenses[globalFY][countryKey] || []).filter(e => e.id !== id);
    const nextManualExpenses = { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: next } };
    updateState({ manualExpenses: nextManualExpenses });
  };

  const handleUpdateBudgetVal = (id: string, value: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const cleanValue = value.replace(/[^\d-]/g, '');
    const amount = cleanValue === '' ? 0 : parseFloat(cleanValue) || 0;
    const nextValuesBucket = { ...(budgetValues[globalFY]?.[countryKey] || {}), [id]: amount };
    const nextBudgetValues = { ...budgetValues, [globalFY]: { ...(budgetValues[globalFY] || {}), [countryKey]: nextValuesBucket } };
    updateState({ budgetValues: nextBudgetValues });
  };

  const calculateCategoryTotals = (catId: string) => {
    const totals = Array(12).fill(0);
    currentManualExpenses.filter(e => e.categoryId === catId).forEach(r => {
      MONTHS.forEach((m, idx) => totals[idx] += (r.monthlyAmounts?.[m.id] || 0));
    });
    return totals;
  };

  const calculateFamilyTotals = (famId: string) => {
    const totals = Array(12).fill(0);
    currentManualExpenses.filter(e => e.familyId === famId).forEach(r => {
      MONTHS.forEach((m, idx) => totals[idx] += (r.monthlyAmounts?.[m.id] || 0));
    });
    return totals;
  };

  const plData = useMemo(() => {
    try {
      const revenueByMission = billingRows.map(row => ({
        mission: row.mission,
        monthly: row.monthlyData.map(d => d.amount || 0),
        budget: currentBudgetValues[`rev_${row.mission.id}`] || 0
      }));

      const expensesByCategory = CATEGORIES_CONFIG.map(cat => ({
        ...cat,
        monthly: calculateCategoryTotals(cat.id),
        budget: currentBudgetValues[cat.id] || 0,
        families: (currentFamilies || []).filter(f => f.categoryId === cat.id).map(fam => ({
          ...fam,
          monthly: calculateFamilyTotals(fam.id),
          budget: currentBudgetValues[fam.id] || 0
        }))
      }));

      const totalRevenueMonthly: number[] = Array(12).fill(0);
      revenueByMission.forEach(m => m.monthly.forEach((v, i) => totalRevenueMonthly[i] += (v || 0)));

      const totalExpensesMonthly: number[] = Array(12).fill(0);
      expensesByCategory.forEach(cat => cat.monthly.forEach((v, i) => totalExpensesMonthly[i] += (v || 0)));

      const ebitMonthly: number[] = totalRevenueMonthly.map((rev, i) => rev - totalExpensesMonthly[i]);

      const todayNow = startOfToday();
      const currentMonthIdx = MONTHS.findIndex(m => m.id === todayNow.getMonth());
      const effectiveMonthIdx = currentMonthIdx === -1 ? 11 : currentMonthIdx;

      const getAggregates = (monthly: number[]) => {
        const series = monthly || Array(12).fill(0);
        const fy = series.reduce((a, b) => a + b, 0);
        const fytd = series.slice(0, effectiveMonthIdx + 1).reduce((a, b) => a + b, 0);
        const fytg = series.slice(effectiveMonthIdx + 1).reduce((a, b) => a + b, 0);
        return { fy, fytd, fytg };
      };

      const totalBudgetRevenue = currentBudgetValues['revenue_total'] || 0;
      const totalBudgetExpenses = currentBudgetValues['expenses_total'] || expensesByCategory.reduce((acc, c) => acc + (c.budget as number), 0);
      const totalBudgetEbit = totalBudgetRevenue - totalBudgetExpenses;

      const calcMargin = (rev: number, ebit: number) => {
        if (!rev || rev === 0) return 0;
        const res = (ebit / rev) * 100;
        return isNaN(res) ? 0 : res;
      };

      const ebitPercentMonthly: number[] = totalRevenueMonthly.map((rev, i) => calcMargin(rev, ebitMonthly[i]));
      
      const revAgg = getAggregates(totalRevenueMonthly);
      const ebitAgg = getAggregates(ebitMonthly);

      return {
        revenueByMission,
        expensesByCategory,
        totalRevenueMonthly,
        totalExpensesMonthly,
        ebitMonthly,
        getAggregates,
        totalBudgetRevenue,
        totalBudgetExpenses,
        totalBudgetEbit,
        ebitPercentMonthly,
        ebitPercentAggregates: {
          fytd: calcMargin(revAgg.fytd, ebitAgg.fytd),
          fytg: calcMargin(revAgg.fytg, ebitAgg.fytg),
          fy: calcMargin(revAgg.fy, ebitAgg.fy),
          budget: calcMargin(totalBudgetRevenue, totalBudgetEbit)
        }
      };
    } catch (e) {
      console.error("P&L Calculation error", e);
      return null;
    }
  }, [billingRows, currentManualExpenses, currentFamilies, today, currentBudgetValues]);

  const formatCurrency = (val: number) => {
    if (val === undefined || isNaN(val)) return '0 €';
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(val)) + ' €';
  };

  const formatPercent = (val: number) => {
    if (val === undefined || isNaN(val)) return '0.0 %';
    return val.toFixed(1) + ' %';
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const BILLING_COL1_WIDTH = isMobile ? 160 : 420;
  const BILLING_COL2_WIDTH = isMobile ? 90 : 110;
  const EXPENSE_COL1_WIDTH = isMobile ? 200 : 650;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {hasMultipleTabs && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm">
          <AlertTriangle className="text-amber-600 shrink-0" size={20} />
          <p className="text-xs font-semibold">
            Suivi Budgétaire semble être ouvert dans un autre onglet ou une autre fenêtre sur ce navigateur. Pour éviter de perdre des modifications, évitez de saisir des données dans plusieurs onglets en même temps.
          </p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex bg-white p-1 rounded-xl border shadow-sm w-full md:w-fit overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('billing')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all shrink-0 ${activeTab === 'billing' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><ReceiptEuro size={16} /> FACTURATION</button>
          <button onClick={() => setActiveTab('expenses')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all shrink-0 ${activeTab === 'expenses' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><Wallet size={16} /> DÉPENSES</button>
          <button onClick={() => setActiveTab('pl')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all shrink-0 ${activeTab === 'pl' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><BarChart3 size={16} /> P&L</button>
          <button onClick={() => setActiveTab('budget')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all shrink-0 ${activeTab === 'budget' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><Target size={16} /> BUDGET</button>
        </div>

        {/* Zone de recherche globale contextualisée par onglet */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={currentSearchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={
              activeTab === 'billing' ? 'Rechercher client, mission, PO...' :
              activeTab === 'expenses' ? 'Rechercher libellé, poste...' :
              activeTab === 'pl' ? 'Rechercher poste, catégorie...' :
              'Rechercher objectif budget...'
            }
            className="w-full pl-3.5 pr-14 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-navy placeholder:text-gray-400 placeholder:font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
            {currentSearchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-gray-400 hover:text-navy p-0.5 rounded transition-colors"
                title="Effacer la recherche"
              >
                <X size={14} />
              </button>
            )}
            <Search size={15} className="text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {activeTab === 'billing' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[70vh]">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center shrink-0">
             <div className="flex items-center gap-2"><Target size={18} className="text-navy" /><h3 className="font-black text-xs text-navy uppercase tracking-widest">Facturation {globalCountry} ({globalFY})</h3></div>
             {isGlobalView && <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">Consolidation Globale</span>}
          </div>
          <div className="flex-1 overflow-auto relative bg-white">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-50 shadow-sm">
                <tr className="text-[9px] uppercase font-black text-gray-400 border-b bg-white">
                  <th style={{ width: BILLING_COL1_WIDTH, minWidth: BILLING_COL1_WIDTH }} className="p-4 border-b border-r bg-white sticky left-0 z-[60] shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded border-gray-300 text-navy accent-navy cursor-pointer transition-all hover:scale-110 shrink-0"
                        checked={filteredBillingRows.length > 0 && filteredBillingRows.every(r => pointedBillings.has(r.mission.id))}
                        ref={el => {
                          if (el) {
                            const all = filteredBillingRows.length > 0 && filteredBillingRows.every(r => pointedBillings.has(r.mission.id));
                            const some = filteredBillingRows.some(r => pointedBillings.has(r.mission.id));
                            el.indeterminate = !all && some;
                          }
                        }}
                        onChange={() => {
                          const all = filteredBillingRows.length > 0 && filteredBillingRows.every(r => pointedBillings.has(r.mission.id));
                          handleToggleAllPointedBilling(filteredBillingRows.map(r => r.mission.id), all);
                        }}
                        title={filteredBillingRows.length > 0 && filteredBillingRows.every(r => pointedBillings.has(r.mission.id)) ? "Tout désélectionner" : "Tout sélectionner"}
                      />
                      <span>Mission / Client</span>
                    </div>
                  </th>
                  <th style={{ width: BILLING_COL2_WIDTH, minWidth: BILLING_COL2_WIDTH, left: BILLING_COL1_WIDTH }} className="p-4 border-b border-r bg-white text-navy sticky z-[60] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Total Mission</th>
                  {MONTHS.map(m => <th key={m.id} className="p-4 border-b text-center min-w-[130px] bg-white">{m.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredBillingRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-gray-400 font-bold text-xs uppercase">
                      Aucune mission ou client ne correspond à la recherche "{searchQueries.billing}"
                    </td>
                  </tr>
                ) : (
                  filteredBillingRows.map((row) => {
                    const isPointed = pointedBillings.has(row.mission.id);
                    return (
                      <tr key={row.mission.id} className={`group transition-colors ${isPointed ? 'bg-amber-100/60 font-semibold' : 'hover:bg-navy/5 even:bg-slate-50/50'}`}>
                        <td style={{ width: BILLING_COL1_WIDTH, minWidth: BILLING_COL1_WIDTH }} className={`py-2 px-4 border-r sticky left-0 z-30 transition-colors shadow-sm ${isPointed ? 'bg-amber-50/95 group-hover:bg-amber-100/70' : 'bg-white group-even:bg-slate-50 group-hover:bg-slate-50'}`}>
                          <div className="flex items-start justify-between group/name">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="pt-0.5 shrink-0">
                                <input 
                                  type="checkbox" 
                                  className="w-3.5 h-3.5 text-navy border-gray-300 rounded focus:ring-navy focus:ring-2 accent-navy cursor-pointer transition-all hover:scale-110"
                                  checked={isPointed}
                                  onChange={() => handleTogglePointedBilling(row.mission.id)}
                                  title="Pointer cette ligne"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-black text-navy uppercase text-[10px] whitespace-nowrap leading-tight truncate">{row.mission.clientName}</div>
                                <div className="text-[10px] text-gray-500 font-bold whitespace-nowrap mt-1 leading-normal truncate">{row.mission.name}</div>
                                {row.mission.customerPo && !isMobile && (
                                  <div className="mt-1 flex items-center gap-1.5 text-[8px] font-black text-navy/40 bg-navy/5 px-1.5 py-0.5 rounded w-fit border border-navy/5">
                                    <Hash size={10} className="text-yellow-accent" />
                                    PO: {row.mission.customerPo}
                                  </div>
                                )}
                              </div>
                            </div>
                            {!isMobile && (
                              <button 
                                onClick={() => {
                                  setActivePoMissionId(row.mission.id);
                                  setTempPo(row.mission.customerPo || '');
                                }}
                                className={`shrink-0 p-1.5 rounded-lg transition-all ${row.mission.customerPo ? 'text-navy bg-yellow-accent/20 shadow-sm' : 'text-gray-300 opacity-0 group-hover/name:opacity-100 hover:bg-navy hover:text-white'}`}
                                title="Gérer le numéro de commande (PO)"
                              >
                                <Hash size={14} strokeWidth={3} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ width: BILLING_COL2_WIDTH, minWidth: BILLING_COL2_WIDTH, left: BILLING_COL1_WIDTH }} className={`py-2 px-4 border-r font-black text-navy text-[10px] text-right sticky z-30 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isPointed ? 'bg-amber-50/95 group-hover:bg-amber-100/70' : 'bg-white group-even:bg-slate-50 group-hover:bg-slate-50'}`}>
                          <span>{formatCurrency(row.totalFY)}</span>
                        </td>
                        {row.monthlyData.map((data, i) => (
                          <td key={i} className={`py-1 px-2 text-center border-r min-w-[130px] relative group/cell transition-colors ${isPointed ? 'bg-amber-100/40' : data.isValidated ? 'bg-emerald-50/10' : data.amount !== 0 ? 'bg-red-500/5' : 'bg-transparent'}`}>
                            <div className="flex items-center gap-1.5 justify-end px-1 h-full min-h-[32px] relative z-10">
                              {!isGlobalView && (
                                <button 
                                  onClick={() => setActiveCommentCell({ type: 'billing', id: row.mission.id, monthId: MONTHS[i].id, currentComment: data.comment || '' })}
                                  className={`absolute top-1 left-1 p-0.5 rounded transition-all z-10 ${data.comment ? 'text-navy bg-yellow-accent shadow-xs ring-1 ring-yellow-accent' : 'text-gray-400 opacity-20 group-hover/cell:opacity-100 hover:text-navy hover:bg-navy/10 hover:opacity-100'}`}
                                  title={data.comment || "Ajouter un commentaire"}
                                >
                                  <MessageSquare size={10} fill={data.comment ? "currentColor" : "none"} strokeWidth={data.comment ? 1.5 : 2.5} />
                                </button>
                              )}
                              <input 
                                type="text" 
                                disabled={isGlobalView} 
                                className={`w-full bg-transparent text-right pl-5 text-[10px] font-black focus:outline-none ${data.isValidated ? 'text-emerald-600' : data.amount === 0 ? 'text-gray-300' : data.amount < 0 ? 'text-emerald-500' : 'text-red-500'}`} 
                                value={data.amount === 0 ? '- €' : formatCurrency(data.amount)} 
                                onChange={(e) => handleUpdateAmount(row.mission.id, MONTHS[i].id, e.target.value)} 
                              />
                              {data.amount !== 0 && (
                                <button 
                                  disabled={isGlobalView} 
                                  onClick={() => toggleValidation(row.mission.id, MONTHS[i].id)} 
                                  className={`rounded p-1 transition-all ${data.isValidated ? 'bg-emerald-500 text-white shadow-sm' : 'border-2 border-red-500 text-red-500 hover:bg-red-50'}`}
                                >
                                  {data.isValidated ? <CheckCircle size={12} /> : <div className="w-2 h-2" />}
                                </button>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="sticky bottom-0 z-50 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
                <tr className="font-black text-[10px] uppercase tracking-widest border-b border-white/5">
                  <td style={{ width: BILLING_COL1_WIDTH, minWidth: BILLING_COL1_WIDTH }} className="py-1.5 px-4 border-r sticky left-0 z-[60] bg-navy shadow-sm">Totaux</td>
                  <td style={{ width: BILLING_COL2_WIDTH, minWidth: BILLING_COL2_WIDTH, left: BILLING_COL1_WIDTH }} className="py-1.5 px-4 border-r text-right text-yellow-accent sticky z-[60] bg-navy shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    {billingRows.reduce((a, b) => a + b.totalFY, 0) === 0 ? <span className="text-white/40">- €</span> : formatCurrency(billingRows.reduce((a, b) => a + b.totalFY, 0))}
                  </td>
                  {monthlyBillingTotals.map((total, i) => (
                    <td key={i} className="py-1.5 px-4 text-center border-r border-white/10 bg-navy min-w-[130px]">
                      {total === 0 ? <span className="text-white/40">- €</span> : formatCurrency(total)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[70vh]">
          <div className="p-4 bg-gray-50 border-b flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2"><TrendingUp size={18} className="text-navy" /><h3 className="font-black text-xs text-navy uppercase tracking-widest">Dépenses {globalCountry} ({globalFY})</h3></div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[9px] font-black uppercase bg-white border px-3 py-1 rounded-full shadow-inner">
                   <div className="flex items-center gap-1">
                     <div className="w-2.5 h-2.5 rounded-full bg-white border border-gray-400 shadow-sm"></div>
                     <span>FNP</span>
                   </div>
                   <div className="flex items-center gap-1">
                     <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600 shadow-sm"></div>
                     <span>Facture parvenue</span>
                   </div>
                   <div className="flex items-center gap-1">
                     <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600 shadow-sm"></div>
                     <span>Validé Finance</span>
                   </div>
                </div>
                {isGlobalView && <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Lecture seule (Global)</span>}
             </div>
          </div>
          <div className="flex-1 overflow-auto relative bg-white">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-50 bg-white shadow-sm">
                <tr className="text-[9px] uppercase font-black text-gray-400 border-b bg-white">
                  <th style={{ width: EXPENSE_COL1_WIDTH, minWidth: EXPENSE_COL1_WIDTH }} className="p-4 border-b border-r bg-white sticky left-0 z-[60] shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded border-gray-300 text-navy accent-navy cursor-pointer transition-all hover:scale-110 shrink-0"
                        checked={visibleExpenseIds.length > 0 && visibleExpenseIds.every(id => pointedExpenses.has(id))}
                        ref={el => {
                          if (el) {
                            const all = visibleExpenseIds.length > 0 && visibleExpenseIds.every(id => pointedExpenses.has(id));
                            const some = visibleExpenseIds.some(id => pointedExpenses.has(id));
                            el.indeterminate = !all && some;
                          }
                        }}
                        onChange={() => {
                          const all = visibleExpenseIds.length > 0 && visibleExpenseIds.every(id => pointedExpenses.has(id));
                          handleToggleAllPointedExpenses(visibleExpenseIds, all);
                        }}
                        title={visibleExpenseIds.length > 0 && visibleExpenseIds.every(id => pointedExpenses.has(id)) ? "Tout désélectionner" : "Tout sélectionner"}
                      />
                      <span>Catégorie / Famille / Libellé</span>
                    </div>
                  </th>
                  {MONTHS.map(m => <th key={m.id} className="p-4 border-b text-center min-w-[110px] bg-white">{m.label}</th>)}
                  <th className="p-4 border-b border-l text-center bg-gray-50 min-w-[120px]">Total FY</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(() => {
                  const query = searchQueries.expenses.trim().toLowerCase();
                  
                  const hasMatches = !query || CATEGORIES_CONFIG.some(cat => {
                    const catMatch = cat.label.toLowerCase().includes(query);
                    const matchingFamilies = (currentFamilies || []).filter(f => f.categoryId === cat.id);
                    return catMatch || matchingFamilies.some(fam => {
                      const famMatch = fam.label.toLowerCase().includes(query);
                      const matchingExpenses = currentManualExpenses.filter(e => e.familyId === fam.id);
                      return famMatch || matchingExpenses.some(exp => exp.label.toLowerCase().includes(query));
                    });
                  });

                  if (!hasMatches) {
                    return (
                      <tr>
                        <td colSpan={14} className="p-8 text-center text-gray-400 font-bold text-xs uppercase">
                          Aucune dépense ne correspond à la recherche "{searchQueries.expenses}"
                        </td>
                      </tr>
                    );
                  }

                  return CATEGORIES_CONFIG.map(cat => {
                    const catMatchesQuery = !query || cat.label.toLowerCase().includes(query);
                    const familiesForCat = (currentFamilies || []).filter(f => f.categoryId === cat.id);
                    
                    const filteredFamilies = familiesForCat.filter(fam => {
                      if (!query || catMatchesQuery) return true;
                      const famMatchesQuery = fam.label.toLowerCase().includes(query);
                      const expensesForFam = currentManualExpenses.filter(e => e.familyId === fam.id);
                      const hasMatchingExpense = expensesForFam.some(exp => exp.label.toLowerCase().includes(query));
                      return famMatchesQuery || hasMatchingExpense;
                    });

                    if (query && !catMatchesQuery && filteredFamilies.length === 0) {
                      return null;
                    }

                    return (
                      <React.Fragment key={cat.id}>
                        <tr className="bg-navy text-white">
                          <td style={{ width: EXPENSE_COL1_WIDTH, minWidth: EXPENSE_COL1_WIDTH }} className="p-4 border-r sticky left-0 z-30 bg-navy font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-between group shadow-sm">
                            <div className="flex items-center gap-3"><cat.icon size={16} className="text-yellow-accent" /> <span className="truncate">{cat.label}</span></div>
                            {!isGlobalView && !isMobile && <button type="button" onClick={() => handleAddFamily(cat.id)} className="p-1 hover:bg-white hover:text-navy rounded-md transition-all flex items-center gap-1.5 px-3 border border-white/20 bg-white/10 shadow-sm"><Layers size={10} strokeWidth={4} /> <span className="text-[8px] font-black uppercase">Famille</span></button>}
                          </td>
                          {calculateCategoryTotals(cat.id).map((v, i) => (
                            <td key={i} className={`p-4 text-center font-black text-[10px] bg-navy ${v < 0 ? 'text-emerald-400' : 'text-white'}`}>
                              {formatCurrency(v)}
                            </td>
                          ))}
                          <td className="p-4 border-l text-center font-black text-[10px] bg-navy text-yellow-accent">{formatCurrency(calculateCategoryTotals(cat.id).reduce((a, b) => a + b, 0))}</td>
                        </tr>
                        {filteredFamilies.map(fam => {
                          const famMatchesQuery = !query || catMatchesQuery || fam.label.toLowerCase().includes(query);
                          const expensesForFam = currentManualExpenses.filter(e => e.familyId === fam.id);
                          const filteredExpenses = expensesForFam.filter(exp => {
                            if (!query || famMatchesQuery) return true;
                            return exp.label.toLowerCase().includes(query);
                          });

                          return (
                            <React.Fragment key={fam.id}>
                              <tr className="bg-gray-100/90 border-y">
                                <td className="py-2.5 pl-10 pr-4 border-r sticky left-0 z-30 bg-gray-100 flex items-center justify-between shadow-sm w-[650px]">
                                  <input type="text" disabled={isGlobalView} className="bg-transparent font-black text-navy text-[10px] uppercase focus:outline-none flex-1 whitespace-normal break-words" value={fam.label} onChange={(e) => handleUpdateFamilyLabel(fam.id, e.target.value)} />
                                  {!isGlobalView && (
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => handleAddExpenseRow(cat.id, fam.id)} className="p-1 hover:bg-navy hover:text-white rounded-md transition-all flex items-center gap-1.5 px-3 bg-white shadow-sm border border-navy/10"><Plus size={10} /> <span className="text-[8px] font-black uppercase">Ligne</span></button>
                                    </div>
                                  )}
                                </td>
                                {calculateFamilyTotals(fam.id).map((v, i) => (
                                  <td key={i} className={`p-2 text-center font-bold text-[9px] bg-gray-50/50 ${v < 0 ? 'text-emerald-600' : 'text-navy/40'}`}>
                                    {v !== 0 ? formatCurrency(v) : '-'}
                                  </td>
                                ))}
                                <td className="p-2 border-l text-center font-black text-navy/60 text-[9px] bg-gray-100/50">{formatCurrency(calculateFamilyTotals(fam.id).reduce((a, b) => a + b, 0))}</td>
                              </tr>
                              {filteredExpenses.map(exp => {
                                const isAuto = exp.id.startsWith('auto-');
                                const isPointed = pointedExpenses.has(exp.id);
                                return (
                                  <tr key={exp.id} className={`group transition-colors ${isPointed ? 'bg-amber-100/60 font-semibold' : 'hover:bg-navy/[0.03]'} ${isAuto ? 'italic' : ''}`}>
                                    <td className={`py-2 pl-20 pr-4 border-r sticky left-0 z-30 transition-colors shadow-sm w-[650px] flex items-center justify-between relative animate-fade-in ${isPointed ? 'bg-amber-50/95 group-hover:bg-amber-100/70' : 'bg-white group-hover:bg-slate-50'}`}>
                                       <div className="absolute left-14 top-1/2 -translate-y-1/2 flex items-center">
                                         <input 
                                           type="checkbox" 
                                           className="w-3.5 h-3.5 text-navy border-gray-300 rounded focus:ring-navy focus:ring-2 accent-navy cursor-pointer transition-all hover:scale-110"
                                           checked={isPointed}
                                           onChange={() => handleTogglePointed(exp.id)}
                                           title="Pointer cette ligne"
                                         />
                                       </div>
                                       <div className="flex items-center flex-1 min-w-0 mr-2">
                                          {isAuto && <Link size={12} className="text-blue-500 mr-2 shrink-0" />}
                                          <input 
                                            type="text" 
                                            disabled={isGlobalView || isAuto} 
                                            className={`bg-transparent font-medium text-navy text-[10px] focus:outline-none flex-1 whitespace-normal break-words ${isAuto ? 'text-blue-700 cursor-default' : ''}`} 
                                            value={exp.label} 
                                            onChange={(e) => handleUpdateExpenseLabel(exp.id, e.target.value)} 
                                          />
                                       </div>
                                       {!isGlobalView && !isAuto && <button type="button" onClick={() => handleDeleteExpenseRow(exp.id)} className="p-1 hover:text-red-500 text-gray-300 transition-colors" title="Supprimer la ligne"><Trash2 size={12} /></button>}
                                    </td>
                                    {MONTHS.map((m, idx) => {
                                      const val = exp.monthlyAmounts?.[m.id] || 0;
                                      const comment = exp.monthlyComments?.[m.id] || '';
                                      const status = exp.monthlyStatuses?.[m.id] || 'NONE';
                                      
                                      const statusStyles = {
                                        NONE: 'bg-transparent',
                                        FNP: 'bg-transparent',
                                        RECEIVED: 'bg-amber-500/10',
                                        VALIDATED: 'bg-emerald-500/10'
                                      };

                                      return (
                                        <td key={idx} className={`p-1.5 border-r relative group/cell transition-colors duration-200 ${isPointed ? 'bg-amber-100/40' : (statusStyles[status] || 'bg-transparent')}`}>
                                          <div className="flex items-center h-full relative z-10">
                                            {!isGlobalView && (
                                              <button 
                                                onClick={() => setActiveCommentCell({ type: 'expense', id: exp.id, monthId: m.id, currentComment: comment })}
                                                className={`absolute top-0.5 left-0.5 p-1 rounded-md transition-all z-10 ${comment ? 'text-navy bg-yellow-accent shadow-md ring-1 ring-yellow-accent' : 'text-gray-400 opacity-20 group-hover/cell:opacity-100 hover:text-navy hover:bg-navy/10 hover:opacity-100'}`}
                                                title={comment || "Ajouter un commentaire"}
                                              >
                                                <MessageSquare size={14} fill={comment ? "currentColor" : "none"} strokeWidth={comment ? 1.5 : 2.5} />
                                              </button>
                                            )}
                                            <input 
                                              type="text" 
                                              disabled={isGlobalView} 
                                              className={`w-full bg-transparent text-right text-[10px] font-bold focus:outline-none px-1 ${val < 0 ? 'text-emerald-600' : ''} ${status === 'VALIDATED' ? 'text-emerald-700' : status === 'RECEIVED' ? 'text-amber-700' : status === 'FNP' ? 'text-gray-700' : ''} ${isAuto ? 'text-blue-700 font-black' : ''}`} 
                                              value={val === 0 ? '- €' : formatCurrency(val)} 
                                              onChange={(e) => handleUpdateExpenseAmount(exp.id, m.id, e.target.value)} 
                                            />
                                            {!isGlobalView && (isAuto || val !== 0) && (
                                              <button 
                                                onClick={() => handleToggleExpenseStatus(exp.id, m.id)}
                                                className={`ml-1.5 p-0.5 rounded transition-all flex items-center justify-center shrink-0 ${status !== 'NONE' ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'}`}
                                                title={
                                                  status === 'VALIDATED' ? 'Validé Finance' : 
                                                  status === 'RECEIVED' ? 'Facture parvenue' : 
                                                  status === 'FNP' ? 'FNP' : 
                                                  'Définir statut'
                                                }
                                              >
                                                {status === 'VALIDATED' ? (
                                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600 shadow-sm" />
                                                ) : status === 'RECEIVED' ? (
                                                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600 shadow-sm" />
                                                ) : status === 'FNP' ? (
                                                  <div className="w-2.5 h-2.5 rounded-full bg-white border border-gray-400 shadow-sm" />
                                                ) : (
                                                  <div className="w-2.5 h-2.5 rounded-full border border-dashed border-gray-300 hover:border-navy" />
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className={`p-1.5 border-l text-center font-bold text-[10px] transition-colors ${isPointed ? 'bg-amber-100/40' : ''} ${(Object.values(exp.monthlyAmounts || {}) as number[]).reduce((a: number, b: number) => a + b, 0) < 0 ? 'text-emerald-600' : 'text-navy'} ${isAuto ? 'text-blue-800 font-black' : ''}`}>
                                      {formatCurrency((Object.values(exp.monthlyAmounts || {}) as number[]).reduce((a: number, b: number) => a + b, 0))}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
              <tfoot className="sticky bottom-0 z-50 bg-navy text-white shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
                <tr className="font-black text-[11px] uppercase tracking-[0.2em]">
                  <td className="py-4 px-4 border-r sticky left-0 z-[60] bg-navy shadow-sm w-[650px]">TOTAL GÉNÉRAL DES CHARGES FY</td>
                  {(plData?.totalExpensesMonthly || Array(12).fill(0)).map((total, i) => (
                    <td key={i} className={`py-4 px-4 text-center border-r border-white/10 bg-navy ${total < 0 ? 'text-emerald-400' : ''}`}>
                      {formatCurrency(total)}
                    </td>
                  ))}
                  <td className="py-4 px-4 border-l text-center text-yellow-accent bg-navy">{formatCurrency((plData?.totalExpensesMonthly || Array(12).fill(0)).reduce((a, b) => a + b, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'pl' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[75vh]">
          <div className="p-4 bg-navy border-b flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3"><Calculator size={20} className="text-yellow-accent" /><h3 className="font-black text-xs text-white uppercase tracking-widest leading-none">Analyse P&L {globalCountry} ({globalFY})</h3></div>
             <div className="flex items-center gap-2">
               <button
                 type="button"
                 onClick={() => setShowDetailsInPL(!showDetailsInPL)}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all shadow-sm ${
                   showDetailsInPL 
                     ? 'bg-yellow-accent text-navy border-yellow-accent' 
                     : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                 }`}
                 title="Afficher ou masquer les lignes détails (familles de dépenses)"
               >
                 <Layers size={13} />
                 <span>{showDetailsInPL ? 'Détails : Affichés' : 'Détails : Masqués'}</span>
               </button>
               {!isGlobalView && (
                 <button onClick={() => setIsBudgetEditMode(!isBudgetEditMode)} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase transition-all shadow-sm ${isBudgetEditMode ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/10 border-white/10 text-white'}`}>{isBudgetEditMode ? <CheckCircle size={14} /> : <PencilLine size={14} />}{isBudgetEditMode ? 'Quitter Edition Budget' : 'Modifier Objectifs'}</button>
               )}
             </div>
          </div>
          <div className="flex-1 overflow-auto relative">
            {!plData ? (
              <div className="flex items-center justify-center h-full text-gray-400 font-bold uppercase text-xs">Calcul des données en cours...</div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-30 shadow-sm">
                  <tr className="text-[9px] uppercase font-black text-gray-500 bg-gray-100 border-b">
                    <th className="p-4 border-b border-r bg-gray-100 sticky left-0 z-40 w-[400px] shadow-sm">Indicateurs / Détails Financiers</th>
                    {MONTHS.map(m => <th key={m.id} className="p-4 border-b text-center min-w-[105px] bg-gray-100">{m.label}</th>)}
                    <th className="p-4 border-b border-l text-center bg-navy text-blue-200 min-w-[110px] z-10">FYTD</th>
                    <th className="p-4 border-b border-l text-center bg-navy text-amber-200 min-w-[110px] z-10">FYTG</th>
                    <th className="p-4 border-b border-l text-center bg-navy text-yellow-accent min-w-[110px] z-10">FY TOTAL</th>
                    <th className={`p-4 border-b border-l text-center min-w-[110px] z-10 ${isBudgetEditMode ? 'bg-emerald-100' : 'bg-gray-200'}`}>BUDGET</th>
                    <th className="p-4 border-b border-l text-center bg-gray-800 text-white min-w-[110px] z-10">VARIATION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const query = searchQueries.pl.trim().toLowerCase();
                    const revenueMatches = !query || "chiffre d'affaires (vendu)".includes(query) || "ca".includes(query);
                    const ebitMatches = !query || "ebit".includes(query);
                    const marginMatches = !query || "marge ebit (%)".includes(query) || "marge".includes(query);

                    const hasExpensesMatches = (plData.expensesByCategory || []).some((cat: any) => {
                      const catMatch = cat.label.toLowerCase().includes(query);
                      const famMatch = (cat.families || []).some((fam: any) => fam.label.toLowerCase().includes(query));
                      return catMatch || famMatch;
                    });

                    if (query && !revenueMatches && !ebitMatches && !marginMatches && !hasExpensesMatches) {
                      return (
                        <tr>
                          <td colSpan={18} className="p-8 text-center text-gray-400 font-bold text-xs uppercase">
                            Aucun poste du P&L ne correspond à la recherche "{searchQueries.pl}"
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <>
                        {revenueMatches && (
                          <tr className="bg-navy/5 group">
                            <td className="p-4 border-r sticky left-0 z-10 bg-gray-50 font-black text-navy text-[11px] shadow-sm uppercase group-hover:bg-slate-100 transition-colors w-[400px]">CHIFFRE D'AFFAIRES (VENDU)</td>
                            {(plData.totalRevenueMonthly as number[]).map((v: number, i: number) => <td key={i} className={`p-4 text-center font-black text-[10px] ${v < 0 ? 'text-red-500' : 'text-navy'}`}>{formatCurrency(v)}</td>)}
                            <td className="p-4 border-l text-center font-black text-[10px] bg-navy/80 text-blue-100">{formatCurrency(plData.getAggregates(plData.totalRevenueMonthly).fytd)}</td>
                            <td className="p-4 border-l text-center font-black text-[10px] bg-navy/80 text-amber-100">{formatCurrency(plData.getAggregates(plData.totalRevenueMonthly).fytg)}</td>
                            <td className="p-4 border-l text-center font-black text-[10px] bg-navy text-yellow-accent">{formatCurrency(plData.getAggregates(plData.totalRevenueMonthly).fy)}</td>
                            <td className="p-4 border-l text-center font-black text-[10px] bg-gray-50">
                              {isBudgetEditMode ? <input type="text" className="w-full border border-emerald-300 rounded px-2 py-1 text-right text-[10px] font-black" value={currentBudgetValues['revenue_total'] || ''} onChange={(e) => handleUpdateBudgetVal('revenue_total', e.target.value)} placeholder="0" /> : formatCurrency(plData.totalBudgetRevenue)}
                            </td>
                            <td className="p-4 border-l text-center bg-gray-50 font-black text-[10px]">{formatCurrency(plData.getAggregates(plData.totalRevenueMonthly).fy - (plData.totalBudgetRevenue))}</td>
                          </tr>
                        )}

                        {(!query || (revenueMatches && hasExpensesMatches)) && (
                          <tr className="h-4 bg-gray-50/50"><td colSpan={18}></td></tr>
                        )}

                        {(plData.expensesByCategory || []).map((cat: any) => {
                          const catMatches = !query || cat.label.toLowerCase().includes(query);
                          const matchingFamilies = (cat.families || []).filter((fam: any) => {
                            if (!query || catMatches) return true;
                            return fam.label.toLowerCase().includes(query);
                          });

                          if (query && !catMatches && matchingFamilies.length === 0) {
                            return null;
                          }

                          const catAgg = plData.getAggregates(cat.monthly);
                          return (
                            <React.Fragment key={cat.id}>
                              <tr className="bg-gray-100 group">
                                  <td className="p-4 border-r sticky left-0 z-10 bg-gray-100 font-black text-gray-700 text-[10px] uppercase shadow-sm w-[400px] flex items-center gap-2">
                                    <cat.icon size={14} className="text-navy" /> {cat.label}
                                  </td>
                                  {(cat.monthly as number[]).map((v: number, i: number) => <td key={i} className={`p-4 text-center text-[10px] font-bold ${v !== 0 ? 'text-navy' : 'text-gray-300'}`}>{v !== 0 ? formatCurrency(v) : '-'}</td>)}
                                  <td className="p-4 border-l text-center font-black text-[10px] bg-navy/10 text-navy">{formatCurrency(catAgg.fytd)}</td>
                                  <td className="p-4 border-l text-center font-black text-[10px] bg-navy/10 text-navy">{formatCurrency(catAgg.fytg)}</td>
                                  <td className="p-4 border-l text-center font-black text-[10px] bg-navy/20 text-navy">{formatCurrency(catAgg.fy)}</td>
                                  <td className="p-4 border-l text-center font-black text-[10px] bg-gray-100">
                                    {isBudgetEditMode ? <input type="text" className="w-full border border-emerald-300 rounded px-2 py-1 text-right text-[10px]" value={currentBudgetValues[cat.id] || ''} onChange={(e) => handleUpdateBudgetVal(cat.id, e.target.value)} placeholder="0" /> : formatCurrency(cat.budget)}
                                  </td>
                                  <td className="p-4 border-l text-center font-black text-[10px] bg-gray-100">{formatCurrency(catAgg.fy - (cat.budget as number))}</td>
                              </tr>
                              {showDetailsInPL && matchingFamilies.map((fam: any) => {
                                  const famAgg = plData.getAggregates(fam.monthly);
                                  return (
                                    <tr key={fam.id} className="bg-white/50 hover:bg-gray-50/50">
                                      <td className="p-3 pl-8 border-r sticky left-0 z-10 bg-white font-black text-gray-500 text-[9px] uppercase shadow-sm w-[400px]">
                                        {fam.label}
                                      </td>
                                      {(fam.monthly as number[]).map((v: number, i: number) => <td key={i} className="p-3 text-center text-[9px] font-bold">{v !== 0 ? formatCurrency(v) : '-'}</td>)}
                                      <td className="p-3 border-l text-center text-[9px] font-bold bg-gray-50/20">{formatCurrency(famAgg.fytd)}</td>
                                      <td className="p-3 border-l text-center text-[9px] font-bold bg-gray-50/20">{formatCurrency(famAgg.fytg)}</td>
                                      <td className="p-3 border-l text-center text-[9px] font-black bg-gray-50/40">{formatCurrency(famAgg.fy)}</td>
                                      <td className="p-3 border-l text-center font-black text-[10px] bg-white">
                                        {isBudgetEditMode ? <input type="text" className="w-full border border-emerald-300 rounded px-2 py-1 text-right text-[9px]" value={currentBudgetValues[fam.id] || ''} onChange={(e) => handleUpdateBudgetVal(fam.id, e.target.value)} placeholder="0" /> : formatCurrency(fam.budget)}
                                      </td>
                                      <td className="p-3 border-l text-center text-[9px] font-bold">{formatCurrency(famAgg.fy - (fam.budget as number))}</td>
                                    </tr>
                                  );
                              })}
                            </React.Fragment>
                          );
                        })}

                        {ebitMatches && (
                          <tr className="bg-navy text-white group">
                            <td className="p-6 border-r sticky left-0 z-10 bg-navy font-black text-[12px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)] w-[400px]"><Zap size={18} className="inline mr-2 text-yellow-accent" /> EBIT</td>
                            {(plData.ebitMonthly as number[]).map((v: number, i: number) => <td key={i} className={`p-6 text-center font-black text-[11px] ${v < 0 ? 'text-red-400' : 'text-yellow-accent'}`}>{formatCurrency(v)}</td>)}
                            <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-blue-200">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fytd)}</td>
                            <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-amber-200">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fytg)}</td>
                            <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-yellow-accent">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fy)}</td>
                            <td className="p-6 border-l text-center font-black text-[11px] bg-navy text-white/60">{formatCurrency(plData.totalBudgetEbit as number)}</td>
                            <td className="p-6 border-l text-center bg-gray-800 font-black text-[11px]">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fy - (plData.totalBudgetEbit))}</td>
                          </tr>
                        )}
                        
                        {marginMatches && (
                          <tr className="bg-navy/80 text-white/90">
                            <td className="p-4 border-r border-white/5 sticky left-0 z-10 bg-[#2d3b4d] font-black text-[11px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] w-[400px] flex items-center gap-2"><Percent size={14} className="text-yellow-accent" /> MARGE EBIT (%)</td>
                            {(plData.ebitPercentMonthly as number[]).map((v: number, i: number) => (
                              <td key={i} className={`p-4 text-center font-black text-[10px] ${v >= 15 ? 'text-emerald-400' : v > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                                {formatPercent(v)}
                              </td>
                            ))}
                            <td className={`p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 ${plData.ebitPercentAggregates.fytd >= 15 ? 'text-emerald-400' : plData.ebitPercentAggregates.fytd > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                              {formatPercent(plData.ebitPercentAggregates.fytd)}
                            </td>
                            <td className={`p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 ${plData.ebitPercentAggregates.fytg >= 15 ? 'text-emerald-400' : plData.ebitPercentAggregates.fytg > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                              {formatPercent(plData.ebitPercentAggregates.fytg)}
                            </td>
                            <td className={`p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 ${plData.ebitPercentAggregates.fy >= 15 ? 'text-emerald-400' : plData.ebitPercentAggregates.fy > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                              {formatPercent(plData.ebitPercentAggregates.fy)}
                            </td>
                            <td className="p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 text-white/40">{formatPercent(plData.ebitPercentAggregates.budget)}</td>
                            <td className={`p-4 border-l border-white/5 text-center bg-gray-800 font-black text-[10px] ${(plData.ebitPercentAggregates.fy - plData.ebitPercentAggregates.budget) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatPercent((plData.ebitPercentAggregates.fy) - (plData.ebitPercentAggregates.budget))}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            )}
          </div>
          <div className="p-4 bg-gray-50 border-t flex items-center justify-between shrink-0 text-[9px] font-black text-navy/40 uppercase">
             <div className="flex items-center gap-4"><FileText size={14} /> <span>Mode Pilotage : {isGlobalView ? 'Consolidé (FR+ES+IT)' : globalCountry}</span></div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-navy text-blue-200" /> FYTD : Jusqu'à ce jour</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-navy text-amber-200" /> FYTG : Reste de l'année</div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[78vh] w-full">
          <div className="p-4 bg-gray-50 border-b flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
               <Goal size={20} className="text-navy" />
               <div>
                 <h3 className="font-black text-xs text-navy uppercase tracking-widest leading-none">
                   Objectifs Budget & Reforecasts (T1, T2, T3, T4 Miroir P&L) — {globalCountry} ({globalFY})
                 </h3>
                 <span className="text-[10px] text-gray-500 font-medium">
                   Suivi pluriannuel, révisions trimestrielles et consolidation automatique
                 </span>
               </div>
             </div>
             <div className="flex items-center gap-3">
               <button
                 type="button"
                 onClick={() => setShowExpenseLinesInBudget(!showExpenseLinesInBudget)}
                 className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 shadow-2xs ${
                   showExpenseLinesInBudget 
                     ? 'bg-navy text-white border-navy' 
                     : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                 }`}
                 title="Afficher ou masquer les lignes détaillées de chaque dépense sous les familles"
               >
                 <Layers size={13} />
                 <span>{showExpenseLinesInBudget ? 'Lignes de dépenses : Affichées' : 'Lignes de dépenses : Masquées'}</span>
               </button>
               {isGlobalView ? (
                 <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Lecture Seule (Vue Globale)</span>
               ) : (
                 <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Mode Édition Activé</span>
               )}
             </div>
          </div>
          <div className="flex-1 overflow-auto relative">
            {!plData ? null : (() => {
              const query = searchQueries.budget.trim().toLowerCase();
              const revenueMatches = !query || "chiffre d'affaires (vendu)".includes(query) || "ca".includes(query);
              const ebitMatches = !query || "ebit".includes(query) || "ebit fy budgeté".includes(query);
              const marginMatches = !query || "marge ebit (%)".includes(query) || "marge".includes(query);

              const hasExpensesMatches = (plData.expensesByCategory || []).some((cat: any) => {
                const catMatch = cat.label.toLowerCase().includes(query);
                const famMatch = (cat.families || []).some((fam: any) => fam.label.toLowerCase().includes(query));
                return catMatch || famMatch;
              });

              if (query && !revenueMatches && !ebitMatches && !marginMatches && !hasExpensesMatches) {
                return (
                  <div className="p-12 text-center text-gray-400 font-bold text-xs uppercase">
                    Aucun poste de budget ne correspond à la recherche "{searchQueries.budget}"
                  </div>
                );
              }

              // Définition des 5 colonnes
              const columns = [
                { id: 'initial', label: 'Budget Initial', subLabel: 'Cible Annuelle FY', prefix: '', isEditable: true, isMirror: false, headerBg: 'bg-navy text-yellow-accent', cellBg: 'bg-yellow-accent/5' },
                { id: 'rf1', label: 'Reforecast 1', subLabel: 'Trimestre 1 (Q1)', prefix: 'rf1_', isEditable: true, isMirror: false, headerBg: 'bg-slate-800 text-white', cellBg: 'bg-slate-50/70' },
                { id: 'rf2', label: 'Reforecast 2', subLabel: 'Trimestre 2 (Q2)', prefix: 'rf2_', isEditable: true, isMirror: false, headerBg: 'bg-slate-800 text-white', cellBg: 'bg-slate-50/70' },
                { id: 'rf3', label: 'Reforecast 3', subLabel: 'Trimestre 3 (Q3)', prefix: 'rf3_', isEditable: true, isMirror: false, headerBg: 'bg-slate-800 text-white', cellBg: 'bg-slate-50/70' },
                { id: 't4', label: 'Trimestre 4', subLabel: 'Miroir P&L Réel (FY)', prefix: 't4_', isEditable: false, isMirror: true, headerBg: 'bg-navy text-emerald-300', cellBg: 'bg-emerald-500/5' },
              ];

              // Helper d'évaluation du montant d'une dépense individuelle
              const getExpVal = (exp: ManualExpense, col: typeof columns[0]) => {
                if (col.isMirror) {
                  return (Object.values(exp.monthlyAmounts || {}) as number[]).reduce((a, b) => a + (b || 0), 0);
                }
                return currentBudgetValues[col.prefix + exp.id] || 0;
              };

              // Helper d'évaluation du montant d'une famille
              const getFamVal = (fam: any, col: typeof columns[0]) => {
                if (col.isMirror) {
                  return plData.getAggregates(fam.monthly).fy || 0;
                }
                const direct = currentBudgetValues[col.prefix + fam.id];
                if (direct !== undefined && direct !== 0) return direct;
                // Sinon somme des dépenses individuelles sous cette famille
                const expensesForFam = currentManualExpenses.filter(e => e.familyId === fam.id);
                return expensesForFam.reduce((acc, exp) => acc + (currentBudgetValues[col.prefix + exp.id] || 0), 0);
              };

              // Helper d'évaluation du montant d'une catégorie
              const getCatVal = (cat: any, col: typeof columns[0]) => {
                if (col.isMirror) {
                  return plData.getAggregates(cat.monthly).fy || 0;
                }
                const direct = currentBudgetValues[col.prefix + cat.id];
                if (direct !== undefined && direct !== 0) return direct;
                // Sinon somme des familles de cette catégorie
                return (cat.families || []).reduce((acc: number, fam: any) => acc + getFamVal(fam, col), 0);
              };

              // Chiffre d'affaires par colonne
              const getRevenueVal = (col: typeof columns[0]) => {
                if (col.isMirror) {
                  return plData.getAggregates(plData.totalRevenueMonthly).fy || 0;
                }
                return currentBudgetValues[col.prefix + 'revenue_total'] || 0;
              };

              // Total Dépenses par colonne
              const getTotalExpensesVal = (col: typeof columns[0]) => {
                if (col.isMirror) {
                  return plData.getAggregates(plData.totalExpensesMonthly).fy || 0;
                }
                return (plData.expensesByCategory || []).reduce((acc: number, cat: any) => acc + getCatVal(cat, col), 0);
              };

              // EBIT par colonne
              const getEbitVal = (col: typeof columns[0]) => {
                return getRevenueVal(col) - getTotalExpensesVal(col);
              };

              // Marge EBIT (%) par colonne
              const getMarginVal = (col: typeof columns[0]) => {
                const rev = getRevenueVal(col);
                if (!rev || rev === 0) return 0;
                return (getEbitVal(col) / rev) * 100;
              };

              // Rendu des badges d'écart (variation vs Budget Initial)
              const renderVariance = (val: number, baseVal: number, isExpense: boolean) => {
                if (baseVal === 0 && val === 0) return null;
                const diff = val - baseVal;
                if (Math.abs(diff) < 0.01) {
                  return <span className="text-[9px] font-bold text-gray-400 mt-0.5 block text-center">Δ 0 €</span>;
                }
                const pct = baseVal !== 0 ? (diff / Math.abs(baseVal)) * 100 : null;
                const isFavorable = isExpense ? diff < 0 : diff > 0;
                const sign = diff > 0 ? '+' : '';
                const pctSign = pct !== null && pct > 0 ? '+' : '';

                return (
                  <div 
                    className={`text-[8.5px] font-black px-1.5 py-0.5 rounded mt-0.5 inline-flex items-center gap-1 leading-tight tracking-tight border shadow-2xs ${
                      isFavorable 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                    title={`Écart vs Budget initial : ${sign}${formatCurrency(diff)}${pct !== null ? ` (${pctSign}${pct.toFixed(1)}%)` : ''}`}
                  >
                    <span>{isFavorable ? '▲' : '▼'} {sign}{formatCurrency(diff)}</span>
                    {pct !== null && <span className="text-[7.5px] opacity-80 font-normal">({pctSign}{pct.toFixed(1)}%)</span>}
                  </div>
                );
              };

              // Rendu des écarts de marge
              const renderMarginVariance = (pctVal: number, basePctVal: number) => {
                if (basePctVal === 0 && pctVal === 0) return null;
                const diff = pctVal - basePctVal;
                if (Math.abs(diff) < 0.05) {
                  return <span className="text-[9px] font-bold text-gray-400 mt-0.5 block text-center">Δ 0.0 pt</span>;
                }
                const isFavorable = diff > 0;
                const sign = diff > 0 ? '+' : '';
                return (
                  <div 
                    className={`text-[8.5px] font-black px-1.5 py-0.5 rounded mt-0.5 inline-flex items-center gap-1 leading-tight tracking-tight border shadow-2xs ${
                      isFavorable 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    <span>{isFavorable ? '▲' : '▼'} {sign}{diff.toFixed(1)} pts</span>
                  </div>
                );
              };

              const initialCol = columns[0];
              const baseRevenue = getRevenueVal(initialCol);
              const baseEbit = getEbitVal(initialCol);
              const baseMargin = getMarginVal(initialCol);

              return (
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 z-30 shadow-sm">
                    <tr className="text-[10px] uppercase font-black border-b text-gray-500 bg-gray-100">
                      <th className="p-3 border-b border-r bg-gray-100 sticky left-0 z-40 min-w-[320px] shadow-sm tracking-wider whitespace-nowrap">
                        Poste / Nature
                      </th>
                      {columns.map(col => (
                        <th key={col.id} className={`p-3 border-b border-r text-center ${col.headerBg} min-w-[175px] z-10 tracking-wider`}>
                          <div className="font-black text-[11px]">{col.label}</div>
                          <div className="text-[8.5px] font-normal opacity-85 mt-0.5 flex items-center justify-center gap-1">
                            <span>{col.subLabel}</span>
                            {col.isMirror && (
                              <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 text-[7.5px] font-black px-1 rounded">
                                P&L
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-[11px]">
                    {/* LIGNE CHIFFRE D'AFFAIRES */}
                    {revenueMatches && (
                      <tr className="bg-navy/5 group hover:bg-navy/10 transition-colors">
                        <td className="p-2.5 border-r sticky left-0 z-10 bg-gray-50 font-black text-navy text-[12px] shadow-sm uppercase w-[320px] whitespace-nowrap overflow-hidden text-ellipsis">
                          CHIFFRE D'AFFAIRES (VENDU)
                        </td>
                        {columns.map(col => {
                          const val = getRevenueVal(col);
                          const rawVal = currentBudgetValues[col.prefix + 'revenue_total'];
                          return (
                            <td key={col.id} className={`p-2.5 border-r text-center ${col.cellBg}`}>
                              {col.isMirror || isGlobalView ? (
                                <div className="flex flex-col items-center justify-center">
                                  <span className="font-black text-[12px] text-navy">
                                    {formatCurrency(val)}
                                  </span>
                                  {col.id !== 'initial' && renderVariance(val, baseRevenue, false)}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center">
                                  <input 
                                    type="text" 
                                    className="w-full max-w-[145px] mx-auto border-2 border-yellow-accent/40 rounded-lg px-2 py-0.5 text-center text-[12px] font-black focus:border-yellow-accent outline-none shadow-2xs bg-white" 
                                    value={rawVal ? formatCurrency(rawVal) : ''} 
                                    onChange={(e) => handleUpdateBudgetVal(col.prefix + 'revenue_total', e.target.value)} 
                                    placeholder="0 €" 
                                  />
                                  {col.id !== 'initial' && renderVariance(val, baseRevenue, false)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* DÉPENSES PAR CATÉGORIES & FAMILLES & LIGNES */}
                    {(plData.expensesByCategory || []).map((cat: any) => {
                      const catMatches = !query || cat.label.toLowerCase().includes(query);
                      const matchingFamilies = (cat.families || []).filter((fam: any) => {
                        if (!query || catMatches) return true;
                        return fam.label.toLowerCase().includes(query);
                      });

                      if (query && !catMatches && matchingFamilies.length === 0) {
                        return null;
                      }

                      const baseCatVal = getCatVal(cat, initialCol);

                      return (
                        <React.Fragment key={cat.id}>
                          {/* Ligne Catégorie */}
                          <tr className="bg-gray-100/90 group font-bold">
                            <td className="p-2 border-r sticky left-0 z-10 bg-gray-100 font-black text-gray-800 text-[11px] uppercase shadow-sm w-[320px] flex items-center gap-2.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              <cat.icon size={16} className="text-navy shrink-0" /> 
                              <span>{cat.label}</span>
                            </td>
                            {columns.map(col => {
                              const val = getCatVal(cat, col);
                              const rawVal = currentBudgetValues[col.prefix + cat.id];
                              return (
                                <td key={col.id} className={`p-2 border-r text-center ${col.cellBg}`}>
                                  {col.isMirror || isGlobalView ? (
                                    <div className="flex flex-col items-center justify-center">
                                      <span className="font-black text-[11px] text-gray-800">
                                        {formatCurrency(val)}
                                      </span>
                                      {col.id !== 'initial' && renderVariance(val, baseCatVal, true)}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center">
                                      <input 
                                        type="text" 
                                        className="w-full max-w-[140px] mx-auto border border-gray-300 rounded-md px-2 py-0.5 text-center text-[11px] font-black focus:border-navy outline-none bg-white shadow-2xs" 
                                        value={rawVal ? formatCurrency(rawVal) : ''} 
                                        onChange={(e) => handleUpdateBudgetVal(col.prefix + cat.id, e.target.value)} 
                                        placeholder={val > 0 ? `${formatCurrency(val)} (auto)` : '0 €'} 
                                        title="Saisie directe catégorie (ou laissez vide pour sommer automatiquement les familles)"
                                      />
                                      {col.id !== 'initial' && renderVariance(val, baseCatVal, true)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Familles de la catégorie */}
                          {matchingFamilies.map((fam: any) => {
                            const baseFamVal = getFamVal(fam, initialCol);
                            const expensesForFam = currentManualExpenses.filter(e => e.familyId === fam.id);
                            const hasExpenses = expensesForFam.length > 0;

                            return (
                              <React.Fragment key={fam.id}>
                                <tr className="bg-white hover:bg-gray-50/70 transition-colors">
                                  <td className="p-1.5 pl-8 border-r sticky left-0 z-10 bg-white font-bold text-gray-600 text-[10.5px] uppercase shadow-sm w-[320px] whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-between">
                                    <span className="truncate">{fam.label}</span>
                                    {hasExpenses && showExpenseLinesInBudget && (
                                      <span className="text-[9px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.2 rounded shrink-0">
                                        {expensesForFam.length} ligne{expensesForFam.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </td>
                                  {columns.map(col => {
                                    const val = getFamVal(fam, col);
                                    const rawVal = currentBudgetValues[col.prefix + fam.id];
                                    return (
                                      <td key={col.id} className={`p-1.5 border-r text-center ${col.cellBg}`}>
                                        {col.isMirror || isGlobalView ? (
                                          <div className="flex flex-col items-center justify-center">
                                            <span className="font-bold text-[10.5px] text-gray-700">
                                              {formatCurrency(val)}
                                            </span>
                                            {col.id !== 'initial' && renderVariance(val, baseFamVal, true)}
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center justify-center">
                                            <input 
                                              type="text" 
                                              className="w-full max-w-[130px] mx-auto border border-gray-200 rounded px-2 py-0.5 text-center text-[10px] font-bold focus:border-navy outline-none bg-white shadow-2xs" 
                                              value={rawVal ? formatCurrency(rawVal) : ''} 
                                              onChange={(e) => handleUpdateBudgetVal(col.prefix + fam.id, e.target.value)} 
                                              placeholder={val > 0 ? `${formatCurrency(val)} (auto)` : '0 €'} 
                                            />
                                            {col.id !== 'initial' && renderVariance(val, baseFamVal, true)}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>

                                {/* Lignes détaillées de dépenses sous chaque famille */}
                                {showExpenseLinesInBudget && expensesForFam.map(exp => {
                                  const baseExpVal = getExpVal(exp, initialCol);
                                  return (
                                    <tr key={exp.id} className="bg-slate-50/40 hover:bg-slate-100/50 text-gray-500 transition-colors">
                                      <td className="p-1 pl-14 border-r sticky left-0 z-10 bg-slate-50/90 text-[9.5px] shadow-sm w-[320px] whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-navy/30 shrink-0" />
                                        <span className="truncate font-medium text-gray-600">{exp.label}</span>
                                      </td>
                                      {columns.map(col => {
                                        const val = getExpVal(exp, col);
                                        const rawVal = currentBudgetValues[col.prefix + exp.id];
                                        return (
                                          <td key={col.id} className={`p-1 border-r text-center ${col.cellBg}`}>
                                            {col.isMirror || isGlobalView ? (
                                              <div className="flex flex-col items-center justify-center">
                                                <span className="font-semibold text-[9.5px] text-gray-600">
                                                  {formatCurrency(val)}
                                                </span>
                                                {col.id !== 'initial' && renderVariance(val, baseExpVal, true)}
                                              </div>
                                            ) : (
                                              <div className="flex flex-col items-center justify-center">
                                                <input 
                                                  type="text" 
                                                  className="w-full max-w-[115px] mx-auto border border-dashed border-gray-300 rounded px-1.5 py-0.2 text-center text-[9.5px] font-medium focus:border-navy outline-none bg-white" 
                                                  value={rawVal ? formatCurrency(rawVal) : ''} 
                                                  onChange={(e) => handleUpdateBudgetVal(col.prefix + exp.id, e.target.value)} 
                                                  placeholder="0 €" 
                                                />
                                                {col.id !== 'initial' && renderVariance(val, baseExpVal, true)}
                                              </div>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}

                    {/* TOTAL DÉPENSES */}
                    <tr className="bg-gray-200/80 font-black text-gray-800">
                      <td className="p-2.5 border-r sticky left-0 z-10 bg-gray-200 uppercase text-[11px] shadow-sm tracking-wider">
                        TOTAL DÉPENSES FY
                      </td>
                      {columns.map(col => {
                        const val = getTotalExpensesVal(col);
                        const baseExpenses = getTotalExpensesVal(initialCol);
                        return (
                          <td key={col.id} className={`p-2.5 border-r text-center ${col.cellBg}`}>
                            <div className="flex flex-col items-center justify-center">
                              <span className="font-black text-[11px] text-gray-900">
                                {formatCurrency(val)}
                              </span>
                              {col.id !== 'initial' && renderVariance(val, baseExpenses, true)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* LIGNE EBIT FY */}
                    {ebitMatches && (
                      <tr className="bg-navy text-white group font-black">
                        <td className="p-3 border-r sticky left-0 z-10 bg-navy font-black text-[12px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)] w-[320px] tracking-widest whitespace-nowrap overflow-hidden text-ellipsis">
                          <Zap size={18} className="inline mr-2 text-yellow-accent" /> EBIT FY
                        </td>
                        {columns.map(col => {
                          const val = getEbitVal(col);
                          return (
                            <td key={col.id} className="p-3 border-r text-center bg-navy text-yellow-accent">
                              <div className="flex flex-col items-center justify-center">
                                <span className="font-black text-[12px]">
                                  {formatCurrency(val)}
                                </span>
                                {col.id !== 'initial' && renderVariance(val, baseEbit, false)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    
                    {/* LIGNE MARGE EBIT (%) */}
                    {marginMatches && (
                      <tr className="bg-gray-800 text-white group font-black">
                        <td className="p-2.5 border-r sticky left-0 z-10 bg-[#2d3b4d] font-black text-[11px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] w-[320px] tracking-widest flex items-center gap-2">
                          <Percent size={14} className="text-yellow-accent" /> MARGE EBIT (%)
                        </td>
                        {columns.map(col => {
                          const val = getMarginVal(col);
                          return (
                            <td key={col.id} className="p-2.5 border-r text-center bg-gray-800 text-yellow-accent">
                              <div className="flex flex-col items-center justify-center">
                                <span className="font-black text-[11px]">
                                  {formatPercent(val)}
                                </span>
                                {col.id !== 'initial' && renderMarginVariance(val, baseMargin)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
          <div className="p-4 bg-gray-50 border-t flex items-center justify-between shrink-0 text-[10px] font-bold text-navy/60 uppercase tracking-wider">
             <div className="flex items-center gap-6">
               <div className="flex items-center gap-2">
                 <FileText size={15} />
                 <span>Budget : {globalFY} — {isGlobalView ? 'Consolidé (Global)' : globalCountry}</span>
               </div>
               <div className="flex items-center gap-4 text-[9px] font-semibold text-gray-500">
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 
                   Écart favorable (Surcroît de CA/EBIT ou économie de dépenses)
                 </span>
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 
                   Écart défavorable (Sous-performance CA/EBIT ou dépassement budgétaire)
                 </span>
               </div>
             </div>
             <p className="max-w-md text-right leading-relaxed italic font-normal text-gray-500 lowercase first-letter:uppercase">
               Le Trimestre 4 reflète automatiquement le réel du P&L (FY Total). Les reforecasts T1, T2 et T3 sont modifiables pour piloter les atterrissages.
             </p>
          </div>
        </div>
      )}

      {activePoMissionId && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200 border border-navy/10">
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 text-navy">
                <Hash size={18} />
                <h3 className="font-black text-xs uppercase tracking-widest">Commande Client (PO)</h3>
              </div>
              <button onClick={() => setActivePoMissionId(null)} className="text-gray-400 hover:text-navy transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-navy/5 p-3 rounded-lg border border-navy/5">
                <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest mb-1">Mission :</p>
                <p className="text-xs font-black text-navy truncate">
                  {missions.find(m => m.id === activePoMissionId)?.clientName} - {missions.find(m => m.id === activePoMissionId)?.name}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase px-1">Référence Commande / PO</label>
                <input 
                  autoFocus
                  type="text"
                  placeholder="Ex: PO-2025-12345"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-yellow-accent outline-none shadow-inner"
                  value={tempPo}
                  onChange={(e) => setTempPo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdatePo();
                    if (e.key === 'Escape') setActivePoMissionId(null);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setTempPo('');
                  }}
                  className="p-3 border-2 border-red-50 text-red-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                  title="Effacer le champ"
                >
                  <Trash size={16} />
                </button>
                <button 
                  onClick={() => setActivePoMissionId(null)}
                  className="flex-1 py-3 border-2 border-gray-100 rounded-xl font-black text-gray-400 uppercase text-[10px] tracking-widest hover:bg-gray-50 transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleUpdatePo}
                  className="flex-1 py-3 bg-navy text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-navy/90 shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Save size={14} className="text-yellow-accent" />
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCommentCell && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 border border-navy/10">
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-navy" />
                <h3 className="font-black text-xs text-navy uppercase tracking-widest">Commentaire Cellule</h3>
              </div>
              <button onClick={() => setActiveCommentCell(null)} className="text-gray-400 hover:text-navy transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-navy/5 p-3 rounded-lg border border-navy/5">
                <p className="text-[10px] font-bold text-navy/60 uppercase tracking-tighter mb-1">Période concernée :</p>
                <p className="text-xs font-black text-navy">
                  {MONTHS.find(m => m.id === activeCommentCell.monthId)?.label} {activeCommentCell.monthId === 0 ? currentYearInt + 1 : currentYearInt}
                </p>
              </div>
              <textarea 
                autoFocus
                placeholder="Saisissez votre note ici..."
                className="w-full h-32 border border-gray-200 rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-yellow-accent outline-none shadow-inner"
                value={activeCommentCell.currentComment}
                onChange={(e) => setActiveCommentCell({ ...activeCommentCell, currentComment: e.target.value })}
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setActiveCommentCell(null)}
                  className="flex-1 py-2 border rounded-lg font-bold text-gray-500 hover:bg-gray-50 transition-all text-xs"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleUpdateComment}
                  className="flex-1 py-2 bg-navy text-white rounded-lg font-bold hover:bg-navy/90 transition-all shadow-md text-xs flex items-center justify-center gap-2"
                >
                  <Save size={14} className="text-yellow-accent" />
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetTracking;