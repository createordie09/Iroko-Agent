import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { feedbackBus } from '../../services/feedback/FeedbackBus';

export function useCapabilitiesSettings() {
  const [toolsList, setToolsList] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [togglingToolName, setTogglingToolName] = useState<string | null>(null);

  const [webSearchPermission, setWebSearchPermission] = useState<'ask' | 'auto' | 'disabled'>('ask');

  const fetchToolsData = async () => {
    setLoadingTools(true);
    try {
      const res = await tokenService.fetch('/api/tools');
      const data = await res.json();
      if (Array.isArray(data.tools)) {
        setToolsList(data.tools);
      }
    } catch {
      feedbackBus.error('Impossible de charger les outils.');
    } finally {
      setLoadingTools(false);
    }
  };

  const fetchSearchPermission = async () => {
    try {
      const res = await tokenService.fetch('/api/search/settings');
      const data = await res.json();
      if (data.permission) {
        setWebSearchPermission(data.permission);
      }
    } catch {
      feedbackBus.error('Impossible de charger la permission de recherche web.');
    }
  };

  const handleUpdateSearchPermission = async (newPerm: 'ask' | 'auto' | 'disabled') => {
    const previous = webSearchPermission;
    setWebSearchPermission(newPerm);
    try {
      await tokenService.fetchChecked('/api/search/settings', {
        method: 'POST',
        body: JSON.stringify({ permission: newPerm })
      }, 'Impossible de modifier la permission de recherche web.');
      fetchToolsData();
    } catch (err) {
      setWebSearchPermission(previous);
      feedbackBus.report(err, 'Impossible de modifier la permission de recherche web.');
    }
  };

  const handleToggleTool = async (name: string, currentEnabled: boolean) => {
    setTogglingToolName(name);
    try {
      await tokenService.fetchChecked(`/api/tools/${name}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      }, "Impossible de modifier l'outil.");
      setToolsList(prev => prev.map(t => t.name === name ? { ...t, enabled: !currentEnabled } : t));
    } catch (err) {
      feedbackBus.report(err, "Impossible de modifier l'outil.");
    } finally {
      setTogglingToolName(null);
    }
  };

  useEffect(() => {
    fetchToolsData();
    fetchSearchPermission();
  }, []);

  return {
    toolsList,
    loadingTools,
    togglingToolName,
    handleToggleTool,
    fetchToolsData,
    webSearchPermission,
    handleUpdateSearchPermission
  };
}
