import React, { useState, useEffect, FormEvent } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { ProviderCredential } from '../../../server/models/types';
import { useApp } from '../../context/AppContext';

export function useProvidersSettings() {
  const { refreshModels } = useApp();

  const [providers, setProviders] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('openrouter');
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyRaw, setNewKeyRaw] = useState('');
  const [showAddKeyForm, setShowAddKeyForm] = useState(false);
  const [showSecret] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, { valid: boolean; latencyMs?: number; error?: string }>>({});
  const [showManageModels, setShowManageModels] = useState(false);
  const [refreshingProviderId, setRefreshingProviderId] = useState<string | null>(null);

  // Génération d'images (Mission M6)
  const [imageProviders, setImageProviders] = useState<any[]>([]);
  const [imageModels, setImageModels] = useState<any[]>([]);
  const [activeImageProvider, setActiveImageProvider] = useState('');
  const [activeImageModel, setActiveImageModel] = useState('');
  const [imageApiKey, setImageApiKey] = useState('');
  const [imageAccountId, setImageAccountId] = useState('');
  const [imageHasKey, setImageHasKey] = useState(false);
  const [imageMaskedKey, setImageMaskedKey] = useState<string | null>(null);
  const [imageSaveSuccess, setImageSaveSuccess] = useState(false);
  const [isSavingImageSettings, setIsSavingImageSettings] = useState(false);

  // Génération de vidéos (Mission M7)
  const [videoProviders, setVideoProviders] = useState<any[]>([]);
  const [videoModels, setVideoModels] = useState<any[]>([]);
  const [activeVideoProvider, setActiveVideoProvider] = useState('');
  const [activeVideoModel, setActiveVideoModel] = useState('');
  const [videoApiKey, setVideoApiKey] = useState('');
  const [videoHasKey, setVideoHasKey] = useState(false);
  const [videoMaskedKey, setVideoMaskedKey] = useState<string | null>(null);
  const [videoTimeoutMs, setVideoTimeoutMs] = useState<number>(600000);
  const [videoSaveSuccess, setVideoSaveSuccess] = useState(false);
  const [isSavingVideoSettings, setIsSavingVideoSettings] = useState(false);

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const [provRes, credRes] = await Promise.all([
        tokenService.fetch('/api/providers').then(r => r.json()),
        tokenService.fetch('/api/credentials').then(r => r.json())
      ]);
      if (provRes.providers) setProviders(provRes.providers.filter((p: any) => p.id !== 'mock'));
      if (credRes.credentials) setCredentials(credRes.credentials);
    } catch {}
    setLoadingKeys(false);
  };

  const handleTestCredential = async (id: string) => {
    setTestingKeyId(id);
    try {
      const res = await tokenService.fetch('/api/credentials/test', {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setTestStatus(prev => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setTestStatus(prev => ({ ...prev, [id]: { valid: false, error: err.message } }));
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyRaw.trim()) return;
    try {
      await tokenService.fetch('/api/credentials', {
        method: 'POST',
        body: JSON.stringify({
          providerId: selectedProviderId,
          label: newKeyLabel.trim() || `Clé ${newKeyRaw.slice(-4)}`,
          key: newKeyRaw.trim(),
          priority: 1
        })
      });
      setNewKeyRaw('');
      setNewKeyLabel('');
      setShowAddKeyForm(false);
      fetchKeys();
      // Notifier le Composer pour qu'il re-sonde /api/models (M10.0)
      refreshModels();
    } catch {}
  };

  const handleAddCredentialDirect = async (providerId: string, key: string, label: string) => {
    try {
      await tokenService.fetch('/api/credentials', {
        method: 'POST',
        body: JSON.stringify({
          providerId,
          label: label || `Clé ${key.slice(-4)}`,
          key,
          priority: 1
        })
      });
      fetchKeys();
      refreshModels();
    } catch {}
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await tokenService.fetch(`/api/credentials?id=${id}`, { method: 'DELETE' });
      fetchKeys();
      // Le catalogue de modèles peut changer après suppression d'une clé (M10.0)
      refreshModels();
    } catch {}
  };

  const handleRefreshProvider = async (providerId: string) => {
    setRefreshingProviderId(providerId);
    try {
      await tokenService.fetch('/api/models/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId })
      });
      await fetchKeys();
      refreshModels();
    } catch {} finally {
      setRefreshingProviderId(null);
    }
  };

  const handleDeleteProviderKeys = async (providerId: string) => {
    const targetCreds = credentials.filter(c => c.providerId === providerId);
    for (const c of targetCreds) {
      try {
        await tokenService.fetch(`/api/credentials?id=${c.id}`, { method: 'DELETE' });
      } catch {}
    }
    await fetchKeys();
    refreshModels();
  };

  const handleTestProvider = async (providerId: string) => {
    const cred = credentials.find(c => c.providerId === providerId);
    if (!cred) return;
    await handleTestCredential(cred.id);
  };

  const getProviderStatusText = (provider: any): string => {
    const pCreds = credentials.filter(c => c.providerId === provider.id);
    if (pCreds.length === 0 && !provider.isLocal) {
      return 'Non configuré';
    }

    for (const c of pCreds) {
      const t = testStatus[c.id];
      if (t && !t.valid) {
        const err = (t.error || '').toLowerCase();
        if (err.includes('econnrefused') || err.includes('enotfound') || err.includes('timeout') || err.includes('injoignable') || err.includes('fetch failed')) {
          return 'Fournisseur injoignable';
        }
        if (err.includes('401') || err.includes('403') || err.includes('invalide') || err.includes('unauthorized') || err.includes('forbidden') || err.includes('clé refusée') || err.includes('cle refusee')) {
          return 'Clé refusée';
        }
        return 'Fournisseur injoignable';
      }
      if (c.status === 'INVALID') return 'Clé refusée';
      if (c.status === 'ERROR') return 'Fournisseur injoignable';
      if (c.status === 'RATE_LIMITED') return 'Quota dépassé (429)';
    }

    if (provider.status === 'ERROR') {
      return 'Fournisseur injoignable';
    }
    if (provider.status === 'RATE_LIMITED') {
      return 'Quota dépassé (429)';
    }

    const count = provider.modelsCount || 0;
    return `Prêt · ${count} modèle${count > 1 ? 's' : ''}`;
  };

  const fetchMediaSettings = async () => {
    try {
      const [provRes, setRes] = await Promise.all([
        tokenService.fetch('/api/media/providers').then(r => r.json()),
        tokenService.fetch('/api/media/settings').then(r => r.json())
      ]);
      if (Array.isArray(provRes)) setImageProviders(provRes);
      if (setRes) {
        setActiveImageProvider(setRes.activeProviderId || '');
        setActiveImageModel(setRes.activeModelId || '');
        setImageHasKey(Boolean(setRes.hasKey));
        setImageMaskedKey(setRes.maskedKey || null);
        if (setRes.accountId) setImageAccountId(setRes.accountId);
      }
      const targetProv = setRes?.activeProviderId || (provRes[0]?.id);
      if (targetProv) {
        const modelsRes = await tokenService.fetch(`/api/media/models?providerId=${encodeURIComponent(targetProv)}`).then(r => r.json());
        if (Array.isArray(modelsRes)) setImageModels(modelsRes);
      }
    } catch {}
  };

  const handleSelectImageProvider = async (providerId: string) => {
    setActiveImageProvider(providerId);
    try {
      const modelsRes = await tokenService.fetch(`/api/media/models?providerId=${encodeURIComponent(providerId)}`).then(r => r.json());
      if (Array.isArray(modelsRes)) {
        setImageModels(modelsRes);
        if (modelsRes.length > 0) {
          setActiveImageModel(modelsRes[0].id);
        }
      }
    } catch {}
  };

  const handleSaveMediaSettings = async () => {
    setIsSavingImageSettings(true);
    try {
      await tokenService.fetch('/api/media/settings', {
        method: 'POST',
        body: JSON.stringify({
          activeProviderId: activeImageProvider,
          activeModelId: activeImageModel,
          apiKey: imageApiKey || undefined,
          accountId: imageAccountId || undefined
        })
      });
      setImageSaveSuccess(true);
      setTimeout(() => setImageSaveSuccess(false), 3000);
      fetchMediaSettings();
    } catch {} finally {
      setIsSavingImageSettings(false);
    }
  };

  const fetchVideoSettings = async () => {
    try {
      const [provRes, setRes] = await Promise.all([
        tokenService.fetch('/api/media/video/providers').then(r => r.json()),
        tokenService.fetch('/api/media/video/settings').then(r => r.json())
      ]);
      if (Array.isArray(provRes)) setVideoProviders(provRes);
      if (setRes) {
        setActiveVideoProvider(setRes.activeProviderId || '');
        setActiveVideoModel(setRes.activeModelId || '');
        setVideoHasKey(Boolean(setRes.hasKey));
        setVideoMaskedKey(setRes.maskedKey || null);
        if (typeof setRes.timeoutMs === 'number') setVideoTimeoutMs(setRes.timeoutMs);
      }
      const targetProv = setRes?.activeProviderId || (provRes[0]?.id);
      if (targetProv) {
        const modelsRes = await tokenService.fetch(`/api/media/video/models?providerId=${encodeURIComponent(targetProv)}`).then(r => r.json());
        if (Array.isArray(modelsRes)) setVideoModels(modelsRes);
      }
    } catch {}
  };

  const handleSelectVideoProvider = async (providerId: string) => {
    setActiveVideoProvider(providerId);
    try {
      const modelsRes = await tokenService.fetch(`/api/media/video/models?providerId=${encodeURIComponent(providerId)}`).then(r => r.json());
      if (Array.isArray(modelsRes)) {
        setVideoModels(modelsRes);
        if (modelsRes.length > 0) {
          setActiveVideoModel(modelsRes[0].id);
        }
      }
    } catch {}
  };

  const handleSaveVideoSettings = async () => {
    setIsSavingVideoSettings(true);
    try {
      await tokenService.fetch('/api/media/video/settings', {
        method: 'POST',
        body: JSON.stringify({
          activeProviderId: activeVideoProvider,
          activeModelId: activeVideoModel,
          apiKey: videoApiKey || undefined,
          timeoutMs: videoTimeoutMs
        })
      });
      setVideoSaveSuccess(true);
      setTimeout(() => setVideoSaveSuccess(false), 3000);
      fetchVideoSettings();
    } catch {} finally {
      setIsSavingVideoSettings(false);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchMediaSettings();
    fetchVideoSettings();
  }, []);

  return {
    providers,
    credentials,
    selectedProviderId,
    setSelectedProviderId,
    loadingKeys,
    newKeyLabel,
    setNewKeyLabel,
    newKeyRaw,
    setNewKeyRaw,
    showAddKeyForm,
    setShowAddKeyForm,
    showSecret,
    testingKeyId,
    testStatus,
    showManageModels,
    setShowManageModels,
    refreshingProviderId,
    fetchKeys,
    handleTestCredential,
    handleTestProvider,
    handleRefreshProvider,
    handleDeleteProviderKeys,
    getProviderStatusText,
    handleAddCredential,
    handleDeleteCredential,
    imageProviders,
    imageModels,
    activeImageProvider,
    activeImageModel,
    setActiveImageModel,
    imageApiKey,
    setImageApiKey,
    imageAccountId,
    setImageAccountId,
    imageHasKey,
    imageMaskedKey,
    imageSaveSuccess,
    isSavingImageSettings,
    handleSelectImageProvider,
    handleSaveMediaSettings,
    videoProviders,
    videoModels,
    activeVideoProvider,
    activeVideoModel,
    setActiveVideoModel,
    videoApiKey,
    setVideoApiKey,
    videoHasKey,
    videoMaskedKey,
    videoTimeoutMs,
    setVideoTimeoutMs,
    videoSaveSuccess,
    isSavingVideoSettings,
    handleSelectVideoProvider,
    handleSaveVideoSettings,
    handleAddCredentialDirect
  };
}
