import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { useSkillsSettings } from '../../../hooks/settings/useSkillsSettings';

export function SkillsPage() {
  const {
    skillsList,
    showImportSkillForm,
    setShowImportSkillForm,
    importSkillPath,
    setImportSkillPath,
    skillError,
    setSkillError,
    editingSkill,
    setEditingSkill,
    editSkillInstructions,
    setEditSkillInstructions,
    handleToggleSkill,
    handleImportSkill,
    handleSaveSkillEdit,
    handleDeleteSkill,
    importResult,
    setImportResult,
    handleConfirmActivation
  } = useSkillsSettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Compétences
          </h3>
          {!showImportSkillForm && !editingSkill && (
            <button
              type="button"
              onClick={() => {
                setShowImportSkillForm(true);
                setSkillError(null);
              }}
              className="px-2.5 py-1 text-[12px] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] rounded-[6px] transition-colors cursor-pointer"
            >
              + Importer une compétence
            </button>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal">
          Compétences modulaires (`SKILL.md`). Les descriptions sont incluses dans le catalogue du prompt système{'\u00A0'}; les instructions complètes ne sont chargées qu'à la demande (§13).
        </p>
      </div>

      {/* Formulaire d'importation */}
      {showImportSkillForm && (
        <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[8px] space-y-3">
          <div className="text-[13px] font-medium text-[var(--text-primary)]">Importer une compétence</div>
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Chemin absolu du dossier</label>
            <input
              type="text"
              value={importSkillPath}
              onChange={e => setImportSkillPath(e.target.value)}
              placeholder="Ex: C:\Users\...\ma-competence"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          {skillError && <div className="text-[12px] text-[var(--text-primary)] bg-[var(--border-subtle)] p-2 rounded">{skillError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowImportSkillForm(false)}
              className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleImportSkill}
              className="px-3 py-1 text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-[6px] transition-colors cursor-pointer"
            >
              Importer
            </button>
          </div>
        </div>
      )}

      {/* Rapport et confirmation de sécurité après import */}
      {importResult && (
        <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[8px] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              Rapport de sécurité{'\u00A0'}: {importResult.skill.name}
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
              {importResult.skill.isSystem ? 'Système' : 'Importée'}
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-normal">
            La compétence a été importée avec succès. Conformément aux règles de sécurité, elle reste désactivée par défaut tant que vous ne confirmez pas son activation.
          </p>

          {importResult.scanReport && (
            <div className="p-2.5 bg-[var(--bg-surface)] rounded-[6px] border border-[var(--border-subtle)] space-y-1 text-[11px] font-mono text-[var(--text-secondary)]">
              <div>Scripts détectés{'\u00A0'}: {importResult.scanReport.scripts.length}</div>
              <div>Appels réseau{'\u00A0'}: {importResult.scanReport.networkCalls.length === 0 ? 'Aucun' : importResult.scanReport.networkCalls.join(', ')}</div>
              <div>Exécutions de commandes{'\u00A0'}: {importResult.scanReport.commandExecutions.length === 0 ? 'Aucune' : importResult.scanReport.commandExecutions.join(', ')}</div>
              <div>URLs distantes{'\u00A0'}: {importResult.scanReport.urls.length === 0 ? 'Aucune' : `${importResult.scanReport.urls.length} URL(s)`}</div>
              <div>Traversées de chemin{'\u00A0'}: {importResult.scanReport.pathTraversals.length === 0 ? 'Aucune' : 'Détectées'}</div>
            </div>
          )}

          {importResult.warnings && importResult.warnings.length > 0 && (
            <div className="p-2.5 bg-[var(--bg-surface)] rounded-[6px] border border-[var(--border-subtle)] space-y-1 text-[11px] text-[var(--text-secondary)]">
              <div className="font-semibold text-[var(--text-primary)]">Avertissements{'\u00A0'}:</div>
              {importResult.warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Laisser désactivée
            </button>
            <button
              type="button"
              onClick={() => handleConfirmActivation(importResult.skill.name)}
              className="px-3 py-1 text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-[6px] transition-colors cursor-pointer"
            >
              Confirmer et activer
            </button>
          </div>
        </div>
      )}

      {/* Formulaire d'édition */}
      {editingSkill && (
        <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[8px] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              Modifier{'\u00A0'}: {editingSkill.name}
            </div>
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">{editingSkill.dirPath}</span>
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Instructions Markdown</label>
            <textarea
              value={editSkillInstructions}
              onChange={e => setEditSkillInstructions(e.target.value)}
              rows={8}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-2 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)] custom-scrollbar"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingSkill(null)}
              className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveSkillEdit}
              className="px-3 py-1 text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-[6px] transition-colors cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Liste des compétences */}
      {skillsList.length === 0 && !showImportSkillForm && !editingSkill && !importResult ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          Aucune compétence configurée.
        </p>
      ) : (
        <div className="space-y-2">
          {skillsList.map(skill => (
            <div
              key={skill.name}
              className="p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">{skill.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
                    {skill.isSystem ? 'Système' : 'Importée'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
                    {skill.enabled ? 'Activée' : 'Désactivée'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSkill(skill.name, skill.enabled)}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      skill.enabled ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {skill.enabled ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSkill(skill);
                      setEditSkillInstructions(skill.instructions);
                    }}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Modifier les instructions"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSkill(skill.name)}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Supprimer la compétence"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                {skill.description}
              </p>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">
                {skill.dirPath}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
