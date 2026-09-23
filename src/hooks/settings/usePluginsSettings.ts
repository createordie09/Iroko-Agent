import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

export function usePluginsSettings() {
  const [pluginsList, setPluginsList] = useState<any[]>([]);

  const fetchPluginsData = async () => {
    try {
      const res = await tokenService.fetch('/api/plugins');
      const data = await res.json();
      if (Array.isArray(data.plugins)) {
        setPluginsList(data.plugins);
      }
    } catch {}
  };

  const handleTogglePlugin = async (id: string, currentEnabled: boolean) => {
    try {
      await tokenService.fetch(`/api/plugins/${encodeURIComponent(id)}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      fetchPluginsData();
    } catch {}
  };

  const handleDeletePlugin = async (id: string) => {
    try {
      await tokenService.fetch(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' });
      fetchPluginsData();
    } catch {}
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
