import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { feedbackBus } from '../../services/feedback/FeedbackBus';

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
    } catch {
      feedbackBus.error('Impossible de charger les permissions.');
    }
  };

  const handleUpdatePermissionMode = async (mode: 'ask' | 'auto_edit' | 'read_only') => {
    const previous = permissionMode;
    setPermissionMode(mode);
    try {
      await tokenService.fetchChecked('/api/permissions/mode', {
        method: 'PUT',
        body: JSON.stringify({ mode })
      }, 'Impossible de modifier le mode de permissions.');
    } catch (err) {
      setPermissionMode(previous);
      feedbackBus.report(err, 'Impossible de modifier le mode de permissions.');
    }
  };

  const handleUpdateTerminalTimeout = async (timeout: number) => {
    const previous = terminalTimeout;
    setTerminalTimeout(timeout);
    try {
      await tokenService.fetchChecked('/api/permissions/terminal_timeout', {
        method: 'PUT',
        body: JSON.stringify({ terminalTimeout: timeout })
      }, 'Impossible de modifier le délai du terminal.');
    } catch (err) {
      setTerminalTimeout(previous);
      feedbackBus.report(err, 'Impossible de modifier le délai du terminal.');
    }
  };

  const handleUpdateFileTimeout = async (timeout: number) => {
    const previous = fileTimeout;
    setFileTimeout(timeout);
    try {
      await tokenService.fetchChecked('/api/permissions/file_timeout', {
        method: 'PUT',
        body: JSON.stringify({ fileTimeout: timeout })
      }, 'Impossible de modifier le délai des fichiers.');
    } catch (err) {
      setFileTimeout(previous);
      feedbackBus.report(err, 'Impossible de modifier le délai des fichiers.');
    }
  };

  const handleRevokeRule = async (ruleId: string) => {
    setRevokingRuleId(ruleId);
    try {
      await tokenService.fetchChecked(`/api/permissions/rules/${ruleId}`, {
        method: 'DELETE'
      }, 'Impossible de révoquer la règle.');
      setProjectRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (err) {
      feedbackBus.report(err, 'Impossible de révoquer la règle.');
    } finally {
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
