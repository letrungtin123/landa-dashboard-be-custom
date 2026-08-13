import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AppTooltip } from '@/components/ui/tooltip';

function JunctionNode({ data }: NodeProps) {
  const isHidden = data?.hidePorts;

  return (
    <AppTooltip content={isHidden ? undefined : "Điểm nối (Junction)"}><div
      className={`w-3 h-3 rounded-full transition-colors group relative border-background ${
        isHidden ? 'bg-muted-foreground shadow-none' : 'bg-muted-foreground hover:bg-primary shadow-md ring-2 cursor-crosshair hover:scale-125'
      }`}

    >
      {/* Target handles allow incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
      />
      {/* Source handles allow outgoing connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className={`w-2 h-2 opacity-0 transition-opacity bg-primary ${!isHidden ? 'group-hover:opacity-100' : ''}`}
      />
    </div></AppTooltip>
  );
}

export default memo(JunctionNode);
