import React from 'react';
import { Terminal } from 'lucide-react';

export interface LiveToolExecution {
  callId: string;
  tool: string;
  input: any;
  result?: any;
  success?: boolean;
}

export interface LiveToolExecutionsProps {
  executions: LiveToolExecution[];
}

export function LiveToolExecutions({ executions }: LiveToolExecutionsProps) {
  if (executions.length === 0) return null;

  return (
    <div className="space-y-1.5 border-l border-[var(--border-modal)] pl-3 py-1 my-2">
      {executions.map(te => (
        <div key={te.callId} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <Terminal className="w-3 h-3 shrink-0" />
          <span className="font-mono text-[var(--text-primary)]">{te.tool}</span>
          {te.input?.path && (
            <span className="font-mono text-[var(--text-secondary)] truncate max-w-xs">{te.input.path}</span>
          )}
          {te.input?.command && (
            <span className="font-mono text-[var(--text-secondary)] truncate max-w-xs">{te.input.command}</span>
          )}
          <span className="text-[11px]">
            {te.success === true ? '✓' : te.success === false ? '✗' : '…'}
          </span>
        </div>
      ))}
    </div>
  );
}
