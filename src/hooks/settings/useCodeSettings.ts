import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

export function useCodeSettings() {
  const [permissionMode, setPermissionMode] = useState<'ask' | 'auto_edit' | 'read_only'>('ask');
  const [terminalTimeout, setTerminalTimeout] = useState<number>(120000);
  const [fileTimeout, setFileTimeout] = useState<number>(30000);
  const [projectRules, setProjectRules] = useState<any[]>([]);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [revokingRuleId, setRevokingRuleId] = useState<string | null>(null);

  const fetchPermissions = async () => {
    try {
      const [permRes, auditRes] = await Promise.all([
        tokenService.fetch('/api/permissions').then(r => r.json()).catch(() => ({})),
        tokenService.fetch('/api/permissions/audit?limit=20').then(r => r.json()).catch(() => ({}))
      ]);
      if (permRes?.mode) setPermissionMode(permRes.mode);
      if (typeof permRes?.terminalTimeout === 'number') setTerminalTimeout(permRes.terminalTimeout);
      if (typeof permRes?.fileTimeout === 'number') setFileTimeout(permRes.fileTimeout);
      if (Array.isArray(permRes?.rules)) setProjectRules(permRes.rules);
      if (Array.isArray(auditRes?.entries)) setAuditEntries(auditRes.entries);
    } catch {}
  };

  const handleUpdatePermissionMode = async (mode: 'ask' | 'auto_edit' | 'read_only') => {
    setPermissionMode(mode);
    try {
      await tokenService.fetch('/api/permissions/mode', {
        method: 'PUT',
        body: JSON.stringify({ mode })
      });
    } catch {}
  };

  const handleUpdateTerminalTimeout = async (timeout: number) => {
    setTerminalTimeout(timeout);
    try {
      await tokenService.fetch('/api/permissions/terminal_timeout', {
        method: 'PUT',
        body: JSON.stringify({ terminalTimeout: timeout })
      });
    } catch {}
  };

  const handleUpdateFileTimeout = async (timeout: number) => {
    setFileTimeout(timeout);
    try {
      await tokenService.fetch('/api/permissions/file_timeout', {
        method: 'PUT',
        body: JSON.stringify({ fileTimeout: timeout })
      });
    } catch {}
  };

  const handleRevokeRule = async (ruleId: string) => {
    setRevokingRuleId(ruleId);
    try {
      await tokenService.fetch(`/api/permissions/rules/${ruleId}`, {
        method: 'DELETE'
      });
      setProjectRules(prev => prev.filter(r => r.id !== ruleId));
    } catch {} finally {
      setRevokingRuleId(null);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  return {
    permissionMode,
    terminalTimeout,
    fileTimeout,
    projectRules,
    auditEntries,
    revokingRuleId,
    handleUpdatePermissionMode,
    handleUpdateTerminalTimeout,
    handleUpdateFileTimeout,
    handleRevokeRule
  };
}
