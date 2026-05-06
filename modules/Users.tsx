import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, Save, AlertTriangle, Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX } from 'lucide-react';
import { AppState, User, Country, Role } from '../types';
import { generateId } from '../utils';
import { syncUserToCloud } from '../services/dataService';

interface UsersProps {
  state: AppState;
  updateState: (newState: Partial<AppState>) => void;
}

type UserSortKey = keyof User | 'fullName';

const Users: React.FC<UsersProps> = ({ state, updateState }) => {
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userSortConfig, setUserSortConfig] = useState<{ key: UserSortKey; direction: 'asc' | 'desc' }>({ 
    key: 'lastName', 
    direction: 'asc' 
  });

  const confirmDeleteUser = () => {
    if (userToDelete) {
      updateState({ users: state.users.filter(u => u.id !== userToDelete) });
      setUserToDelete(null);
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editingUser.id) {
      const newUser = { ...editingUser } as User;
      const newUsers = state.users.map(u => 
        u.id === editingUser.id ? { ...u, ...newUser } as User : u
      );
      updateState({ users: newUsers });
      syncUserToCloud(newUser);
    } else {
      const newUser: User = {
        ...editingUser,
        id: generateId(),
      } as User;
      updateState({ users: [...state.users, newUser] });
      syncUserToCloud(newUser);
    }
    setEditingUser(null);
  };

  const handleUserSort = (key: UserSortKey) => {
    setUserSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const UserSortIcon = ({ column }: { column: UserSortKey }) => {
    if (userSortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-20" />;
    return userSortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1 text-yellow-accent" /> : <ChevronDown size={12} className="ml-1 text-yellow-accent" />;
  };

  const clearFilters = () => {
    setUserSearch('');
  };

  const hasActiveFilters = userSearch !== '';

  // Processed Users (Country + Search + Sort)
  const processedUsers = useMemo(() => {
    let result = [...state.users];
    if (state.globalCountry !== 'Global') {
      result = result.filter(u => u.country === state.globalCountry);
    }
    if (userSearch) {
      const term = userSearch.toLowerCase();
      result = result.filter(u => 
        u.firstName.toLowerCase().includes(term) || 
        u.lastName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.grade.toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => {
      let valA: any = a[userSortConfig.key as keyof User];
      let valB: any = b[userSortConfig.key as keyof User];
      if (userSortConfig.key === 'fullName') {
        valA = `${a.firstName} ${a.lastName}`;
        valB = `${b.firstName} ${b.lastName}`;
      }
      if (valA < valB) return userSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return userSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [state.users, userSearch, userSortConfig, state.globalCountry]);

  const getInitialUser = (): Partial<User> => ({
    firstName: '',
    lastName: '',
    email: '',
    grade: Role.CONSULTANT,
    country: state.globalCountry !== 'Global' ? state.globalCountry as Country : Country.FRANCE,
    active: true,
    isAdmin: false,
    cjm: 500,
    // Added budget_tracking: true to fix the missing property error
    permissions: {
      dashboard: true,
      planning: true,
      availability: true,
      timesheets: true,
      budget_tracking: true,
      admin: false,
      reporting: true
    }
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-700 uppercase text-xs tracking-wider shrink-0">
                Gestion des Utilisateurs
              </h2>
              <span className="bg-navy/10 text-navy px-2 py-0.5 rounded-full text-[10px] font-bold">
                {processedUsers.length}
              </span>
            </div>
            
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                placeholder="Rechercher Nom, Email, Grade..." 
                className="w-full pl-9 pr-4 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-yellow-accent outline-none"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <button 
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-100 uppercase"
              >
                <FilterX size={12} />
                Supprimer les filtres
              </button>
            )}
          </div>

          <button 
            onClick={() => setEditingUser(getInitialUser())}
            className="flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-navy/90 transition-colors shrink-0"
          >
            <Plus size={16} />
            Ajouter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase text-gray-400 font-bold border-b">
                <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleUserSort('fullName')}>
                  <div className="flex items-center">Utilisateur <UserSortIcon column="fullName" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleUserSort('grade')}>
                  <div className="flex items-center">Grade <UserSortIcon column="grade" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleUserSort('country')}>
                  <div className="flex items-center">Pays <UserSortIcon column="country" /></div>
                </th>
                <th className="p-4">Permissions</th>
                <th className="p-4 cursor-pointer hover:text-navy transition-colors group" onClick={() => handleUserSort('active')}>
                  <div className="flex items-center">Statut <UserSortIcon column="active" /></div>
                </th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {processedUsers.map((user) => (
                <tr key={user.id} className="text-sm hover:bg-gray-50 cursor-pointer group" onClick={() => setEditingUser(user)}>
                  <td className="p-4">
                    <div className="font-bold text-navy">{user.firstName} {user.lastName}</div>
                    <div className="text-[10px] text-gray-500">{user.email}</div>
                  </td>
                  <td className="p-4 text-xs">{user.grade}</td>
                  <td className="p-4 text-xs">{user.country}</td>
                  <td className="p-4">
                    <div className="flex gap-1 flex-wrap">
                      {user.isAdmin && <span className="bg-navy text-white text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Admin</span>}
                      {user.permissions.planning && <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Planif</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {user.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setUserToDelete(user.id); }}
                        className={`p-1.5 text-red-400 hover:text-red-600 transition-colors`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-lg font-bold text-navy">Confirmer la suppression</h3>
              <p className="text-sm text-gray-500">
                Êtes-vous sûr de vouloir supprimer cet utilisateur ? <br/>
                <span className="font-bold text-navy">
                  {state.users.find(u => u.id === userToDelete)?.firstName + ' ' + state.users.find(u => u.id === userToDelete)?.lastName}
                </span>
                <br/>Cette action est irréversible.
              </p>
            </div>
            <div className="p-4 bg-gray-50 flex gap-3">
              <button 
                onClick={() => setUserToDelete(null)}
                className="flex-1 px-4 py-2 border rounded-lg font-bold text-gray-600 hover:bg-white transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={confirmDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-md"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold text-navy">
                {editingUser.id ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
              </h3>
              <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prénom</label>
                  <input required type="text" value={editingUser.firstName} onChange={e => setEditingUser({...editingUser, firstName: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nom</label>
                  <input required type="text" value={editingUser.lastName} onChange={e => setEditingUser({...editingUser, lastName: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                  <input required type="email" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grade</label>
                  <select value={editingUser.grade} onChange={e => setEditingUser({...editingUser, grade: e.target.value as Role})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent">
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pays</label>
                  <select value={editingUser.country} onChange={e => setEditingUser({...editingUser, country: e.target.value as Country})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent">
                    {Object.values(Country).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CJM (Coût/Jour)</label>
                  <input type="number" value={editingUser.cjm} onChange={e => setEditingUser({...editingUser, cjm: parseInt(e.target.value) || 0})} className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-yellow-accent" />
                </div>
                
                <div className="flex flex-col gap-4 pt-2">
                   <div className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" id="user-active" checked={editingUser.active} onChange={e => setEditingUser({...editingUser, active: e.target.checked})} className="w-4 h-4 rounded text-navy" />
                      <label htmlFor="user-active" className="text-sm font-bold text-gray-700 cursor-pointer">Actif</label>
                   </div>
                   <div className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" id="user-admin" checked={editingUser.isAdmin} onChange={e => setEditingUser({...editingUser, isAdmin: e.target.checked})} className="w-4 h-4 rounded text-navy" />
                      <label htmlFor="user-admin" className="text-sm font-bold text-gray-700 cursor-pointer">Administrateur</label>
                   </div>
                </div>

                <div className="col-span-2 space-y-2 pt-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Permissions Modules</label>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.keys(editingUser.permissions || {}).map((p) => (
                      <label key={p} className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                        <input 
                          type="checkbox" 
                          checked={(editingUser.permissions as any)[p]} 
                          onChange={e => setEditingUser({
                            ...editingUser, 
                            permissions: { ...editingUser.permissions!, [p]: e.target.checked }
                          })} 
                          className="w-4 h-4 rounded text-navy"
                        />
                        <span className="text-xs font-medium capitalize">{p}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onClick={() => setEditingUser(null)} className="px-6 py-2 border rounded-lg font-bold text-gray-500 hover:bg-gray-50">Annuler</button>
                <button type="submit" className="flex items-center gap-2 px-6 py-2 bg-navy text-white rounded-lg font-bold hover:bg-navy/90 shadow-lg">
                  <Save size={18} /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;