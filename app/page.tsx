'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Download, FileText, TreeDeciduous, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseGedcom, buildTree, applyLayout, ParsedGedcom, TreeNode } from '@/lib/gedcom';
import { generateFlowPDF } from '@/lib/pdf';
import TreeEditor from '@/components/TreeEditor';
import { Node, Edge } from '@xyflow/react';

export default function GedcomToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedGedcom | null>(null);
  const [rootId, setRootId] = useState<string>('');
  const [source, setSource] = useState<string>('rootsmagic');
  const [exportFormat, setExportFormat] = useState<'A3_GRID' | 'A0_POSTER'>('A3_GRID');
  const [layoutMode, setLayoutMode] = useState<string>('horizontal');
  const [pageSize, setPageSize] = useState<string>('A3');
  const [maxGen, setMaxGen] = useState<number>(5);
  const [layoutKey, setLayoutKey] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State to hold the current nodes and edges from the editor
  const [currentNodes, setCurrentNodes] = useState<Node[]>([]);
  const [currentEdges, setCurrentEdges] = useState<Edge[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.toLowerCase().endsWith('.ged') && !uploadedFile.name.toLowerCase().endsWith('.txt')) {
      setError('Por favor, envie um arquivo .ged ou .txt válido.');
      return;
    }

    setFile(uploadedFile);
    setError(null);
    setIsProcessing(true);

    try {
      const content = await uploadedFile.text();
      const parsed = parseGedcom(content, source);
      
      if (Object.keys(parsed.individuals).length === 0) {
        throw new Error('Nenhum dado encontrado no arquivo GEDCOM.');
      }
      
      setParsedData(parsed);
      // Auto-select the first person
      setRootId(Object.keys(parsed.individuals)[0]);
    } catch (err) {
      setError('Erro ao processar o arquivo. Verifique se o formato está correto.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const sortedIndividuals = useMemo(() => {
    if (!parsedData) return [];
    return Object.values(parsedData.individuals).sort((a, b) => a.name.localeCompare(b.name));
  }, [parsedData]);

  const treeNode = useMemo(() => {
    // Use layoutKey to force recalculation when Reorganize is clicked
    const _forceRecalc = layoutKey;
    if (!parsedData || !rootId) return null;
    const root = buildTree(parsedData.individuals, parsedData.families, rootId, maxGen);
    if (root) {
      applyLayout(root, layoutMode);
    }
    return root;
  }, [parsedData, rootId, layoutMode, layoutKey, maxGen]);

  const handleNodesChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setCurrentNodes(nodes);
    setCurrentEdges(edges);
  }, []);

  const handleDownload = () => {
    if (currentNodes.length === 0) return;
    generateFlowPDF(currentNodes, currentEdges, exportFormat, pageSize);
  };

  const handleReorganize = () => {
    setLayoutKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <TreeDeciduous size={20} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">GEDTree</h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">Editor Visual Interativo</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Info & Upload */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Sua história familiar <span className="text-indigo-600">editável.</span>
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Arraste as pessoas para ajustar o layout antes de gerar o PDF.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700">Software de Origem</label>
                <div className="grid grid-cols-2 gap-2">
                  {['rootsmagic', 'myheritage', 'familysearch', 'other'].map(s => (
                    <button
                      key={s}
                      onClick={() => setSource(s)}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${source === s ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                    >
                      {s === 'rootsmagic' && 'RootsMagic'}
                      {s === 'myheritage' && 'MyHeritage'}
                      {s === 'familysearch' && 'FamilySearch'}
                      {s === 'other' && 'Outro'}
                    </button>
                  ))}
                </div>
              </div>

              <label 
                htmlFor="gedcom-upload"
                className={`
                  relative group cursor-pointer block
                  border-2 border-dashed rounded-2xl p-8
                  transition-all duration-300 ease-out
                  ${file ? 'border-green-200 bg-green-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}
                `}
              >
                <input 
                  type="file" 
                  id="gedcom-upload" 
                  className="hidden" 
                  accept=".ged,.txt"
                  onChange={handleFileUpload}
                />
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110
                    ${file ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}
                  `}>
                    {file ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {file ? file.name : 'Selecione seu arquivo'}
                    </p>
                  </div>
                </div>
              </label>

              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-3 text-sm"
                  >
                    <AlertCircle size={18} />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {parsedData && treeNode && (
              <div className="space-y-6 pt-6 border-t border-slate-200">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Pessoa Raiz</label>
                  <select 
                    value={rootId}
                    onChange={(e) => setRootId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    {sortedIndividuals.map(indi => (
                      <option key={indi.id} value={indi.id}>
                        {indi.name} ({indi.birth ? indi.birth.substring(0, 4) : '?'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Formato de Exportação</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setExportFormat('A3_GRID')}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${exportFormat === 'A3_GRID' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                    >
                      Grade de Páginas
                    </button>
                    <button
                      onClick={() => setExportFormat('A0_POSTER')}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${exportFormat === 'A0_POSTER' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                    >
                      Pôster Gigante
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Tamanho da Página</label>
                  <select 
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="A4">A4 (297 x 210 mm)</option>
                    <option value="A3">A3 (420 x 297 mm)</option>
                    <option value="A2">A2 (594 x 420 mm)</option>
                    <option value="A1">A1 (841 x 594 mm)</option>
                    <option value="A0">A0 (1189 x 841 mm)</option>
                    <option value="2A0">2A0 (1682 x 1189 mm)</option>
                    <option value="4A0">4A0 (2378 x 1682 mm)</option>
                    <option value="POSTER_2M">Pôster (2m x 1m)</option>
                    <option value="POSTER_3M">Pôster (3m x 1m)</option>
                    <option value="POSTER_5M">Pôster (5m x 1m)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Gerações (Limite)</label>
                  <select 
                    value={maxGen}
                    onChange={(e) => setMaxGen(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value={2}>2 Gerações</option>
                    <option value={3}>3 Gerações</option>
                    <option value={4}>4 Gerações</option>
                    <option value={5}>5 Gerações</option>
                    <option value={6}>6 Gerações</option>
                    <option value={7}>7 Gerações</option>
                    <option value={8}>8 Gerações</option>
                    <option value={9}>9 Gerações</option>
                    <option value={10}>10 Gerações</option>
                    <option value={15}>15 Gerações</option>
                    <option value={20}>20 Gerações</option>
                    <option value={99}>Todas</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Layout da Árvore</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setLayoutMode('horizontal')} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${layoutMode === 'horizontal' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}>Padrão (Direita)</button>
                    <button onClick={() => setLayoutMode('vertical')} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${layoutMode === 'vertical' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}>Pirâmide (Cima)</button>
                    <button onClick={() => setLayoutMode('butterfly')} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${layoutMode === 'butterfly' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}>Centro (Borboleta)</button>
                    <button onClick={() => setLayoutMode('fan')} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${layoutMode === 'fan' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}>Leque (Semicírculo)</button>
                  </div>
                </div>

                <button
                  onClick={handleReorganize}
                  className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-6 rounded-xl transition-all active:scale-[0.98]"
                >
                  Reorganizar Layout
                </button>

                <button
                  onClick={handleDownload}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-slate-200"
                >
                  <Download size={18} />
                  Gerar PDF
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Editor */}
          <div className="lg:col-span-8">
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-[600px] flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Editor Visual</h3>
                {parsedData && (
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                    {currentNodes.length} Pessoas na Tela
                  </span>
                )}
              </div>
              <div className="flex-1 relative">
                {isProcessing ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 z-10">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium text-sm">Processando arquivo...</p>
                  </div>
                ) : parsedData && treeNode ? (
                  <TreeEditor rootNode={treeNode} layoutMode={layoutMode} layoutKey={layoutKey} exportFormat={exportFormat} pageSize={pageSize} onNodesChangeCallback={handleNodesChange} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-300">
                    <FileText size={48} strokeWidth={1} />
                    <p className="text-sm">Aguardando arquivo</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-slate-400">
          <p>© 2026 GEDTree - Ferramenta de Genealogia</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-indigo-600 transition-colors">Privacidade</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Termos</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
