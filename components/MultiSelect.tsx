import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  presetAllLabel?: string;
  presetExceptKo?: boolean; // Specific to Status filter
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Tous',
  presetAllLabel = 'Tous',
  presetExceptKo = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter options based on local search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(q));
  }, [options, searchQuery]);

  // Determine helper text to show on trigger
  const triggerText = useMemo(() => {
    if (selectedValues.length === 0) {
      return placeholder;
    }
    if (selectedValues.includes('All')) {
      return presetAllLabel;
    }
    if (selectedValues.includes('Except KO')) {
      return 'Tous sauf KO';
    }
    if (selectedValues.length === options.length) {
      return presetAllLabel;
    }
    if (selectedValues.length > 2) {
      return `${selectedValues.length} sél.`;
    }
    return selectedValues.join(', ');
  }, [selectedValues, options.length, placeholder, presetAllLabel]);

  // Handle checking/unchecking a value
  const handleToggleValue = (val: string) => {
    // If we click an option while 'All' or 'Except KO' is selected, we replace it with literal values
    let currentSelected = [...selectedValues];
    
    if (currentSelected.includes('All')) {
      currentSelected = [];
    } else if (currentSelected.includes('Except KO')) {
      currentSelected = options.filter(opt => opt.trim().toUpperCase() !== 'KO');
    }

    if (currentSelected.includes(val)) {
      const next = currentSelected.filter(v => v !== val);
      onChange(next.length === 0 ? ['All'] : next);
    } else {
      const next = [...currentSelected, val];
      onChange(next.length === options.length ? ['All'] : next);
    }
  };

  // Special handler for selecting "Tous"
  const handleSelectAll = () => {
    onChange(['All']);
    setSearchQuery('');
  };

  // Special handler for selecting "Tous sauf KO"
  const handleSelectExceptKo = () => {
    onChange(['Except KO']);
    setSearchQuery('');
  };

  // Special handler for clearing / deselecting all
  const handleClear = () => {
    onChange([]);
    setSearchQuery('');
  };

  const isActive = selectedValues.length > 0 && !selectedValues.includes('All');

  return (
    <div className="relative space-y-1" ref={containerRef}>
      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block font-sans">
        {label}
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-2 py-1 text-[10px] font-bold text-navy bg-white outline-none cursor-pointer flex items-center justify-between gap-1 transition-all ${
          isActive 
            ? 'border-yellow-accent bg-yellow-accent/5 ring-1 ring-yellow-accent/20' 
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="truncate max-w-[90%]">{triggerText}</span>
        <ChevronDown size={10} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Quick presets */}
          <div className="px-2 pb-2 mb-2 border-b border-slate-100 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors ${
                selectedValues.includes('All')
                  ? 'bg-navy text-white'
                  : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
              }`}
            >
              Tous
            </button>
            {presetExceptKo && (
              <button
                type="button"
                onClick={handleSelectExceptKo}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors ${
                  selectedValues.includes('Except KO')
                    ? 'bg-navy text-white'
                    : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                }`}
              >
                Sauf KO
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-100 text-gray-500 hover:bg-slate-200 transition-colors"
            >
              Aucun
            </button>
          </div>

          {/* Search bar inside popover for large lists */}
          {options.length > 5 && (
            <div className="px-2 mb-2 relative">
              <Search size={10} className="absolute left-3.5 top-2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md pl-6 pr-4 py-1 text-[9px] font-medium text-navy outline-none focus:border-navy/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-2 text-gray-400 hover:text-navy"
                >
                  <X size={8} />
                </button>
              )}
            </div>
          )}

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto px-1 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredOptions.length === 0 ? (
              <p className="text-[10px] text-gray-400 text-center py-2 italic">Aucun résultat</p>
            ) : (
              filteredOptions.map(opt => {
                // Determine checked state depending on preset selections
                let isChecked = false;
                if (selectedValues.includes('All')) {
                  isChecked = true;
                } else if (selectedValues.includes('Except KO')) {
                  isChecked = opt.trim().toUpperCase() !== 'KO';
                } else {
                  isChecked = selectedValues.includes(opt);
                }

                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleToggleValue(opt)}
                    className="w-full text-left px-2 py-1 rounded text-[10px] font-semibold text-navy hover:bg-slate-50 flex items-center justify-between gap-1 transition-colors"
                  >
                    <span className="truncate pr-1">{opt}</span>
                    <div className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center shrink-0 ${
                      isChecked 
                        ? 'bg-navy border-navy text-white' 
                        : 'border-slate-300 bg-white'
                    }`}>
                      {isChecked && <Check size={8} strokeWidth={3} />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
