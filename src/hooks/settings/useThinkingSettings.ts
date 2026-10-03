import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { feedbackBus } from '../../services/feedback/FeedbackBus';

export function useThinkingSettings() {
  const [thinkingLevel, setThinkingLevel] = useState<'disabled' | 'low' | 'medium' | 'high'>(() => {
    return (localStorage.getItem('iroko_thinking_level') as any) || 'medium';
  });
  const [subagentAutoRouting, setSubagentAutoRouting] = useState<boolean>(() => {
    const cached = localStorage.getItem('iroko_subagent_auto_routing');
    return cached === null ? true : cached === 'true';
  });

  const fetchSettings = async () => {
    try {
      const res = await tokenService.fetch('/api/settings').then(r => r.json());
      if (res?.settings) {
        if (res.settings.thinking_level) {
          setThinkingLevel(res.settings.thinking_level);
          localStorage.setItem('iroko_thinking_level', res.settings.thinking_level);
        }
        if (res.settings.subagent_auto_routing !== undefined) {
          const enabled = res.settings.subagent_auto_routing === true || res.settings.subagent_auto_routing === 'true';
          setSubagentAutoRouting(enabled);
          localStorage.setItem('iroko_subagent_auto_routing', String(enabled));
        }
      }
    } catch {
      feedbackBus.error('Impossible de charger les réglages de réflexion.');
    }
  };

  const handleUpdateThinkingLevel = async (level: 'disabled' | 'low' | 'medium' | 'high') => {
    setThinkingLevel(level);
    localStorage.setItem('iroko_thinking_level', level);
    try {
      await tokenService.fetchChecked('/api/settings/thinking_level', {
        method: 'PUT',
        body: JSON.stringify({ value: level })
      }, 'Impossible d\'enregistrer le niveau de réflexion.');
    } catch (err) {
      feedbackBus.report(err, 'Impossible d\'enregistrer le niveau de réflexion.');
    }
  };

  const handleUpdateSubagentAutoRouting = async (enabled: boolean) => {
    setSubagentAutoRouting(enabled);
    localStorage.setItem('iroko_subagent_auto_routing', String(enabled));
    try {
      await tokenService.fetchChecked('/api/settings/subagent_auto_routing', {
        method: 'PUT',
        body: JSON.stringify({ value: enabled })
      }, 'Impossible d\'enregistrer le routage des sous-agents.');
    } catch (err) {
      feedbackBus.report(err, 'Impossible d\'enregistrer le routage des sous-agents.');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    thinkingLevel,
    handleUpdateThinkingLevel,
    subagentAutoRouting,
    handleUpdateSubagentAutoRouting
  };
}
