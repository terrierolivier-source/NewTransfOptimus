import React, { useState, useMemo } from 'react';
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
  FileSearch,
  CheckCircle2,
  Clock,
  Link,
  Hash,
  Trash
} from 'lucide-react';
import { getFiscalYear, generateId, getBusinessDays, calculateMonthlySmoothedRevenue, calculateTotalMissionRevenue } from '../utils';

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
  
  const [activeCommentCell, setActiveCommentCell] = useState<{
    type: 'billing' | 'expense';
    id: string;
    monthId: number;
    currentComment: string;
  } | null>(null);

  const [activePoMissionId, setActivePoMissionId] = useState<string | null>(null);
  const [tempPo, setTempPo] = useState<string>('');

  const { missions, globalCountry, globalFY, manualExpenses, budgetFamilies, budgetValues, users } = state;
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

      const processResource = (resId: string, label: string, resType: 'f' | 's') => {
        const autoId = `auto-${resType}-${resId}-${mission.id}`;
        const stored = storedExpenses.find(e => e.id === autoId);
        
        const categoryId = 'contractors';
        const familyId = 'fam-c1';

        const expense: ManualExpense = {
          id: autoId,
          label: `[${resType === 'f' ? 'FREE' : 'SST'}] ${label} (${mission.clientName})`,
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

      mission.freelanceStaffing?.forEach(f => processResource(f.id, `${f.firstName} ${f.lastName}`, 'f'));
      mission.subcontractorStaffing?.forEach(s => processResource(s.id, s.entity, 's'));
    });

    storedExpenses.filter(e => !e.id.startsWith('auto-')).forEach(e => combined.push(e));

    return combined;
  }, [manualExpenses, globalFY, globalCountry, isGlobalView, missions, autoDefaults, users]);

  const currentFamilies = useMemo(() => {
    const templateCountry = isGlobalView ? Country.FRANCE : (globalCountry as Country);
    return budgetFamilies[globalFY]?.[templateCountry] || [];
  }, [budgetFamilies, globalFY, globalCountry, isGlobalView]);

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
  
  const monthlyBillingTotals = useMemo(() => {
    const totals = Array(12).fill(0);
    billingRows.forEach(row => row.monthlyData.forEach((data, i) => totals[i] += (data.amount || 0)));
    return totals;
  }, [billingRows]);

  const handleUpdateAmount = (missionId: string, monthId: number, value: string) => {
    if (isGlobalView) return;
    const cleanValue = value.replace(/[^\d-]/g, '');
    if (cleanValue === '-' || cleanValue === '') return;
    const amount = parseFloat(cleanValue) || 0;
    
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;

    const newOverrides = { ...(mission.billingOverrides || {}) };
    if (!newOverrides[globalFY]) newOverrides[globalFY] = {};
    const existing = newOverrides[globalFY][monthId] || { amount: 0, isValidated: false };
    newOverrides[globalFY][monthId] = { ...existing, amount };

    updateState({ 
        missions: missions.map(m => m.id === missionId ? { ...m, billingOverrides: newOverrides } : m) 
    });
  };

  const toggleValidation = (missionId: string, monthId: number) => {
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
    updateState({ missions: missions.map(m => m.id === missionId ? { ...m, billingOverrides: newOverrides } : m) });
  };

  const handleUpdateComment = () => {
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
        updateState({ missions: missions.map(m => m.id === id ? { ...m, billingOverrides: newOverrides } : m) });
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
      updateState({ manualExpenses: { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } } });
    }
    setActiveCommentCell(null);
  };

  const handleUpdatePo = () => {
    if (!activePoMissionId) return;
    const updatedMissions = missions.map(m => 
      m.id === activePoMissionId ? { ...m, customerPo: tempPo.trim() || undefined } : m
    );
    updateState({ missions: updatedMissions });
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
    updateState({ manualExpenses: { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } } });
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
    else if (currentStatus === 'FNP') nextStatus = 'VALIDATED';
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
    updateState({ manualExpenses: { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: nextBucket } } });
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
    updateState({ budgetFamilies: { ...budgetFamilies, [globalFY]: { ...budgetFamilies[globalFY], [countryKey]: nextFams } } });
  };

  const handleDeleteFamily = (id: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const nextFams = (budgetFamilies[globalFY][countryKey] || []).filter(f => f.id !== id);
    const nextExpenses = (manualExpenses[globalFY][countryKey] || []).filter(e => e.familyId !== id);
    updateState({ 
      budgetFamilies: { ...budgetFamilies, [globalFY]: { ...budgetFamilies[globalFY], [countryKey]: nextFams } },
      manualExpenses: { ...manualExpenses, [globalFY]: { ...manualExpenses[globalFY], [countryKey]: nextExpenses } }
    });
  };

  const handleAddExpenseRow = (categoryId: string, familyId: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const newExpense: ManualExpense = { id: generateId(), label: 'Libellé ligne...', categoryId, familyId, monthlyAmounts: {}, monthlyComments: {}, monthlyStatuses: {} };
    const nextManual = { ...manualExpenses };
    if (!nextManual[globalFY]) nextManual[globalFY] = {};
    nextManual[globalFY][countryKey] = [...(nextManual[globalFY][countryKey] || []), newExpense];
    updateState({ manualExpenses: nextManual });
  };

  const handleUpdateExpenseLabel = (id: string, label: string) => {
    if (isGlobalView || id.startsWith('auto-')) return;
    const countryKey = globalCountry as string;
    const next = (manualExpenses[globalFY][countryKey] || []).map(e => e.id === id ? { ...e, label } : e);
    updateState({ manualExpenses: { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: next } } });
  };

  const handleDeleteExpenseRow = (id: string) => {
    if (isGlobalView || id.startsWith('auto-')) return;
    const countryKey = globalCountry as string;
    const next = (manualExpenses[globalFY][countryKey] || []).filter(e => e.id !== id);
    updateState({ manualExpenses: { ...manualExpenses, [globalFY]: { ...(manualExpenses[globalFY] || {}), [countryKey]: next } } });
  };

  const handleUpdateBudgetVal = (id: string, value: string) => {
    if (isGlobalView) return;
    const countryKey = globalCountry as string;
    const cleanValue = value.replace(/[^\d-]/g, '');
    const amount = cleanValue === '' ? 0 : parseFloat(cleanValue) || 0;
    const nextValues = { ...(budgetValues[globalFY]?.[countryKey] || {}), [id]: amount };
    updateState({ budgetValues: { ...budgetValues, [globalFY]: { ...(budgetValues[globalFY] || {}), [countryKey]: nextValues } } });
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex bg-white p-1 rounded-xl border shadow-sm w-fit">
        <button onClick={() => setActiveTab('billing')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all ${activeTab === 'billing' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><ReceiptEuro size={16} /> SUIVI FACTURATION CLIENTS</button>
        <button onClick={() => setActiveTab('expenses')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all ${activeTab === 'expenses' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><Wallet size={16} /> SUIVI DÉPENSES</button>
        <button onClick={() => setActiveTab('pl')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all ${activeTab === 'pl' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><BarChart3 size={16} /> SUIVI P&L</button>
        <button onClick={() => setActiveTab('budget')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black transition-all ${activeTab === 'budget' ? 'bg-navy text-yellow-accent shadow-md' : 'text-gray-400 hover:text-navy'}`}><Target size={16} /> BUDGET</button>
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
                  <th className="p-4 border-b border-r bg-white sticky left-0 z-[60] w-[420px] min-w-[420px] shadow-sm">Mission / Client</th>
                  <th className="p-4 border-b border-r bg-white text-navy sticky left-[420px] z-[60] w-[110px] min-w-[110px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Total Mission</th>
                  {MONTHS.map(m => <th key={m.id} className="p-4 border-b text-center min-w-[110px] bg-white">{m.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {billingRows.map((row) => (
                  <tr key={row.mission.id} className="group hover:bg-navy/5 even:bg-slate-50/50">
                    <td className="py-2 px-4 border-r sticky left-0 z-30 bg-white group-even:bg-slate-50 group-hover:bg-slate-50 transition-colors shadow-sm w-[420px] min-w-[420px]">
                      <div className="flex items-start justify-between group/name">
                        <div className="min-w-0">
                          <div className="font-black text-navy uppercase text-[10px] whitespace-nowrap leading-tight truncate">{row.mission.clientName}</div>
                          <div className="text-[10px] text-gray-500 font-bold whitespace-nowrap mt-1 leading-normal truncate">{row.mission.name}</div>
                          {row.mission.customerPo && (
                            <div className="mt-1 flex items-center gap-1.5 text-[8px] font-black text-navy/40 bg-navy/5 px-1.5 py-0.5 rounded w-fit border border-navy/5">
                              <Hash size={10} className="text-yellow-accent" />
                              PO: {row.mission.customerPo}
                            </div>
                          )}
                        </div>
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
                      </div>
                    </td>
                    <td className="py-2 px-4 border-r font-black text-navy text-[10px] text-right sticky left-[420px] z-30 bg-white group-even:bg-slate-50 group-hover:bg-slate-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[110px] min-w-[110px]">
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 text-[8px] uppercase tracking-tighter mb-0.5">Contrat Total</span>
                        <span className="border-b border-gray-100 pb-1 w-full text-right">{formatCurrency(row.totalMissionOverall)}</span>
                        <div className="mt-1 flex flex-col items-end opacity-80">
                          <span className="text-navy">{formatCurrency(row.totalFY)}</span>
                          <span className="text-[7px] text-gray-400 font-black uppercase tracking-tighter mt-0.5 leading-none">Total {globalFY}</span>
                        </div>
                      </div>
                    </td>
                    {row.monthlyData.map((data, i) => (
                      <td key={i} className={`py-1 px-2 text-center border-r relative group/cell ${data.isValidated ? 'bg-emerald-50/10' : data.amount !== 0 ? 'bg-red-500/5' : 'bg-transparent'}`}>
                        <div className="flex items-center gap-1.5 justify-end px-1 h-full min-h-[32px] relative z-10">
                          {!isGlobalView && (
                            <button 
                              onClick={() => setActiveCommentCell({ type: 'billing', id: row.mission.id, monthId: MONTHS[i].id, currentComment: data.comment || '' })}
                              className={`absolute top-0.5 left-0.5 p-1 rounded-md transition-all z-10 ${data.comment ? 'text-navy bg-yellow-accent shadow-md ring-1 ring-yellow-accent' : 'text-gray-400 opacity-20 group-hover/cell:opacity-100 hover:text-navy hover:bg-navy/10 hover:opacity-100'}`}
                              title={data.comment || "Ajouter un commentaire"}
                            >
                              <MessageSquare size={14} fill={data.comment ? "currentColor" : "none"} strokeWidth={data.comment ? 1.5 : 2.5} />
                            </button>
                          )}
                          <input 
                            type="text" 
                            disabled={isGlobalView} 
                            className={`w-full bg-transparent text-right text-[10px] font-black focus:outline-none ${data.isValidated ? 'text-emerald-600' : data.amount === 0 ? 'text-gray-300' : data.amount < 0 ? 'text-emerald-500' : 'text-red-500'}`} 
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
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-50 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
                <tr className="font-black text-[10px] uppercase tracking-widest border-b border-white/5">
                  <td className="py-1.5 px-4 border-r sticky left-0 z-[60] bg-navy shadow-sm w-[420px] min-w-[420px]">Totaux Mensuels</td>
                  <td className="py-1.5 px-4 border-r text-right text-yellow-accent sticky left-[420px] z-[60] bg-navy shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[110px] min-w-[110px]">
                    {billingRows.reduce((a, b) => a + b.totalFY, 0) === 0 ? <span className="text-white/40">- €</span> : formatCurrency(billingRows.reduce((a, b) => a + b.totalFY, 0))}
                  </td>
                  {monthlyBillingTotals.map((total, i) => (
                    <td key={i} className="py-1.5 px-4 text-center border-r border-white/10 bg-navy min-w-[110px]">
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
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-amber-500/20 border border-amber-500"></div> <span>FNP</span></div>
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-500/20 border border-emerald-500"></div> <span>Validé</span></div>
                </div>
                {isGlobalView && <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Lecture seule (Global)</span>}
             </div>
          </div>
          <div className="flex-1 overflow-auto relative bg-white">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-50 bg-white shadow-sm">
                <tr className="text-[9px] uppercase font-black text-gray-400 border-b bg-white">
                  <th className="p-4 border-b border-r bg-white sticky left-0 z-[60] w-[650px] shadow-sm">Catégorie / Famille / Libellé Dépense</th>
                  {MONTHS.map(m => <th key={m.id} className="p-4 border-b text-center min-w-[110px] bg-white">{m.label}</th>)}
                  <th className="p-4 border-b border-l text-center bg-gray-50 min-w-[120px]">Total FY</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {CATEGORIES_CONFIG.map(cat => {
                  return (
                    <React.Fragment key={cat.id}>
                      <tr className="bg-navy text-white">
                        <td className="p-4 border-r sticky left-0 z-30 bg-navy font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-between group shadow-sm w-[650px]">
                          <div className="flex items-center gap-3"><cat.icon size={16} className="text-yellow-accent" /> {cat.label}</div>
                          {!isGlobalView && <button type="button" onClick={() => handleAddFamily(cat.id)} className="p-1 hover:bg-white hover:text-navy rounded-md transition-all flex items-center gap-1.5 px-3 border border-white/20 bg-white/10 shadow-sm"><Layers size={10} strokeWidth={4} /> <span className="text-[8px] font-black uppercase">Famille</span></button>}
                        </td>
                        {calculateCategoryTotals(cat.id).map((v, i) => (
                          <td key={i} className={`p-4 text-center font-black text-[10px] bg-navy ${v < 0 ? 'text-emerald-400' : 'text-white'}`}>
                            {formatCurrency(v)}
                          </td>
                        ))}
                        <td className="p-4 border-l text-center font-black text-[10px] bg-navy text-yellow-accent">{formatCurrency(calculateCategoryTotals(cat.id).reduce((a, b) => a + b, 0))}</td>
                      </tr>
                      {(currentFamilies || []).filter(f => f.categoryId === cat.id).map(fam => {
                        return (
                          <React.Fragment key={fam.id}>
                            <tr className="bg-gray-100/90 border-y">
                              <td className="py-2.5 pl-10 pr-4 border-r sticky left-0 z-30 bg-gray-100 flex items-center justify-between shadow-sm w-[650px]">
                                <input type="text" disabled={isGlobalView} className="bg-transparent font-black text-navy text-[10px] uppercase focus:outline-none flex-1 whitespace-normal break-words" value={fam.label} onChange={(e) => handleUpdateFamilyLabel(fam.id, e.target.value)} />
                                {!isGlobalView && (
                                  <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => handleAddExpenseRow(cat.id, fam.id)} className="p-1 hover:bg-navy hover:text-white rounded-md transition-all flex items-center gap-1.5 px-3 bg-white shadow-sm border border-navy/10"><Plus size={10} /> <span className="text-[8px] font-black uppercase">Ligne</span></button>
                                    <button type="button" onClick={() => handleDeleteFamily(fam.id)} className="p-1 hover:bg-red-500 hover:text-white rounded-md transition-all px-2 text-red-500" title="Supprimer la famille"><Trash2 size={12} /></button>
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
                            {currentManualExpenses.filter(e => e.familyId === fam.id).map(exp => {
                              const isAuto = exp.id.startsWith('auto-');
                              return (
                                <tr key={exp.id} className={`group hover:bg-navy/[0.03] ${isAuto ? 'italic' : ''}`}>
                                  <td className="py-2 pl-20 pr-4 border-r sticky left-0 z-30 bg-white group-hover:bg-slate-50 transition-colors shadow-sm w-[650px] flex items-center justify-between">
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
                                     {isAuto && <span className="text-[8px] font-black uppercase text-blue-400 tracking-tighter">Automatique (Staffing)</span>}
                                  </td>
                                  {MONTHS.map((m, idx) => {
                                    const val = exp.monthlyAmounts?.[m.id] || 0;
                                    const comment = exp.monthlyComments?.[m.id] || '';
                                    const status = exp.monthlyStatuses?.[m.id] || 'NONE';
                                    
                                    const statusStyles = {
                                      NONE: 'bg-transparent',
                                      FNP: 'bg-amber-500/10',
                                      VALIDATED: 'bg-emerald-500/10'
                                    };

                                    return (
                                      <td key={idx} className={`p-1.5 border-r relative group/cell transition-colors duration-200 ${statusStyles[status]}`}>
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
                                            className={`w-full bg-transparent text-right text-[10px] font-bold focus:outline-none px-1 ${val < 0 ? 'text-emerald-600' : ''} ${status === 'VALIDATED' ? 'text-emerald-700' : status === 'FNP' ? 'text-amber-700' : ''} ${isAuto ? 'text-blue-700 font-black' : ''}`} 
                                            value={val === 0 ? '- €' : formatCurrency(val)} 
                                            onChange={(e) => handleUpdateExpenseAmount(exp.id, m.id, e.target.value)} 
                                          />
                                          {!isGlobalView && (isAuto || val !== 0) && (
                                            <button 
                                              onClick={() => handleToggleExpenseStatus(exp.id, m.id)}
                                              className={`ml-1 p-0.5 rounded transition-all opacity-0 group-hover/cell:opacity-100 ${status === 'VALIDATED' ? 'text-emerald-600 opacity-100' : status === 'FNP' ? 'text-amber-600 opacity-100' : 'text-gray-300 hover:text-navy'}`}
                                              title={status === 'VALIDATED' ? 'Facture Validée' : status === 'FNP' ? 'FNP (Facture Non Parvenue)' : 'Définir statut'}
                                            >
                                              {status === 'VALIDATED' ? <CheckCircle2 size={12} strokeWidth={3} /> : status === 'FNP' ? <Clock size={12} strokeWidth={3} /> : <FileSearch size={12} />}
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className={`p-1.5 border-l text-center font-bold text-[10px] ${(Object.values(exp.monthlyAmounts || {}) as number[]).reduce((a: number, b: number) => a + b, 0) < 0 ? 'text-emerald-600' : 'text-navy'} ${isAuto ? 'text-blue-800 font-black' : ''}`}>
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
                })}
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
             {!isGlobalView && (
               <button onClick={() => setIsBudgetEditMode(!isBudgetEditMode)} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase transition-all shadow-sm ${isBudgetEditMode ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/10 border-white/10 text-white'}`}>{isBudgetEditMode ? <CheckCircle size={14} /> : <PencilLine size={14} />}{isBudgetEditMode ? 'Quitter Edition Budget' : 'Modifier Objectifs'}</button>
             )}
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

                  <tr className="h-4 bg-gray-50/50"><td colSpan={18}></td></tr>

                  {(plData.expensesByCategory || []).map((cat: any) => {
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
                        {(cat.families || []).map((fam: any) => {
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

                  <tr className="bg-navy text-white group">
                    <td className="p-6 border-r sticky left-0 z-10 bg-navy font-black text-[12px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)] w-[400px]"><Zap size={18} className="inline mr-2 text-yellow-accent" /> EBIT</td>
                    {(plData.ebitMonthly as number[]).map((v: number, i: number) => <td key={i} className={`p-6 text-center font-black text-[11px] ${v < 0 ? 'text-red-400' : 'text-yellow-accent'}`}>{formatCurrency(v)}</td>)}
                    <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-blue-200">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fytd)}</td>
                    <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-amber-200">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fytg)}</td>
                    <td className="p-6 border-l text-center font-black text-[12px] bg-navy text-yellow-accent">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fy)}</td>
                    <td className="p-6 border-l text-center font-black text-[11px] bg-navy text-white/60">{formatCurrency(plData.totalBudgetEbit as number)}</td>
                    <td className="p-6 border-l text-center bg-gray-800 font-black text-[11px]">{formatCurrency(plData.getAggregates(plData.ebitMonthly).fy - (plData.totalBudgetEbit))}</td>
                  </tr>
                  
                  <tr className="bg-navy/80 text-white/90">
                    <td className="p-4 border-r border-white/5 sticky left-0 z-10 bg-[#2d3b4d] font-black text-[11px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] w-[400px] flex items-center gap-2"><Percent size={14} className="text-yellow-accent" /> MARGE EBIT (%)</td>
                    {(plData.ebitPercentMonthly as number[]).map((v: number, i: number) => <td key={i} className={`p-4 text-center font-black text-[10px] ${v < 0 ? 'text-red-400' : 'text-white'}`}>{formatPercent(v)}</td>)}
                    <td className="p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60">{formatPercent(plData.ebitPercentAggregates.fytd)}</td>
                    <td className="p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60">{formatPercent(plData.ebitPercentAggregates.fytg)}</td>
                    <td className="p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 text-yellow-accent">{formatPercent(plData.ebitPercentAggregates.fy)}</td>
                    <td className="p-4 border-l border-white/5 text-center font-black text-[10px] bg-navy/60 text-white/40">{formatPercent(plData.ebitPercentAggregates.budget)}</td>
                    <td className="p-4 border-l border-white/5 text-center bg-gray-800 font-black text-[10px]">{formatPercent((plData.ebitPercentAggregates.fy) - (plData.ebitPercentAggregates.budget))}</td>
                  </tr>
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
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[75vh] w-1/2 mx-auto">
          <div className="p-4 bg-gray-50 border-b flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3"><Goal size={20} className="text-navy" /><h3 className="font-black text-xs text-navy uppercase tracking-widest leading-none">Définition Objectifs Budget {globalCountry} ({globalFY})</h3></div>
             {isGlobalView ? (
               <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Lecture Seule (Vue Globale)</span>
             ) : (
               <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Mode Édition Activé</span>
             )}
          </div>
          <div className="flex-1 overflow-auto relative">
            {!plData ? null : (
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-30 shadow-sm">
                  <tr className="text-[10px] uppercase font-black text-gray-500 bg-gray-100 border-b">
                    <th className="p-3 border-b border-r bg-gray-100 sticky left-0 z-40 w-[320px] shadow-sm tracking-widest whitespace-nowrap">Poste / Nature</th>
                    <th className="p-3 border-b border-l text-center bg-navy text-yellow-accent min-w-[150px] z-10 tracking-widest uppercase">Objectif Budget Global Annuel</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="bg-navy/5 group">
                    <td className="p-2.5 border-r sticky left-0 z-10 bg-gray-50 font-black text-navy text-[12px] shadow-sm uppercase w-[320px] whitespace-nowrap overflow-hidden text-ellipsis">CHIFFRE D'AFFAIRES (VENDU)</td>
                    <td className="p-2.5 border-l text-center font-black text-[12px] bg-yellow-accent/5">
                      {isGlobalView ? formatCurrency(plData.totalBudgetRevenue) : (
                        <input 
                          type="text" 
                          className="w-full max-w-[180px] mx-auto border-2 border-yellow-accent/20 rounded-lg px-3 py-1 text-center text-[12px] font-black focus:border-yellow-accent outline-none shadow-sm" 
                          value={currentBudgetValues['revenue_total'] ? formatCurrency(currentBudgetValues['revenue_total']) : '0 €'} 
                          onChange={(e) => handleUpdateBudgetVal('revenue_total', e.target.value)} 
                          placeholder="0 €" 
                        />
                      )}
                    </td>
                  </tr>

                  {(plData.expensesByCategory || []).map((cat: any) => {
                    const catBudget = currentBudgetValues[cat.id] || 0;
                    return (
                      <React.Fragment key={cat.id}>
                        <tr className="bg-gray-100 group">
                            <td className="p-2.5 border-r sticky left-0 z-10 bg-gray-100 font-black text-gray-700 text-[11px] uppercase shadow-sm w-[320px] flex items-center gap-3 whitespace-nowrap overflow-hidden text-ellipsis">
                              <cat.icon size={18} className="text-navy" /> {cat.label}
                            </td>
                            <td className="p-2.5 border-l text-center font-black text-[11px] bg-gray-100/50">
                              {isGlobalView ? formatCurrency(catBudget) : (
                                <input 
                                  type="text" 
                                  className="w-full max-w-[180px] mx-auto border border-gray-300 rounded-lg px-3 py-0.5 text-center text-[11px] font-black focus:border-navy outline-none" 
                                  value={currentBudgetValues[cat.id] ? formatCurrency(catBudget) : '0 €'} 
                                  onChange={(e) => handleUpdateBudgetVal(cat.id, e.target.value)} 
                                  placeholder="0 €" 
                                />
                              )}
                            </td>
                        </tr>
                        {(cat.families || []).map((fam: any) => {
                            const famBudget = currentBudgetValues[fam.id] || 0;
                            return (
                              <tr key={fam.id} className="bg-white/50 hover:bg-gray-50/50">
                                <td className="p-1.5 pl-10 border-r sticky left-0 z-10 bg-white font-black text-gray-500 text-[10px] uppercase shadow-sm w-[320px] whitespace-nowrap overflow-hidden text-ellipsis">
                                  {fam.label}
                                </td>
                                <td className="p-1.5 border-l text-center font-black text-[10px] bg-white">
                                  {isGlobalView ? formatCurrency(famBudget) : (
                                    <input 
                                      type="text" 
                                      className="w-full max-w-[150px] mx-auto border border-gray-200 rounded px-2 py-0.5 text-center text-[10px] font-bold" 
                                      value={currentBudgetValues[fam.id] ? formatCurrency(famBudget) : '0 €'} 
                                      onChange={(e) => handleUpdateBudgetVal(fam.id, e.target.value)} 
                                      placeholder="0 €" 
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <tr className="bg-navy text-white group">
                    <td className="p-4 border-r sticky left-0 z-10 bg-navy font-black text-[13px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)] w-[320px] tracking-widest whitespace-nowrap overflow-hidden text-ellipsis"><Zap size={20} className="inline mr-3 text-yellow-accent" /> EBIT FY BUDGETÉ</td>
                    <td className="p-4 border-l text-center font-black text-[13px] bg-navy text-yellow-accent">{formatCurrency(plData.totalBudgetEbit)}</td>
                  </tr>
                  
                  <tr className="bg-gray-800 text-white group">
                    <td className="p-3 border-r sticky left-0 z-10 bg-[#2d3b4d] font-black text-[11px] uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] w-[320px] tracking-widest flex items-center gap-2"><Percent size={14} className="text-yellow-accent" /> MARGE EBIT (%) BUDGETÉE</td>
                    <td className="p-3 border-l text-center font-black text-[11px] bg-gray-800 text-yellow-accent">{formatPercent(plData.ebitPercentAggregates.budget)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          <div className="p-5 bg-gray-50 border-t flex items-center justify-between shrink-0 text-[10px] font-black text-navy/40 uppercase tracking-widest">
             <div className="flex items-center gap-4"><FileText size={16} /> <span>Budget : {globalFY} - {isGlobalView ? 'Consolidé' : globalCountry}</span></div>
             <p className="max-w-md text-right leading-relaxed italic">Les cibles de budget sont définies par catégorie et famille pour une vision stratégique globale.</p>
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