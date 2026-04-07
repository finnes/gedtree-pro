'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Download, FileText, TreeDeciduous, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseGedcom, Individual } from '@/lib/gedcom';
import { generateTreePDF } from '@/lib/pdf';

export default function GedcomToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.toLowerCase().endsWith('.ged')) {
      setError('Por favor, envie um arquivo .ged válido.');
      return;
    }

    setFile(uploadedFile);
    setError(null);
    setIsProcessing(true);

    try {
      const content = await uploadedFile.text();
      const parsed = parseGedcom(content);
      if (parsed.length === 0) {
        throw new Error('Nenhum dado encontrado no arquivo GEDCOM.');
      }
      setIndividuals(parsed);
    } catch (err) {
      setError('Erro ao processar o arquivo. Verifique se o formato está correto.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (individuals.length === 0) return;
    generateTreePDF(individuals);
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
            <h1 className="font-bold text-lg tracking-tight">GedTree <span className="text-indigo-600">Pro</span></h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">Conversor GEDCOM para PDF</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Column: Info & Upload */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Sua história familiar em um <span className="text-indigo-600">banner gigante.</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Transforme seu arquivo GEDCOM em um PDF de alta resolução formatado para impressão em 4 páginas A3. 
                Perfeito para quadros, reuniões de família ou presentes.
              </p>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 space-y-4">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                <Info size={18} /> Requisitos de Impressão
              </h3>
              <ul className="space-y-3 text-sm text-indigo-800/80">
                <li className="flex gap-3">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span>Layout &quot;Tripa&quot;: 1680mm x 297mm (4x A3 Paisagem).</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span>Guias de corte vermelhas para colagem perfeita entre as folhas.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span>Conectores ortogonais que atravessam as bordas das páginas.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <label 
                htmlFor="gedcom-upload"
                className={`
                  relative group cursor-pointer block
                  border-2 border-dashed rounded-3xl p-12
                  transition-all duration-300 ease-out
                  ${file ? 'border-green-200 bg-green-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}
                `}
              >
                <input 
                  type="file" 
                  id="gedcom-upload" 
                  className="hidden" 
                  accept=".ged"
                  onChange={handleFileUpload}
                />
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className={`
                    w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110
                    ${file ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}
                  `}>
                    {file ? <CheckCircle2 size={32} /> : <Upload size={32} />}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">
                      {file ? file.name : 'Selecione seu arquivo .ged'}
                    </p>
                    <p className="text-sm text-slate-500">
                      Arraste e solte ou clique para navegar
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
          </div>

          {/* Right Column: Preview & Actions */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Resumo da Árvore</h3>
                {individuals.length > 0 && (
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                    {individuals.length} Indivíduos
                  </span>
                )}
              </div>
              <div className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center space-y-6">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">Processando gerações...</p>
                  </div>
                ) : individuals.length > 0 ? (
                  <div className="space-y-6 w-full">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Gerações</p>
                        <p className="text-2xl font-black text-slate-900">
                          {Math.max(...individuals.map(i => i.generation)) + 1}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Formato</p>
                        <p className="text-2xl font-black text-slate-900">4x A3</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDownload}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-slate-200"
                    >
                      <Download size={20} />
                      Gerar PDF para Impressão
                    </button>
                    
                    <p className="text-xs text-slate-400 italic">
                      O PDF será gerado localmente no seu navegador para total privacidade dos seus dados.
                    </p>
                  </div>
                ) : (
                  <div className="text-slate-300 flex flex-col items-center gap-4">
                    <FileText size={64} strokeWidth={1} />
                    <p className="max-w-[200px]">Aguardando arquivo para gerar prévia</p>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Guide Mockup */}
            <div className="relative aspect-[16/3] bg-slate-200 rounded-xl overflow-hidden border border-slate-300 group">
              <div className="absolute inset-0 flex">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex-1 border-r border-slate-300 last:border-0 relative flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400">A3 #{i}</span>
                    {i < 4 && (
                      <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-red-400/50 border-r border-dashed border-red-400" />
                    )}
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center px-4">
                <div className="w-full h-0.5 bg-indigo-400/30 rounded-full relative">
                   <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-500 rounded-full" />
                   <div className="absolute right-0 top-1/2 -translate-y-1/2 w-full h-full flex justify-around items-center">
                      {[1,2,3,4,5,6].map(j => (
                        <div key={j} className="w-1 h-1 bg-indigo-400 rounded-full" />
                      ))}
                   </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-slate-400">
          <p>© 2026 GedTree Pro - Ferramenta de Genealogia</p>
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
