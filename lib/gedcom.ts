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

export function parseGedcom(content: string, source: string = 'other'): ParsedGedcom {
  // Remove BOM and null bytes
  content = content.replace(/^\uFEFF/, '').replace(/\0/g, '');
  // Split by any newline character
  const lines = content.split(/\r\n|\n|\r/);
  
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  
  let currentRecord: any = null;
  let currentType: 'INDI' | 'FAM' | null = null;
  let currentEvent: 'BIRT' | 'DEAT' | null = null;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    // Match standard GEDCOM lines: "level [id] tag [value]"
    // Examples: "0 @I1@ INDI", "1 NAME John /Doe/", "2 DATE 3 JUL 1979"
    const match = line.match(/^(\d+)\s+(@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) continue;
    
    const level = parseInt(match[1], 10);
    let idMatch = match[2] ? match[2].trim() : null;
    const tag = match[3].toUpperCase();
    let value = match[4] ? match[4].trim() : '';
    
    // Some software (like older MyHeritage exports) might put the ID after the tag: "0 INDI @I1@"
    if (level === 0 && !idMatch && value.match(/^@[^@]+@$/)) {
      if (tag === 'INDI' || tag === 'FAM') {
        idMatch = value;
        value = '';
      }
    }
    
    if (level === 0) {
      currentEvent = null;
      
      if (tag === 'INDI' && idMatch) {
        currentType = 'INDI';
        const id = cleanId(idMatch);
        currentRecord = { id, name: 'Desconhecido', birth: '', death: '', famc: [] };
        individuals[id] = currentRecord;
      } else if (tag === 'FAM' && idMatch) {
        currentType = 'FAM';
        const id = cleanId(idMatch);
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
          const nameVal = value.replace(/\//g, '').trim();
          if (nameVal) currentRecord.name = nameVal;
        } else if (tag === 'BIRT') {
          currentEvent = 'BIRT';
        } else if (tag === 'DEAT') {
          currentEvent = 'DEAT';
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
