import React, { useState } from 'react';
import { CalendarDays, Plus, Sparkles, Bot, Tag, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CalendarItem } from '../../types';

export function TasksWorkspace() {
  const { calendarItems, setCalendarItems } = useApp();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle]         = useState('');
  const [newDesc, setNewDesc]           = useState('');

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newItem: CalendarItem = {
      id: `task-${Date.now()}`,
      idea: newTitle.trim(),
      description: newDesc.trim() || 'Tâche planifiée dans Iroko',
      network: 'Système Agent',
      planned_date: new Date().toISOString().split('T')[0],
      status: 'idea'
    };
    setCalendarItems(prev => [newItem, ...prev]);
    setNewTitle(''); setNewDesc('');
    setShowNewModal(false);
  };

  const fieldCls = 'w-full px-3 py-2 bg-[#0a0a0a] border-b border-[#1f1f1f] text-[13px] text-white placeholder:text-[#555555] focus:outline-none focus:border-b-[#aaaaaa] transition-colors';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar w-full bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* En-tête */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1f1f1f]">
          <div>
            <h1 className="text-[20px] font-semibold text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#8a8a8a]" />
              Tâches & Feuille de Route
            </h1>
            <p className="text-[13px] text-[#8a8a8a] mt-1">
              Suivi des tâches et de la feuille de route du projet actif.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="btn-ghost text-[13px]"
          >
            <Plus className="w-4 h-4" />
            Nouvelle tâche
          </button>
        </div>

        {/* Section : Feuille de route & Publications */}
        <div>
          <p className="text-[12px] text-[#555555] mb-4 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Feuille de route & Publications
          </p>

          {calendarItems.length === 0 ? (
            <div className="py-16 text-center">
              <CalendarDays className="w-6 h-6 text-[#555555] mx-auto mb-3" />
              <p className="text-[14px] text-[#8a8a8a]">Aucun élément planifié pour le moment</p>
              <p className="text-[13px] text-[#555555] mt-1">
                Ajoutez des objectifs de projet ou des publications à programmer.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {calendarItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-start justify-between py-3 border-b border-[#1f1f1f] last:border-b-0 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[14px] font-medium text-white truncate">{item.idea}</h4>
                    <p className="text-[13px] text-[#8a8a8a] mt-0.5 line-clamp-2">{item.description}</p>
                    <p className="text-[12px] text-[#555555] mt-1">{item.network}</p>
                  </div>
                  <span className="text-[12px] text-[#555555] font-mono shrink-0 pt-0.5">{item.planned_date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal d'ajout de tâche */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111111] border border-[#1f1f1f]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
              <h3 className="text-[14px] font-semibold text-white">Nouvelle tâche</h3>
              <button type="button" onClick={() => setShowNewModal(false)} className="btn-ghost px-1 py-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="px-4 py-4 space-y-4">
              <div>
                <label className="text-[12px] text-[#8a8a8a] block mb-1">Titre</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex : Optimiser les requêtes SQL, Rédiger l'article…"
                  required
                  autoFocus
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="text-[12px] text-[#8a8a8a] block mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Détails, critères d'acceptation…"
                  rows={3}
                  className={`${fieldCls} resize-none`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNewModal(false)} className="btn-ghost text-[13px]">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="send-btn"
                  style={{ width: 'auto', padding: '0 14px', fontSize: 13 }}
                >
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
