import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { useUndoDeletion } from '../useUndoDeletion';

export interface SkillScanSummary {
  scripts: string[];
  networkCalls: string[];
  commandExecutions: string[];
  urls: string[];
  pathTraversals: string[];
  hasSuspiciousActivity: boolean;
}

export interface SkillItem {
  name: string;
  description: string;
  dirPath: string;
  instructions: string;
  enabled: boolean;
  isSystem: boolean;
  metadata?: Record<string, any>;
  warnings?: string[];
  scanReport?: SkillScanSummary;
}

export function useSkillsSettings() {
  const { scheduleUndoableDeletion } = useUndoDeletion();
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [showImportSkillForm, setShowImportSkillForm] = useState(false);
  const [importSkillPath, setImportSkillPath] = useState('');
  const [skillError, setSkillError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [editSkillInstructions, setEditSkillInstructions] = useState('');
  const [importResult, setImportResult] = useState<{
    skill: SkillItem;
    scanReport?: SkillScanSummary;
    warnings?: string[];
  } | null>(null);

  const fetchSkillsData = async () => {
    try {
      const res = await tokenService.fetch('/api/skills');
      const data = await res.json();
      if (Array.isArray(data.skills)) {
        setSkillsList(data.skills);
      }
    } catch {}
  };

  const handleToggleSkill = async (name: string, currentEnabled: boolean) => {
    try {
      await tokenService.fetch(`/api/skills/${encodeURIComponent(name)}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      fetchSkillsData();
    } catch {}
  };

  const handleImportSkill = async () => {
    setSkillError(null);
    if (!importSkillPath.trim()) {
      setSkillError("Le chemin du dossier ou de l'archive .zip est obligatoire.");
      return;
    }

    try {
      const res = await tokenService.fetch('/api/skills/import', {
        method: 'POST',
        body: JSON.stringify({ dirPath: importSkillPath.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setSkillError(data.error || 'Erreur lors de l\'importation.');
        return;
      }

      setShowImportSkillForm(false);
      setImportSkillPath('');
      setImportResult({
        skill: data.skill,
        scanReport: data.scanReport,
        warnings: data.warnings
      });
      fetchSkillsData();
    } catch (err: any) {
      setSkillError(err.message || 'Erreur réseau.');
    }
  };

  const handleConfirmActivation = async (name: string) => {
    await handleToggleSkill(name, false);
    setImportResult(null);
  };

  const handleSaveSkillEdit = async () => {
    if (!editingSkill) return;
    try {
      await tokenService.fetch(`/api/skills/${encodeURIComponent(editingSkill.name)}`, {
        method: 'PUT',
        body: JSON.stringify({ instructions: editSkillInstructions })
      });
      setEditingSkill(null);
      fetchSkillsData();
    } catch {}
  };

  const handleDeleteSkill = (name: string) => {
    const oldSkills = [...skillsList];
    setSkillsList(prev => prev.filter(s => s.name !== name));
    scheduleUndoableDeletion({
      itemType: 'skill',
      id: name,
      label: 'Compétence supprimée.',
      onRestore: () => {
        setSkillsList(oldSkills);
      }
    });
  };

  const handleExportSkill = async (name: string): Promise<boolean> => {
    try {
      const res = await tokenService.fetch(`/api/skills/${encodeURIComponent(name)}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSkillError(data.error || "Erreur lors de l'exportation de la compétence.");
        return false;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return true;
    } catch (err: any) {
      setSkillError(err.message || "Erreur réseau lors de l'exportation.");
      return false;
    }
  };

  const handleImportZipFile = async (file: File) => {
    setSkillError(null);
    try {
      const token = await tokenService.getToken();
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Iroko-Request': '1',
          'Content-Type': 'application/zip',
          'X-Filename': encodeURIComponent(file.name)
        },
        body: file
      });
      const data = await res.json();
      if (!res.ok) {
        setSkillError(data.error || "Erreur lors de l'importation de l'archive.");
        return;
      }

      setShowImportSkillForm(false);
      setImportSkillPath('');
      setImportResult({
        skill: data.skill,
        scanReport: data.scanReport,
        warnings: data.warnings
      });
      fetchSkillsData();
    } catch (err: any) {
      setSkillError(err.message || 'Erreur réseau.');
    }
  };

  useEffect(() => {
    fetchSkillsData();
  }, []);

  return {
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
    handleExportSkill,
    handleImportZipFile,
    handleSaveSkillEdit,
    handleDeleteSkill,
    importResult,
    setImportResult,
    handleConfirmActivation
  };
}
