import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, Check, CalendarDays, Users, Briefcase, TrendingUp, AlertCircle, FileSpreadsheet, Search } from 'lucide-react';
import { Mission, AppState, TimesheetStatus } from '../types';
import { 
  format, 
  parseISO, 
  isValid, 
  eachWeekOfInterval, 
  startOfWeek, 
  endOfWeek, 
  isAfter, 
  isBefore,
  addWeeks,
  isSameDay
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { getBusinessDays } from '../utils';

interface MissionDetailModalProps {
  mission: Mission;
  onClose: () => void;
  state: AppState;
}

export const MissionDetailModal: React.FC<MissionDetailModalProps> = ({ mission, onClose, state }) => {
  const [collabSearch, setCollabSearch] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentWeekHeaderRef = useRef<HTMLTableHeaderCellElement>(null);

  const currentWeekKey = useMemo(() => {
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, []);

  // 1. Get list of all weeks for this mission (Start -> End)
  const weeks = useMemo(() => {
    const start = parseISO(mission.startDate);
    const end = parseISO(mission.endDate);
    if (!isValid(start) || !isValid(end)) return [];

    try {
      // Settle Monday for the first week and generate everything up to the end week
      const normalizedStart = startOfWeek(start, { weekStartsOn: 1 });
      const weekInterval = eachWeekOfInterval({ start: normalizedStart, end }, { weekStartsOn: 1 });
      return weekInterval.map(mondayDate => {
        const weekKey = format(mondayDate, 'yyyy-MM-dd');
        return {
          date: mondayDate,
          key: weekKey,
          label: `S${format(mondayDate, 'w')}`,
          range: `${format(mondayDate, 'dd/MM')} - ${format(endOfWeek(mondayDate, { weekStartsOn: 1 }), 'dd/MM')}`
        };
      });
    } catch (e) {
      console.error("[MissionDetailModal] Error generating weeks:", e);
      return [];
    }
  }, [mission.startDate, mission.endDate]);

  // 2. Gather all unique consultants who have planning in this mission OR has logged timesheets
  const consultants = useMemo(() => {
    const rawConsultants: Array<{ id: string; name: string; type: 'internal' | 'freelance' | 'subcontractor' }> = [];

    // Sourced from Planning entries
    const missionPlannings = state.planning.filter(p => p.missionId === mission.id);
    missionPlannings.forEach(p => {
      const colId = p.collaboratorId || p.userId || p.id;
      if (!colId) return;
      const colRef = state.collaborators.find(c => c.id === colId);
      const name = p.externalName || (colRef ? `${colRef.firstName} ${colRef.lastName}` : 'Collaborateur Externe');
      const type = p.externalType || colRef?.collaboratorType || 'internal';
      rawConsultants.push({ id: colId, name, type });
    });

    // Sourced from Timesheets entries (in case they logged time but aren't in planning)
    const missionTimesheets = state.timesheets.filter(t => t.missionId === mission.id);
    missionTimesheets.forEach(t => {
      const colId = t.collaboratorId || t.userId;
      if (!colId) return;
      if (rawConsultants.some(rc => rc.id === colId)) return;
      const colRef = state.collaborators.find(c => c.id === colId);
      const name = colRef ? `${colRef.firstName} ${colRef.lastName}` : 'Loggeur de temps';
      const type = colRef?.collaboratorType || 'internal';
      rawConsultants.push({ id: colId, name, type });
    });

    // Dynamic extraction of staffing cards from internal/freelance/subcontractor rows of the mission
    (mission.internalStaffing || []).forEach(st => {
      const colId = st.collaboratorId || st.userId;
      if (!colId) return;
      const colRef = state.collaborators.find(c => c.id === colId);
      const name = colRef ? `${colRef.firstName} ${colRef.lastName}` : 'Interne';
      rawConsultants.push({ id: colId, name, type: 'internal' });
    });

    (mission.freelanceStaffing || []).forEach(frRow => {
      if (!frRow.id) return;
      const name = `${frRow.firstName || 'Freelance'} ${frRow.lastName || ''}`;
      rawConsultants.push({ id: frRow.id, name, type: 'freelance' });
    });

    (mission.subcontractorStaffing || []).forEach(subRow => {
      if (!subRow.id) return;
      const name = subRow.entity || 'Sous-traitant';
      rawConsultants.push({ id: subRow.id, name, type: 'subcontractor' });
    });

    // Let's group identical external names (for freelancers/subcontractors) and same IDs (for internals) dynamically
    const groups: Array<{
      id: string;
      name: string;
      type: 'internal' | 'freelance' | 'subcontractor';
      talentIds: string[];
    }> = [];

    rawConsultants.forEach(item => {
      const type = item.type || 'internal';
      if (type === 'internal') {
        let existing = groups.find(g => g.type === 'internal' && g.id === item.id);
        if (!existing) {
          existing = { id: item.id, name: item.name, type: 'internal', talentIds: [] };
          groups.push(existing);
        }
        if (!existing.talentIds.includes(item.id)) {
          existing.talentIds.push(item.id);
        }
      } else {
        const normName = item.name.trim().toLowerCase();
        let existing = groups.find(g => g.type === type && g.name.trim().toLowerCase() === normName);
        if (!existing) {
          existing = { id: item.id, name: item.name, type: type as any, talentIds: [] };
          groups.push(existing);
        }
        if (!existing.talentIds.includes(item.id)) {
          existing.talentIds.push(item.id);
        }
        // Also capture item.id in talentIds
        if (item.id && !existing.talentIds.includes(item.id)) {
          existing.talentIds.push(item.id);
        }
      }
    });

    let list = groups;

    // Apply names search query filter if any
    if (collabSearch.trim()) {
      const q = collabSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }

    return list;
  }, [mission, state.planning, state.timesheets, state.collaborators, collabSearch]);

  useEffect(() => {
    if (weeks.length > 0) {
      const timer = setTimeout(() => {
        if (scrollContainerRef.current && currentWeekHeaderRef.current) {
          const container = scrollContainerRef.current;
          const header = currentWeekHeaderRef.current;
          // Calculate target scrollLeft to align with the sticky column (240px wide)
          const targetScroll = Math.max(0, header.offsetLeft - 240);
          container.scrollTo({
            left: targetScroll,
            behavior: 'smooth'
          });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [weeks]);

  // 3. Construct cell metrics map: key is `${consultantId}|${weekStartKey}`
  const gridData = useMemo(() => {
    const data: Record<string, {
      actualDays: number;
      plannedDays: number;
      hasActual: boolean;
    }> = {};

    const missionTimesheets = state.timesheets.filter(
      t => t.missionId === mission.id && t.status === TimesheetStatus.VALIDE
    );

    consultants.forEach(c => {
      weeks.forEach(w => {
        const key = `${c.id}|${w.key}`;

        // Compute actual days from validated timesheets
        const userWeekTimesheets = missionTimesheets.filter(
          t => (c.talentIds.includes(t.collaboratorId || '') || c.talentIds.includes(t.userId || '')) && t.weekStart === w.key
        );
        const hasActual = userWeekTimesheets.length > 0;
        const actualDays = userWeekTimesheets.reduce((acc, t) => acc + (t.percentage / 100), 0);

        // Compute planned days from staffing/planning table
        const pEntries = state.planning.filter(
          p => p.missionId === mission.id && 
               (c.talentIds.includes(p.collaboratorId || '') || c.talentIds.includes(p.userId || '')) && 
               p.weekStart === w.key
        );

        let plannedDays = 0;
        if (pEntries.length > 0) {
          const wEnd = endOfWeek(w.date, { weekStartsOn: 1 });
          const bDays = getBusinessDays(w.date, wEnd, state.holidays, mission.country);
          // Standard: sum the percentages of any matching planning entries
          pEntries.forEach(pEntry => {
            plannedDays += bDays.length * (pEntry.percentage / 100);
          });
        }

        data[key] = {
          actualDays,
          plannedDays,
          hasActual
        };
      });
    });

    return data;
  }, [consultants, weeks, state.timesheets, state.planning, state.holidays, mission.id, mission.country]);

  // 4. Compute Totals
  const consultantRowTotals = useMemo(() => {
    const totals: Record<string, { actualTotal: number; plannedTotal: number; mixedTotal: number }> = {};
    consultants.forEach(c => {
      let actualTotal = 0;
      let plannedTotal = 0;
      let mixedTotal = 0;

      weeks.forEach(w => {
        const key = `${c.id}|${w.key}`;
        const cell = gridData[key] || { actualDays: 0, plannedDays: 0, hasActual: false };
        actualTotal += cell.actualDays;
        plannedTotal += cell.plannedDays;
        
        // Mixed Total: actual days if logged, else planned forecasted days
        mixedTotal += cell.hasActual ? cell.actualDays : cell.plannedDays;
      });

      totals[c.id] = { actualTotal, plannedTotal, mixedTotal };
    });
    return totals;
  }, [consultants, weeks, gridData]);

  const weekColumnTotals = useMemo(() => {
    const totals: Record<string, { actualTotal: number; plannedTotal: number; mixedTotal: number }> = {};
    weeks.forEach(w => {
      let actualTotal = 0;
      let plannedTotal = 0;
      let mixedTotal = 0;

      consultants.forEach(c => {
        const key = `${c.id}|${w.key}`;
        const cell = gridData[key] || { actualDays: 0, plannedDays: 0, hasActual: false };
        actualTotal += cell.actualDays;
        plannedTotal += cell.plannedDays;
        mixedTotal += cell.hasActual ? cell.actualDays : cell.plannedDays;
      });

      totals[w.key] = { actualTotal, plannedTotal, mixedTotal };
    });
    return totals;
  }, [weeks, consultants, gridData]);

  // General KPIs sum
  const kpis = useMemo(() => {
    let globalActual = 0;
    let globalPlannedRemaining = 0;
    const now = new Date();

    consultants.forEach(c => {
      weeks.forEach(w => {
        const key = `${c.id}|${w.key}`;
        const cell = gridData[key] || { actualDays: 0, plannedDays: 0, hasActual: false };
        globalActual += cell.actualDays;

        // Is the week start or end in the current/future?
        const wEnd = endOfWeek(w.date, { weekStartsOn: 1 });
        if (isAfter(wEnd, now) || isSameDay(w.date, now)) {
          // If no actual logged, count planned
          if (!cell.hasActual) {
            globalPlannedRemaining += cell.plannedDays;
          }
        }
      });
    });

    return {
      globalActual,
      globalPlannedRemaining,
      grandTotal: globalActual + globalPlannedRemaining
    };
  }, [consultants, weeks, gridData]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200" id="mission-detail-modal">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[96%] max-w-7xl max-h-[94vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header styling */}
        <div className="bg-navy px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
              <FileSpreadsheet className="text-yellow-accent" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] lg:text-xs font-black uppercase tracking-widest text-yellow-accent px-2 py-0.5 rounded bg-white/10">Tableur Temps</span>
                <span className="text-white/60 text-xs lg:text-sm font-bold font-mono">ID: {mission.id}</span>
              </div>
              <h2 className="text-base lg:text-xl font-black uppercase leading-tight mt-1">
                {mission.clientName} <span className="text-yellow-accent/90">&bull;</span> {mission.name}
              </h2>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Bento stats row & Filter section */}
        <div className="px-6 py-4 border-b bg-slate-50 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            {/* KPI 1 */}
            <div className="bg-white border border-slate-200 text-left rounded-xl px-5 py-3 flex items-center gap-4.5 shadow-sm min-w-[180px]">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Check size={20} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Réel Validé</p>
                <p className="text-base lg:text-lg font-black text-navy">{kpis.globalActual.toFixed(1)} <span className="text-xs font-bold text-gray-400">jours</span></p>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white border border-slate-200 text-left rounded-xl px-5 py-3 flex items-center gap-4.5 shadow-sm min-w-[180px]">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <CalendarDays size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Prévu Restant</p>
                <p className="text-base lg:text-lg font-black text-navy">{kpis.globalPlannedRemaining.toFixed(1)} <span className="text-xs font-bold text-gray-400">jours</span></p>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white border border-slate-200 text-left rounded-xl px-5 py-3 flex items-center gap-4.5 shadow-sm min-w-[180px]">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Estimé (Réel+Prév)</p>
                <p className="text-base lg:text-lg font-black text-navy">{kpis.grandTotal.toFixed(1)} <span className="text-xs font-bold text-gray-400">jours</span></p>
              </div>
            </div>
          </div>

          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input 
              type="text"
              placeholder="Rechercher un consultant..."
              value={collabSearch}
              onChange={e => setCollabSearch(e.target.value)}
              className="w-full pl-9.5 pr-8 py-2 border border-slate-200 bg-white text-xs font-bold text-navy uppercase rounded-lg outline-none focus:border-navy focus:ring-1 focus:ring-navy/10"
            />
            {collabSearch && (
              <button 
                onClick={() => setCollabSearch('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-navy text-sm font-bold"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* The Spreadsheet / Data grid wrapper with customized overflow */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
          {weeks.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200/50 rounded-xl p-6 text-center text-yellow-800 flex flex-col items-center justify-center gap-2">
              <AlertCircle size={28} />
              <p className="font-bold text-xs uppercase tracking-wider">Erreur de paramétrage des dates</p>
              <p className="text-xs">Cette mission ne possède pas de plages de dates cohérentes (Début: {mission.startDate}, Fin: {mission.endDate})</p>
            </div>
          ) : consultants.length === 0 ? (
            <div className="bg-slate-100 border rounded-xl p-8 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
              <Users size={28} />
              <p className="font-bold text-xs uppercase tracking-wider">Aucun collaborateur trouvé</p>
              <p className="text-[10px]">Aucun collaborateur n'est actuellement planifié ou n'a saisi de temps sur cette mission.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col min-w-full">
              {/* Table Wrapper with horizontal scrolling */}
              <div ref={scrollContainerRef} className="overflow-x-auto min-w-full">
                <table className="border-collapse table-auto min-w-full text-left">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-white">
                      {/* Frozen Consultant ID/Name Column Header */}
                      <th className="sticky left-0 bg-slate-900 z-30 px-5 py-3.5 text-xs lg:text-sm font-black uppercase tracking-wider min-w-[240px] border-r border-slate-800 font-sans">
                        Collaborateur
                      </th>
                      {/* Dynamic Weeks Columns Header */}
                      {weeks.map(w => {
                        const isCurrentWeek = w.key === currentWeekKey;
                        return (
                          <th 
                            key={w.key} 
                            ref={isCurrentWeek ? currentWeekHeaderRef : undefined}
                            className={`px-4 py-2.5 text-center text-xs font-black uppercase tracking-tight min-w-[110px] border-r transition-colors ${
                              isCurrentWeek 
                                ? 'bg-red-950/90 border-r-red-800' 
                                : 'bg-slate-900 border-r-slate-800'
                            }`}
                          >
                            {isCurrentWeek && (
                              <div className="mb-1">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black bg-red-650 bg-red-600 text-white uppercase tracking-widest leading-none">
                                  En cours
                                </span>
                              </div>
                            )}
                            <div className={isCurrentWeek ? 'text-red-200 font-extrabold' : 'text-yellow-accent font-black'}>
                              {w.label}
                            </div>
                            <div className={`text-[9px] font-mono mt-1 tracking-tight ${
                              isCurrentWeek ? 'text-red-300' : 'text-slate-300'
                            }`}>
                              {w.range}
                            </div>
                          </th>
                        );
                      })}
                      {/* Row Total Headers (Mixed tracking is best) */}
                      <th className="px-5 py-3.5 text-center text-xs font-black uppercase tracking-wider min-w-[140px] bg-slate-900">
                        Total Général
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultants.map((c, cIdx) => {
                      const isEven = cIdx % 2 === 0;
                      const rowBg = isEven ? 'bg-white' : 'bg-slate-50';
                      const rowTotals = consultantRowTotals[c.id] || { actualTotal: 0, plannedTotal: 0, mixedTotal: 0 };

                      return (
                        <tr key={c.id} className={`${rowBg} hover:bg-slate-100 border-b border-slate-100 transition-colors`}>
                          {/* Frozen Consultant Left Column */}
                          <td className={`sticky left-0 ${rowBg} hover:bg-slate-100 z-20 px-5 py-3.5 border-r border-slate-200 flex items-center gap-3 min-w-[240px] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]`}>
                            <span className={`w-3 h-3 rounded-full shrink-0 ${
                              c.type === 'freelance' 
                                ? 'bg-orange-400' 
                                : c.type === 'subcontractor' 
                                  ? 'bg-purple-400' 
                                  : 'bg-blue-400'
                            }`} />
                            <div className="overflow-hidden">
                              <p className="font-black text-navy text-xs lg:text-[13px] uppercase truncate tracking-tight">{c.name}</p>
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-1">
                                {c.type === 'freelance' ? 'Freelance' : c.type === 'subcontractor' ? 'Sous-traitant' : 'Salarié'}
                              </p>
                            </div>
                          </td>

                          {/* Render cells for each week in the row */}
                          {weeks.map(w => {
                            const cellKey = `${c.id}|${w.key}`;
                            const cell = gridData[cellKey] || { actualDays: 0, plannedDays: 0, hasActual: false };
                            const isCurrentWeek = w.key === currentWeekKey;

                            return (
                              <td 
                                key={w.key} 
                                className={`p-1.5 px-2.5 border-r border-slate-100 text-center transition-colors ${
                                  isCurrentWeek ? 'bg-red-50/40' : ''
                                }`}
                              >
                                {cell.hasActual ? (
                                  // Validated days logged (Emerald style)
                                  <div 
                                    className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-black tracking-tight flex flex-col items-center justify-center gap-1 shadow-sm shadow-emerald-50/20"
                                    title={`Temps réel validé pour la semaine ${w.label}`}
                                  >
                                    <div className="flex items-center gap-1 leading-none font-sans">
                                      <Check size={11} strokeWidth={3} className="text-emerald-600 shrink-0" />
                                      <span>{cell.actualDays.toFixed(1)} j</span>
                                    </div>
                                    <div className="text-[8px] font-black text-emerald-500 uppercase leading-none tracking-widest">Réel</div>
                                  </div>
                                ) : cell.plannedDays > 0 ? (
                                  // Planned days scheduled (Indigo style)
                                  <div 
                                    className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-5/60 text-indigo-800 text-xs font-bold tracking-tight flex flex-col items-center justify-center gap-1 shadow-sm shadow-indigo-50/20"
                                    title={`Temps prévisionnel planifié pour la semaine ${w.label}`}
                                  >
                                    <span className="leading-none">{cell.plannedDays.toFixed(1)} j</span>
                                    <span className="text-[8px] font-black text-indigo-400 uppercase leading-none tracking-widest">Prévu</span>
                                  </div>
                                ) : (
                                  // Empty cell
                                  <span className={`font-mono text-xs font-semibold ${isCurrentWeek ? 'text-red-400/85' : 'text-slate-350'}`}>-</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Row Mixed Total (Actual + Future Planned Remaining) */}
                          <td className="px-5 py-3 border-slate-200 text-center font-black text-xs lg:text-sm text-navy bg-slate-50/50">
                            <span className="bg-navy/5 px-3 py-1.5 rounded-lg border border-navy/15 inline-block font-sans">
                              {rowTotals.mixedTotal.toFixed(1)} j
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Column Totals Row */}
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-black">
                      <td className="sticky left-0 bg-slate-100 z-20 px-5 py-4 border-r border-slate-300 text-[11px] lg:text-xs text-navy uppercase tracking-wider shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                        TOTAL SEMAINE
                      </td>
                      {weeks.map(w => {
                        const colTotal = weekColumnTotals[w.key] || { actualTotal: 0, plannedTotal: 0, mixedTotal: 0 };
                        const isCurrentWeek = w.key === currentWeekKey;
                        return (
                          <td 
                            key={w.key} 
                            className={`px-4 py-3 text-center border-r border-slate-200 transition-colors ${
                              isCurrentWeek ? 'bg-red-50/50' : ''
                            }`}
                          >
                            {colTotal.mixedTotal > 0 ? (
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="text-xs lg:text-[13px] font-black text-navy leading-none">
                                  {colTotal.mixedTotal.toFixed(1)} j
                                </span>
                                <div className="text-[9px] font-extrabold text-navy/50 uppercase tracking-tight">
                                  {(colTotal.mixedTotal / 5).toFixed(1)} ETP
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 font-bold text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                      {/* Grand Total Intersection */}
                      <td className="px-5 py-4 text-center bg-slate-200 border-t border-slate-300 text-xs lg:text-sm font-black text-navy">
                        <span className="bg-navy text-white px-3.5 py-1.5 rounded-lg shadow-sm font-sans tracking-tight">
                          {kpis.grandTotal.toFixed(1)} j
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Legend Footer */}
        <div className="px-6 py-4 bg-white border-t flex flex-wrap items-center justify-between gap-5 shrink-0">
          <div className="flex flex-wrap gap-5 text-xs font-black uppercase tracking-wider text-gray-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-blue-400" />
              <span>Salarié</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-orange-400" />
              <span>Freelance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-purple-400" />
              <span>Sous-traitant</span>
            </div>
            <div className="w-px h-4.5 bg-gray-300 mx-1" />
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px] font-black flex items-center gap-1.5"><Check size={11} strokeWidth={2.5} /> 5.0 j</span>
              <span>Semaine validée (Réel)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px] font-bold">5.0 j</span>
              <span>Semaine prévisionnelle (Planning)</span>
            </div>
          </div>
          <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            1 ETP = 5 jours par semaine
          </div>
        </div>
      </div>
    </div>
  );
};
