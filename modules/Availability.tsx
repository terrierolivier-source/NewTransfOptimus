import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AppState, Role, PlanningEntry, TimesheetStatus, Country, User } from '../types';
import { 
  format, 
  startOfMonth, 
  startOfToday, 
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isBefore,
  addMonths,
  addWeeks,
  addDays,
  startOfWeek,
  endOfWeek,
  parseISO,
  endOfMonth,
  isValid,
  isSameDay
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  CalendarDays, 
  Calendar, 
  CalendarRange, 
  FilterX, 
  X, 
  Smile, 
  Save, 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  MessageSquare, 
  Target, 
  CalendarClock, 
  BarChart3,
  ChevronDown, 
  Check,
  Filter,
  UserCircle,
  Users as UsersIcon,
  Palmtree,
  GraduationCap,
  Coffee
} from 'lucide-react';
import { getBusinessDays, isWorkingDay, getDedupedTimesheets, getFiscalYear } from '../utils';
import { syncPlanningToCloud } from '../services/dataService';

interface AvailabilityProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'ytd';

const SENTIMENTS = ['🤩', '😊', '😐', '😟', '😡'];
const WEATHERS = [
  { id: 'sun', icon: Sun, label: 'Beau fixe', color: 'text-yellow-500' },
  { id: 'cloud', icon: Cloud, label: 'Voilé', color: 'text-gray-400' },
  { id: 'rain', icon: CloudRain, label: 'Pluvieux', color: 'text-blue-400' },
  { id: 'storm', icon: CloudLightning, label: 'Orageux', color: 'text-purple-500' },
];

const CATEGORIES = [
  { id: 'CONGES', label: 'Congés', icon: Palmtree, color: 'bg-red-600', textColor: 'text-white' },
  { id: 'FORMATION', label: 'Formation', icon: GraduationCap, color: 'bg-purple-600', textColor: 'text-white' },
  { id: 'INTERMISSION', label: 'Inter mission', icon: Coffee, color: 'bg-slate-600', textColor: 'text-white' },
];

const DELIVERY_GRADES = [Role.CONSULTANT, Role.DELIVERY_MANAGER, Role.PRINCIPAL];

const getFiscalQuarterStart = (date: Date) => {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month === 0) return new Date(year - 1, 10, 1);
  if (month >= 1 && month <= 3) return new Date(year, 1, 1);
  if (month >= 4 && month <= 6) return new Date(year, 4, 1);
  if (month >= 7 && month <= 9) return new Date(year, 7, 1);
  return new Date(year, 10, 1);
};

const formatFiscalQuarter = (date: Date) => {
  const start = getFiscalQuarterStart(date);
  const m = start.getMonth();
  const q = m === 1 ? '1ER' : m === 4 ? '2ÈME' : m === 7 ? '3ÈME' : '4ÈME';
  return `${q} TRIM. ${start.getFullYear()}`;
};

const Availability: React.FC<AvailabilityProps> = ({ state, updateState }) => {
  const { timesheets: rawTimesheets } = state;
  const [timeScale, setTimeScale] = useState<TimeScale>('day');
  const [currentDate, setCurrentDate] = useState(startOfToday());

  // Centralized deduplication for all Availability calculations
  const timesheets = useMemo(() => {
    const deduped = getDedupedTimesheets(rawTimesheets);
    if (rawTimesheets.length !== deduped.length) {
      console.log(`[Availability] Deduped timesheets: ${rawTimesheets.length} -> ${deduped.length}`);
    }
    return deduped;
  }, [rawTimesheets]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrades, setSelectedGrades] = useState<Role[]>(DELIVERY_GRADES);
  const [showGradeDropdown, setShowGradeDropdown] = useState(false);
  const gradeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gradeDropdownRef.current && !gradeDropdownRef.current.contains(event.target as Node)) {
        setShowGradeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);
  const [tempSentiment, setTempSentiment] = useState<string>('😐');
  const [tempWeather, setTempWeather] = useState<string>('sun');
  const [tempComment, setTempComment] = useState<string>('');
  const [tempOccupancy, setTempOccupancy] = useState<number>(0);

  const period = useMemo(() => {
    switch (timeScale) {
      case 'day': return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
      case 'week': return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
      case 'quarter': {
        const start = getFiscalQuarterStart(currentDate);
        return { start, end: endOfMonth(addMonths(start, 2)) };
      }
      case 'ytd': {
        const fy = getFiscalYear(currentDate);
        const fyYear = parseInt(fy.replace('FY', ''));
        const start = startOfDay(new Date(fyYear, 1, 1));
        const end = endOfDay(currentDate);
        return { start, end };
      }
      default: return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
    }
  }, [currentDate, timeScale]);

  const handleNavigate = (direction: number) => {
    switch (timeScale) {
      case 'day': setCurrentDate(d => addDays(d, direction)); break;
      case 'week': setCurrentDate(d => addWeeks(d, direction)); break;
      case 'quarter': setCurrentDate(d => addMonths(d, direction * 3)); break;
      case 'ytd': setCurrentDate(d => addDays(d, direction)); break;
      default: setCurrentDate(d => addMonths(d, direction));
    }
  };

  const getOccupancyForUserInPeriod = (user: User) => {
    const userPlanning = state.planning.filter(p => p.userId === user.id);
    const userTimesheets = state.timesheets.filter(t => t.userId === user.id);
    
    const businessDays = getBusinessDays(period.start, period.end, state.holidays, user.country);
    if (businessDays.length === 0) {
      // If we are on a non-working day (e.g. looking at a Saturday or Holiday), 
      // we should not show 100% availability. Returning 100% occupancy (0 availability) 
      // for weekends/holidays is safer, or simply ignoring it.
      return isWorkingDay(period.start, state.holidays, user.country) ? 0 : 100;
    }

    let totalOccupancyAcrossPeriod = 0;

    businessDays.forEach(day => {
      const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const dayIdx = (day.getDay() + 6) % 7;
      const today = startOfToday();

      let dailySum = 0;
      
      // If it's today or in the past, prioritize Validated Timesheets
      if (!isBefore(today, day)) {
        const dayTimesheets = userTimesheets.filter(t => t.weekStart === monday && t.dayIndex === dayIdx && t.status === TimesheetStatus.VALIDE);
        if (dayTimesheets.length > 0) {
          // Priority 1: Real data (Sum of all active missions/activities, excluding Intermission)
          dailySum = dayTimesheets.reduce((acc, t) => {
            if (t.missionId === 'INTERMISSION' || t.activityType === 'INTERMISSION') return acc;
            return acc + (t.percentage || 0);
          }, 0);
        } else {
          // Priority 2: Fallback to Planning if no validated timesheets for this day
          const dayPlanning = userPlanning.filter(p => p.weekStart === monday);
          dailySum = dayPlanning.reduce((acc, p) => {
            if (p.missionId === 'INTERMISSION') return acc;
            return acc + (p.percentage || 0);
          }, 0);
        }
      } else {
        // Future: Always use Planning
        const dayPlanning = userPlanning.filter(p => p.weekStart === monday);
        dailySum = dayPlanning.reduce((acc, p) => {
          if (p.missionId === 'INTERMISSION') return acc;
          return acc + (p.percentage || 0);
        }, 0);
      }
      
      totalOccupancyAcrossPeriod += Math.min(100, dailySum);
    });

    return totalOccupancyAcrossPeriod / businessDays.length;
  };

  const deliveryKpis = useMemo(() => {
    const deliveryUsers = state.collaborators.filter(u => 
      u.active && 
      DELIVERY_GRADES.includes(u.grade) &&
      (state.globalCountry === 'Global' || u.country === state.globalCountry)
    );
    
    if (deliveryUsers.length === 0) return { avg: 0, count: 0 };

    const totalOcc = deliveryUsers.reduce((acc, user) => acc + getOccupancyForUserInPeriod(user), 0);
    return {
      avg: totalOcc / deliveryUsers.length,
      count: deliveryUsers.length
    };
  }, [state.collaborators, state.globalCountry, period, state.planning, state.timesheets, state.holidays]);

  const filteredConsultants = useMemo(() => {
    const list = state.collaborators.filter(u => 
      u.active && 
      (state.globalCountry === 'Global' || u.country === state.globalCountry) &&
      (selectedGrades.length === 0 || selectedGrades.includes(u.grade)) &&
      (u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    return [...list].sort((a, b) => getOccupancyForUserInPeriod(a) - getOccupancyForUserInPeriod(b));
  }, [state.collaborators, state.globalCountry, searchTerm, selectedGrades, period, state.planning, state.timesheets, state.holidays]);

  const toggleGrade = (grade: Role) => {
    setSelectedGrades(prev => 
      prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
    );
  };

  const getStaffingForConsultant = (userId: string) => {
    const userPlanning = state.planning.filter(p => p.userId === userId || p.collaboratorId === userId);
    const userTimesheets = state.timesheets.filter(t => t.userId === userId || t.collaboratorId === userId);
    
    const missionIds = Array.from(new Set([
      ...userPlanning.map(p => p.missionId),
      ...userTimesheets.map(t => t.missionId || t.activityType)
    ]));

    return missionIds.filter(Boolean).map(mId => {
      const mission = state.missions.find(m => m.id === mId);
      const category = CATEGORIES.find(c => c.id === mId);

      if (!mission && !category) return null;

      const planningInPeriod = userPlanning.filter(p => {
        const pStart = parseISO(p.weekStart);
        const pEnd = endOfWeek(pStart, { weekStartsOn: 1 });
        return (pStart <= period.end && pEnd >= period.start);
      }).filter(p => p.missionId === mId);

      const tsInPeriod = userTimesheets.filter(t => {
        const tDate = parseISO(t.weekStart);
        const tEnd = endOfWeek(tDate, { weekStartsOn: 1 });
        return (tDate <= period.end && tEnd >= period.start) && isWorkingDay(addDays(tDate, t.dayIndex));
      }).filter(t => (t.missionId === mId || t.activityType === mId));

      if (planningInPeriod.length === 0 && tsInPeriod.length === 0) return null;

      let interventionEndDate = period.end;
      if (mission) {
        const staffingRow = mission.internalStaffing?.find(s => s.userId === userId || s.collaboratorId === userId) || mission.freelanceStaffing?.find(f => f.id === userId);
        interventionEndDate = staffingRow ? parseISO(staffingRow.endDate) : parseISO(mission.endDate);
      }

      const collab = state.collaborators.find(c => c.id === userId);
      const businessDaysInPeriodForStaffing = getBusinessDays(period.start, period.end, state.holidays, collab?.country || 'Global'); 

      let totalStaffingOccupancy = 0;
      let workingDaysCount = businessDaysInPeriodForStaffing.length;

      if (workingDaysCount > 0) {
        businessDaysInPeriodForStaffing.forEach(day => {
          const monday = format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
          const dayIdx = (day.getDay() + 6) % 7;
          const today = startOfToday();

          let dayOcc = 0;
          if (!isBefore(today, day)) {
            const dayTs = userTimesheets.find(t => t.weekStart === monday && t.dayIndex === dayIdx && t.status === TimesheetStatus.VALIDE && (t.missionId === mId || t.activityType === mId));
            if (dayTs) {
              dayOcc = dayTs.percentage;
            } else {
              // Only fallback to planning if there are NO validated timesheets at all for this day for any mission
              const anyTsOnDay = userTimesheets.some(t => t.weekStart === monday && t.dayIndex === dayIdx && t.status === TimesheetStatus.VALIDE);
              if (!anyTsOnDay) {
                const dayPlan = userPlanning.find(p => p.weekStart === monday && p.missionId === mId);
                dayOcc = dayPlan?.percentage || 0;
              }
            }
          } else {
            const dayPlan = userPlanning.find(p => p.weekStart === monday && p.missionId === mId);
            dayOcc = dayPlan?.percentage || 0;
          }
          totalStaffingOccupancy += dayOcc;
        });
      }

      const avgOccupancy = workingDaysCount > 0 ? Math.round(totalStaffingOccupancy / workingDaysCount) : 0;

      const firstEntry = planningInPeriod[0] || userPlanning.find(p => p.missionId === mId);
      
      return { 
        id: mId, 
        mission, 
        category,
        avgOccupancy, 
        sentiment: firstEntry?.sentiment || '😐', 
        weather: firstEntry?.weather || 'sun', 
        comment: firstEntry?.comment || '', 
        interventionEndDate 
      };
    }).filter(s => s !== null);
  };

  const openFeedbackModal = (userId: string, missionId: string) => {
    const staffing = getStaffingForConsultant(userId).find(s => s?.id === missionId);
    if (!staffing || !staffing.mission) return;
    setTempSentiment(staffing.sentiment);
    setTempWeather(staffing.weather);
    setTempComment(staffing.comment);
    setTempOccupancy(staffing.avgOccupancy);
    setActiveFeedbackId(`${userId}|${missionId}`);
  };

  const handleSaveFeedback = async () => {
    if (!activeFeedbackId) return;
    const [userId, missionId] = activeFeedbackId.split('|');
    const updatedPlanning = state.planning.map(p => (p.userId === userId && p.missionId === missionId) ? { ...p, sentiment: tempSentiment, weather: tempWeather, comment: tempComment } : p);
    updateState({ planning: updatedPlanning });
    
    // Cloud Sync for specifically updated entries
    const entriesToSync = updatedPlanning.filter(p => (p.userId === userId && p.missionId === missionId));
    if (entriesToSync.length > 0) {
      await syncPlanningToCloud(entriesToSync);
    }
    
    setActiveFeedbackId(null);
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-[-16px] xl:top-[-32px] z-40 bg-brand-gray -mx-4 xl:-mx-8 px-4 xl:px-8 pt-4 xl:pt-8 pb-4 mb-2">
        <div className="bg-white p-4 xl:p-2 rounded-xl border shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
            <div className="flex bg-gray-100 p-0.5 rounded-lg overflow-x-auto w-full md:w-auto no-scrollbar shrink-0">
              {(['day', 'week', 'month', 'quarter', 'ytd'] as TimeScale[]).map(s => (
                <button key={s} onClick={() => setTimeScale(s)} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[9px] font-bold transition-all shrink-0 ${timeScale === s ? 'bg-white shadow-sm text-navy' : 'text-gray-500 hover:text-navy'}`}>{s === 'day' ? <Clock size={12} /> : s === 'week' ? <CalendarDays size={12} /> : s === 'month' ? <Calendar size={12} /> : s === 'quarter' ? <CalendarRange size={12} /> : <BarChart3 size={12} />} {s.toUpperCase()}</button>
              ))}
            </div>
            <div className="flex items-center justify-between w-full md:w-auto gap-3">
              <div className="flex items-center gap-1 bg-navy/5 p-0.5 rounded-xl border border-navy/10 shrink-0">
                <button onClick={() => handleNavigate(-1)} className="p-1 hover:bg-white rounded-lg transition-all text-navy"><ChevronLeft size={14} /></button>
                <div className="font-black text-navy text-[9px] uppercase px-1 min-w-[85px] text-center tracking-tighter">
                  {timeScale === 'day' ? format(currentDate, 'dd/MM/yy') : timeScale === 'week' ? `S${format(currentDate, 'w')} ${format(currentDate, 'yyyy')}` : timeScale === 'quarter' ? formatFiscalQuarter(currentDate) : timeScale === 'ytd' ? `YTD ${getFiscalYear(currentDate)}` : format(currentDate, 'MMMM yyyy', { locale: fr })}
                </div>
                <button onClick={() => handleNavigate(1)} className="p-1 hover:bg-white rounded-lg transition-all text-navy"><ChevronRight size={14} /></button>
              </div>
              
              <div className="flex md:hidden items-center gap-4 px-3 py-1 bg-navy text-white rounded-xl shadow-md flex-1 justify-center">
                <div className="flex flex-col items-center">
                  <span className="text-[7px] font-black text-yellow-accent uppercase tracking-widest leading-none mb-0.5">Occ.</span>
                  <span className="text-[10px] font-black leading-none">{Math.round(deliveryKpis.avg)}%</span>
                </div>
                <div className="w-px h-4 bg-white/20"></div>
                <div className="flex flex-col items-center">
                  <span className="text-[7px] font-black text-white/40 uppercase tracking-widest leading-none mb-0.5">TEAM</span>
                  <span className="text-[10px] font-black leading-none">{deliveryKpis.count}</span>
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-6 px-4 py-1 bg-navy text-white rounded-xl shadow-md">
              <div className="flex flex-col">
                <span className="text-[7px] font-black text-yellow-accent uppercase tracking-widest leading-none mb-1">Occ. Delivery</span>
                <span className="text-xs font-black leading-none">{Math.round(deliveryKpis.avg)}%</span>
              </div>
              <div className="w-px h-5 bg-white/20"></div>
              <div className="flex flex-col">
                <span className="text-[7px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Taille Team</span>
                <span className="text-xs font-black leading-none">{deliveryKpis.count}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none" ref={gradeDropdownRef}>
                <button 
                  onClick={() => setShowGradeDropdown(!showGradeDropdown)}
                  className={`w-full flex items-center justify-between md:justify-start gap-2 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${selectedGrades.length !== DELIVERY_GRADES.length ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'}`}
                >
                  <div className="flex items-center gap-2">
                    <UserCircle size={14} />
                    <span>Grades ({selectedGrades.length})</span>
                  </div>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showGradeDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showGradeDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 bg-gray-50 border-b flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Filtrer par grade</span>
                      <button 
                        onClick={() => setSelectedGrades(DELIVERY_GRADES)}
                        className="text-[9px] font-bold text-navy hover:text-yellow-accent px-2 py-1 rounded bg-white border shadow-sm transition-all"
                      >
                        Delivery
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {Object.values(Role).map((grade) => (
                        <button
                          key={grade}
                          onClick={() => toggleGrade(grade)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-navy/5 rounded-lg transition-colors group"
                        >
                          <span className={`text-[10px] font-bold uppercase transition-colors ${selectedGrades.includes(grade) ? 'text-navy' : 'text-gray-400'}`}>
                            {grade}
                          </span>
                          {selectedGrades.includes(grade) && (
                            <Check size={12} className="text-yellow-accent" strokeWidth={3} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => setCurrentDate(startOfToday())} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-navy text-yellow-accent rounded-lg transition-all hover:bg-navy/90 shadow-sm uppercase tracking-tighter w-10 md:w-auto overflow-hidden">
                <CalendarClock size={14} className="shrink-0" /> <span className="hidden md:inline">Aujourd'hui</span>
              </button>
            </div>
          </div>
          <div className="relative w-full xl:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
            <input type="text" placeholder="Rechercher..." className="pl-8 pr-3 py-1.5 border rounded-lg focus:ring-1 focus:ring-yellow-accent outline-none w-full text-[11px] bg-gray-50/50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredConsultants.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-dashed flex flex-col items-center justify-center text-gray-400 space-y-4">
            <FilterX size={48} className="opacity-20" />
            <div className="text-center">
              <p className="font-bold uppercase text-xs tracking-widest">Aucun résultat trouvé</p>
              <p className="text-[10px] mt-1 font-medium italic">Modifiez vos filtres de grades ou de recherche.</p>
            </div>
          </div>
        ) : filteredConsultants.map((user) => {
          const staffings = getStaffingForConsultant(user.id);
          const avgOccupancyTotal = getOccupancyForUserInPeriod(user);
          const availability = Math.max(0, 100 - Math.round(avgOccupancyTotal));
          return (
            <div key={user.id} className="flex flex-col xl:flex-row bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden min-h-[110px] transition-all hover:shadow-md group/row">
              <div className="w-full xl:w-72 p-3 border-b xl:border-b-0 xl:border-r bg-gray-50/50 flex flex-col justify-center shrink-0 px-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-navy text-yellow-accent flex items-center justify-center font-bold text-sm border-2 border-yellow-accent/20 shadow-sm shrink-0">{user.firstName[0]}{user.lastName[0]}</div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-navy truncate uppercase text-[11px] leading-tight tracking-tight">{user.firstName} {user.lastName}</h3>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter mt-1">{user.grade}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-3 flex items-center gap-4 overflow-x-auto no-scrollbar">
                <div className={`w-40 h-28 rounded-lg shadow-md p-3 flex flex-col justify-between shrink-0 border transition-all duration-300 ${availability >= 70 ? 'bg-green-500 border-green-600' : availability <= 10 ? 'bg-red-500 border-red-600' : 'bg-yellow-accent border-yellow-500/20'}`}>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${availability < 30 ? 'text-white' : 'text-navy'}`}>Disponibilité Moy.</span>
                  <div className="text-center"><span className={`text-3xl font-black leading-none ${availability < 30 ? 'text-white' : 'text-navy'}`}>{availability}%</span></div>
                  <div className={`text-[8px] font-black text-right uppercase tracking-widest ${availability < 30 ? 'text-white' : 'text-navy'}`}>{availability >= 90 ? 'LIBRE' : availability <= 10 ? 'COMPLET' : 'PARTIEL'}</div>
                </div>
                {staffings.map((staff) => {
                  if (!staff) return null;
                  const isMission = !!staff.mission;
                  const cardBg = isMission ? 'bg-navy' : staff.category?.color || 'bg-slate-600';
                  const textColor = isMission ? 'text-white' : staff.category?.textColor || 'text-white';
                  const label = isMission ? staff.mission?.clientName : staff.category?.label;
                  const subLabel = isMission ? staff.mission?.name : 'Activité interne';
                  const Icon = isMission ? null : staff.category?.icon;

                  return (
                    <div 
                      key={staff.id} 
                      onClick={() => isMission ? openFeedbackModal(user.id, staff.id) : null} 
                      className={`relative w-64 h-28 ${cardBg} ${textColor} rounded-lg shadow-md p-3 flex flex-col justify-between shrink-0 transform hover:scale-[1.03] transition-all border border-white/10 ${isMission ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {Icon && <Icon size={14} className="shrink-0 opacity-70" />}
                          <span className="text-[8px] font-black text-yellow-accent uppercase tracking-widest truncate leading-tight">{label}</span>
                        </div>
                        {isMission && (
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              const wConfig = WEATHERS.find(w => w.id === staff.weather);
                              const WIcon = wConfig?.icon || Sun;
                              return <WIcon size={14} className={wConfig?.color || 'text-yellow-400'} />;
                            })()}
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs border border-white/5">{staff.sentiment}</div>
                          </div>
                        )}
                      </div>
                      <p className={`text-[10px] font-bold leading-tight ${isMission ? 'text-white/90' : 'text-white/80'} truncate`}>{subLabel}</p>
                      <div className="flex justify-between items-end border-t border-white/10 pt-1.5 mt-auto">
                        <div className="flex flex-col">
                          <span className="text-[7px] text-white/40 font-bold uppercase tracking-widest leading-none mb-0.5">{isMission ? 'Fin estimée' : 'Fin période'}</span>
                          <span className="text-[9px] font-bold leading-none">{isValid(staff.interventionEndDate) ? format(staff.interventionEndDate, 'dd MMM yyyy', { locale: fr }) : '--'}</span>
                        </div>
                        <div className="bg-white/10 text-white px-2 py-1 rounded-md font-black text-[10px] border border-white/5">{staff.avgOccupancy}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {activeFeedbackId && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] p-6 animate-in zoom-in duration-200">
            <h3 className="font-black text-navy uppercase text-sm mb-4">Mise à jour qualitative</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Humeur Consultant</label>
                <div className="flex gap-2">
                  {SENTIMENTS.map(s => (
                    <button key={s} onClick={() => setTempSentiment(s)} className={`text-2xl p-2 rounded-lg border-2 transition-all ${tempSentiment === s ? 'border-yellow-accent bg-yellow-50 scale-110 shadow-sm' : 'border-gray-100 opacity-40 hover:opacity-100'}`}>{s}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Météo Projet</label>
                <div className="flex gap-2">
                  {WEATHERS.map(w => (
                    <button key={w.id} onClick={() => setTempWeather(w.id)} className={`p-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1 min-w-[64px] ${tempWeather === w.id ? 'border-navy bg-navy/5 scale-105 shadow-sm' : 'border-gray-100 opacity-40 hover:opacity-100'}`}>
                      <w.icon size={20} className={w.color} />
                      <span className="text-[8px] font-bold uppercase">{w.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 mb-6">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Commentaires</label>
              <textarea className="w-full border rounded-xl p-3 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-yellow-accent/50 focus:border-yellow-accent transition-all shadow-inner" value={tempComment} onChange={e => setTempComment(e.target.value)} placeholder="Partagez vos impressions sur la mission..." />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setActiveFeedbackId(null)} className="flex-1 py-3 border rounded-xl font-bold text-gray-500 uppercase text-[10px] hover:bg-gray-50 transition-all">Annuler</button>
              <button onClick={handleSaveFeedback} className="flex-1 py-3 bg-navy text-white rounded-xl font-bold uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-navy/90 transition-all shadow-lg active:scale-95"><Save size={14} className="text-yellow-accent" /> Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Availability;