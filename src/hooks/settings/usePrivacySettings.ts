import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { clearAllDrafts } from '../useDraft';

export function usePrivacySettings() {
  const [privacyInfo, setPrivacyInfo] = useState<any>(null);
  const [maskModelEnabled, setMaskModelEnabled] = useState(true);
  const [privacySuccessMessage, setPrivacySuccessMessage] = useState<string | null>(null);
  const [showClearConversationsConfirm, setShowClearConversationsConfirm] = useState(false);
  const [showClearMemoryConfirmInPrivacy, setShowClearMemoryConfirmInPrivacy] = useState(false);
  const [showClearKeysConfirm, setShowClearKeysConfirm] = useState(false);

  // Espace disque (Mission M8.3 P9)
  const [storageBreakdown, setStorageBreakdown] = useState<{
    attachments: { bytes: number; count: number };
    artifacts: { bytes: number; count: number };
    media: { bytes: number; count: number };
    database: { bytes: number; count: number };
    temp: { bytes: number; count: number };
    totalBytes: number;
  } | null>(null);
  const [cleaningCategory, setCleaningCategory] = useState<string | null>(null);
  const [confirmCleanCategory, setConfirmCleanCategory] = useState<{ id: string; label: string } | null>(null);

  // Sauvegarde & Restauration SQLite (Mission M8.2)
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreConfirmPath, setRestoreConfirmPath] = useState<string | null>(null);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(null);

  // Diagnostic système anonymisé (Mission M8.2)
  const [diagnosticData, setDiagnosticData] = useState<{
    appVersion: string;
    nodeVersion: string;
    platform: string;
    runtimePort: number;
    database: { sizeBytes: number; schemaVersion: number };
    connectedProviders: string[];
    mcpServers: Array<{ name: string; status: string }>;
    recentErrors: Array<{ timestamp: string; message: string }>;
    dataDir: string;
    restarts?: Array<{ timestamp: string; exitCode: number | null; signal: string | null; reason?: string }>;
  } | null>(null);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);

  const fetchStorageBreakdown = async () => {
    try {
      const res = await tokenService.fetch('/api/privacy/storage-breakdown');
      if (res.ok) {
        const data = await res.json();
        setStorageBreakdown(data);
      }
    } catch {}
  };

  const handleCleanStorageCategory = async (category: string) => {
    setCleaningCategory(category);
    try {
      const res = await tokenService.fetch('/api/privacy/storage-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });
      if (res.ok) {
        if (category === 'conversations' || category === 'all') {
          clearAllDrafts();
          if (category === 'all') {
            try {
              localStorage.removeItem('iroko_onboarding_completed');
              await tokenService.fetch('/api/settings/onboarding_completed', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: false })
              });
            } catch {}
          }
        }
        await fetchStorageBreakdown();
        setConfirmCleanCategory(null);
      }
    } catch {} finally {
      setCleaningCategory(null);
    }
  };

  const formatStorageSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const fetchPrivacyData = async () => {
    try {
      const res = await tokenService.fetch('/api/privacy/info');
      const data = await res.json();
      if (data.dataDir) {
        setPrivacyInfo(data);
        setMaskModelEnabled(data.maskModel !== false);
      }
      fetchStorageBreakdown();
    } catch {}
  };

  const handleToggleMaskModel = async (enabled: boolean) => {
    setMaskModelEnabled(enabled);
    try {
      await tokenService.fetch('/api/privacy/mask_model', {
        method: 'PUT',
        body: JSON.stringify({ enabled })
      });
    } catch {}
  };

  const handleExportAllData = async () => {
    try {
      const res = await tokenService.fetch('/api/privacy/export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iroko-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleClearAllConversations = async () => {
    try {
      await tokenService.fetch('/api/privacy/conversations', { method: 'DELETE' });
      clearAllDrafts();
      localStorage.removeItem('iroko_history');
      localStorage.setItem('iroko_migration_done', 'true');
      setShowClearConversationsConfirm(false);
      setPrivacySuccessMessage('Toutes les discussions ont été supprimées.');
      fetchPrivacyData();
      setTimeout(() => setPrivacySuccessMessage(null), 4000);
    } catch {}
  };

  const handleClearAllMemoryInPrivacy = async () => {
    try {
      await tokenService.fetch('/api/privacy/memory', { method: 'DELETE' });
      setShowClearMemoryConfirmInPrivacy(false);
      setPrivacySuccessMessage('La mémoire de projet a été entièrement effacée.');
      fetchPrivacyData();
      setTimeout(() => setPrivacySuccessMessage(null), 4000);
    } catch {}
  };

  const handleClearAllKeys = async () => {
    try {
      await tokenService.fetch('/api/privacy/credentials', { method: 'DELETE' });
      setShowClearKeysConfirm(false);
      setPrivacySuccessMessage('Toutes les clés d\'API ont été supprimées.');
      fetchPrivacyData();
      setTimeout(() => setPrivacySuccessMessage(null), 4000);
    } catch {}
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupErrorMessage(null);
    setBackupSuccessMessage(null);
    try {
      const dlgRes = await tokenService.fetch('/api/dialog/save-backup', { method: 'POST' });
      const dlgData = await dlgRes.json();
      if (dlgData.canceled) {
        setIsBackingUp(false);
        return;
      }
      if (dlgData.selectedPath) {
        const res = await tokenService.fetch('/api/backup', {
          method: 'POST',
          body: JSON.stringify({ targetPath: dlgData.selectedPath })
        });
        const data = await res.json();
        if (!res.ok) {
          setBackupErrorMessage(data.error || 'Erreur lors de la sauvegarde.');
        } else {
          setBackupSuccessMessage(`Sauvegarde créée avec succès (${Math.round((data.sizeBytes || 0) / 1024)} Ko).`);
          setTimeout(() => setBackupSuccessMessage(null), 4000);
        }
      } else {
        window.location.href = '/api/backup/download';
        setBackupSuccessMessage('Téléchargement de la sauvegarde lancé.');
        setTimeout(() => setBackupSuccessMessage(null), 4000);
      }
    } catch {
      window.location.href = '/api/backup/download';
      setBackupSuccessMessage('Téléchargement de la sauvegarde lancé.');
      setTimeout(() => setBackupSuccessMessage(null), 4000);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handlePickRestoreFile = async () => {
    setBackupErrorMessage(null);
    setBackupSuccessMessage(null);
    try {
      const dlgRes = await tokenService.fetch('/api/dialog/pick-backup', { method: 'POST' });
      const dlgData = await dlgRes.json();
      if (dlgData.canceled || !dlgData.selectedPath) return;
      setRestoreConfirmPath(dlgData.selectedPath);
    } catch (err: any) {
      setBackupErrorMessage('Impossible d\'ouvrir le sélecteur de fichier\u00A0: ' + (err.message || 'Erreur'));
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreConfirmPath) return;
    setIsRestoring(true);
    setBackupErrorMessage(null);
    setBackupSuccessMessage(null);
    try {
      const res = await tokenService.fetch('/api/restore', {
        method: 'POST',
        body: JSON.stringify({ archivePath: restoreConfirmPath })
      });
      const data = await res.json();
      if (!res.ok) {
        setBackupErrorMessage(data.error || 'Erreur lors de la restauration.');
      } else {
        setRestoreConfirmPath(null);
        setBackupSuccessMessage('Sauvegarde restaurée avec succès. La base a été rechargée.');
        fetchPrivacyData();
        fetchDiagnosticData();
        setTimeout(() => setBackupSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      setBackupErrorMessage(err.message || 'Erreur lors de la restauration.');
    } finally {
      setIsRestoring(false);
    }
  };

  const fetchDiagnosticData = async () => {
    try {
      const res = await tokenService.fetch('/api/diagnostic');
      const data = await res.json();
      if (data.appVersion) {
        setDiagnosticData(data);
      }
    } catch {}
  };

  const handleCopyDiagnostic = () => {
    if (!diagnosticData) return;
    navigator.clipboard.writeText(JSON.stringify(diagnosticData, null, 2));
    setDiagnosticCopied(true);
    setTimeout(() => setDiagnosticCopied(false), 2000);
  };

  useEffect(() => {
    fetchPrivacyData();
    fetchDiagnosticData();
  }, []);

  return {
    privacyInfo,
    maskModelEnabled,
    privacySuccessMessage,
    showClearConversationsConfirm,
    setShowClearConversationsConfirm,
    showClearMemoryConfirmInPrivacy,
    setShowClearMemoryConfirmInPrivacy,
    showClearKeysConfirm,
    setShowClearKeysConfirm,
    handleToggleMaskModel,
    handleExportAllData,
    handleClearAllConversations,
    handleClearAllMemoryInPrivacy,
    handleClearAllKeys,
    storageBreakdown,
    cleaningCategory,
    confirmCleanCategory,
    setConfirmCleanCategory,
    handleCleanStorageCategory,
    formatStorageSize,
    isBackingUp,
    isRestoring,
    restoreConfirmPath,
    setRestoreConfirmPath,
    backupSuccessMessage,
    backupErrorMessage,
    handleBackup,
    handlePickRestoreFile,
    handleConfirmRestore,
    diagnosticData,
    diagnosticCopied,
    handleCopyDiagnostic
  };
}
