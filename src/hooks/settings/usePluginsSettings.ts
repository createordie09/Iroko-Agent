import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { feedbackBus } from '../../services/feedback/FeedbackBus';

export function usePluginsSettings() {
  const [pluginsList, setPluginsList] = useState<any[]>([]);

  const fetchPluginsData = async () => {
    try {
      const res = await tokenService.fetch('/api/plugins');
      const data = await res.json();
      if (Array.isArray(data.plugins)) {
        setPluginsList(data.plugins);
      }
    } catch {
      feedbackBus.error('Impossible de charger les extensions.');
    }
  };

  const handleTogglePlugin = async (id: string, currentEnabled: boolean) => {
    try {
      await tokenService.fetchChecked(`/api/plugins/${encodeURIComponent(id)}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      }, "Impossible de modifier l'extension.");
    } catch (err) {
      feedbackBus.report(err, "Impossible de modifier l'extension.");
    }
    fetchPluginsData();
  };

  const handleDeletePlugin = async (id: string) => {
    try {
      await tokenService.fetchChecked(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' }, "Impossible de supprimer l'extension.");
    } catch (err) {
      feedbackBus.report(err, "Impossible de supprimer l'extension.");
    }
    fetchPluginsData();
  };

  useEffect(() => {
    fetchPluginsData();
  }, []);

  return {
    pluginsList,
    handleTogglePlugin,
    handleDeletePlugin,
    fetchPluginsData
  };
}
