import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

export function useSkillsSettings() {
  const [skillsList, setSkillsList] = useState<any[]>([]);
  const [showImportSkillForm, setShowImportSkillForm] = useState(false);
  const [importSkillPath, setImportSkillPath] = useState('');
  const [skillError, setSkillError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [editSkillInstructions, setEditSkillInstructions] = useState('');

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
      setSkillError('Le chemin du dossier est obligatoire.');
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
      fetchSkillsData();
    } catch (err: any) {
      setSkillError(err.message || 'Erreur réseau.');
    }
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

  const handleDeleteSkill = async (name: string) => {
    try {
      await tokenService.fetch(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
      fetchSkillsData();
    } catch {}
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
    handleSaveSkillEdit,
    handleDeleteSkill
  };
}
