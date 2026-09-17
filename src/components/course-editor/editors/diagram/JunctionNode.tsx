import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AppTooltip } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

function JunctionNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const isHidden = data?.hidePorts;

  return (
    <AppTooltip content={isHidden ? undefined : t('courseEditorForms.junction')}>
      <div
        className={`group relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          isHidden ? 'cursor-pointer' : 'cursor-crosshair'
        }`}
        aria-label={isHidden ? undefined : t('courseEditorForms.junction')}
      >
        {/* Keep the visual junction small while giving it a reliable 32px hit area. */}
        <span
          className={`block h-3 w-3 rounded-full border-2 border-background transition-colors ${
            isHidden
              ? 'bg-muted-foreground shadow-none'
              : 'bg-muted-foreground shadow-md group-hover:bg-primary group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary/30'
          }`}
        />

      {/* Target handles allow incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
        style={{ top: 10 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
        style={{ left: 10 }}
      />
      {/* Source handles allow outgoing connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
        style={{ bottom: 10 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
        style={{ right: 10 }}
      />
      </div>
    </AppTooltip>
  );
}

export default memo(JunctionNode);
