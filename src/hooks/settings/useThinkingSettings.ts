import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';

export function useThinkingSettings() {
  const [thinkingLevel, setThinkingLevel] = useState<'disabled' | 'low' | 'medium' | 'high'>(() => {
    return (localStorage.getItem('iroko_thinking_level') as any) || 'medium';
  });

  const fetchThinkingLevel = async () => {
    try {
      const res = await tokenService.fetch('/api/settings').then(r => r.json());
      if (res?.settings?.thinking_level) {
        setThinkingLevel(res.settings.thinking_level);
        localStorage.setItem('iroko_thinking_level', res.settings.thinking_level);
      }
    } catch {}
  };

  const handleUpdateThinkingLevel = async (level: 'disabled' | 'low' | 'medium' | 'high') => {
    setThinkingLevel(level);
    localStorage.setItem('iroko_thinking_level', level);
    try {
      await tokenService.fetch('/api/settings/thinking_level', {
        method: 'PUT',
        body: JSON.stringify({ value: level })
      });
    } catch {}
  };

  useEffect(() => {
    fetchThinkingLevel();
  }, []);

  return {
    thinkingLevel,
    handleUpdateThinkingLevel
  };
}
