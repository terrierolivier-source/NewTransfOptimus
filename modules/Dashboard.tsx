import React, { useMemo, useState, useEffect } from 'react';
import { 
  TrendingUp, Target, Briefcase, Users, AlertCircle, 
  UserCheck, BarChart3, CloudRain, 
  CloudLightning, UserX, Clock, ClipboardCheck, 
  Frown,
  Euro, AlertTriangle, ShieldAlert, X,
  ExternalLink,
  Coins,
  HandCoins,
  Layers
} from 'lucide-react';
import { AppState, Country, BillingMode, MissionStatus, Role, TimesheetStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Label, LabelList,
  LineChart, Line, ReferenceLine, ReferenceArea, ComposedChart, Area
} from 'recharts';
import { getBusinessDays, getMonday, getFiscalYear, calculateSmoothedMissionRevenue, calculateTotalMissionRevenue, isWorkingDay, getDedupedTimesheets } from '../utils';
import { parseISO, format, isAfter, startOfToday, subWeeks, endOfWeek, eachDayOfInterval, isBefore, startOfDay, endOfDay, startOfWeek, endOfMonth, addDays, eachWeekOfInterval, isValid, max, min, differenceInDays, startOfMonth, isSameDay } from 'date-fns';
import { supabase } from '../services/supabase';
import { XsellOpportunity, getOpportunityRefFY, getOpportunityRefYear, parseRefacPercentageToRatio } from './XsellOpportunities';

interface DashboardProps {
  state: AppState;
}

const formatMoodDate = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '';
    return ` (le ${format(d, 'dd/MM/yyyy')})`;
  } catch {
    return '';
  }
};

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  const { missions, planning, timesheets: rawTimesheets, collaborators, globalCountry, globalFY, budgetValues, holidays, manualExpenses } = state;
  const today = startOfToday();
  const [selectedTypology, setSelectedTypology] = useState<string | null>(null);

  // DB & State management for Xsell indicators
  const [xsellOpportunities, setXsellOpportunities] = useState<XsellOpportunity[]>([]);

  const fetchXsellOpportunities = async () => {
    try {
      const { data, error } = await supabase
        .from('xsell_opportunities')
        .select('*');
      if (!error && data) {
        setXsellOpportunities(data);
      }
    } catch (err) {
      console.error('Error fetching xsell opportunities in Dashboard:', err);
    }
  };

  useEffect(() => {
    fetchXsellOpportunities();

    const channel = supabase.channel('xsell-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xsell_opportunities' }, () => {
        fetchXsellOpportunities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Helper for parsing refac percentage to ratio (similar to XsellOpportunities)
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

  // Format Helper for Currencies (from Xsell)
  const formatCurrencyXsell = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    const rounded = Math.round(val);
    const formattedNum = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formattedNum}\u00A0€`;
  };

  const getStatusProgressBarColorXsell = (status: string | null | undefined) => {
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

  const xsellMetrics = useMemo(() => {
    const list = xsellOpportunities;

    // Filter by globalFY for the CA indicators (strictly using the unified Fiscal Year rule: 01/02 to 31/01)
    const normalizedGlobalFY = (globalFY || 'FY26').toUpperCase();
    const currentFYYear = parseInt(normalizedGlobalFY.replace('FY', ''), 10);
    const listCurrentFY = list.filter(o => {
      const oppFY = getOpportunityRefFY(o);
      const refYear = getOpportunityRefYear(o);
      return oppFY === normalizedGlobalFY || (refYear !== null && (refYear === currentFYYear || refYear === (2000 + currentFYYear)));
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
    // Opportunities grouped by Status
    const statusOpportunities: Record<string, typeof list> = {};
    list.forEach(o => {
      const s = o.status || 'Non renseigné';
      statusCount[s] = (statusCount[s] || 0) + 1;
      if (!statusOpportunities[s]) {
        statusOpportunities[s] = [];
      }
      statusOpportunities[s].push(o);
    });

    const countInProgress = list.filter(o => o.status === '04 - mission en cours').length;

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

    // Calcul du montant Prév. Transfo (Xsell) pour l'anneau et les prévisions :
    // Tient compte des missions en cours ('04 - mission en cours') ET des missions terminées ('05 - mission terminée'),
    // quel que soit le statut de facturation ("01 - Non prêt à facturer", "02 - Prêt à facturer", "03 - Facturé", etc.)
    const eligibleTransfoRevenue = listCurrentFY
      .filter(o => {
        const s = (o.status || '').trim().toLowerCase();
        return s.includes('04') || s.includes('en cours') || s.includes('05') || s.includes('terminée') || s.includes('terminee');
      })
      .reduce((sum, o) => {
        const amount = o.amount_to_invoice !== null && o.amount_to_invoice !== undefined && o.amount_to_invoice > 0
          ? o.amount_to_invoice
          : Math.round((o.estimated_revenue || 0) * parseRefacPercentageToRatio(o.refac_percentage));
        return sum + amount;
      }, 0);

    // Aligné sur eligibleTransfoRevenue pour assurer la stricte égalité de valeur et montant avec l'indicateur CA Prévisionnel
    const transfoInProgress = eligibleTransfoRevenue;

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
      totalCount: list.length,
      totalEstRevenue,
      totalInvoiceTransfo,
      totalSavings,
      statusCount,
      statusOpportunities,
      topOwners,
      topEntities,
      countInProgress,
      countCompleted: statusCount['05 - mission terminée'] || 0,
      transfoInProgress,
      transfoCompleted,
      eligibleTransfoRevenue,
      epsaRevenue
    };
  }, [xsellOpportunities, globalFY]);

  // Centralized deduplication for all Dashboard calculations
  const timesheets = useMemo(() => {
    const deduped = getDedupedTimesheets(rawTimesheets);
    if (rawTimesheets.length !== deduped.length) {
      console.log(`[Dashboard] Deduped timesheets: ${rawTimesheets.length} -> ${deduped.length}`);
    }
    return deduped;
  }, [rawTimesheets]);

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
        const mCollabTS = timesheets.filter(t => t.missionId === m.id && (t.collaboratorId === collabId || t.userId === collabId) && t.status === TimesheetStatus.VALIDE);
        
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

  const xsellForecastTransfo = useMemo(() => {
    return xsellMetrics.eligibleTransfoRevenue || 0;
  }, [xsellMetrics.eligibleTransfoRevenue]);

  const totalCombinedForecast = useMemo(() => {
    return totalForecastRevenue + xsellForecastTransfo;
  }, [totalForecastRevenue, xsellForecastTransfo]);

  const budgetedRevenue = useMemo(() => {
    if (globalCountry === 'Global') {
      return Object.values(budgetValues[globalFY] || {}).reduce((acc, countryData) => acc + (countryData['revenue_total'] || 0), 0);
    }
    return budgetValues[globalFY]?.[globalCountry as string]?.['revenue_total'] || 0;
  }, [budgetValues, globalFY, globalCountry]);

  const caRingData = useMemo(() => {
    const remaining = Math.max(0, budgetedRevenue - totalCombinedForecast);
    return [
      { name: 'CA Prévisionnel missions (+SF)', value: totalForecastRevenue, color: '#e1b129' },
      { name: 'CA prév. Transfo à facturer (Xsell)', value: xsellForecastTransfo, color: '#fef08a' },
      { name: 'Reste à atteindre', value: remaining, color: '#f3f4f6' }
    ].filter(d => d.value > 0 || d.name === 'Reste à atteindre');
  }, [totalForecastRevenue, xsellForecastTransfo, totalCombinedForecast, budgetedRevenue]);

  const portfolioWeightedMarginData = useMemo(() => {
    // Pour la marge, on exclut explicitement les missions non démarrées
    const activeMissionsForMargin = missionsForSelectedFY.filter(m => m.status !== MissionStatus.NON_DEMARREE);

    const totalFYRevForMargin = activeMissionsForMargin.reduce((acc, m) => {
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      return acc + (metrics?.fyRevenue || 0);
    }, 0);
    
    // On calcule le coût uniquement pour ces missions
    let totalFYCost = 0;
    activeMissionsForMargin.forEach(m => {
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      if (metrics) {
        totalFYCost += metrics.fyProdCost;
      }
    });
    
    const marginPercent = totalFYRevForMargin === 0 ? 0 : ((totalFYRevForMargin - totalFYCost) / totalFYRevForMargin) * 100;
    return { totalFYRev: totalFYRevForMargin, totalFYCost, marginPercent };
  }, [missionsForSelectedFY, missionMetrics]);

  const portfolioWeightedMargin = portfolioWeightedMarginData.marginPercent;

  const healthStatus = useMemo(() => {
    if (portfolioWeightedMargin <= 0) return { label: 'SANTÉ CRITIQUE', color: 'text-red-600', bg: 'bg-red-50', icon: ShieldAlert };
    if (portfolioWeightedMargin < 15) return { label: 'SANTÉ SOUS SURVEILLANCE', color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle };
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
      if (bDays.length === 0) {
        if (!isWorkingDay(userEffectiveStart, holidays, collab.country)) {
          globalSumOfAverages += 100;
          validUsersCount++;
        }
        return;
      }

      validUsersCount++;
      const userPlanning = planning.filter(p => p.collaboratorId === collab.id || p.userId === collab.id);
      const userTimesheets = timesheets.filter(t => t.collaboratorId === collab.id || t.userId === collab.id);
      let userTotalPercentage = 0;

      bDays.forEach(day => {
        const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const dayIdx = (day.getDay() + 6) % 7;
        const dayActuals = userTimesheets.filter(t => t.weekStart === monday && t.dayIndex === dayIdx && t.status === TimesheetStatus.VALIDE && t.missionId !== 'INTERMISSION' && t.activityType !== 'INTERMISSION');
        if (dayActuals.length > 0) {
          userTotalPercentage += Math.min(100, dayActuals.reduce((acc, t) => acc + t.percentage, 0));
        } else {
          // If no validated timesheets for this day (even if past), fallback to planning
          const weekPlans = userPlanning.filter(p => p.weekStart === monday && p.missionId !== 'INTERMISSION');
          userTotalPercentage += Math.min(100, weekPlans.reduce((acc, p) => acc + p.percentage, 0));
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
        
        // On considère qu'il est disponible s'il n'est pas staffé (on ignore le jour férié dans ce test simple)
        return totalPercentage === 0;
      });
      
      return { 
        weeks, 
        count: availableUsers.length,
        dateLabel: format(targetDate, 'dd/MM'),
        users: availableUsers.map(u => ({
          name: `${u.firstName} ${u.lastName}`,
          availability: 100 // Based on the 0% load threshold
        })).sort((a, b) => a.name.localeCompare(b.name))
      };
    });
  }, [filteredCollaboratorsForStats, planning, today, holidays]);

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
              
              if (!isBefore(today, day)) {
                 const dayActuals = timesheets.filter(t => (t.collaboratorId === collab.id || t.userId === collab.id) && t.weekStart === monday && t.dayIndex === dayIdx && t.status === TimesheetStatus.VALIDE && t.missionId !== 'INTERMISSION' && t.activityType !== 'INTERMISSION');
                 if (dayActuals.length > 0) {
                   totalLoad += Math.min(100, dayActuals.reduce((acc, t) => acc + t.percentage, 0));
                 } else {
                   const dayPlans = planning.filter(p => (p.collaboratorId === collab.id || p.userId === collab.id) && p.weekStart === monday && p.missionId !== 'INTERMISSION');
                   totalLoad += Math.min(100, dayPlans.reduce((acc, p) => acc + p.percentage, 0));
                 }
              } else {
                 const dayPlans = planning.filter(p => (p.collaboratorId === collab.id || p.userId === collab.id) && p.weekStart === monday && p.missionId !== 'INTERMISSION');
                 totalLoad += Math.min(100, dayPlans.reduce((acc, p) => acc + p.percentage, 0));
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
    })).sort((a, b) => b.revenue - a.revenue);
  }, [missionsForSelectedFY, globalFY, missionMetrics]);

  const alerts = useMemo(() => {
    const eligibleCollaborators = collaborators.filter(c => c.active && (globalCountry === 'Global' || c.country === globalCountry) && isOperationalCollaborator(c));
    const lowMargin = missionMetrics.filter(m => m.margin < 5 && m.totalRevenue > 0);
    
    // Mission sans staffing: Une mission en cours doit avoir au moins un collaborateur éligible staffé
    const noStaffing = filteredMissions.filter(m => {
      if (m.status !== MissionStatus.EN_COURS) return false;
      
      const staffings = planning.filter(p => p.missionId === m.id && p.percentage > 0);
      
      // Check if there is ANY type of staffing in the planning:
      // 1. Internal collaborator (active)
      // 2. Or external freelance/subcontractor (via externalName or externalType)
      const hasStaffingInPlanning = staffings.some(p => {
        // Option A: Link via collaboratorId/userId to a known collaborator
        const collab = collaborators.find(c => c.id === (p.collaboratorId || p.userId));
        if (collab && collab.active) return true;
        
        // Option B: Direct external entry in planning
        if (p.externalName || p.externalType) return true;
        
        return false;
      });

      if (hasStaffingInPlanning) return false;

      // Also check the mission's static staffing arrays as fallbacks/truth sources
      const hasInternalStaffing = (m.internalStaffing || []).length > 0;
      const hasFreelanceStaffing = (m.freelanceStaffing || []).length > 0;
      const hasSubcontractorStaffing = (m.subcontractorStaffing || []).length > 0;

      return !(hasInternalStaffing || hasFreelanceStaffing || hasSubcontractorStaffing);
    });

    const lateTimesheets = eligibleCollaborators.map(collab => {
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
      
      if (isAfter(effectiveStart, effectiveEnd)) return null;
      
      const bDays = getBusinessDays(effectiveStart, effectiveEnd, holidays, collab.country);
      if (bDays.length === 0) return null;
      
      const collabTS = timesheets.filter(t => (t.collaboratorId === collab.id || t.userId === collab.id) && t.status === TimesheetStatus.VALIDE);
      
      const missingDays: { date: Date; dateStr: string; label: string }[] = [];
      bDays.forEach(day => {
        const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const dayIdx = (day.getDay() + 6) % 7;
        const dayTotal = collabTS
          .filter(t => t.weekStart === monday && t.dayIndex === dayIdx)
          .reduce((acc, t) => acc + t.percentage, 0);
        if (Math.min(100, dayTotal) < 100) {
          missingDays.push({
            date: day,
            dateStr: format(day, 'yyyy-MM-dd'),
            label: format(day, 'dd/MM')
          });
        }
      });

      if (missingDays.length === 0) return null;

      return {
        ...collab,
        missingDaysCount: missingDays.length,
        missingDates: missingDays
      };
    }).filter(Boolean);
    
    const lowMoodConsultants: any[] = [];
    const processedUsers = new Set<string>();

    filteredMissions.forEach(m => {
      if (m.status !== MissionStatus.EN_COURS) return;
      
      const missionPlanning = planning.filter(p => p.missionId === m.id);
      const lowMoodEntries = missionPlanning.filter(p => p.sentiment && !['🤩', '😊', '😐'].includes(p.sentiment));
      
      // Trier par date du changement de statut pour avoir la version la plus récente en premier
      const sortedLowMoodEntries = [...lowMoodEntries].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
      
      sortedLowMoodEntries.forEach(entry => {
        const collabId = entry.collaboratorId || entry.userId;
        const collab = collaborators.find(c => c.id === collabId);
        if (collab && isOperationalCollaborator(collab) && !processedUsers.has(`${m.id}-${collab.id}`)) {
          lowMoodConsultants.push({
            ...collab,
            missionId: m.id,
            clientName: m.clientName,
            missionName: m.name,
            sentiment: entry.sentiment,
            updatedAt: entry.updatedAt
          });
          processedUsers.add(`${m.id}-${collab.id}`);
        }
      });
    });

    const badWeatherMissions: any[] = [];
    const processedWeatherUsers = new Set<string>();

    filteredMissions.forEach(m => {
      if (m.status !== MissionStatus.EN_COURS) return;
      
      const missionPlanning = planning.filter(p => p.missionId === m.id);
      const tempBadWeatherEntries = missionPlanning.filter(p => p.weather && ['cloud', 'rain', 'storm'].includes(p.weather));
      
      // Trier par date du changement de statut pour avoir la version la plus récente en premier
      const sortedEntries = [...tempBadWeatherEntries].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
      
      sortedEntries.forEach(entry => {
        const collabId = entry.collaboratorId || entry.userId;
        const collab = collaborators.find(c => c.id === collabId);
        if (collab && isOperationalCollaborator(collab) && !processedWeatherUsers.has(`${m.id}-${collab.id}`)) {
          badWeatherMissions.push({
            id: `badweather-${m.id}-${collab.id}`,
            clientName: m.clientName,
            missionName: m.name,
            collabFirstName: collab.firstName,
            collabLastName: collab.lastName,
            weather: entry.weather,
            updatedAt: entry.updatedAt
          });
          processedWeatherUsers.add(`${m.id}-${collab.id}`);
        }
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

  const topClients = useMemo(() => {
    const clientMap: Record<string, { clientName: string; fyRevenue: number; missionCount: number }> = {};
    
    missionsForSelectedFY.forEach(m => {
      const metrics = missionMetrics.find(mm => mm.mission.id === m.id);
      const rev = metrics?.fyRevenue || 0;
      if (rev <= 0) return;
      const rawName = (m.clientName || '').trim();
      if (!rawName) return;
      
      const key = rawName.toLowerCase();
      if (!clientMap[key]) {
        clientMap[key] = { clientName: rawName, fyRevenue: 0, missionCount: 0 };
      }
      clientMap[key].fyRevenue += rev;
      clientMap[key].missionCount += 1;
    });

    return Object.values(clientMap)
      .sort((a, b) => b.fyRevenue - a.fyRevenue)
      .slice(0, 5);
  }, [missionsForSelectedFY, missionMetrics]);

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
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center min-h-[337px] group/ring relative">
          <h3 className={`${CARD_TITLE_CLASS} text-center w-full`}>CA PRÉVISIONNEL (+SF)</h3>
          <div className="flex-1 w-full flex flex-col items-center justify-center">
            <div className="h-44 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        return (
                          <div className="bg-navy p-2.5 rounded-xl shadow-xl border border-white/10 text-white text-left z-50">
                            <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">{data.name}</p>
                            <p className="text-sm font-black text-amber-300">{formatNumberWithDots(data.value as number)} €</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
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
                    {caRingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    <Label 
                      value={`${Math.round((totalCombinedForecast / (budgetedRevenue || 1)) * 100)}%`} 
                      position="center" 
                      className="font-black text-2xl fill-navy"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Montants et Décomposition */}
            <div className="text-center mt-1 w-full space-y-1">
              <p className="text-xl font-black text-navy tracking-tight">{formatNumberWithDots(totalCombinedForecast)} €</p>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest opacity-60">OBJECTIF : {formatNumberWithDots(budgetedRevenue)} €</p>

              {/* Légende détaillée pour distinguer les 2 composantes */}
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-1 text-left px-2">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e1b129] shrink-0"></span>
                    <span className="text-gray-500 font-semibold truncate">Prév. missions (+SF)</span>
                  </div>
                  <span className="font-bold text-navy font-mono ml-2 shrink-0">{formatNumberWithDots(totalForecastRevenue)} €</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#fef08a] border border-amber-300 shrink-0"></span>
                    <span className="text-gray-500 font-semibold truncate">Prév. Transfo (Xsell)</span>
                  </div>
                  <span className="font-bold text-amber-700 font-mono ml-2 shrink-0">{formatNumberWithDots(xsellForecastTransfo)} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Graphique Staffing Mensuel */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center min-h-[337px]">
          <h3 className={`${CARD_TITLE_CLASS} text-center w-full`}>STAFFING MENSUEL (RÉEL + PRÉV)</h3>
          <div className="flex-1 w-full flex flex-col items-center justify-center pt-2">
             <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyStaffingData} margin={{ left: -30, right: 10, top: 10 }}>
                    <defs>
                      <linearGradient id="ytdGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e1b129" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#e1b129" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
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
                      ticks={[0, 25, 50, 75, 100]}
                      fontSize={8} 
                      fontWeight={800} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
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
                    
                    {/* Accentuated Grid Lines */}
                    {[0, 25, 50, 75, 100].map(val => (
                      <ReferenceLine key={val} y={val} stroke="#e2e8f0" strokeWidth={1} />
                    ))}

                    <Line type="monotone" dataKey="rate" stroke="#e1b129" strokeWidth={3} dot={{ fill: '#e1b129', r: 3, strokeWidth: 2 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                    
                    {/* Darker 80% Target Line in Foreground */}
                    <ReferenceLine y={80} stroke="#64748b" strokeDasharray="4 4" strokeWidth={1.5} isFront={true}>
                       <Label value="OBJ. 80%" position="insideBottomRight" fontSize={7} fontWeight={900} fill="#475569" />
                    </ReferenceLine>
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
                    {/* Tooltip Noms Collaborateurs + Date + % */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-navy p-3 rounded-2xl shadow-2xl border border-white/10 hidden group-hover/h:block z-[70] animate-in fade-in zoom-in duration-200 pointer-events-none max-h-56 overflow-y-auto no-scrollbar">
                       <div className="border-b border-white/10 pb-2 mb-2">
                         <p className="text-[9px] font-black text-yellow-accent uppercase tracking-widest">Disponibles le {h.dateLabel}</p>
                         <p className="text-[7px] font-black text-white/40 uppercase tracking-tighter">Total : {h.count} Consultants</p>
                       </div>
                       <div className="space-y-1.5">
                          {h.users.length === 0 ? (
                            <p className="text-[9px] text-white/40 italic">Aucun collaborateur disponible</p>
                          ) : (
                            h.users.map((u, idx) => (
                              <div key={idx} className="flex justify-between items-center gap-3">
                                <p className="text-[10px] text-white font-bold truncate">{u.name}</p>
                                <p className="text-[10px] text-yellow-accent font-black shrink-0">{u.availability}%</p>
                              </div>
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
          <h3 className={`${SECTION_TITLE_CLASS} mb-6`}>TOP 5 CLIENTS PAR CA {globalFY} (+SF)</h3>
          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {topClients.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">
                Aucun client avec du CA sur {globalFY}
              </div>
            ) : (
              topClients.map((client, i) => {
                const shareOfGlobal = totalForecastRevenue > 0 ? (client.fyRevenue / totalForecastRevenue) * 100 : 0;
                return (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-100/50 rounded-2xl border border-transparent hover:border-yellow-accent/20 transition-all group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-yellow-accent flex items-center justify-center font-black text-white text-[9px] shadow-sm shrink-0 group-hover:scale-105 transition-transform">{i + 1}</div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-navy uppercase tracking-tight truncate">{client.clientName}</p>
                        <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 truncate">
                          {client.missionCount} mission{client.missionCount > 1 ? 's' : ''} • {shareOfGlobal.toFixed(1)}% du CA global
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xs font-black text-navy">{formatNumberWithDots(client.fyRevenue)} €</p>
                      <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">CA {globalFY}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={CONTENT_BLOCK_CLASS}>
          <h3 className={`${SECTION_TITLE_CLASS} mb-6`}>TOP 5 MISSIONS PAR RENTABILITÉ {globalFY}</h3>
          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {missionMetrics
              .filter(mm => missionsForSelectedFY.some(mfy => mfy.id === mm.mission.id) && mm.fyProdCost > 0 && mm.mission.status !== MissionStatus.NON_DEMARREE)
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
                  <p className={`text-xs font-black ${m.fyMargin >= 15 ? 'text-emerald-600' : m.fyMargin > 0 ? 'text-orange-500' : 'text-red-600'}`}>{Math.round(m.fyMargin)}%</p>
                  <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">MARGE {globalFY}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION SUIVI XSELL */}
      <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
        <h3 className={`${SECTION_TITLE_CLASS}`}>
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shrink-0">
            <TrendingUp size={16} />
          </div>
          SUIVI XSELL
        </h3>
        
        {/* Metric Cards - 5 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total opportunités */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Total Opportunités</span>
              <div className="text-xl font-black text-navy">{xsellMetrics.totalCount}</div>
              <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                <span>dont {xsellMetrics.statusCount['KO'] || 0} KO</span>
              </div>
            </div>
            <div className="absolute right-4 top-4 bg-navy/5 text-navy p-3 rounded-full">
              <Briefcase size={20} />
            </div>
          </div>

          {/* Card 2: Missions en cours */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Missions En Cours</span>
              <div className="text-xl font-black text-amber-600">{xsellMetrics.countInProgress}</div>
              <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                <span>{xsellMetrics.countCompleted} terminées</span>
              </div>
            </div>
            <div className="absolute right-4 top-4 bg-amber-50 text-amber-600 p-3 rounded-full">
              <Layers size={20} />
            </div>
          </div>

          {/* Card 3: CA bénéficiaire estimé */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden flex-1 min-w-0">
            <div className="space-y-1 z-10 min-w-0 w-full">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA Bénéficiaire Estimé</span>
              <div className="text-xl font-medium text-black truncate">{formatCurrencyXsell(xsellMetrics.totalEstRevenue)}</div>
              <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-black inline-block"></span>
                <span>Entités Groupe EPSA</span>
              </div>
            </div>
            <div className="absolute right-4 top-4 bg-black/5 text-black p-3 rounded-full">
              <Coins size={20} />
            </div>
          </div>

          {/* Card 4: CA prév. Transfo à facturer */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden flex-1 min-w-0">
            <div className="space-y-1 z-10 min-w-0 w-full">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA prév. Transfo à facturer</span>
              <div className="text-xl font-medium text-emerald-600 truncate">{formatCurrencyXsell(xsellMetrics.transfoInProgress)}</div>
              <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>Prév. Transfo (Xsell)</span>
              </div>
            </div>
            <div className="absolute right-4 top-4 bg-emerald-50 text-emerald-600 p-3 rounded-full">
              <Euro size={20} />
            </div>
          </div>

          {/* Card 5: CA transfo facturé */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden flex-1 min-w-0">
            <div className="space-y-1 z-10 min-w-0 w-full">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CA Transfo facturé</span>
              <div className="text-xl font-medium text-green-500 truncate">{formatCurrencyXsell(xsellMetrics.transfoCompleted)}</div>
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

        {/* Breakdowns - 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 6: Répartition par Statut */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
              <Layers size={14} className="text-navy" /> Répartition par Statut
            </h3>
            {Object.keys(xsellMetrics.statusCount).length === 0 ? (
              <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
            ) : (
              <div className="flex flex-col flex-1 h-[160px] justify-between">
                <div className="flex items-end justify-between h-[155px] pb-1 border-b border-gray-100 relative px-1">
                  <div className="absolute inset-x-0 bottom-1/4 border-b border-gray-50 border-dashed pointer-events-none"></div>
                  <div className="absolute inset-x-0 bottom-2/4 border-b border-gray-50 border-dashed pointer-events-none"></div>
                  <div className="absolute inset-x-0 bottom-3/4 border-b border-gray-50 border-dashed pointer-events-none"></div>

                  {(() => {
                    const statusesToDisplay = Object.entries(xsellMetrics.statusCount)
                      .filter(([status]) => status !== 'KO' && status !== 'Non renseigné')
                      .sort((a, b) => a[0].localeCompare(b[0]));
                    
                    const maxDisplayCount = Math.max(...statusesToDisplay.map(([_, count]) => count as number), 1);

                    return statusesToDisplay.map(([status, count], barIndex) => {
                      const pct = Math.round(((count as number) / (xsellMetrics.totalCount || 1)) * 100) || 0;
                      const heightPct = ((count as number) / maxDisplayCount) * 100;
                      const barColorClass = getStatusProgressBarColorXsell(status);
                      
                      const parts = status.split(' - ');
                      const name = parts[parts.length - 1] || status;
                      let shortName = name;
                      if (name.toLowerCase().includes('rdv à venir')) shortName = 'RDV à ven.';
                      if (name.toLowerCase().includes('rdv réalisé')) shortName = 'RDV réal.';
                      if (name.toLowerCase().includes('contrat signé')) shortName = 'Contrat';
                      if (name.toLowerCase().includes('cours')) shortName = 'En cours';
                      if (name.toLowerCase().includes('terminée')) shortName = 'Terminée';

                      const oppsForStatus = xsellMetrics.statusOpportunities?.[status] || [];

                      // Position popup correctly so it is never cut off by the left navigation menu
                      const isLeftBar = barIndex <= 1;
                      const isRightBar = barIndex >= statusesToDisplay.length - 2;
                      const popupAlignment = isLeftBar 
                        ? 'left-0 items-start' 
                        : isRightBar 
                          ? 'right-0 items-end' 
                          : 'left-1/2 -translate-x-1/2 items-center';
                      const arrowAlignment = isLeftBar ? 'left-6' : isRightBar ? 'right-6' : 'left-1/2 -translate-x-1/2';

                      return (
                        <div key={status} className="flex flex-col items-center flex-1 group relative">
                          {/* Pop-up détaillé optimisé au survol (sans ascenseur, lecture immédiate et décalage anti-coupure) */}
                          <div className={`absolute bottom-full mb-3 hidden group-hover:flex flex-col ${popupAlignment} z-50 pointer-events-none transition-all animate-in fade-in zoom-in-95 duration-150`}>
                            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-white/20 p-3 w-84 max-w-sm text-left ring-1 ring-black/20">
                              {/* Header du Pop-up */}
                              <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2 gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${barColorClass.split(' ')[0]}`}></div>
                                  <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider truncate">
                                    {status}
                                  </span>
                                </div>
                                <span className="bg-white/15 text-white font-mono text-[10px] px-2 py-0.5 rounded-md font-extrabold shrink-0 border border-white/15">
                                  {count as number} {(count as number) > 1 ? 'opportunités' : 'opportunité'} <span className="text-white/70 font-normal">({pct}%)</span>
                                </span>
                              </div>

                              {/* Liste détaillée des opportunités : Responsable - Compte Client - Entité Bénéficiaire */}
                              <div className="space-y-1.5">
                                {oppsForStatus.length === 0 ? (
                                  <p className="text-[10px] text-white/50 italic py-1">Aucune opportunité</p>
                                ) : (
                                  <>
                                    {oppsForStatus.slice(0, 10).map((opp, oIdx) => {
                                      const owner = opp.account_owner || '-';
                                      const account = opp.account_name || 'Client non précisé';
                                      const entity = opp.beneficiary_entity || '-';

                                      return (
                                        <div
                                          key={opp.id || `opp-${oIdx}`}
                                          className="text-[10px] bg-white/10 rounded-lg px-2.5 py-1.5 border border-white/10 flex items-center justify-between gap-2"
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            <span className="font-bold text-amber-300 text-[10px] truncate shrink-0 max-w-[90px]" title={owner}>
                                              {owner}
                                            </span>
                                            <span className="text-white/40 text-[9px] font-bold">•</span>
                                            <span className="font-semibold text-white text-[10px] truncate" title={account}>
                                              {account}
                                            </span>
                                          </div>
                                          <span className="text-[9px] text-sky-200 bg-sky-950/60 border border-sky-400/20 px-1.5 py-0.5 rounded font-medium truncate shrink-0 max-w-[85px]" title={entity}>
                                            {entity.length > 12 ? entity.substring(0, 10) + '..' : entity}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    {oppsForStatus.length > 10 && (
                                      <div className="pt-0.5 text-center text-[9px] text-amber-300 font-semibold">
                                        + {oppsForStatus.length - 10} autre{oppsForStatus.length - 10 > 1 ? 's' : ''} opportunité{oppsForStatus.length - 10 > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            {/* Flèche pointeur avec positionnement adaptatif */}
                            <div className={`w-2.5 h-2.5 bg-slate-900 rotate-45 -mt-1 shadow-sm border-r border-b border-white/20 relative ${arrowAlignment}`}></div>
                          </div>

                          <span className="text-[10px] font-extrabold text-navy/80 mb-1 transition-all group-hover:scale-110 group-hover:text-navy">
                            {count}
                          </span>

                          <div className="w-7 sm:w-9 bg-gray-50/50 rounded-t-md relative overflow-hidden flex items-end h-[105px] border border-gray-100/50 hover:border-gray-300 hover:shadow-sm transition-all duration-200 cursor-pointer">
                            <div 
                              className={`w-full rounded-t-sm transition-all duration-700 ease-out origin-bottom ${barColorClass}`}
                              style={{ height: `${heightPct}%` }}
                            ></div>
                          </div>

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

          {/* Card 7: Top Responsables Lead */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
              <Users size={14} className="text-blue-500" /> Top Responsables Lead
            </h3>
            {xsellMetrics.topOwners.length === 0 ? (
              <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[160px] pr-1.5 small-scrollbar">
                {xsellMetrics.topOwners.map((item) => {
                  const maxVal = xsellMetrics.topOwners[0]?.value || 1;
                  const pct = Math.round((item.value / maxVal) * 100) || 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-navy tracking-tight">
                        <span className="truncate">{item.name}</span>
                        <span>{formatCurrencyXsell(item.value)}</span>
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

          {/* Card 8: Top Entités Bénéficiaires */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-xs font-black text-navy uppercase tracking-widest border-b pb-2.5 mb-3 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-emerald-500" /> Top Entités Bénéficiaires
            </h3>
            {xsellMetrics.topEntities.length === 0 ? (
              <p className="text-center text-xs text-gray-300 py-6 font-semibold">Aucune donnée disponible</p>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[160px] pr-1.5 small-scrollbar">
                {xsellMetrics.topEntities.map((item) => {
                  const maxVal = xsellMetrics.topEntities[0]?.value || 1;
                  const pct = Math.round((item.value / maxVal) * 100) || 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-navy tracking-tight">
                        <span className="truncate">{item.name}</span>
                        <span>{formatCurrencyXsell(item.value)}</span>
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
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-96 max-w-[90vw] bg-navy/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/15 p-5 hidden group-hover:block z-[60] animate-in fade-in zoom-in duration-200 pointer-events-none transition-all">
                  <div className="text-xs font-black text-yellow-accent uppercase mb-4 border-b border-white/10 pb-2 flex justify-between items-center tracking-widest">
                    <span>Détails Alertes</span>
                    <span className="bg-white/15 px-2.5 py-0.5 rounded-lg text-white font-mono text-[10px]">{list.length}</span>
                  </div>
                  <div className="space-y-3.5">
                    {list.length === 0 ? (
                      <p className="text-[11px] text-white/60 font-bold uppercase italic text-center py-2">Aucune alerte</p>
                    ) : (
                      list.slice(0, 12).map((item: any, idx: number) => {
                        let line1: React.ReactNode = '';
                        let line2: React.ReactNode = '';
                        let isLine2Bold = true;

                        if (key === 'lowMoodConsultants') {
                          line1 = `${item.firstName} ${item.lastName} ${item.sentiment}${formatMoodDate(item.updatedAt)}`;
                          line2 = `${item.clientName} / ${item.missionName}`;
                          isLine2Bold = false;
                        } else if (key === 'badWeatherMissions') {
                          line1 = `${item.clientName} / ${item.missionName}`;
                          const emoji = item.weather === 'cloud' ? '☁️' : item.weather === 'rain' ? '🌧️' : item.weather === 'storm' ? '⛈️' : '';
                          line2 = (
                            <span className="inline-flex items-center gap-1.5 align-middle">
                              <span>{item.collabFirstName} {item.collabLastName}</span>
                              {emoji && <span className="text-[18px] leading-none inline-block select-none transform hover:scale-110 transition-transform">{emoji}</span>}
                              <span>{formatMoodDate(item.updatedAt)}</span>
                            </span>
                          );
                          isLine2Bold = false;
                        } else if (key === 'lateTimesheets') {
                          line1 = `${item.firstName} ${item.lastName}`;
                          const dates = (item.missingDates || []).map((d: any) => d.label);
                          line2 = (
                            <div className="mt-1 space-y-1">
                              <span className="text-white/80 font-normal">
                                {item.missingDaysCount || dates.length} jour{(item.missingDaysCount || dates.length) > 1 ? 's' : ''} non renseigné{(item.missingDaysCount || dates.length) > 1 ? 's' : ''}
                              </span>
                              {dates.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5 max-h-16 overflow-y-auto">
                                  {dates.map((lbl: string, dIdx: number) => (
                                    <span key={dIdx} className="inline-block px-1.5 py-0.5 bg-yellow-accent/20 border border-yellow-accent/40 text-yellow-accent text-[9px] font-bold rounded">
                                      {lbl}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                          isLine2Bold = false;
                        } else if (key === 'lowMargin') {
                          line1 = item.mission?.clientName || '';
                          line2 = `${Math.round(item.margin)}% marge`;
                        } else if (key === 'noStaffing') {
                          line1 = item.clientName || '';
                          line2 = item.name || '';
                        } else {
                          line1 = `${item.firstName} ${item.lastName}`;
                          line2 = item.grade || '';
                        }

                        return (
                          <div key={idx} className="flex flex-col border-l-2 border-yellow-accent pl-3 py-1 hover:bg-white/5 rounded-r transition-colors">
                            <p className="text-xs font-black text-white uppercase truncate tracking-tight">
                              {line1}
                            </p>
                            <div className={`text-[10px] text-white uppercase mt-1 ${isLine2Bold ? 'font-bold' : 'font-normal'}`}>
                              {line2}
                            </div>
                          </div>
                        );
                      })
                    )}
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