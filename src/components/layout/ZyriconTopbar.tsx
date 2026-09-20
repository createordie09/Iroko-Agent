import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Play, Hammer, Settings, Upload, Menu } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ZyriconTopbarProps {
  onOpenConfiguration: () => void;
  onOpenExport: () => void;
}

export function ZyriconTopbar({ onOpenConfiguration, onOpenExport }: ZyriconTopbarProps) {
  const { activeModel, setActiveModel, activeView, setIsMobileSidebarOpen } = useApp();
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const models = [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
    { id: 'openrouter/auto', name: 'Rotation auto', provider: 'OpenRouter' }
  ];

  const currentModelName = models.find(m => m.id === activeModel)?.name || 'Claude 3.5 Sonnet';
  const isWorkspace = activeView === 'workspace';

  return (
    <div
      className="h-12 px-3 sm:px-4 flex items-center justify-between border-b border-[#1f1f1f] bg-[#0a0a0a] select-none shrink-0"
      style={{ minHeight: 48, maxHeight: 48 }}
    >
      {/* ── Gauche : Menu mobile + Sélecteur de modèle ── */}
      <div className="flex items-center gap-2">
        {/* Déclencheur tiroir mobile */}
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="btn-ghost p-1.5 md:hidden"
          title="Menu de navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Menu déroulant des modèles */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            className="flex items-center gap-1 text-[13px] text-[#8a8a8a] hover:text-white transition-colors"
          >
            <span>{currentModelName}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute top-[calc(100%+8px)] left-0 w-56 bg-[#111111] border border-[#1f1f1f] py-1 z-50">
              <div className="text-[12px] text-[#555555] px-3 py-1">Modèles</div>
              {models.map(m => {
                const isSelected = m.id === activeModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setActiveModel(m.id);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[13px] transition-colors text-left ${
                      isSelected
                        ? 'text-white bg-[#1a1a1a]'
                        : 'text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[12px] text-[#555555]">{m.provider}</div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Droite : Boutons d'action ghost ── */}
      <div className="flex items-center gap-1">
        {isWorkspace && (
          <>
            <button type="button" className="btn-ghost text-[13px]">
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Tester</span>
            </button>
            <button type="button" className="btn-ghost text-[13px]">
              <Hammer className="w-4 h-4" />
              <span className="hidden sm:inline">Compiler</span>
            </button>
          </>
        )}
        <button type="button" onClick={onOpenConfiguration} className="btn-ghost text-[13px]">
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">Configuration</span>
        </button>
        <button type="button" onClick={onOpenExport} className="btn-ghost text-[13px]">
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Exporter</span>
        </button>
      </div>
    </div>
  );
}
