import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

export function useCapabilitiesSettings() {
  const [toolsList, setToolsList] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [togglingToolName, setTogglingToolName] = useState<string | null>(null);

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
  }, []);

  return {
    toolsList,
    loadingTools,
    togglingToolName,
    handleToggleTool,
    fetchToolsData
  };
}
