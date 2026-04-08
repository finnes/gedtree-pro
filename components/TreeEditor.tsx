import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Node,
  Edge,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  SelectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TreeNode } from '@/lib/gedcom';
import { MousePointer2, Hand, ZoomIn, ZoomOut, Maximize, Minimize, Focus, Undo2, Redo2, Grid, X } from 'lucide-react';

// Custom Node Component for a Person
const PersonNode = ({ id, data }: { id: string, data: any }) => {
  const { setNodes, setEdges } = useReactFlow();
  
  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nodes) => nodes.filter((node) => node.id !== id));
    setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-sm w-[160px] p-3 flex flex-col items-center justify-center relative group hover:border-indigo-400 hover:shadow-md transition-all">
      <button 
        onClick={onDelete}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-200"
      >
        <X size={12} />
      </button>
      <Handle type="target" position={Position.Left} id="target-left" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Right} id="target-right" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Top} id="target-top" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="w-1 h-1 opacity-0" />
      
      <Handle type="source" position={Position.Left} id="source-left" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Right} id="source-right" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Top} id="source-top" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="w-1 h-1 opacity-0" />
      
      <div className="font-bold text-xs text-slate-800 text-center leading-tight mb-1">
        {data.name}
      </div>
      <div className="text-[9px] text-slate-500 text-center leading-tight">
        {data.birth ? `★ ${data.birth.substring(0, 10)}` : ''}
        {data.birth && data.death ? <br /> : ''}
        {data.death ? `✝ ${data.death.substring(0, 10)}` : ''}
      </div>
    </div>
  );
};

const BoundaryNode = ({ data }: { data: any }) => {
  return (
    <div className="border-2 border-dashed border-slate-400 pointer-events-none" style={{ width: data.width, height: data.height }}>
      <div className="p-2 text-slate-400 text-xs font-mono">
        {data.format === 'A3_GRID' ? `Grade de Páginas (${data.pageSize})` : `Pôster Gigante (${data.pageSize})`}
      </div>
    </div>
  );
};

const FamilyNode = ({ id }: { id: string }) => {
  return (
    <div className="w-2 h-2 bg-slate-400 rounded-full flex items-center justify-center relative">
      <Handle type="target" position={Position.Left} id="target-left" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Right} id="target-right" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Top} id="target-top" className="w-1 h-1 opacity-0" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="w-1 h-1 opacity-0" />
      
      <Handle type="source" position={Position.Left} id="source-left" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Right} id="source-right" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Top} id="source-top" className="w-1 h-1 opacity-0" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="w-1 h-1 opacity-0" />
    </div>
  );
};

const nodeTypes = {
  person: PersonNode,
  boundary: BoundaryNode,
  family: FamilyNode,
};

interface FlowContentProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: any;
  onNodesChange: any;
  onEdgesChange: any;
  isFullscreen: boolean;
  setIsFullscreen: (val: boolean) => void;
  layoutKey: number;
}

const FlowContent = ({ nodes, edges, setNodes, onNodesChange, onEdgesChange, isFullscreen, setIsFullscreen, layoutKey }: FlowContentProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [isPanMode, setIsPanMode] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Fit view when layout changes
  useEffect(() => {
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.1 });
    }, 50);
  }, [layoutKey, fitView]);

  // History for Undo/Redo
  const [past, setPast] = useState<Node[][]>([]);
  const [future, setFuture] = useState<Node[][]>([]);

  const takeSnapshot = useCallback(() => {
    setPast((p) => [...p, nodes]);
    setFuture([]);
  }, [nodes]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture((f) => [nodes, ...f]);
    setNodes(previous);
  }, [past, nodes, setNodes]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setFuture(newFuture);
    setPast((p) => [...p, nodes]);
    setNodes(next);
  }, [future, nodes, setNodes]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStart={takeSnapshot}
      onSelectionDragStart={takeSnapshot}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.01}
      maxZoom={4}
      panOnDrag={isPanMode}
      selectionOnDrag={!isPanMode}
      selectionMode={SelectionMode.Partial}
      panOnScroll={true}
      snapToGrid={snapToGrid}
      snapGrid={[20, 20]}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
      <MiniMap 
        nodeColor="#e2e8f0" 
        maskColor="rgba(248, 250, 252, 0.7)" 
        className="bg-white border border-slate-200 rounded-lg shadow-sm mb-4 ml-4"
      />
      <Panel position="top-right" className="bg-white p-1.5 rounded-xl shadow-lg border border-slate-200 flex gap-1 m-4">
        <button onClick={undo} disabled={past.length === 0} className={`p-2 rounded-lg transition-colors ${past.length === 0 ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`} title="Desfazer (Ctrl+Z)">
          <Undo2 size={20}/>
        </button>
        <button onClick={redo} disabled={future.length === 0} className={`p-2 rounded-lg transition-colors ${future.length === 0 ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`} title="Refazer (Ctrl+Y)">
          <Redo2 size={20}/>
        </button>
        <div className="w-px bg-slate-200 mx-1 my-1" />
        <button onClick={() => setIsPanMode(false)} className={`p-2 rounded-lg transition-colors ${!isPanMode ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`} title="Selecionar Vários (Seta)">
          <MousePointer2 size={20}/>
        </button>
        <button onClick={() => setIsPanMode(true)} className={`p-2 rounded-lg transition-colors ${isPanMode ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`} title="Mover Tela (Mão)">
          <Hand size={20}/>
        </button>
        <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-2 rounded-lg transition-colors ${snapToGrid ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`} title="Alinhamento Automático (Snap Grid)">
          <Grid size={20}/>
        </button>
        <div className="w-px bg-slate-200 mx-1 my-1" />
        <button onClick={() => zoomIn({ duration: 300 })} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors" title="Zoom In">
          <ZoomIn size={20}/>
        </button>
        <button onClick={() => zoomOut({ duration: 300 })} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors" title="Zoom Out">
          <ZoomOut size={20}/>
        </button>
        <button onClick={() => fitView({ duration: 800 })} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors" title="Ajustar à Tela">
          <Focus size={20}/>
        </button>
        <div className="w-px bg-slate-200 mx-1 my-1" />
        <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors" title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}>
          {isFullscreen ? <Minimize size={20}/> : <Maximize size={20}/>}
        </button>
      </Panel>
      <Panel position="bottom-left" className="bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-2 m-4 text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500"></div> Pais
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-emerald-500"></div> Filhos
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 border-t border-dashed border-pink-500"></div> Cônjuges
        </div>
      </Panel>
    </ReactFlow>
  );
};

interface TreeEditorProps {
  rootNode: TreeNode | null;
  layoutMode: string;
  layoutKey: number;
  exportFormat: 'A3_GRID' | 'A0_POSTER';
  pageSize: string;
  onNodesChangeCallback?: (nodes: Node[], edges: Edge[]) => void;
}

export default function TreeEditor({ rootNode, layoutMode, layoutKey, exportFormat, pageSize, onNodesChangeCallback }: TreeEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Convert our TreeNode structure to React Flow Nodes and Edges
  useEffect(() => {
    if (!rootNode) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const visited = new Set<string>();

    const traverse = (node: TreeNode) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);

      // Add Node
      newNodes.push({
        id: node.id,
        type: 'person',
        position: { x: node.x, y: node.y },
        data: { name: node.name, birth: node.birth, death: node.death },
      });

      // Add Edges
      const addEdge = (target: TreeNode, type: string) => {
        let strokeColor = '#94a3b8'; // default slate-400
        let strokeWidth = 0.5;
        let strokeDasharray = 'none';

        if (type === 'parent') {
          strokeColor = '#3b82f6'; // blue-500
          strokeWidth = 0.5;
        } else if (type === 'spouse') {
          strokeColor = '#ec4899'; // pink-500
          strokeWidth = 0.5;
          strokeDasharray = '5,5'; // dashed for spouses
        } else if (type === 'child') {
          strokeColor = '#10b981'; // emerald-500
          strokeWidth = 0.5;
        }

        let sourceHandle = 'source-bottom';
        let targetHandle = 'target-top';

        // Calculate relative position to determine best handles
        const dx = target.x - node.x;
        const dy = target.y - node.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal connection
          if (dx > 0) {
            sourceHandle = 'source-right';
            targetHandle = 'target-left';
          } else {
            sourceHandle = 'source-left';
            targetHandle = 'target-right';
          }
        } else {
          // Vertical connection
          if (dy > 0) {
            sourceHandle = 'source-bottom';
            targetHandle = 'target-top';
          } else {
            sourceHandle = 'source-top';
            targetHandle = 'target-bottom';
          }
        }

        newEdges.push({
          id: `e-${node.id}-${target.id}-${type}`,
          source: node.id,
          target: target.id,
          sourceHandle,
          targetHandle,
          type: 'smoothstep',
          animated: false,
          style: { stroke: strokeColor, strokeWidth, strokeDasharray },
        });
        traverse(target);
      };

      node.parents.forEach(p => traverse(p));

      // Group children by family
      const childrenByFamily: Record<string, TreeNode[]> = {};
      node.children.forEach(c => {
        const parentIds = c.parents.map(p => p.id).sort().join('-');
        if (!childrenByFamily[parentIds]) childrenByFamily[parentIds] = [];
        childrenByFamily[parentIds].push(c);
      });

      Object.entries(childrenByFamily).forEach(([famId, children]) => {
        const familyNodeId = `fam-${famId}`;
        
        if (!visited.has(familyNodeId)) {
          visited.add(familyNodeId);
          
          const parents = children[0].parents;
          const px = parents.reduce((sum, p) => sum + p.x, 0) / parents.length;
          const py = parents.reduce((sum, p) => sum + p.y, 0) / parents.length;
          
          newNodes.push({
            id: familyNodeId,
            type: 'family',
            position: { x: px + 160/2 - 4, y: py + 50/2 - 4 },
            data: {},
          });

          parents.forEach(p => {
            let sourceHandle = 'source-bottom';
            let targetHandle = 'target-top';
            
            const dx = px - p.x;
            const dy = py - p.y;

            if (Math.abs(dx) > Math.abs(dy)) {
              sourceHandle = dx > 0 ? 'source-right' : 'source-left';
              targetHandle = dx > 0 ? 'target-left' : 'target-right';
            } else {
              sourceHandle = dy > 0 ? 'source-bottom' : 'source-top';
              targetHandle = dy > 0 ? 'target-top' : 'target-bottom';
            }

            newEdges.push({
              id: `e-${p.id}-${familyNodeId}`,
              source: p.id,
              target: familyNodeId,
              sourceHandle,
              targetHandle,
              type: 'smoothstep',
              style: { 
                stroke: parents.length > 1 ? '#ec4899' : '#3b82f6', 
                strokeWidth: 0.5, 
                strokeDasharray: parents.length > 1 ? '5,5' : 'none' 
              },
            });
          });

          children.forEach(c => {
            let sourceHandle = 'source-bottom';
            let targetHandle = 'target-top';
            
            const dx = c.x - px;
            const dy = c.y - py;

            if (Math.abs(dx) > Math.abs(dy)) {
              sourceHandle = dx > 0 ? 'source-right' : 'source-left';
              targetHandle = dx > 0 ? 'target-left' : 'target-right';
            } else {
              sourceHandle = dy > 0 ? 'source-bottom' : 'source-top';
              targetHandle = dy > 0 ? 'target-top' : 'target-bottom';
            }

            newEdges.push({
              id: `e-${familyNodeId}-${c.id}`,
              source: familyNodeId,
              target: c.id,
              sourceHandle,
              targetHandle,
              type: 'smoothstep',
              style: { stroke: '#10b981', strokeWidth: 0.5 },
            });
          });
        }
        
        children.forEach(c => traverse(c));
      });

      node.spouses.forEach(s => {
        const haveChildrenTogether = node.children.some(c => c.parents.includes(s));
        if (!haveChildrenTogether) {
          addEdge(s, 'spouse');
        } else {
          traverse(s);
        }
      });
    };

    traverse(rootNode);

    // Add Boundary Node
    const PAGE_SIZES: Record<string, {w: number, h: number}> = {
        'A4': { w: 297, h: 210 },
        'A3': { w: 420, h: 297 },
        'A2': { w: 594, h: 420 },
        'A1': { w: 841, h: 594 },
        'A0': { w: 1189, h: 841 },
        '2A0': { w: 1682, h: 1189 },
        '4A0': { w: 2378, h: 1682 },
        'POSTER_2M': { w: 2000, h: 1000 },
        'POSTER_3M': { w: 3000, h: 1000 },
        'POSTER_5M': { w: 5000, h: 1000 },
    };
    const pSize = PAGE_SIZES[pageSize] || PAGE_SIZES['A3'];
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    newNodes.forEach(n => {
        if (n.position.x < minX) minX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
        if (n.position.x + 160 > maxX) maxX = n.position.x + 160;
        if (n.position.y + 50 > maxY) maxY = n.position.y + 50;
    });
    
    // Add padding
    minX -= 50;
    minY -= 50;
    maxX += 50;
    maxY += 50;

    const treeW = Math.max(maxX - minX, 100);
    const treeH = Math.max(maxY - minY, 100);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    let boxW = pSize.w * 2;
    let boxH = pSize.h * 2;

    if (exportFormat === 'A0_POSTER') {
        const pageRatio = pSize.w / pSize.h;
        const treeRatio = treeW / treeH;
        
        if (treeRatio > pageRatio) {
            boxW = treeW;
            boxH = treeW / pageRatio;
        } else {
            boxH = treeH;
            boxW = treeH * pageRatio;
        }
    } else {
        // Grid mode: calculate how many pages are needed
        const effWidth = pSize.w * 2;
        const effHeight = pSize.h * 2;
        const cols = Math.max(1, Math.ceil(treeW / effWidth));
        const rows = Math.max(1, Math.ceil(treeH / effHeight));
        boxW = cols * effWidth;
        boxH = rows * effHeight;
    }

    newNodes.push({
        id: 'boundary',
        type: 'boundary',
        position: { x: centerX - boxW / 2, y: centerY - boxH / 2 },
        data: { width: boxW, height: boxH, format: exportFormat, pageSize: pageSize },
        zIndex: -1,
        selectable: false,
        draggable: false,
        focusable: false,
        deletable: false,
        style: { pointerEvents: 'none' },
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [rootNode, layoutMode, layoutKey, exportFormat, pageSize, setNodes, setEdges]);

  // Notify parent component when nodes/edges change (for PDF export)
  useEffect(() => {
    if (onNodesChangeCallback) {
      onNodesChangeCallback(nodes, edges);
    }
  }, [nodes, edges, onNodesChangeCallback]);

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] bg-slate-50" : "absolute inset-0 bg-slate-50"}>
      <ReactFlowProvider>
        <FlowContent 
          nodes={nodes} 
          edges={edges} 
          setNodes={setNodes}
          onNodesChange={onNodesChange} 
          onEdgesChange={onEdgesChange}
          isFullscreen={isFullscreen}
          setIsFullscreen={setIsFullscreen}
          layoutKey={layoutKey}
        />
      </ReactFlowProvider>
      
      {/* Editor Help Overlay */}
      {!isFullscreen && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm border border-slate-200 px-4 py-3 rounded-xl shadow-sm z-10 pointer-events-none">
          <h4 className="font-bold text-slate-800 text-sm mb-1">Modo Editor Livre</h4>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• Arraste as caixas para ajustar</li>
            <li>• Use a barra superior para ferramentas</li>
          </ul>
        </div>
      )}
    </div>
  );
}
