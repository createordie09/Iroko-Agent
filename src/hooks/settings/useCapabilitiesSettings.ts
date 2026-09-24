import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

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
    } catch {} finally {
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
    } catch {}
  };

  const handleUpdateSearchPermission = async (newPerm: 'ask' | 'auto' | 'disabled') => {
    setWebSearchPermission(newPerm);
    try {
      await tokenService.fetch('/api/search/settings', {
        method: 'POST',
        body: JSON.stringify({ permission: newPerm })
      });
      fetchToolsData();
    } catch {}
  };

  const handleToggleTool = async (name: string, currentEnabled: boolean) => {
    setTogglingToolName(name);
    try {
      const res = await tokenService.fetch(`/api/tools/${name}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        setToolsList(prev => prev.map(t => t.name === name ? { ...t, enabled: !currentEnabled } : t));
      }
    } catch {} finally {
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
