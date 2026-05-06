import { Country, Role, User, MissionStatus, BillingMode } from './types';

export const FY_START_MONTH = 1; // February (0-indexed is 1)
export const FY_START_DAY = 1;

export const SEED_USERS_RAW = `NOM,PRENOM,GRADE,EMAIL,PAYS
HUON,Yannick,Directeur Associé,yhuon@epsa.com,France
TERRIER,Olivier,Directeur Associé,oterrier@epsa.com,France
BOUCHET,Stéphane,Country Manager,sbouchet@epsa.com,France
MINAUD,François,Country Manager,fminaud@epsa.com,France
SZAFRANIEC,Anne,Country Manager,aszafraniec@epsa.com,France
GUMANI,Dillan,Principal,dgumani@epsa.com,France
MONTAUFIER,Hugo,Principal,hmontaufier@epsa.com,France
BOMBRE,Salomé,Delivery Manager,sbombre@epsa.com,France
HANDAINE,Amnaï,Delivery Manager,ahandaine@epsa.com,France
WANDEROILD,Alexis,Delivery Manager,awanderoild@epsa.com,France
REY,Benoit,Delivery Manager,brey@epsa.com,France
FIMBRES,Cynthia,Consultant,cfimbres@epsa.com,France
LEFEVRE,Suliac,Consultant,slefevre@epsa.com,France
DE SENA,Marie,Consultant,mde sena@epsa.com,France
DUHAMEL,Marie,Consultant,mduhamel@epsa.com,France
HARDY,Charlotte,Consultant,chardy@epsa.com,France
TIBI,Sarah-Lou,Consultant,stibi@epsa.com,France
FADEL,Max,Country Manager,mfadel@epsa.com,Espagne
POLANCO,Cristina,Principal,cpolanco@epsa.com,Espagne
FERNANDEZ,Marta,Consultant,mfernandez@epsa.com,Espagne
MIGHOUAR,Safaa,Country Manager,smighouar@epsa.com,Italie
PEDERZOLI,PEDERZOLI,Consultant,ppederzoli@epsa.com,Italie
MELATO,MELATO,Consultant,mmelato@epsa.com,Italie`;

export const SEED_MISSIONS_RAW = `CLIENT,PAYS,NOM_MISSION,FY2025,FY2026,RESPONSABLE_EMAIL,TYPE_MISSION,MODE,TYPOLOGIE,DATE_DEBUT,DATE_FIN,STATUT
LOEWE,Espagne,"LOEWE - Plan de Transfo Achats - Déploiement","300000","100000",mfadel@epsa.com,Déploiement,Forfait,Achats,01/03/2025,31/03/2026,Active
ALTRAD,France,"ALTRAD & IMPULSE - Déploiement initiatives Achats","537396","",dgumani@epsa.com,Déploiement,Forfait,Achats,01/05/2025,30/09/2025,Active
ALTRAD IMPULSE,France,"ALTRAD & IMPULSE - Dividende","300000","10000",dgumani@epsa.com,Déploiement,Forfait,Achats,01/09/2025,31/03/2026,Active
CARREFOUR,France,"PMO Junior","63825","72633",aszafraniec@epsa.com,Staffing,Régie,PMO,01/05/2025,31/03/2026,Active
CARREFOUR,France,"PMO Sénior","101700","7299",aszafraniec@epsa.com,Staffing,Régie,PMO,01/05/2025,31/03/2026,Active
CLARINS,France,"CLARINS - Mission Prestation IT - Pôle applicatif Qualité / R&D (RNOct)","400000","",oterrier@epsa.com,Staffing,Régie,IT,01/03/2025,30/09/2025,Active
COOPER,France,"COOPER - Plan de transfo et MRO","214500","",aszafraniec@epsa.com,Déploiement,Forfait,SUPPLY CHAIN,01/09/2025,31/12/2025,Active
DAHER,France,"DAHER - Spend cube et contrathèque 2026","23500","",aszafraniec@epsa.com,Déploiement,Forfait,SUPPLY CHAIN,01/05/2025,30/09/2025,Active
EMEIS,France,"EMEIS - Accompagnement Orga Appro centre en Fr (RN)","59400","",yhuon@epsa.com,Staffing,Régie,SUPPLY CHAIN,01/10/2025,31/12/2025,Active
EPSA DEV,France,"EPSA DEV - PMO équipe ""Project Management""","81000","81726",oterrier@epsa.com,Staffing,Régie,PMO,01/03/2025,31/05/2026,Active
EXPLEO,France,"EXPLEO - Mission Excellence opé (RN Juin)","19530","",sbouchet@epsa.com,Staffing,Régie,SUPPLY CHAIN,01/10/2025,31/12/2025,Active
GREENYELLOW,France,"GREENYELLOW - Manager de transition (RN)","12500","",sbouchet@epsa.com,Staffing,Régie,Achats,01/05/2025,30/09/2025,Active
IMAGERIE CARDINET,France,"Plan Transfo Achats & Lean Management Radiologie","110000","",oterrier@epsa.com,Audit,Forfait,Stratégie,01/10/2025,31/12/2025,Active
KRYS GROUP,France,"KRYS GROUP - Transfo Achats (Orga et Optim HAI)","45000","",oterrier@epsa.com,Audit,Forfait,Achats,01/03/2025,30/09/2025,Active
SABENA TECHNICS,France,"SABENA TECHNICS - Optimisation Processus Douanes","35000","",oterrier@epsa.com,Audit,Forfait,SUPPLY CHAIN,01/09/2025,31/12/2025,Active
SANOFI,France,"SANOFI - Déploiement Pack 2025","249898","",dgumani@epsa.com,Déploiement,Forfait,Opérations,01/10/2025,31/12/2025,Active
SERVIER,France,"SERVIER - Prolongation mission supply Cynthia (Oct à Mars)","52560","",aszafraniec@epsa.com,Staffing,Régie,SUPPLY CHAIN,01/03/2025,30/10/2025,Active
SOFINORD,France,"SOFINORD - Déploiement Transfo","90000","80000",fminaud@epsa.com,Déploiement,Forfait,Achats,01/03/2025,31/05/2026,Active
SEO,France,"SEO - Implémentation Fonctionnelle Achats","55000","",fminaud@epsa.com,Déploiement,Régie,Achats,01/05/2025,30/10/2025,Active
TALAN,France,"TALAN - CatMan HA","19680","",aszafraniec@epsa.com,Déploiement,Forfait,Achats,01/09/2025,31/12/2025,Active
ULM,France,"ULM - Mission Accompagnement Dév. Co.","235000","",sbouchet@epsa.com,Déploiement,Forfait,Stratégie,01/03/2025,30/10/2025,Active
UTAC,France,"UTAC - Plan de Perf","150000","",yhuon@epsa.com,Déploiement,Forfait,Achats,01/05/2025,30/10/2025,Active
STELLANTIS,Italie,"Staffing SUPPLY CHAIN","190000","100000",smighouar@epsa.com,Staffing,Régie,SUPPLY CHAIN,01/03/2025,31/05/2026,Active`;

export const MISSION_TYPES = ['Staffing', 'Audit', 'Déploiement'];
export const TYPOLOGIES = ['SUPPLY CHAIN', 'Stratégie', 'Opérations', 'Achats', 'IT', 'Finance', 'HR', 'PMO'];

export const ADMIN_ROLES = [Role.BUSINESS_DEV, Role.COUNTRY_MANAGER, Role.DIRECTEUR_ASSOCIE];

export const parseCSVUsers = (): User[] => {
  const lines = SEED_USERS_RAW.split('\n').slice(1);
  return lines.map((line, index) => {
    const [last, first, grade, email, country] = line.split(',');
    const isAdmin = ADMIN_ROLES.includes(grade as Role);
    return {
      id: `u-${index}`,
      lastName: last,
      firstName: first,
      grade: grade as Role,
      email: email,
      country: country as Country,
      isAdmin: isAdmin,
      active: true,
      cjm: grade.includes('Directeur') ? 1200 : grade.includes('Manager') ? 800 : 500,
      joiningDate: '2024-01-01', // Date par défaut pour les users historiques
      permissions: {
        dashboard: true,
        planning: true,
        availability: true,
        timesheets: true,
        budget_tracking: true,
        admin: isAdmin,
        reporting: true
      }
    };
  });
};