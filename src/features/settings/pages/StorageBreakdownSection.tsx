import React from 'react';

interface StorageBreakdownSectionProps {
  storageBreakdown: {
    attachments: { bytes: number; count: number };
    artifacts: { bytes: number; count: number };
    media: { bytes: number; count: number };
    database: { bytes: number; count: number };
    temp: { bytes: number; count: number };
    totalBytes: number;
  } | null;
  cleaningCategory: string | null;
  confirmCleanCategory: { id: string; label: string } | null;
  setConfirmCleanCategory: (cat: { id: string; label: string } | null) => void;
  handleCleanStorageCategory: (catId: string) => Promise<void>;
  formatStorageSize: (bytes: number) => string;
}

export function StorageBreakdownSection({
  storageBreakdown,
  cleaningCategory,
  confirmCleanCategory,
  setConfirmCleanCategory,
  handleCleanStorageCategory,
  formatStorageSize
}: StorageBreakdownSectionProps) {
  return (
    <div className="py-3 border-b border-[var(--border-subtle)]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] text-[var(--text-primary)]">Espace disque</div>
        {storageBreakdown && (
          <span className="text-[12px] font-mono text-[var(--text-secondary)]">
            Total{'\u00A0'}: {formatStorageSize(storageBreakdown.totalBytes)}
          </span>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] mb-3">
        Volumes réels occupés sur votre machine par catégorie de données. Vous pouvez libérer de l'espace en nettoyant chaque catégorie de façon sécurisée.
      </p>

      <div className="space-y-2">
        {[
          { id: 'attachments', label: 'Pièces jointes', data: storageBreakdown?.attachments, actionLabel: 'Nettoyer' },
          { id: 'artifacts', label: 'Artéfacts', data: storageBreakdown?.artifacts, actionLabel: 'Nettoyer' },
          { id: 'media', label: 'Médias générés', data: storageBreakdown?.media, actionLabel: 'Nettoyer' },
          { id: 'temp', label: 'Espaces temporaires', data: storageBreakdown?.temp, actionLabel: 'Nettoyer' },
          { id: 'database', label: 'Base de données SQLite', data: storageBreakdown?.database, actionLabel: 'Compacter' }
        ].map(cat => {
          const countStr = cat.data ? (cat.id === 'database' ? `${cat.data.count} fichier` : `${cat.data.count} fichier(s)`) : '—';
          const sizeStr = cat.data ? formatStorageSize(cat.data.bytes) : '—';
          const isCleaning = cleaningCategory === cat.id;

          return (
            <div
              key={cat.id}
              className="bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-primary)] font-medium">{cat.label}</span>
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">{sizeStr}</span>
                </div>
                <div className="text-[11px] text-[var(--text-placeholder)]">{countStr}</div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmCleanCategory({ id: cat.id, label: cat.label })}
                disabled={isCleaning || (cat.data?.bytes === 0 && cat.id !== 'database')}
                className="px-2.5 py-1 text-[11px] bg-[var(--bg-app)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] rounded-[6px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCleaning ? 'Nettoyage…' : cat.actionLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation de nettoyage de catégorie */}
      {confirmCleanCategory && (
        <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 space-y-2">
          <div className="text-[12px] text-[var(--text-primary)] font-medium">
            Confirmer le {confirmCleanCategory.id === 'database' ? 'compactage' : 'nettoyage'} de «{'\u00A0'}{confirmCleanCategory.label}{'\u00A0'}»{'\u00A0'}?
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {confirmCleanCategory.id === 'database'
              ? 'La base SQLite sera défragmentée (VACUUM) pour libérer l\'espace inutilisé sans perte de données.'
              : 'Les fichiers physiques de cette catégorie seront définitivement effacés du disque.'}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmCleanCategory(null)}
              className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleCleanStorageCategory(confirmCleanCategory.id)}
              className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px] cursor-pointer"
            >
              Confirmer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
