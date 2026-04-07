import { parse } from 'parse-gedcom';

export interface Individual {
  id: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  fatherId?: string;
  motherId?: string;
  generation: number;
  x: number;
  y: number;
  subtreeHeight: number;
}

export function parseGedcom(content: string): Individual[] {
  const data = parse(content) as any;
  // parse-gedcom returns either an array or an object with a tree property
  const records = Array.isArray(data) ? data : (data.tree || []);
  
  const individualsMap: Record<string, any> = {};
  const familiesMap: Record<string, any> = {};

  if (records.length === 0) return [];

  records.forEach((record: any) => {
    const tag = record.tag?.toUpperCase();
    if (tag === 'INDI') {
      const nameTag = record.tree.find((t: any) => t.tag?.toUpperCase() === 'NAME');
      const birthTag = record.tree.find((t: any) => t.tag?.toUpperCase() === 'BIRT');
      const deathTag = record.tree.find((t: any) => t.tag?.toUpperCase() === 'DEAT');
      
      const birthDate = birthTag?.tree.find((t: any) => t.tag?.toUpperCase() === 'DATE')?.data;
      const deathDate = deathTag?.tree.find((t: any) => t.tag?.toUpperCase() === 'DATE')?.data;

      const id = record.pointer || record.data;
      if (id) {
        individualsMap[id] = {
          id: id,
          name: nameTag?.data?.replace(/\//g, ' ').trim() || 'Desconhecido',
          birthDate: birthDate || '',
          deathDate: deathDate || '',
          famc: record.tree.find((t: any) => t.tag?.toUpperCase() === 'FAMC')?.data
        };
      }
    } else if (tag === 'FAM') {
      const id = record.pointer || record.data;
      if (id) {
        familiesMap[id] = {
          husb: record.tree.find((t: any) => t.tag?.toUpperCase() === 'HUSB')?.data,
          wife: record.tree.find((t: any) => t.tag?.toUpperCase() === 'WIFE')?.data
        };
      }
    }
  });

  // Link parents
  Object.values(individualsMap).forEach((indi: any) => {
    if (indi.famc && familiesMap[indi.famc]) {
      indi.fatherId = familiesMap[indi.famc].husb;
      indi.motherId = familiesMap[indi.famc].wife;
    }
  });

  // Find root (first person or someone without children in the file - simplified)
  const rootId = Object.keys(individualsMap)[0];
  if (!rootId) return [];

  const result: Individual[] = [];
  const visited = new Set<string>();

  const BOX_HEIGHT = 20;
  const BOX_SPACING = 10;
  const GEN_WIDTH = 150;

  function calculateSubtreeHeight(id: string | undefined, gen: number): number {
    if (!id || !individualsMap[id] || gen >= 10) return BOX_HEIGHT + BOX_SPACING;
    
    const indi = individualsMap[id];
    const fatherHeight = calculateSubtreeHeight(indi.fatherId, gen + 1);
    const motherHeight = calculateSubtreeHeight(indi.motherId, gen + 1);
    
    const height = Math.max(BOX_HEIGHT + BOX_SPACING, fatherHeight + motherHeight);
    indi.subtreeHeight = height;
    return height;
  }

  function layout(id: string | undefined, gen: number, startY: number) {
    if (!id || !individualsMap[id] || gen >= 10 || visited.has(id)) return;
    visited.add(id);

    const indi = individualsMap[id];
    const totalHeight = indi.subtreeHeight || (BOX_HEIGHT + BOX_SPACING);
    
    indi.generation = gen;
    indi.x = gen * GEN_WIDTH + 20; // 20mm margin
    indi.y = startY + totalHeight / 2;

    result.push(indi as Individual);

    const fatherHeight = (indi.fatherId && individualsMap[indi.fatherId]) ? individualsMap[indi.fatherId].subtreeHeight : (BOX_HEIGHT + BOX_SPACING);
    
    layout(indi.fatherId, gen + 1, startY);
    layout(indi.motherId, gen + 1, startY + fatherHeight);
  }

  calculateSubtreeHeight(rootId, 0);
  layout(rootId, 0, 20); // 20mm top margin

  return result;
}
