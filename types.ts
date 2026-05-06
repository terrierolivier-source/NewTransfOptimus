export enum Country {
  FRANCE = 'France',
  SPAIN = 'Espagne',
  ITALY = 'Italie'
}

export enum Role {
  CONSULTANT = 'Consultant',
  DELIVERY_MANAGER = 'Delivery Manager',
  PRINCIPAL = 'Principal',
  BUSINESS_DEV = 'Business Dev',
  COUNTRY_MANAGER = 'Country Manager',
  DIRECTEUR_ASSOCIE = 'Directeur Associé'
}

export enum MissionStatus {
  NON_DEMARREE = 'Non démarrée',
  EN_COURS = 'En cours',
  TERMINEE = 'Terminée'
}

export enum BillingMode {
  FORFAIT = 'Forfait',
  REGIE = 'Régie'
}

export enum TimesheetStatus {
  BROUILLON = 'Brouillon',
  SOUMIS = 'Soumis',
  VALIDE = 'Validé',
  REJETE = 'Rejeté',
  MODIF_DEMANDEE = 'Modif demandée',
  A_REVALIDER = 'À revalider'
}

export interface User {
  id: string;
  lastName: string;
  firstName: string;
  grade: Role;
  email: string;
  country: Country;
  isAdmin: boolean;
  active: boolean;
  cjm: number; // Cost per day
  joiningDate: string; // Date d'arrivée format YYYY-MM-DD
  leavingDate?: string; // Date de départ format YYYY-MM-DD
  permissions: {
    dashboard: boolean;
    planning: boolean;
    availability: boolean;
    timesheets: boolean;
    budget_tracking: boolean;
    admin: boolean;
    reporting: boolean;
  };
}

export interface InternalStaffing {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  percentage: number;
  cjm: number;
  tjm: number;
}

export interface ExternalFreelance {
  id: string;
  firstName: string;
  lastName: string;
  entity: string;
  startDate: string;
  endDate: string;
  cjm: number; // Cost price
  tjm: number; // Selling price
  percentage: number;
}

export interface ExternalSubcontractor {
  id: string;
  entity: string;
  startDate: string;
  endDate: string;
  amount: number; // Buy amount (cost)
  soldAmount: number; // Sold amount (revenue)
  percentage: number;
}

export interface MonthlyBillingOverride {
  amount: number;
  isValidated: boolean;
  comment?: string;
}

export type ExpenseStatus = 'FNP' | 'VALIDATED' | 'NONE';

export interface ManualExpense {
  id: string;
  label: string;
  familyId: string; // 'none' for direct category expenses
  categoryId: string;
  monthlyAmounts: Record<number, number>; // month index -> amount
  monthlyComments?: Record<number, string>; // month index -> comment
  monthlyStatuses?: Record<number, ExpenseStatus>; // month index -> status
}

export interface BudgetFamily {
  id: string;
  label: string;
  categoryId: string;
}

export interface Mission {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  managerId: string;
  billingMode: BillingMode;
  type: string;
  typology: string;
  country: Country;
  startDate: string;
  endDate: string;
  status: MissionStatus;
  forfaitAmountCurrentFY: number;
  forfaitAmountNextFY: number;
  successFeesCurrentFY?: number;
  successFeesNextFY?: number;
  active: boolean;
  billingOverrides?: Record<string, Record<number, MonthlyBillingOverride>>;
  internalStaffing?: InternalStaffing[];
  freelanceStaffing?: ExternalFreelance[];
  subcontractorStaffing?: ExternalSubcontractor[];
  customerPo?: string;
}

export interface PlanningEntry {
  id: string;
  missionId: string;
  userId: string; 
  externalName?: string; 
  externalType?: 'freelance' | 'subcontractor';
  weekStart: string; 
  percentage: number; 
  tjm?: number; 
  costDay?: number; 
  sentiment?: string; 
  weather?: string; 
  comment?: string; 
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  weekStart: string;
  missionId: string; 
  dayIndex: number; 
  percentage: number;
  status: TimesheetStatus;
  comment?: string;
}

export interface Holiday {
  id: string;
  country: Country;
  date: string;
  label: string;
}

export interface AppState {
  users: User[];
  missions: Mission[];
  planning: PlanningEntry[];
  timesheets: TimesheetEntry[];
  holidays: Holiday[];
  currentUser: User | null;
  globalFY: string;
  globalCountry: Country | 'Global';
  globalLanguage: 'FR' | 'EN';
  isMonthlyClosed: boolean;
  // Segmentation par FY puis par Pays
  manualExpenses: Record<string, Record<string, ManualExpense[]>>; 
  budgetFamilies: Record<string, Record<string, BudgetFamily[]>>; 
  budgetValues: Record<string, Record<string, Record<string, number>>>; 
}