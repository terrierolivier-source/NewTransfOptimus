import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, Target, Briefcase, Users, AlertCircle, 
  UserCheck, BarChart3, CloudRain, 
  CloudLightning, UserX, Clock, ClipboardCheck, 
  Frown,
  Euro, AlertTriangle, ShieldAlert, X,
  ExternalLink,
  Coins,
  HandCoins
} from 'lucide-react';
import { AppState, Country, BillingMode, MissionStatus, Role, TimesheetStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Label, LabelList,
  LineChart, Line, ReferenceLine, ReferenceArea, ComposedChart, Area
} from 'recharts';
import { getBusinessDays, getMonday, getFiscalYear, calculateSmoothedMissionRevenue, calculateTotalMissionRevenue } from '../utils';
import { parseISO, format, isAfter, startOfToday, subWeeks, endOfWeek, eachDayOfInterval, isBefore, startOfDay, endOfDay, startOfWeek, endOfMonth, addDays, eachWeekOfInterval, isValid, max, min, differenceInDays, startOfMonth } from 'date-fns';

interface DashboardProps {
  state: AppState;
}

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  const { missions, planning, timesheets, collaborators, globalCountry, globalFY, budgetValues, holidays, manualExpenses } = state;
  const today = startOfToday();
  const [selectedTypology, setSelectedTypology] = useState<string | null>(null);

  // Helper pour identifier les collaborateurs opérationnels éligibles pour le Dashboard
  const OPERATIONAL_GRADES = ["consultant", "delivery manager", "principal"];
  const isOperationalCollaborator = (c: any) => {
    if (!c || !c.active || !c.grade) return false;
    const normalizedGrade = String(c.grade).trim().toLowerCase();
    return OPERATIONAL_GRADES.includes(normalizedGrade);
  };

  // Helper pour formater avec le point comme séparateur de milliers (standard européen/allemand)
  const formatNumberWithDots = (val: number) => 
    new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(val));

  // --- FILTRES DE BASE ---
  const filteredMissions = useMemo(() => 
    missions.filter(m => (globalCountry === 'Global' || m.country === globalCountry)),
    [missions, globalCountry]
  );

  const filteredCollaboratorsForStats = useMemo(() => 
    collaborators.filter(c => (globalCountry === 'Global' || c.country === globalCountry)),
    [collaborators, globalCountry]
  );

  // --- CALCULS DE RENTABILITÉ ---
  const missionMetrics = useMemo(() => {
    const fyYear = parseInt(globalFY.replace('FY', ''));
    
    // Dates de l'exercice fiscal pour filtrer les coûts de production
    // Le FY commence le 1er Février et se finit le 31 Janvier de l'année suivante
    const fyStart = startOfDay(new Date(fyYear, 1, 1));
    const fyEnd = endOfDay(new Date(fyYear + 1, 0, 31));

    return filteredMissions.map(m => {
      let fyProdCost = 0;
      let totalProdCost = 0;

      // --- CALCUL COÛT PROD FY ---
      
      // 1. STAFFING INTERNE
      (m.internalStaffing || []).forEach(row => {
        const collabId = row.collaboratorId || row.userId;
        const collab = collaborators.find(c => c.id === collabId);
        const cjm = row.cjm || collab?.cjm || 500;
        const mCollabTS = timesheets.filter(t => t.missionId === m.id && (t.collaboratorId === collabId || t.userId === collabId) && t.status === 'Validé');
        
        // RÉEL (Basé sur les timesheets validées)
        mCollabTS.forEach(ts => {
          const tsWeekStart = parseISO(ts.weekStart);
          const tsDate = startOfDay(addDays(tsWeekStart, ts.dayIndex));
          const cost = (ts.percentage / 100) * cjm;
          
          if (!isBefore(tsDate, fyStart) && !isAfter(tsDate, fyEnd)) {
            fyProdCost += cost;
          }
          totalProdCost += cost;
        });

        // PRÉVISIONNEL (Semaines sans timesheet dans l'intervalle de mission)
        const start = parseISO(row.startDate);
        const end = parseISO(row.endDate);
        if (isValid(start) && isValid(end)) {
          try {
            const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
            weeks.forEach(wStart => {
              const weekKey = format(wStart, 'yyyy-MM-dd');
              if (!mCollabTS.some(t => t.weekStart === weekKey)) {
                const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
                // Intersection Semaine / Mission / FY
                const overlapStart = max([wStart, start, fyStart]);
                const overlapEnd = min([wEnd, end, fyEnd]);
                
                if (overlapStart <= overlapEnd) {
                  const bDays = getBusinessDays(overlapStart, overlapEnd, holidays, m.country);
                  const cost = bDays.length * (row.percentage / 100) * cjm;
                  fyProdCost += cost;
                }

                // Pour le total de la mission (hors FY), on prend juste l'intersection Semaine / Mission
                const globalOverlapStart = max([wStart, start]);
                const globalOverlapEnd = min([wEnd, end]);
                if (globalOverlapStart <= globalOverlapEnd) {
                   const gBDays = getBusinessDays(globalOverlapStart, globalOverlapEnd, holidays, m.country);
                   totalProdCost += gBDays.length * (row.percentage / 100) * cjm;
                }
              }
            });
          } catch(e) {}
        }
      });

      // 2. FREELANCES (Avec Overrides du Suivi Facturation)
      (m.freelanceStaffing || []).forEach(row => {
        const autoId = `auto-f-${row.id}-${m.id}`;
        const start = parseISO(row.startDate);
        const end = parseISO(row.endDate);
        if (!isValid(start) || !isValid(end)) return;

        const manualExp = manualExpenses[globalFY]?.[m.country]?.find(e => e.id === autoId);
        const fyMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
        
        fyMonths.forEach(monthId => {
          const override = manualExp?.monthlyAmounts?.[monthId];
          if (override !== undefined) {
            fyProdCost += Number(override);
          } else {
            const year = monthId === 0 ? fyYear + 1 : fyYear;
            const monthStart = startOfMonth(new Date(year, monthId, 1));
            const monthEnd = endOfMonth(monthStart);
            const overlapStart = max([monthStart, start, fyStart]);
            const overlapEnd = min([monthEnd, end, fyEnd]);
            if (overlapStart <= overlapEnd) {
              const bDays = getBusinessDays(overlapStart, overlapEnd, holidays, m.country);
              fyProdCost += bDays.length * (row.percentage / 100) * row.cjm;
            }
          }
        });

        // Lifecycle Total (approximation simplifiée pour le lifecycle)
        const bDaysTotal = getBusinessDays(start, end, holidays, m.country);
        totalProdCost += bDaysTotal.length * (row.percentage / 100) * row.cjm;
      });

      // 3. SOUS-TRAITANTS (SOUS-CONTRAT)
      (m.subcontractorStaffing || []).forEach(row => {
        const autoId = `auto-s-${row.id}-${m.id}`;
        const start = parseISO(row.startDate);
        const end = parseISO(row.endDate);
        if (!isValid(start) || !isValid(end)) return;
        const totalDays = Math.max(1, differenceInDays(end, start) + 1);
        const dailyRate = row.amount / totalDays;

        const manualExp = manualExpenses[globalFY]?.[m.country]?.find(e => e.id === autoId);
        const fyMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
        
        fyMonths.forEach(monthId => {
          const override = manualExp?.monthlyAmounts?.[monthId];
          if (override !== undefined) {
            fyProdCost += Number(override);
          } else {
            const year = monthId === 0 ? fyYear + 1 : fyYear;
            const monthStart = startOfMonth(new Date(year, monthId, 1));
            const monthEnd = endOfMonth(monthStart);
            const overlapStart = max([monthStart, start, fyStart]);
            const overlapEnd = min([monthEnd, end, fyEnd]);
            if (overlapStart <= overlapEnd) {
               const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
               fyProdCost += overlapDays * dailyRate;
            }
          }
        });
        totalProdCost += row.amount;
      });

      // 4. AUTRES DÉPENSES MANUELLES DIRECTES (PROD)
      const directMissionExpenses = (manualExpenses[globalFY]?.[m.country] || []).filter(e => e.id.endsWith(`-${m.id}`) && !e.id.startsWith('auto-'));
      directMissionExpenses.forEach(exp => {
        Object.values(exp.monthlyAmounts).forEach(amt => {
          fyProdCost += Number(amt);
          totalProdCost += Number(amt);
        });
      });

      // --- REVENU ---
      const fyRevenue = calculateSmoothedMissionRevenue(m, globalFY);
      const totalRevenue = calculateTotalMissionRevenue(m);

      const totalMargin = totalRevenue > 0 ? ((totalRevenue - totalProdCost) / totalRevenue) * 100 : 0;
      const fyMargin = fyRevenue > 0 ? ((fyRevenue - fyProdCost) / fyRevenue) * 100 : 0;

      return { 
        mission: m, 
        fyRevenue, 
        totalRevenue, 
        totalProdCost, 
        fyProdCost, 
        totalMargin, 
        fyMargin,
        prodCost: totalProdCost, 
        margin: totalMargin 
      };
    });
  }, [filteredMissions, timesheets, planning, collaborators, holidays, globalFY, manualExpenses]);

  // --- FILTRAGE PAR FY SÉLECTIONNÉ (Corrigé pour inclure tout impact financier et temporel) ---
  const missionsForSelectedFY = useMemo(() => {
    const fyYear = parseInt(globalFY.replace('FY', ''));
    
    // Période de l'exercice fiscal (FY commence le 1er Février)
    const fyStart = startOfDay(new Date(fyYear, 1, 1));
    const fyEnd = endOfDay(new Date(fyYear + 1, 0, 31));
    
    return missionMetrics.filter(mm => {
      const { mission: m, fyRevenue, fyProdCost } = mm;
      
      // On inclut toutes les missions qui ont un impact financier sur l'année sélectionnée, 
      // même si elles sont archivées (active: false), pour garantir l'intégrité du P&L annuel.
      if (fyRevenue > 0 || fyProdCost > 0) return true;

      // Sinon on se base sur les dates pour inclure les missions "en attente" ou "prévues"
      const mStart = parseISO(m.startDate);
      const mEnd = parseISO(m.endDate);
      
      return !isAfter(mStart, fyEnd) && !isBefore(mEnd, fyStart);
    }).map(mm => mm.mission);
  }, [missionMetrics, globalFY]);

  const totalForecastRevenue = useMemo(() => {
    return missionsForSelectedFY.reduce((acc, m) => {
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      return acc + (metrics?.fyRevenue || 0);
    }, 0);
  }, [missionsForSelectedFY, missionMetrics]);

  const budgetedRevenue = useMemo(() => {
    if (globalCountry === 'Global') {
      return Object.values(budgetValues[globalFY] || {}).reduce((acc, countryData) => acc + (countryData['revenue_total'] || 0), 0);
    }
    return budgetValues[globalFY]?.[globalCountry as string]?.['revenue_total'] || 0;
  }, [budgetValues, globalFY, globalCountry]);

  const caRingData = [
    { name: 'Réalisé/Prévu', value: totalForecastRevenue },
    { name: 'Reste à atteindre', value: Math.max(0, budgetedRevenue - totalForecastRevenue) }
  ];

  const portfolioWeightedMarginData = useMemo(() => {
    // On utilise exactement le même CA que le bloc "Suivi Facturation" (77 000€ attendus)
    const totalFYRev = totalForecastRevenue;
    
    // On calcule le coût pour toutes les missions sélectionnées pour ce FY
    let totalFYCost = 0;
    missionsForSelectedFY.forEach(m => {
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      if (metrics) {
        totalFYCost += metrics.fyProdCost;
      }
    });
    
    const marginPercent = totalFYRev === 0 ? 0 : ((totalFYRev - totalFYCost) / totalFYRev) * 100;
    return { totalFYRev, totalFYCost, marginPercent };
  }, [totalForecastRevenue, missionsForSelectedFY, missionMetrics]);

  const portfolioWeightedMargin = portfolioWeightedMarginData.marginPercent;

  const healthStatus = useMemo(() => {
    if (portfolioWeightedMargin < 5) return { label: 'SANTÉ CRITIQUE', color: 'text-red-600', bg: 'bg-red-50', icon: ShieldAlert };
    if (portfolioWeightedMargin < 20) return { label: 'SANTÉ SOUS SURVEILLANCE', color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle };
    return { label: 'SANTÉ FINANCIÈRE OPTIMALE', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: TrendingUp };
  }, [portfolioWeightedMargin]);

  const avgOccupancy = useMemo(() => {
    const eligibleCollaborators = filteredCollaboratorsForStats.filter(isOperationalCollaborator);
    if (eligibleCollaborators.length === 0) return 0;

    const fyYear = parseInt(globalFY.replace('FY', ''));
    const fyStart = startOfDay(new Date(fyYear, 1, 1));
    const fyEnd = endOfDay(new Date(fyYear + 1, 0, 31));
    const ytdEnd = isAfter(today, fyEnd) ? fyEnd : (isBefore(today, fyStart) ? fyStart : today);
    
    let globalSumOfAverages = 0;
    let validUsersCount = 0;

    eligibleCollaborators.forEach(collab => {
      const joiningDate = collab.joiningDate ? parseISO(collab.joiningDate) : startOfDay(new Date(2020, 0, 1));
      const leavingDate = collab.leavingDate ? parseISO(collab.leavingDate) : fyEnd;
      const userEffectiveStart = isAfter(joiningDate, fyStart) ? startOfDay(joiningDate) : fyStart;
      const userEffectiveEnd = isBefore(leavingDate, ytdEnd) ? endOfDay(leavingDate) : ytdEnd;
      if (isAfter(userEffectiveStart, userEffectiveEnd)) return;
      const bDays = getBusinessDays(userEffectiveStart, userEffectiveEnd, holidays, collab.country);
      if (bDays.length === 0) return;

      validUsersCount++;
      const userPlanning = planning.filter(p => p.collaboratorId === collab.id || p.userId === collab.id);
      const userTimesheets = timesheets.filter(t => t.collaboratorId === collab.id || t.userId === collab.id);
      let userTotalPercentage = 0;

      bDays.forEach(day => {
        const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const dayIdx = (day.getDay() + 6) % 7;
        const dayActuals = userTimesheets.filter(t => t.weekStart === monday && t.dayIndex === dayIdx && t.missionId !== 'INTERMISSION');
        if (dayActuals.length > 0) {
          userTotalPercentage += dayActuals.reduce((acc, t) => acc + t.percentage, 0);
        } else {
          const weekPlans = userPlanning.filter(p => p.weekStart === monday && p.missionId !== 'INTERMISSION');
          userTotalPercentage += weekPlans.reduce((acc, p) => acc + p.percentage, 0);
        }
      });
      globalSumOfAverages += (userTotalPercentage / bDays.length);
    });
    return validUsersCount > 0 ? globalSumOfAverages / validUsersCount : 0;
  }, [filteredCollaboratorsForStats, planning, timesheets, holidays, globalFY, today]);

  const occupancyStatus = useMemo(() => {
    if (avgOccupancy < 50) return { label: 'SOUS-CHARGE CRITIQUE', color: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' };
    if (avgOccupancy < 75) return { label: 'CAPACITÉ DISPONIBLE', color: 'text-orange-500', bg: 'bg-orange-50', bar: 'bg-orange-500' };
    return { label: 'OPTIMISATION ATTEINTE', color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' };
  }, [avgOccupancy]);

  const interContratHorizons = useMemo(() => {
    const eligibleCollaborators = filteredCollaboratorsForStats.filter(isOperationalCollaborator);
    
    return [4, 8, 12].map(weeks => {
      const targetDate = addDays(today, weeks * 7);
      const targetMonday = format(startOfWeek(targetDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      const availableUsers = eligibleCollaborators.filter(collab => {
        const userPlanning = planning.filter(p => (p.collaboratorId === collab.id || p.userId === collab.id) && p.weekStart === targetMonday && p.missionId !== 'INTERMISSION');
        const totalPercentage = userPlanning.reduce((acc, p) => acc + p.percentage, 0);
        return totalPercentage === 0;
      });
      
      return { 
        weeks, 
        count: availableUsers.length,
        userNames: availableUsers.map(u => `${u.firstName} ${u.lastName}`).sort()
      };
    });
  }, [filteredCollaboratorsForStats, planning, today]);

  const missionCounts = useMemo(() => {
    // On ne compte que les missions qui ont un impact réel sur le CA ou coût du FY sélectionné
    // ou qui chevauchent les dates
    return {
      active: missionsForSelectedFY.filter(m => m.status === MissionStatus.EN_COURS).length,
      notStarted: missionsForSelectedFY.filter(m => m.status === MissionStatus.NON_DEMARREE).length,
      finished: missionsForSelectedFY.filter(m => m.status === MissionStatus.TERMINEE).length
    };
  }, [missionsForSelectedFY]);

  const clientCount = useMemo(() => new Set(missionsForSelectedFY.map(m => m.clientName)).size, [missionsForSelectedFY]);
  const activeClientNames = useMemo(() => 
    Array.from(new Set(missionsForSelectedFY.map(m => m.clientName))).sort(),
    [missionsForSelectedFY]
  );
  
  const monthlyStaffingData = useMemo(() => {
    const fyYear = parseInt(globalFY.replace('FY', ''));
    const eligibleCollaborators = filteredCollaboratorsForStats.filter(isOperationalCollaborator);
    
    if (eligibleCollaborators.length === 0) return [];

    const monthList = [
      { id: 1, label: 'Fév' }, { id: 2, label: 'Mar' }, { id: 3, label: 'Avr' },
      { id: 4, label: 'Mai' }, { id: 5, label: 'Jun' }, { id: 6, label: 'Jul' },
      { id: 7, label: 'Aoû' }, { id: 8, label: 'Sep' }, { id: 9, label: 'Oct' },
      { id: 10, label: 'Nov' }, { id: 11, label: 'Déc' }, { id: 0, label: 'Jan' }
    ];

    const currentMonthIdx = monthList.findIndex(m => m.id === today.getMonth());

    return monthList.map(({ id, label }, index) => {
      const year = id === 0 ? fyYear + 1 : fyYear;
      const start = startOfDay(new Date(year, id, 1));
      const end = endOfMonth(start);
      const isPastOrCurrent = index <= currentMonthIdx;
      
      let totalCap = 0;
      let totalLoad = 0;

      eligibleCollaborators.forEach(collab => {
        const joiningDate = collab.joiningDate ? parseISO(collab.joiningDate) : startOfDay(new Date(2000, 0, 1));
        const leavingDate = collab.leavingDate ? parseISO(collab.leavingDate) : endOfDay(new Date(2100, 0, 1));
        
        const effectiveStart = isAfter(joiningDate, start) ? joiningDate : start;
        const effectiveEnd = isBefore(leavingDate, end) ? leavingDate : end;

        if (!isAfter(effectiveStart, effectiveEnd)) {
          const bDays = getBusinessDays(effectiveStart, effectiveEnd, holidays, collab.country);
          if (bDays.length > 0) {
            totalCap += bDays.length * 100;
            bDays.forEach(day => {
              const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
              const dayIdx = (day.getDay() + 6) % 7;
              if (isBefore(day, today)) {
                 const dayActuals = timesheets.filter(t => (t.collaboratorId === collab.id || t.userId === collab.id) && t.weekStart === monday && t.dayIndex === dayIdx && t.status === 'Validé' && t.missionId !== 'INTERMISSION');
                 totalLoad += dayActuals.reduce((acc, t) => acc + t.percentage, 0);
              } else {
                 const dayPlans = planning.filter(p => (p.collaboratorId === collab.id || p.userId === collab.id) && p.weekStart === monday && p.missionId !== 'INTERMISSION');
                 totalLoad += dayPlans.reduce((acc, p) => acc + p.percentage, 0);
              }
            });
          }
        }
      });

      return {
        name: label,
        rate: totalCap > 0 ? Math.round((totalLoad / totalCap) * 100) : 0,
        ytdRate: isPastOrCurrent ? (totalCap > 0 ? Math.round((totalLoad / totalCap) * 100) : 0) : null,
        isYTD: isPastOrCurrent
      };
    });
  }, [filteredCollaboratorsForStats, planning, timesheets, holidays, globalFY, today]);

  const currentMonthLabel = useMemo(() => {
    const monthList = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return monthList[today.getMonth()];
  }, [today]);

  const typologyData = useMemo(() => {
    const groups: Record<string, { count: number, revenue: number }> = {};
    const actualYear = parseInt(getFiscalYear(today).replace('FY', ''));
    const fyYear = parseInt(globalFY.replace('FY', ''));

    missionsForSelectedFY.forEach(m => {
      if (!groups[m.typology]) {
        groups[m.typology] = { count: 0, revenue: 0 };
      }
      groups[m.typology].count += 1;
      
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      groups[m.typology].revenue += (metrics?.fyRevenue || 0);
    });

    return Object.entries(groups).map(([name, data]) => ({ 
      name, 
      count: data.count,
      revenue: data.revenue
    })).sort((a, b) => b.count - a.count);
  }, [missionsForSelectedFY, globalFY]);

  const alerts = useMemo(() => {
    const eligibleCollaborators = collaborators.filter(c => c.active && (globalCountry === 'Global' || c.country === globalCountry) && isOperationalCollaborator(c));
    const lowMargin = missionMetrics.filter(m => m.margin < 5 && m.totalRevenue > 0);
    
    // Mission sans staffing: Une mission en cours doit avoir au moins un collaborateur éligible staffé
    const noStaffing = filteredMissions.filter(m => {
      if (m.status !== MissionStatus.EN_COURS) return false;
      const staffings = planning.filter(p => p.missionId === m.id && p.percentage > 0);
      return !staffings.some(p => {
        const collab = collaborators.find(c => c.id === (p.collaboratorId || p.userId));
        return isOperationalCollaborator(collab);
      });
    });

    const lateTimesheets = eligibleCollaborators.filter(collab => {
      const fyYear = parseInt(globalFY.replace('FY', ''));
      const startRange = startOfDay(new Date(fyYear, 1, 1)); 
      const endRange = startOfDay(addDays(today, -7)); 
      
      let collabJoining = startOfDay(new Date(2000, 0, 1));
      if (collab.joiningDate) {
        const parsed = parseISO(collab.joiningDate);
        if (isValid(parsed)) collabJoining = parsed;
      }

      let collabLeaving = endOfDay(new Date(2100, 0, 1));
      if (collab.leavingDate) {
        const parsed = parseISO(collab.leavingDate);
        if (isValid(parsed)) collabLeaving = parsed;
      }
      
      const effectiveStart = isAfter(collabJoining, startRange) ? startOfDay(collabJoining) : startRange;
      const effectiveEnd = isBefore(collabLeaving, endRange) ? endOfDay(collabLeaving) : endRange;
      
      if (isAfter(effectiveStart, effectiveEnd)) return false;
      
      const bDays = getBusinessDays(effectiveStart, effectiveEnd, holidays, collab.country);
      if (bDays.length === 0) return false;
      
      const collabTS = timesheets.filter(t => (t.collaboratorId === collab.id || t.userId === collab.id) && t.status === TimesheetStatus.VALIDE);
      
      return bDays.some(day => {
        const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const dayIdx = (day.getDay() + 6) % 7;
        const dayTotal = collabTS
          .filter(t => t.weekStart === monday && t.dayIndex === dayIdx)
          .reduce((acc, t) => acc + t.percentage, 0);
        return dayTotal < 100;
      });
    });
    
    const lowMoodConsultants: any[] = [];
    const processedUsers = new Set<string>();

    filteredMissions.forEach(m => {
      if (m.status !== MissionStatus.EN_COURS) return;
      
      const missionPlanning = planning.filter(p => p.missionId === m.id);
      const lowMoodEntries = missionPlanning.filter(p => p.sentiment && ['😐', '😟', '😡'].includes(p.sentiment));
      
      lowMoodEntries.forEach(entry => {
        const collabId = entry.collaboratorId || entry.userId;
        const collab = collaborators.find(c => c.id === collabId);
        if (collab && isOperationalCollaborator(collab) && !processedUsers.has(`${m.id}-${collab.id}`)) {
          lowMoodConsultants.push({
            ...collab,
            missionId: m.id,
            clientName: m.clientName,
            missionName: m.name,
            sentiment: entry.sentiment
          });
          processedUsers.add(`${m.id}-${collab.id}`);
        }
      });
    });

    const badWeatherMissions: any[] = [];
    filteredMissions.forEach(m => {
      const missionPlanning = planning.filter(p => p.missionId === m.id);
      const badWeatherCollabIds = new Set(
        missionPlanning
          .filter(p => p.weather === 'rain' || p.weather === 'storm')
          .map(p => p.collaboratorId || p.userId)
      );
      
      badWeatherCollabIds.forEach(collabId => {
        const collab = collaborators.find(c => c.id === collabId);
        if (!collab || !isOperationalCollaborator(collab)) return;

        const collabName = `${collab.firstName} ${collab.lastName}`;
        badWeatherMissions.push({
          id: `badweather-${m.id}-${collabId}`,
          clientName: m.clientName,
          name: `${m.name} (${collabName})`,
          weather: 'storm'
        });
      });
    });
    return { lowMargin, noStaffing, lateTimesheets, lowMoodConsultants, badWeatherMissions };
  }, [missionMetrics, filteredMissions, planning, timesheets, collaborators, today, globalCountry, globalFY, holidays]);

  const detailedMissions = useMemo(() => {
    if (!selectedTypology) return [];
    
    return missionsForSelectedFY
      .filter(m => m.typology === selectedTypology)
      .map(m => {
        const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
        return {
          ...m,
          fyRevenue: metrics?.fyRevenue || 0
        };
      })
      .sort((a, b) => b.fyRevenue - a.fyRevenue);
  }, [selectedTypology, missionsForSelectedFY, missionMetrics]);

  // Styles uniformisés pour les titres
  const CARD_TITLE_CLASS = "text-[12px] font-black text-gray-400 uppercase tracking-widest mb-4";
  const SECTION_TITLE_CLASS = "text-[12px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-4";
  const KPI_BLOCK_CLASS = "p-5 rounded-3xl border shadow-sm h-[158px] flex flex-col transition-all duration-300";
  const CONTENT_BLOCK_CLASS = "bg-white py-6 px-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col h-full overflow-hidden transition-all duration-300";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* SECTION 1: INDICATEURS CLÉS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Anneau CA */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center min-h-[337px]">
          <h3 className={`${CARD_TITLE_CLASS} text-center w-full`}>CA PRÉVISIONNEL (+SF)</h3>
          <div className="flex-1 w-full flex flex-col items-center justify-center">
            <div className="h-44 w-full relative pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={caRingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={82}
                    paddingAngle={0}
                    dataKey="value"
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Cell fill="#e1b129" />
                    <Cell fill="#f3f4f6" />
                    <Label 
                      value={`${Math.round((totalForecastRevenue / (budgetedRevenue || 1)) * 100)}%`} 
                      position="center" 
                      className="font-black text-2xl fill-navy"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2">
              <p className="text-xl font-black text-navy tracking-tight">{formatNumberWithDots(totalForecastRevenue)} €</p>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-0.5 opacity-60">OBJECTIF : {formatNumberWithDots(budgetedRevenue)} €</p>
            </div>
          </div>
        </div>

        {/* Graphique Staffing Mensuel */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center min-h-[337px]">
          <h3 className={`${CARD_TITLE_CLASS} text-center w-full`}>STAFFING MENSUEL (RÉEL + PRÉV)</h3>
          <div className="flex-1 w-full flex flex-col items-center justify-center pt-4">
             <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyStaffingData} margin={{ left: -30, right: 10 }}>
                    <defs>
                      <linearGradient id="ytdGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e1b129" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#e1b129" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      fontSize={8} 
                      fontWeight={800} 
                      axisLine={false} 
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis 
                      domain={[0, 110]} 
                      ticks={[25, 50, 75, 100]}
                      fontSize={8} 
                      fontWeight={800} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          // On prend la valeur du taux réel (rate)
                          const data = payload.find(p => p.dataKey === 'rate');
                          if (!data) return null;
                          return (
                            <div className="bg-navy p-2 rounded-lg shadow-xl border border-white/10">
                              <p className="text-[10px] font-black text-white uppercase mb-1">{data.payload.name}</p>
                              <p className="text-sm font-black text-yellow-accent">{data.value}%</p>
                              {data.payload.isYTD && <p className="text-[7px] font-black text-white/50 uppercase mt-0.5">PÉRIODE RÉELLE (YTD)</p>}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="ytdRate" 
                      stroke="none" 
                      fill="url(#ytdGradient)" 
                      fillOpacity={1} 
                      connectNulls={false}
                    />
                    <ReferenceLine y={80} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth={1}>
                       <Label value="OBJ. 80%" position="insideBottomRight" fontSize={7} fontWeight={900} fill="#94a3b8" />
                    </ReferenceLine>
                    <Line type="monotone" dataKey="rate" stroke="#e1b129" strokeWidth={3} dot={{ fill: '#e1b129', r: 3, strokeWidth: 2 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
             </div>
             <div className="text-center mt-2">
                <p className="text-xl font-black text-navy tracking-tight">{Math.round(avgOccupancy)}%</p>
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-0.5 opacity-60">OBJECTIF : 80%</p>
             </div>
          </div>
        </div>

        {/* Colonne 3: Grille des 4 Mini-KPIs en 2x2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className={`${KPI_BLOCK_CLASS} bg-white border-gray-100 group/margin relative`}>
            {/* Tooltip Détail Calcul */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-navy p-3 rounded-xl shadow-xl border border-white/10 hidden group-hover/margin:block z-50 pointer-events-none">
               <p className="text-[9px] font-black text-yellow-accent uppercase tracking-widest mb-2 border-b border-white/10 pb-1">Détail du calcul</p>
               <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                     <span className="text-[8px] text-white/50 font-bold uppercase">CA Cumulé</span>
                     <span className="text-[10px] text-white font-black">{formatNumberWithDots(portfolioWeightedMarginData.totalFYRev)} €</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-[8px] text-white/50 font-bold uppercase">Coûts de Prod</span>
                     <span className="text-[10px] text-white font-black">{formatNumberWithDots(portfolioWeightedMarginData.totalFYCost)} €</span>
                  </div>
                  <div className="pt-1.5 border-t border-white/10 flex justify-between items-center">
                     <span className="text-[8px] text-yellow-accent/50 font-bold uppercase">Marge Brute</span>
                     <span className="text-[10px] text-yellow-accent font-black">{formatNumberWithDots(portfolioWeightedMarginData.totalFYRev - portfolioWeightedMarginData.totalFYCost)} €</span>
                  </div>
               </div>
               <p className="mt-2 text-[7px] text-white/30 italic">(CA - Coûts) / CA * 100</p>
            </div>

            <h3 className={CARD_TITLE_CLASS}>MARGE MISSIONS ({globalFY})</h3>
            <div className="flex items-center gap-4 mt-auto mb-auto">
              <div className={`p-2 rounded-2xl ${healthStatus.bg}`}>
                <healthStatus.icon className={healthStatus.color} size={24} />
              </div>
              <div>
                <p className={`text-2xl font-black ${healthStatus.color}`}>{Math.round(portfolioWeightedMargin)}%</p>
                <p className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${healthStatus.color}`}>{healthStatus.label}</p>
              </div>
            </div>
          </div>

          <div className={`${KPI_BLOCK_CLASS} bg-white border-gray-100`}>
            <h3 className={CARD_TITLE_CLASS}>MISSIONS {globalFY}</h3>
            <div className="flex items-center gap-4 mt-auto mb-auto">
              <div className="p-2 bg-yellow-accent/10 rounded-2xl">
                <Briefcase className="text-yellow-accent" size={24} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-navy">{missionCounts.active + missionCounts.notStarted}</span>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">ACTIVES</span>
                </div>
                {missionCounts.finished > 0 && (
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-lg font-bold text-gray-300">{missionCounts.finished}</span>
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">TERMINEÉS</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`${KPI_BLOCK_CLASS} bg-white border-gray-100`}>
            <h3 className={CARD_TITLE_CLASS}>Capacité disponible à :</h3>
            <div className="flex-1 flex flex-col justify-center">
              <div className="grid grid-cols-3 gap-2">
                {interContratHorizons.map((h, i) => (
                  <div key={i} className="text-center group/h relative">
                    {/* Tooltip Noms Collaborateurs */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-navy p-2 rounded-xl shadow-xl border border-white/10 hidden group-hover/h:block z-50 pointer-events-none max-h-48 overflow-y-auto">
                       <p className="text-[8px] font-black text-yellow-accent uppercase tracking-widest mb-1.5 border-b border-white/10 pb-1">Disponibles ({h.count})</p>
                       <div className="space-y-0.5">
                          {h.userNames.length === 0 ? (
                            <p className="text-[9px] text-white/40 italic">Aucun</p>
                          ) : (
                            h.userNames.map((name, idx) => (
                              <p key={idx} className="text-[9px] text-white font-medium truncate">{name}</p>
                            ))
                          )}
                       </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-2 border border-transparent group-hover/h:border-blue-200 transition-all cursor-help">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">{h.weeks} Sem.</p>
                      <p className={`text-xl font-black ${h.count >= 6 ? 'text-red-500' : h.count >= 3 ? 'text-orange-500' : 'text-emerald-600'}`}>
                        {h.count}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${KPI_BLOCK_CLASS} bg-white border-gray-100 group/clients relative`}>
            {/* Tooltip Liste Clients */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-navy p-3 rounded-xl shadow-xl border border-white/10 hidden group-hover/clients:block z-50 pointer-events-none max-h-64 overflow-y-auto">
               <p className="text-[9px] font-black text-yellow-accent uppercase tracking-widest mb-2 border-b border-white/10 pb-1">Liste des clients ({clientCount})</p>
               <div className="space-y-1">
                  {activeClientNames.map((name, idx) => (
                    <p key={idx} className="text-[10px] text-white font-medium truncate">{name}</p>
                  ))}
               </div>
            </div>

            <h3 className={CARD_TITLE_CLASS}>CLIENTS ACTIFS {globalFY}</h3>
            <div className="flex items-center gap-4 mt-auto mb-auto">
              <div className="p-2 bg-yellow-accent/10 rounded-2xl">
                <Users className="text-yellow-accent" size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-navy">{clientCount}</p>
                <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-0.5">SUR CETTE ANNÉE</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: RÉPARTITION ET TOP MISSIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className={CONTENT_BLOCK_CLASS}>
          <h3 className={`${SECTION_TITLE_CLASS} mb-6`}>RÉPARTITION PAR TYPOLOGIE</h3>
          <div className="flex-1 flex flex-col justify-end">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typologyData} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={8} fontWeight={800} className="uppercase text-navy tracking-tight" />
                  <YAxis hide domain={[0, 'dataMax + 2']} />
                  <Tooltip cursor={{ fill: 'rgba(41, 54, 71, 0.05)' }} content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-2 border rounded-xl shadow-xl text-[10px]">
                          <p className="font-black text-navy uppercase mb-0.5">{data.name}</p>
                          <p className="font-bold text-gray-500">{data.count} Missions</p>
                          <p className="font-black text-navy">{formatNumberWithDots(data.revenue)} €</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Bar dataKey="count" fill="#293647" radius={[4, 4, 0, 0]} barSize={28} onClick={(data) => setSelectedTypology(data.name)} className="cursor-pointer hover:opacity-90 transition-opacity">
                    <LabelList dataKey="count" position="top" content={(props: any) => {
                      const { x, y, width, value, index } = props;
                      const data = typologyData[index];
                      if (!data) return null;
                      return (
                        <g>
                          <text x={x + width / 2} y={y - 10} textAnchor="middle" fill="#293647" fontSize={9} fontWeight={900} className="uppercase tracking-tighter">{formatNumberWithDots(data.revenue)} €</text>
                          <text x={x + width / 2} y={y + 15} textAnchor="middle" fill="#e1b129" fontSize={11} fontWeight={900}>{value}</text>
                        </g>
                      );
                    }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className={CONTENT_BLOCK_CLASS}>
          <h3 className={`${SECTION_TITLE_CLASS} mb-6`}>TOP 5 MISSIONS PAR CA {globalFY} (+SF)</h3>
          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {missionMetrics
              .filter(mm => missionsForSelectedFY.some(mfy => mfy.id === mm.mission.id))
              .sort((a, b) => b.fyRevenue - a.fyRevenue)
              .slice(0, 5)
              .map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-slate-100/50 rounded-2xl border border-transparent hover:border-yellow-accent/20 transition-all group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-yellow-accent flex items-center justify-center font-black text-white text-[9px] shadow-sm shrink-0 group-hover:scale-105 transition-transform">{i + 1}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-navy uppercase tracking-tight truncate">{m.mission.clientName}</p>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 truncate border-b border-yellow-accent/10 pb-px w-fit max-w-full">{m.mission.name}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs font-black text-navy">{formatNumberWithDots(m.fyRevenue)} €</p>
                  <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">CA {globalFY}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={CONTENT_BLOCK_CLASS}>
          <h3 className={`${SECTION_TITLE_CLASS} mb-6`}>TOP 5 MISSIONS PAR RENTABILITÉ {globalFY}</h3>
          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {missionMetrics
              .filter(mm => missionsForSelectedFY.some(mfy => mfy.id === mm.mission.id))
              .sort((a, b) => b.fyMargin - a.fyMargin)
              .slice(0, 5)
              .map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-slate-100/50 rounded-2xl border border-transparent hover:border-yellow-accent/20 transition-all group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-yellow-accent flex items-center justify-center font-black text-white text-[9px] shadow-sm shrink-0 group-hover:scale-105 transition-transform">{i + 1}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-navy uppercase tracking-tight truncate">{m.mission.clientName}</p>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 truncate border-b border-yellow-accent/10 pb-px w-fit max-w-full">{m.mission.name}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className={`text-xs font-black ${m.fyMargin >= 20 ? 'text-emerald-600' : m.fyMargin >= 5 ? 'text-orange-500' : 'text-red-600'}`}>{Math.round(m.fyMargin)}%</p>
                  <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">MARGE {globalFY}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION ALERTES */}
      <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
        <h3 className={`${SECTION_TITLE_CLASS} mb-8`}>
          <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg">
            <AlertCircle size={16} />
          </div>
          ALERTES DE PILOTAGE CRITIQUE
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {Object.entries(alerts).map(([key, listObj]) => {
            const list = listObj as any[];
            const config = {
              lowMargin: { icon: TrendingUp, label: "Missions faible rentabilité", color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
              noStaffing: { icon: UserX, label: "Missions sans Staffing", color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
              lateTimesheets: { icon: Clock, label: "Gestion des temps (Retards)", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
              lowMoodConsultants: { icon: Frown, label: "Humeur collaborateurs", color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
              badWeatherMissions: { icon: CloudLightning, label: "Alertes Météo Projet", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
            }[key as keyof typeof alerts];
            return (
              <div key={key} className="relative group">
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 bg-navy/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-5 hidden group-hover:block z-[60] animate-in fade-in zoom-in duration-200 pointer-events-none transition-all">
                  <div className="text-[10px] font-black text-yellow-accent uppercase mb-4 border-b border-white/10 pb-2 flex justify-between items-center tracking-widest">
                    <span>Détails Alertes</span>
                    <span className="bg-white/10 px-2 py-0.5 rounded text-white font-mono">{list.length}</span>
                  </div>
                  <div className="space-y-3">
                    {list.length === 0 ? <p className="text-[9px] text-white/40 font-bold uppercase italic text-center py-2">Aucune alerte</p> : list.slice(0, 12).map((item: any, idx: number) => (
                      <div key={idx} className="flex flex-col border-l-2 border-yellow-accent/40 pl-3 py-0.5 hover:bg-white/5 rounded-r transition-colors">
                        <p className="text-[10px] font-black text-white uppercase truncate tracking-tight">
                          {key === 'lowMargin' ? item.mission.clientName : (key === 'noStaffing' || key === 'badWeatherMissions' || key === 'lowMoodConsultants' ? item.clientName : `${item.firstName} ${item.lastName}`)}
                        </p>
                        <p className="text-[8px] text-white/40 font-bold uppercase truncate mt-0.5">
                          {key === 'lowMargin' ? `${Math.round(item.margin)}% marge` : 
                           (key === 'noStaffing' || key === 'badWeatherMissions' ? item.name : 
                            (key === 'lowMoodConsultants' ? `${item.firstName} ${item.lastName} ${item.sentiment}` : item.grade))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`h-[165px] p-5 rounded-3xl border transition-all flex flex-col items-center justify-center gap-3 cursor-help ${list.length > 0 ? `${config.border} ${config.bg} hover:shadow-lg hover:scale-[1.02]` : 'border-gray-50 bg-gray-50/50 text-gray-300'}`}>
                  <config.icon size={24} className={list.length > 0 ? config.color : ''} />
                  <span className={`text-3xl font-black ${list.length > 0 ? 'text-navy' : 'text-gray-300'}`}>{list.length}</span>
                  <span className={`text-[12px] font-black uppercase text-center leading-tight tracking-widest ${list.length > 0 ? 'text-gray-400' : 'text-gray-300'}`}>{config.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTypology && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300">
            <div className="px-10 py-8 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-yellow-accent flex items-center justify-center text-navy shadow-lg"><BarChart3 size={24} /></div>
                <div>
                  <h3 className="text-xl font-black text-navy uppercase tracking-tight">{selectedTypology}</h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">DÉTAIL DES MISSIONS {globalFY}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTypology(null)} className="w-10 h-10 rounded-full bg-white border flex items-center justify-center text-gray-400 hover:text-navy transition-all"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-4 no-scrollbar">
              {detailedMissions.map((m, idx) => (
                <div key={m.id} className="flex items-center justify-between p-5 bg-slate-50/50 rounded-3xl border border-transparent hover:border-yellow-accent/20 transition-all group">
                  <div className="flex items-center gap-5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-white border flex items-center justify-center font-black text-navy text-xs shrink-0 shadow-sm">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-navy uppercase tracking-tight truncate">{m.clientName}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate">{m.name}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-lg font-black text-navy">{formatNumberWithDots(m.fyRevenue)} €</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${m.status === MissionStatus.EN_COURS ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{m.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-10 py-6 bg-navy text-white flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total Typologie (CA+SF)</span>
              <div className="text-right">
                <p className="text-2xl font-black text-yellow-accent">{formatNumberWithDots(detailedMissions.reduce((acc, m) => acc + m.fyRevenue, 0))} €</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Montant Cumulé sur l'Année</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;