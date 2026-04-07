export interface Individual {
  id: string;
  name: string;
  birth: string;
  death: string;
  famc: string[];
}

export interface Family {
  id: string;
  husb: string | null;
  wife: string | null;
  chil: string[];
}

export interface ParsedGedcom {
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
}

export function cleanId(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/@/g, '').trim();
}

export function parseGedcom(content: string): ParsedGedcom {
  // Remove BOM if present
  content = content.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  
  let currentRecord: any = null;
  let currentType: 'INDI' | 'FAM' | null = null;
  let currentEvent: 'BIRT' | 'DEAT' | null = null;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    
    const level = parseInt(parts[0], 10);
    if (isNaN(level)) continue;
    
    let idMatch = null;
    let tag = '';
    let value = '';
    
    if (parts[1].startsWith('@') && parts[1].endsWith('@')) {
      idMatch = parts[1];
      tag = parts[2] || '';
      value = parts.slice(3).join(' ');
    } else {
      tag = parts[1];
      value = parts.slice(2).join(' ');
    }
    
    tag = tag.toUpperCase();
    
    if (level === 0) {
      currentEvent = null;
      if (tag === 'INDI' && idMatch) {
        currentType = 'INDI';
        const id = cleanId(idMatch);
        currentRecord = { id, name: 'Desconhecido', birth: '', death: '', famc: [] };
        individuals[id] = currentRecord;
      } else if (tag === 'INDI' && value.startsWith('@')) {
        currentType = 'INDI';
        const id = cleanId(value.split(/\s+/)[0]);
        currentRecord = { id, name: 'Desconhecido', birth: '', death: '', famc: [] };
        individuals[id] = currentRecord;
      } else if (tag === 'FAM' && idMatch) {
        currentType = 'FAM';
        const id = cleanId(idMatch);
        currentRecord = { id, husb: null, wife: null, chil: [] };
        families[id] = currentRecord;
      } else if (tag === 'FAM' && value.startsWith('@')) {
        currentType = 'FAM';
        const id = cleanId(value.split(/\s+/)[0]);
        currentRecord = { id, husb: null, wife: null, chil: [] };
        families[id] = currentRecord;
      } else {
        currentType = null;
        currentRecord = null;
      }
      continue;
    }
    
    if (!currentRecord) continue;
    
    if (currentType === 'INDI') {
      if (level === 1) {
        if (tag === 'NAME') {
          currentRecord.name = value.replace(/\//g, '').trim();
        } else if (tag === 'BIRT' || tag === 'DEAT') {
          currentEvent = tag;
        } else if (tag === 'FAMC') {
          currentRecord.famc.push(cleanId(value));
        } else {
          currentEvent = null;
        }
      } else if (level === 2 && tag === 'DATE' && currentEvent) {
        if (currentEvent === 'BIRT') currentRecord.birth = value;
        if (currentEvent === 'DEAT') currentRecord.death = value;
      }
    } else if (currentType === 'FAM') {
      if (level === 1) {
        if (tag === 'HUSB') currentRecord.husb = cleanId(value);
        else if (tag === 'WIFE') currentRecord.wife = cleanId(value);
        else if (tag === 'CHIL') currentRecord.chil.push(cleanId(value));
      }
    }
  }
  
  return { individuals, families };
}

export interface TreeNode {
  id: string;
  name: string;
  birth: string;
  death: string;
  generation: number;
  father: TreeNode | null;
  mother: TreeNode | null;
  subtreeHeight: number;
  x: number;
  y: number;
}

export function buildTree(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  rootId: string,
  maxGen: number = 15
): TreeNode | null {
  
  function traverse(indiId: string, gen: number): TreeNode | null {
    if (gen >= maxGen) return null;
    
    const cleanIndiId = cleanId(indiId);
    const indi = individuals[cleanIndiId];
    if (!indi) return null;
    
    const node: TreeNode = {
      id: cleanIndiId,
      name: indi.name,
      birth: indi.birth,
      death: indi.death,
      generation: gen,
      father: null,
      mother: null,
      subtreeHeight: 0,
      x: 0,
      y: 0
    };
    
    let fam: Family | null = null;
    
    // 1. Try FAMC
    for (const famcId of indi.famc) {
      if (families[famcId]) {
        fam = families[famcId];
        break;
      }
    }
    
    // 2. Fallback: search all families where this person is a child
    if (!fam) {
      for (const f of Object.values(families)) {
        if (f.chil.includes(cleanIndiId)) {
          fam = f;
          break;
        }
      }
    }
    
    if (fam) {
      if (fam.husb) node.father = traverse(fam.husb, gen + 1);
      if (fam.wife) node.mother = traverse(fam.wife, gen + 1);
    }
    
    return node;
  }
  
  return traverse(rootId, 0);
}

export function getMaxGen(node: TreeNode | null): number {
  if (!node) return 0;
  return Math.max(
    node.generation,
    getMaxGen(node.father),
    getMaxGen(node.mother)
  );
}

export function layoutTree(
  node: TreeNode | null,
  startY: number,
  boxHeight: number,
  boxSpacing: number,
  genWidth: number
): number {
  if (!node) return 0;
  
  if (!node.father && !node.mother) {
    node.subtreeHeight = boxHeight + boxSpacing;
    node.x = node.generation * genWidth;
    node.y = startY + node.subtreeHeight / 2;
    return node.subtreeHeight;
  }
  
  const hF = layoutTree(node.father, startY, boxHeight, boxSpacing, genWidth);
  const hM = layoutTree(node.mother, startY + hF, boxHeight, boxSpacing, genWidth);
  
  node.subtreeHeight = Math.max(boxHeight + boxSpacing, hF + hM);
  node.x = node.generation * genWidth;
  node.y = startY + node.subtreeHeight / 2;
  
  return node.subtreeHeight;
}
