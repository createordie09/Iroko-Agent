import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { feedbackBus } from '../../services/feedback/FeedbackBus';

export function useConnectorsSettings() {
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [projectMcpConfig, setProjectMcpConfig] = useState<any | null>(null);
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpType, setNewMcpType] = useState<'stdio' | 'streamable-http' | 'sse'>('stdio');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpSuccessMessage] = useState<string | null>(null);
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null);

  const fetchMcpData = async () => {
    try {
      const [serversRes, configRes] = await Promise.all([
        tokenService.fetch('/api/mcp/servers').then(r => r.json()),
        tokenService.fetch('/api/mcp/project-config').then(r => r.json()).catch(() => ({ found: false }))
      ]);
      if (Array.isArray(serversRes.servers)) {
        setMcpServers(serversRes.servers);
      }
      if (configRes.found) {
        setProjectMcpConfig(configRes);
      } else {
        setProjectMcpConfig(null);
      }
    } catch {
      feedbackBus.error('Impossible de charger les connecteurs.');
    }
  };

  const handleAddMcpServer = async () => {
    setMcpError(null);
    if (!newMcpName.trim()) {
      setMcpError('Le nom du connecteur est obligatoire.');
      return;
    }
    if (newMcpType === 'stdio' && !newMcpCommand.trim()) {
      setMcpError('La commande est obligatoire pour un connecteur stdio.');
      return;
    }
    if ((newMcpType === 'streamable-http' || newMcpType === 'sse') && !newMcpUrl.trim()) {
      setMcpError('L\'URL est obligatoire pour un connecteur HTTP/SSE.');
      return;
    }

    try {
      const args = newMcpArgs.trim() ? newMcpArgs.trim().split(/\s+/) : [];
      const res = await tokenService.fetch('/api/mcp/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: newMcpName.trim(),
          type: newMcpType,
          command: newMcpType === 'stdio' ? newMcpCommand.trim() : undefined,
          args: newMcpType === 'stdio' ? args : undefined,
          url: newMcpType !== 'stdio' ? newMcpUrl.trim() : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setMcpError(data.error || 'Erreur lors de l\'ajout du connecteur.');
        return;
      }

      setShowAddMcpForm(false);
      setNewMcpName('');
      setNewMcpCommand('');
      setNewMcpArgs('');
      setNewMcpUrl('');
      fetchMcpData();
    } catch (err: any) {
      setMcpError(err.message || 'Erreur réseau.');
    }
  };

  const handleToggleMcpServer = async (name: string, currentEnabled: boolean) => {
    try {
      await tokenService.fetchChecked(`/api/mcp/servers/${encodeURIComponent(name)}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      }, 'Impossible de modifier le connecteur.');
    } catch (err) {
      feedbackBus.report(err, 'Impossible de modifier le connecteur.');
    }
    fetchMcpData();
  };

  const handleToggleMcpTool = async (serverName: string, toolName: string, currentEnabled: boolean) => {
    try {
      await tokenService.fetchChecked(`/api/mcp/servers/${encodeURIComponent(serverName)}/tools/${encodeURIComponent(toolName)}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !currentEnabled })
      }, "Impossible de modifier l'outil du connecteur.");
    } catch (err) {
      feedbackBus.report(err, "Impossible de modifier l'outil du connecteur.");
    }
    fetchMcpData();
  };

  const handleDeleteMcpServer = async (name: string) => {
    try {
      await tokenService.fetchChecked(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' }, 'Impossible de supprimer le connecteur.');
    } catch (err) {
      feedbackBus.report(err, 'Impossible de supprimer le connecteur.');
    }
    fetchMcpData();
  };

  const handleApproveProjectMcpConfig = async () => {
    try {
      await tokenService.fetchChecked('/api/mcp/approve-project-config', { method: 'POST' }, "Impossible d'approuver la configuration du projet.");
      setProjectMcpConfig(null);
    } catch (err) {
      feedbackBus.report(err, "Impossible d'approuver la configuration du projet.");
    }
    fetchMcpData();
  };

  useEffect(() => {
    fetchMcpData();
  }, []);

  return {
    mcpServers,
    projectMcpConfig,
    setProjectMcpConfig,
    showAddMcpForm,
    setShowAddMcpForm,
    newMcpName,
    setNewMcpName,
    newMcpType,
    setNewMcpType,
    newMcpCommand,
    setNewMcpCommand,
    newMcpArgs,
    setNewMcpArgs,
    newMcpUrl,
    setNewMcpUrl,
    mcpError,
    mcpSuccessMessage,
    expandedMcpServer,
    setExpandedMcpServer,
    handleAddMcpServer,
    handleToggleMcpServer,
    handleToggleMcpTool,
    handleDeleteMcpServer,
    handleApproveProjectMcpConfig
  };
}
