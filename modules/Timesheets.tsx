import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X, 
  User, 
  Briefcase, 
  Palmtree, 
  GraduationCap, 
  Coffee, 
  Clock,
  Save,
  Check,
  ZapOff,
  CalendarOff,
  Target,
  Calendar
} from 'lucide-react';
import { AppState, TimesheetEntry, TimesheetStatus, MissionStatus, Role } from '../types';
import { getMonday, generateId } from '../utils';
import { addWeeks, addDays, format, isSameDay, parseISO, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TimesheetsProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

const APP_COLORS = {
  FORECAST: 'bg-amber-50/40 border-amber-200 text-amber-900', 
  ACTUAL: 'bg-emerald-50/40 border-emerald-200 text-emerald-900',     
  CONGES: 'bg-red-50 text-red-700 border-red-200',
  FORMATION: 'bg-purple-50 text-purple-700 border-purple-100',
  INTERMISSION: 'bg-slate-100 text-slate-700 border-slate-200',
  HOLIDAY: 'bg-gray-100 border-gray-200 text-gray-400',
};

// Liste des catégories hors-mission (Congés en première position)
const CATEGORIES = [
  { id: 'CONGES', label: 'Congés', icon: Palmtree, color: APP_COLORS.CONGES },
  { id: 'FORMATION', label: 'Formation', icon: GraduationCap, color: APP_COLORS.FORMATION },
  { id: 'INTERMISSION', label: 'Inter mission', icon: Coffee, color: APP_COLORS.INTERMISSION },
];

const Timesheets: React.FC<TimesheetsProps> = ({ state, updateState }) => {
  const [anchorWeek, setAnchorWeek] = useState(getMonday(new Date()));
  const [selectedUserId, setSelectedUserId] = useState(state.currentUser?.id || '');
  
  const selectableUsers = useMemo(() => {
    return state.collaborators.map(c => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      role: c.grade,
      country: c.country,
      isExternal: c.collaboratorType !== 'internal'
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.collaborators]);

  const [activeMenuDay, setActiveMenuDay] = useState<{ weekKey: string, dayIdx: number } | null>(null);
  const [validatingEntry, setValidatingEntry] = useState<any | null>(null);
  const [validationPercentage, setValidationPercentage] = useState<number>(0);
  const [validationComment, setValidationComment] = useState<string>('');

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuDay(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayedWeeks = useMemo(() => [
    anchorWeek,
    addWeeks(anchorWeek, 1)
  ], [anchorWeek]);

  const selectedUser = useMemo(() => selectableUsers.find(u => u.id === selectedUserId), [selectableUsers, selectedUserId]);
  const isAdmin = state.currentUser?.isAdmin || state.currentUser?.grade === Role.DIRECTEUR_ASSOCIE;
  const isSelf = selectedUserId === state.currentUser?.id;
  const canEdit = isAdmin || (isSelf && ![Role.BUSINESS_DEV].includes(state.currentUser?.grade as Role));

  const allAvailableMissions = useMemo(() => {
    return state.missions.filter(m => m.status === MissionStatus.EN_COURS && m.active);
  }, [state.missions]);

  const getWeekData = (weekStart: Date) => {
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    const weekDays = [0, 1, 2, 3, 4].map(d => addDays(weekStart, d));
    
    const actualEntries = state.timesheets.filter(t => t.userId === selectedUserId && t.weekStart === weekKey);
    const planningForWeek = state.planning.filter(p => p.userId === selectedUserId && p.weekStart === weekKey);
    
    const userHolidays = !selectedUser ? [] : state.holidays.filter(h => 
      h.country === selectedUser.country && weekDays.some(d => format(d, 'yyyy-MM-dd') === h.date)
    );

    const isDayHoliday = (day: Date) => userHolidays.find(h => h.date === format(day, 'yyyy-MM-dd'));

    const dailyData: Record<number, any[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const dayDate = weekDays[dayIdx];
      const dayActuals = actualEntries.filter(e => e.dayIndex === dayIdx);
      dailyData[dayIdx] = dayActuals.map(e => ({ ...e, isActual: true }));
      
      planningForWeek.forEach(plan => {
        const actualRow = dayActuals.find(a => a.missionId === plan.missionId);
        if (!actualRow && plan.percentage > 0) {
          const mission = state.missions.find(m => m.id === plan.missionId);
          if (mission) {
            const staffRow = [
              ...(mission.internalStaffing || []),
              ...(mission.freelanceStaffing || []),
              ...(mission.subcontractorStaffing || [])
            ].find(s => (s as any).userId === selectedUserId || s.id === selectedUserId);

            if (staffRow) {
              const start = parseISO(staffRow.startDate);
              const end = parseISO(staffRow.endDate);
              if (isWithinInterval(dayDate, { start, end })) {
                dailyData[dayIdx].push({ 
                  id: `plan-${plan.id}-${dayIdx}`, 
                  missionId: plan.missionId, 
                  weekStart: weekKey,
                  percentage: plan.percentage, 
                  isActual: false, 
                  dayIndex: dayIdx, 
                  comment: '' 
                });
              }
            }
          }
        }
      });
    }

    const getDayTotal = (dayIdx: number) => 
      isDayHoliday(weekDays[dayIdx]) ? 0 : dailyData[dayIdx].reduce((sum, e) => sum + e.percentage, 0);

    return { weekKey, weekDays, dailyData, isDayHoliday, getDayTotal };
  };

  const handleOpenValidation = (entry: any) => {
    const weekData = getWeekData(parseISO(entry.weekStart));
    if (!canEdit || weekData.isDayHoliday(weekData.weekDays[entry.dayIndex])) return;
    setValidatingEntry(entry);
    setValidationPercentage(entry.percentage);
    setValidationComment(entry.comment || '');
  };

  const handleQuickValidate = (e: React.MouseEvent, entry: any) => {
    e.stopPropagation();
    const weekData = getWeekData(parseISO(entry.weekStart));
    if (!canEdit || weekData.isDayHoliday(weekData.weekDays[entry.dayIndex])) return;
    const newEntry: TimesheetEntry = { 
        id: generateId(), 
        userId: selectedUserId, 
        weekStart: entry.weekStart, 
        missionId: entry.missionId, 
        dayIndex: entry.dayIndex, 
        percentage: entry.percentage, 
        comment: '', 
        status: TimesheetStatus.VALIDE 
    };
    updateState({ timesheets: [...state.timesheets, newEntry] });
  };

  const handleConfirmValidation = () => {
    if (!validatingEntry) return;
    const numVal = Math.min(100, Math.max(0, validationPercentage));
    let newTimesheets = [...state.timesheets];
    if (validatingEntry.isActual) {
      newTimesheets = newTimesheets.map(t => t.id === validatingEntry.id ? { ...t, percentage: numVal, comment: validationComment, status: TimesheetStatus.VALIDE } : t);
    } else {
      newTimesheets.push({ 
        id: generateId(), 
        userId: selectedUserId, 
        weekStart: validatingEntry.weekStart, 
        missionId: validatingEntry.missionId, 
        dayIndex: validatingEntry.dayIndex, 
        percentage: numVal, 
        comment: validationComment, 
        status: TimesheetStatus.VALIDE 
      });
    }
    updateState({ timesheets: newTimesheets });
    setValidatingEntry(null);
  };

  const handleRemoveEntry = (e: React.MouseEvent, entry: any) => {
    e.stopPropagation();
    if (!canEdit) return;
    if (entry.isActual) {
      updateState({ timesheets: state.timesheets.filter(t => t.id !== entry.id) });
    } else {
      const cancelEntry: TimesheetEntry = { 
        id: generateId(), 
        userId: selectedUserId, 
        weekStart: entry.weekStart, 
        missionId: entry.missionId, 
        dayIndex: entry.dayIndex, 
        percentage: 0, 
        status: TimesheetStatus.VALIDE 
      };
      updateState({ timesheets: [...state.timesheets, cancelEntry] });
    }
  };

  const handleAddEntry = (weekKey: string, dayIndex: number, typeId: string) => {
    const weekData = getWeekData(parseISO(weekKey));
    if (!canEdit || weekData.isDayHoliday(weekData.weekDays[dayIndex])) return;
    
    // Pour les activités internes, on propose 100% d'office pour faciliter la saisie
    const isInternal = CATEGORIES.some(c => c.id === typeId);

    const newEntry: TimesheetEntry = { 
      id: generateId(), 
      userId: selectedUserId, 
      weekStart: weekKey, 
      missionId: typeId, 
      dayIndex: dayIndex, 
      percentage: isInternal ? 100 : 0,
      status: TimesheetStatus.VALIDE 
    };

    updateState({ timesheets: [...state.timesheets, newEntry] });
    setActiveMenuDay(null);
    
    // Ouvre la modal pour permettre d'ajouter un commentaire (ex: destination ou motif)
    setValidatingEntry({ ...newEntry, isActual: true });
    setValidationPercentage(isInternal ? 100 : 0);
    setValidationComment('');
  };

  const modalInfo = useMemo(() => {
    if (!validatingEntry) return null;
    const mission = state.missions.find(m => m.id === validatingEntry.missionId);
    const category = CATEGORIES.find(c => c.id === validatingEntry.missionId);
    return { mission, category };
  }, [validatingEntry, state.missions]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto h-full flex flex-col pb-6">
      <div className="bg-white p-2.5 rounded-xl border shadow-sm flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 p-1 rounded-xl">
               <button onClick={() => setAnchorWeek(w => addWeeks(w, -1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-navy"><ChevronLeft size={18} /></button>
               <button onClick={() => setAnchorWeek(w => addWeeks(w, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-navy"><ChevronRight size={18} /></button>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-navy/30 uppercase tracking-[0.2em] leading-none mb-1">Période d'affichage</span>
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-yellow-accent" />
                <span className="text-xs font-black text-navy uppercase tracking-tight">
                  {format(displayedWeeks[0], 'dd MMM', { locale: fr })} - {format(addDays(displayedWeeks[1], 4), 'dd MMM yyyy', { locale: fr })}
                </span>
              </div>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-200"></div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-navy text-yellow-accent flex items-center justify-center font-black text-[10px] border border-navy/10 uppercase">
                {selectedUser?.name.split(' ').map(n => n[0]).join('')}
            </div>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="bg-brand-gray border-2 border-transparent focus:border-yellow-accent rounded-lg px-3 py-1.5 text-[10px] font-black text-navy outline-none cursor-pointer transition-all hover:bg-gray-200">
              {selectableUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role}) {u.isExternal ? '👤 EXT' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={() => setAnchorWeek(getMonday(new Date()))} className="px-4 py-1.5 bg-navy text-yellow-accent text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-navy/90 transition-all shadow-md active:scale-95">Cette semaine</button>
      </div>

      <div className="space-y-10 flex-1 overflow-auto pr-2 custom-scrollbar">
        {displayedWeeks.map((weekStart, wIdx) => {
          const { weekKey, weekDays, dailyData, isDayHoliday, getDayTotal } = getWeekData(weekStart);
          return (
            <div key={weekKey} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${wIdx * 100}ms` }}>
              <div className="flex items-center gap-4 px-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
                <h3 className="text-[10px] font-black text-navy/40 uppercase tracking-[0.3em] flex items-center gap-3">
                   Semaine du {format(weekStart, 'dd MMMM', { locale: fr })}
                   <span className="bg-navy/5 text-navy/60 px-2 py-0.5 rounded-full text-[8px] tracking-normal">S{format(weekStart, 'w')}</span>
                </h3>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {weekDays.map((day, dayIdx) => {
                  const holiday = isDayHoliday(day);
                  const dayEntries = dailyData[dayIdx];
                  const total = getDayTotal(dayIdx);
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <div key={dayIdx} className={`flex flex-col rounded-xl border-2 transition-all relative h-[280px] group/day ${holiday ? 'border-gray-100 bg-gray-50/50' : isToday ? 'border-yellow-accent bg-white shadow-lg scale-[1.01] z-10' : 'border-gray-100 bg-white/60 hover:bg-white hover:border-gray-200 hover:shadow-md'}`}>
                      <div className={`p-2.5 border-b flex flex-col items-center gap-0.5 rounded-t-xl shrink-0 ${holiday ? 'bg-gray-100/30' : isToday ? 'bg-yellow-accent/10' : 'bg-gray-50/30'}`}>
                        <span className="text-[9px] font-black text-navy/40 uppercase tracking-widest leading-none">{format(day, 'EEEE', { locale: fr })}</span>
                        <span className={`text-xl font-black leading-none ${isToday ? 'text-navy' : 'text-navy/70'}`}>{format(day, 'dd')}</span>
                        {!holiday && (
                          <div className={`mt-1 px-3 py-1 rounded-full text-[10px] font-black border shadow-sm transition-all duration-300 ${total > 100 ? 'bg-red-500 text-white border-red-600' : total === 100 ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-navy/5 text-navy border-navy/10'}`}>
                            {total}%
                          </div>
                        )}
                      </div>

                      <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar relative">
                        {holiday ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center opacity-30">
                            <CalendarOff size={32} className="mb-2 text-gray-300 stroke-[1.5]" />
                            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 leading-tight">{holiday.label}</span>
                          </div>
                        ) : (
                          <>
                            {dayEntries.map(entry => {
                              const mission = state.missions.find(m => m.id === entry.missionId);
                              const isCategory = !mission;
                              const category = CATEGORIES.find(c => c.id === entry.missionId);
                              let style = entry.isActual ? APP_COLORS.ACTUAL : APP_COLORS.FORECAST;
                              if (isCategory) style = category?.color || APP_COLORS.INTERMISSION;
                              
                              return (
                                <div key={entry.id} onClick={() => handleOpenValidation(entry)} className={`p-2.5 rounded-lg border shadow-sm relative group cursor-pointer hover:shadow-md transition-all animate-in zoom-in duration-200 ${style}`}>
                                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    {!entry.isActual && !isCategory && canEdit && (
                                        <button onClick={(e) => { e.stopPropagation(); handleQuickValidate(e, entry); }} className="p-1 bg-amber-500 text-white rounded shadow-md transition-all active:scale-90" title="Valider tel quel">
                                            <Check size={10} strokeWidth={4} />
                                        </button>
                                    )}
                                    {canEdit && (
                                        <button onClick={(e) => handleRemoveEntry(e, entry)} className="p-1 bg-white text-red-500 hover:bg-red-500 hover:text-white rounded border border-red-100 shadow-md transition-all" title="Retirer">
                                            <X size={10} strokeWidth={4} />
                                        </button>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-start gap-1.5 overflow-hidden">
                                        <div className={`p-1 rounded shrink-0 ${entry.isActual ? 'bg-emerald-100' : (isCategory ? 'bg-white/50' : 'bg-amber-100')}`}>
                                            {isCategory ? (category ? <category.icon size={10} className="text-current" /> : <Clock size={10} />) : <Briefcase size={10} className={entry.isActual ? 'text-emerald-700' : 'text-amber-700'} />}
                                        </div>
                                        <div className="overflow-hidden">
                                            <span className="text-[9px] font-black uppercase truncate block leading-tight tracking-tight text-navy/80">{isCategory ? category?.label : mission?.clientName}</span>
                                            {!isCategory && <span className="text-[7px] font-bold text-navy/40 uppercase truncate block leading-none mt-0.5">{mission?.name}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <span className="text-sm font-black text-navy">{entry.percentage}%</span>
                                        {entry.isActual && !isCategory && <div className="bg-emerald-500 text-white rounded-full p-0.5 shadow-sm"><Check size={8} strokeWidth={6} /></div>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {canEdit && (
                              <button 
                                onClick={() => setActiveMenuDay(activeMenuDay?.weekKey === weekKey && activeMenuDay?.dayIdx === dayIdx ? null : { weekKey, dayIdx })} 
                                className={`w-full py-3 border-2 border-dashed rounded-lg transition-all flex flex-col items-center justify-center gap-1.5 group shrink-0 ${activeMenuDay?.weekKey === weekKey && activeMenuDay?.dayIdx === dayIdx ? 'border-navy bg-navy/5 text-navy' : 'border-gray-100 text-gray-300 hover:text-navy hover:border-navy/30 hover:bg-navy/5'}`}
                              >
                                <Plus size={18} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[8px] font-black uppercase tracking-[0.2em]">Ajouter</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {canEdit && activeMenuDay?.weekKey === weekKey && activeMenuDay?.dayIdx === dayIdx && (
                        <div ref={menuRef} className="absolute top-2 left-2 right-2 bg-white rounded-xl shadow-2xl border-2 border-navy/10 ring-4 ring-black/5 z-[100] p-2 space-y-1 animate-in slide-in-from-top-2 duration-300 max-h-[270px] overflow-y-auto custom-scrollbar">
                          <div className="text-[8px] font-black text-gray-400 uppercase p-1 tracking-[0.2em] border-b mb-1 flex items-center justify-between">Activités <Plus size={8} /></div>
                          {CATEGORIES.map(cat => (
                            <button 
                              key={cat.id} 
                              onClick={() => handleAddEntry(weekKey, dayIdx, cat.id)} 
                              className="w-full text-left p-1.5 hover:bg-navy/5 rounded-lg text-[10px] font-black text-navy flex items-center gap-2 transition-all"
                            >
                              <div className={`p-1.5 rounded-md ${cat.color} shadow-sm`}><cat.icon size={12} /></div>
                              {cat.label}
                            </button>
                          ))}
                          <div className="text-[8px] font-black text-gray-400 uppercase p-1 tracking-[0.2em] border-t border-b my-1 flex items-center justify-between">Missions <Briefcase size={8} /></div>
                          <div className="space-y-1 py-1">
                            {allAvailableMissions.map(m => (
                              <button key={m.id} onClick={() => handleAddEntry(weekKey, dayIdx, m.id)} className="w-full text-left p-1.5 hover:bg-navy/5 rounded-lg text-[10px] font-black text-navy flex items-start gap-2 transition-all group/btn">
                                <div className="p-1.5 bg-yellow-accent/10 rounded-md group-hover/btn:bg-yellow-accent group-hover/btn:text-navy transition-colors text-yellow-600 shadow-sm shrink-0"><Briefcase size={12} /></div>
                                <div className="flex flex-col min-w-0">
                                  <div className="truncate uppercase tracking-tight font-black">{m.clientName}</div>
                                  <div className="truncate uppercase text-[8px] text-gray-400 font-bold">{m.name}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {validatingEntry && modalInfo && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden animate-in zoom-in duration-300 border border-white/20">
            <div className={`px-6 py-4 text-white flex justify-between items-center shrink-0 ${modalInfo.category ? (modalInfo.category.id === 'CONGES' ? 'bg-red-600' : 'bg-navy') : 'bg-navy'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-white/20 rounded-xl shrink-0 shadow-inner">
                  {modalInfo.category ? <modalInfo.category.icon size={20} /> : <Clock size={20} className="text-yellow-accent" />}
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.1em] truncate mb-0.5">{modalInfo.category ? modalInfo.category.label : modalInfo.mission?.clientName}</h3>
                  <p className="text-[9px] text-white/40 font-bold uppercase truncate tracking-widest">{modalInfo.mission ? modalInfo.mission.name : 'Activité hors mission'}</p>
                </div>
              </div>
              <button onClick={() => setValidatingEntry(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3 p-5 bg-gray-50 rounded-[20px] border border-gray-100 shadow-inner">
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-navy uppercase tracking-widest flex items-center gap-2">
                        <Target size={16} className="text-yellow-accent" /> Part (%)
                    </label>
                    <span className="text-lg font-black text-navy bg-white px-3 py-1 rounded-xl shadow-sm border border-gray-100">{validationPercentage}%</span>
                </div>
                <input type="range" min="0" max="100" step="5" value={validationPercentage} onChange={(e) => setValidationPercentage(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-navy" />
                <div className="flex justify-between text-[8px] font-black text-gray-300 uppercase tracking-widest px-1"><span>0%</span><span>50%</span><span>100%</span></div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-navy uppercase tracking-widest px-2">Commentaires / Détails</label>
                <textarea value={validationComment} onChange={(e) => setValidationComment(e.target.value)} placeholder="Ajouter un commentaire optionnel..." className="w-full bg-gray-50 border border-gray-100 rounded-[20px] p-4 text-xs font-medium text-navy min-h-[100px] outline-none focus:ring-2 focus:ring-yellow-accent/30 focus:bg-white transition-all resize-none shadow-inner" />
              </div>
              
              <div className="flex gap-3 pt-1">
                <button onClick={() => setValidatingEntry(null)} className="flex-1 py-3 border-2 border-gray-100 rounded-xl font-black text-gray-400 uppercase text-[10px] tracking-widest hover:bg-gray-50 transition-all">Annuler</button>
                <button onClick={handleConfirmValidation} className="flex-2 px-8 py-3 bg-navy text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-navy/90 shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 group">
                    <Save size={16} className="text-yellow-accent group-hover:scale-110 transition-transform" /> 
                    Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timesheets;