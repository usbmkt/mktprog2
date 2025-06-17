
// client/src/components/flow/NodeContextMenu.tsx
import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Copy, Trash2 } from 'lucide-react';
import { NodeContextMenuProps as FlowNodeContextMenuPropsImport } from '@/types/zapTypes'; 
import { cn } from '@/lib/utils';
import { popoverContentStyle } from './utils'; 


export interface FullNodeContextMenuProps { // Removed FlowNodeContextMenuPropsImport extension
  id: string;
  top: number;
  left: number;
  nodeType?: string; // Made optional or ensure it's always passed
  onClose: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

const NodeContextMenu: React.FC<FullNodeContextMenuProps> = ({
  id, 
  top, 
  left, 
  // nodeType is also available from FlowNodeContextMenuPropsImport if needed
  onClose,
  onDelete,
  onDuplicate,
}) => {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onMouseDown={onClose}>
        <ContextMenu open={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <ContextMenuContent
                className={cn("w-48 neu-card", popoverContentStyle)}
                style={{ position: 'absolute', top: `${top}px`, left: `${left}px` }}
                onEscapeKeyDown={onClose}
            >
                <ContextMenuItem onClick={() => { onDuplicate(id); onClose(); }} className="text-xs">
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar Nó
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => { onDelete(id); onClose(); }}
                    className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Deletar Nó
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    </div>
  );
};

export default NodeContextMenu;