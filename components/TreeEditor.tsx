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
import { MousePointer2, Hand, ZoomIn, ZoomOut, Maximize, Minimize, Focus, Undo2, Redo2, Grid } from 'lucide-react';

// Custom Node Component for a Person
const PersonNode = ({ data }: { data: any }) => {
  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-sm w-[160px] p-3 flex flex-col items-center justify-center relative group hover:border-indigo-400 hover:shadow-md transition-all">
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

const nodeTypes = {
  person: PersonNode,
};

interface FlowContentProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: any;
  onNodesChange: any;
  onEdgesChange: any;
  isFullscreen: boolean;
  setIsFullscreen: (val: boolean) => void;
}

const FlowContent = ({ nodes, edges, setNodes, onNodesChange, onEdgesChange, isFullscreen, setIsFullscreen }: FlowContentProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [isPanMode, setIsPanMode] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);

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
    </ReactFlow>
  );
};

interface TreeEditorProps {
  rootNode: TreeNode | null;
  layoutMode: string;
  layoutKey: number;
  onNodesChangeCallback?: (nodes: Node[], edges: Edge[]) => void;
}

export default function TreeEditor({ rootNode, layoutMode, layoutKey, onNodesChangeCallback }: TreeEditorProps) {
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

    const getHandles = (sourceNode: TreeNode, targetNode: TreeNode) => {
      if (layoutMode === 'vertical') {
        return { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
      }
      if (layoutMode === 'fan') {
        return { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
      }
      if (layoutMode === 'butterfly') {
        if (targetNode.x < sourceNode.x) {
          return { sourceHandle: 'source-left', targetHandle: 'target-right' };
        } else if (targetNode.x > sourceNode.x) {
          return { sourceHandle: 'source-right', targetHandle: 'target-left' };
        }
      }
      return { sourceHandle: 'source-right', targetHandle: 'target-left' };
    };

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

      // Add Edges to Parents
      if (node.father) {
        const handles = getHandles(node, node.father);
        newEdges.push({
          id: `e-${node.id}-${node.father.id}`,
          source: node.id,
          target: node.father.id,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        });
        traverse(node.father);
      }

      if (node.mother) {
        const handles = getHandles(node, node.mother);
        newEdges.push({
          id: `e-${node.id}-${node.mother.id}`,
          source: node.id,
          target: node.mother.id,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        });
        traverse(node.mother);
      }
    };

    traverse(rootNode);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [rootNode, layoutMode, layoutKey, setNodes, setEdges]);

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
