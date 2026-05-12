
import { format, startOfWeek, addWeeks, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameDay, eachMonthOfInterval, isWithinInterval, isValid, parseISO } from 'date-fns';
import { Country, Holiday, Mission } from './types';
// Fix: FY_START_MONTH is exported from constants.ts, not types.ts
import { FY_START_MONTH } from './constants';

export const getFiscalYear = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth();
  // FY starts Feb 1st (month 1)
  if (month < FY_START_MONTH) {
    return `FY${year - 1}`;
  }
  return `FY${year}`;
};

export const getMonday = (date: Date): Date => {
  return startOfWeek(date, { weekStartsOn: 1 });
};

export const formatDateDisplay = (date: Date | string): string => {
  return format(new Date(date), 'dd/MM/yyyy');
};

export const isWorkingDay = (date: Date): boolean => {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
};

export const getBusinessDays = (start: Date, end: Date, holidays: Holiday[], country: Country): Date[] => {
  const days = eachDayOfInterval({ start, end });
  return days.filter(day => {
    if (!isWorkingDay(day)) return false;
    const isHoliday = holidays.some(h => h.country === country && isSameDay(new Date(h.date), day));
    return !isHoliday;
  });
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const normalizeTimesheetEntry = (entry: any) => {
  const categories = ['CONGES', 'FORMATION', 'INTERMISSION'];
  
  // If it's already a normalized category (has activityType)
  if (entry.activityType && categories.includes(entry.activityType)) {
    return { 
      missionId: null, 
      activityType: entry.activityType as 'CONGES' | 'FORMATION' | 'INTERMISSION' 
    };
  }
  
  // If it's a category currently in missionId (from Planning or old Timesheet)
  if (entry.missionId && categories.includes(entry.missionId)) {
    return { 
      missionId: null, 
      activityType: entry.missionId as 'CONGES' | 'FORMATION' | 'INTERMISSION' 
    };
  }
  
  // Otherwise it's a real mission
  return { 
    missionId: entry.missionId || null, 
    activityType: null 
  };
};

export const getDedupedTimesheets = (entries: any[]): any[] => {
  if (!entries || entries.length === 0) return [];
  
  const dedupMap = new Map<string, any>();
  
  // Sort entries to make sure the "newest" ones are processed last OR we use logic with timestamps
  // If we order by updated_at DESC in the loop, we keep the first one we find.
  
  const sorted = [...entries].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.created_at || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.created_at || b.createdAt || 0).getTime();
    return dateB - dateA; // Descending: newest first
  });

  sorted.forEach(entry => {
    const { missionId, activityType } = normalizeTimesheetEntry(entry);
    // Business key: collab + mission + activity + week + day
    const key = `${entry.collaboratorId || entry.userId}|${missionId || 'null'}|${activityType || 'null'}|${entry.weekStart}|${entry.dayIndex}`;
    
    if (!dedupMap.has(key)) {
      dedupMap.set(key, { ...entry, missionId, activityType });
    }
  });

  return Array.from(dedupMap.values());
};

export const calculateMonthlySmoothedRevenue = (mission: Mission): number => {
  const mStart = parseISO(mission.startDate);
  const mEnd = parseISO(mission.endDate);
  
  if (!isValid(mStart) || !isValid(mEnd)) return 0;
  
  const totalRevenue = 
    (Number(mission.forfaitAmountCurrentFY) || 0) + 
    (Number(mission.forfaitAmountNextFY) || 0) +
    (Number(mission.successFeesCurrentFY) || 0) +
    (Number(mission.successFeesNextFY) || 0);
    
  if (totalRevenue === 0) return 0;
  
  const totalMonths = eachMonthOfInterval({ start: startOfMonth(mStart), end: endOfMonth(mEnd) }).length;
  if (totalMonths === 0) return 0;
  
  return totalRevenue / totalMonths;
};

export const calculateTotalMissionRevenue = (mission: Mission): number => {
  const mStart = parseISO(mission.startDate);
  const mEnd = parseISO(mission.endDate);
  if (!isValid(mStart) || !isValid(mEnd)) return 0;

  const baseTotal = 
    (Number(mission.forfaitAmountCurrentFY) || 0) + 
    (Number(mission.forfaitAmountNextFY) || 0) +
    (Number(mission.successFeesCurrentFY) || 0) +
    (Number(mission.successFeesNextFY) || 0);

  // Delta from overrides across all years
  let totalDelta = 0;
  const amountPerMonth = calculateMonthlySmoothedRevenue(mission);

  if (mission.billingOverrides) {
    Object.entries(mission.billingOverrides).forEach(([fy, overrides]) => {
      const fyYearInt = parseInt(fy.replace('FY', ''));
      const monthsIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
      
      monthsIds.forEach(monthId => {
        if (overrides[monthId]) {
          const year = monthId === 0 ? fyYearInt + 1 : fyYearInt;
          const targetMonthDate = new Date(year, monthId, 15);
          
          if (isWithinInterval(targetMonthDate, { start: startOfMonth(mStart), end: endOfMonth(mEnd) })) {
            // Delta = Override - what was expected via smoothing
            totalDelta += (overrides[monthId].amount || 0) - amountPerMonth;
          } else {
            // Month is outside mission bounds but has an override? 
            // We count the full override amount since expected was 0
            totalDelta += (overrides[monthId].amount || 0);
          }
        }
      });
    });
  }

  return baseTotal + totalDelta;
};

export const calculateSmoothedMissionRevenue = (mission: Mission, targetFY: string): number => {
  const mStart = parseISO(mission.startDate);
  const mEnd = parseISO(mission.endDate);
  
  if (!isValid(mStart) || !isValid(mEnd)) return 0;
  
  const amountPerMonth = calculateMonthlySmoothedRevenue(mission);
  const overrides = mission.billingOverrides?.[targetFY] || {};
  
  const fyYearInt = parseInt(targetFY.replace('FY', ''));
  const monthsIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
  
  let total = 0;
  monthsIds.forEach(monthId => {
    if (overrides[monthId]) {
      total += overrides[monthId].amount || 0;
    } else if (amountPerMonth > 0) {
      const year = monthId === 0 ? fyYearInt + 1 : fyYearInt;
      const targetMonthDate = new Date(year, monthId, 15);
      if (isWithinInterval(targetMonthDate, { start: startOfMonth(mStart), end: endOfMonth(mEnd) })) {
        total += amountPerMonth;
      }
    }
  });

  return total;
};
