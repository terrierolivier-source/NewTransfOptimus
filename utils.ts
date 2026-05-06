
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

export const getBusinessDays = (start: Date, end: Date, holidays: Holiday[], country: Country): Date[] => {
  const days = eachDayOfInterval({ start, end });
  return days.filter(day => {
    if (isWeekend(day)) return false;
    const isHoliday = holidays.some(h => h.country === country && isSameDay(new Date(h.date), day));
    return !isHoliday;
  });
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

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
