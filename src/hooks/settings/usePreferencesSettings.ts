import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { tokenService } from '../../services/security/TokenService';
import { speechService, VoiceSpeed } from '../../services/speech/SpeechService';
import { notificationService } from '../../services/notification/NotificationService';

export function usePreferencesSettings() {
  const {
    conversationFont,
    setConversationFont,
    theme,
    setTheme,
    animations,
    setAnimations,
    voiceLang,
    setVoiceLang,
    voiceURI,
    setVoiceURI,
    voiceSpeed,
    setVoiceSpeed,
    notificationsEnabled,
    toggleNotifications
  } = useApp();

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSynthesisSupported, setIsSynthesisSupported] = useState(true);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

  // Instructions personnalisées (Mission M8.2)
  const [customInstructions, setCustomInstructions] = useState('');
  const [isSavingCustomInstructions, setIsSavingCustomInstructions] = useState(false);
  const [customInstructionsSuccess, setCustomInstructionsSuccess] = useState<string | null>(null);
  const [customInstructionsError, setCustomInstructionsError] = useState<string | null>(null);

  useEffect(() => {
    setIsSynthesisSupported(speechService.isSynthesisSupported());
    const unsub = speechService.onVoicesChanged(v => setAvailableVoices(v));
    setAvailableVoices(speechService.getVoices());
    return unsub;
  }, []);

  const fetchCustomInstructions = async () => {
    try {
      const res = await tokenService.fetch('/api/settings/custom-instructions');
      const data = await res.json();
      if (typeof data.custom_instructions === 'string') {
        setCustomInstructions(data.custom_instructions);
      }
    } catch {}
  };

  const handleSaveCustomInstructions = async () => {
    setIsSavingCustomInstructions(true);
    setCustomInstructionsError(null);
    setCustomInstructionsSuccess(null);
    try {
      const res = await tokenService.fetch('/api/settings/custom_instructions', {
        method: 'PUT',
        body: JSON.stringify({ value: customInstructions })
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomInstructionsError(data.error || 'Erreur lors de la sauvegarde.');
      } else {
        setCustomInstructionsSuccess('Instructions enregistrées avec succès.');
        setTimeout(() => setCustomInstructionsSuccess(null), 3000);
      }
    } catch (err: any) {
      setCustomInstructionsError(err.message || 'Erreur de communication.');
    } finally {
      setIsSavingCustomInstructions(false);
    }
  };

  useEffect(() => {
    fetchCustomInstructions();
  }, []);

  return {
    conversationFont,
    setConversationFont,
    theme,
    setTheme,
    animations,
    setAnimations,
    voiceLang,
    setVoiceLang,
    voiceURI,
    setVoiceURI,
    voiceSpeed,
    setVoiceSpeed,
    notificationsEnabled,
    toggleNotifications,
    availableVoices,
    isSynthesisSupported,
    isLangMenuOpen,
    setIsLangMenuOpen,
    isVoiceMenuOpen,
    setIsVoiceMenuOpen,
    isSpeedMenuOpen,
    setIsSpeedMenuOpen,
    customInstructions,
    setCustomInstructions,
    isSavingCustomInstructions,
    customInstructionsSuccess,
    customInstructionsError,
    handleSaveCustomInstructions,
    isNotificationSupported: notificationService.isSupported()
  };
}
