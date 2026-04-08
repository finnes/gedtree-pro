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
  content = content.replace(/^\uFEFF/, '').replace(/\0/g, '');
  const lines = content.split(/\r\n|\n|\r/);
  
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  
  let currentRecord: any = null;
  let currentType: 'INDI' | 'FAM' | null = null;
  let currentEvent: 'BIRT' | 'DEAT' | null = null;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    const match = line.match(/^(\d+)\s+(@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) continue;
    
    const level = parseInt(match[1], 10);
    let idMatch = match[2] ? match[2].trim() : null;
    const tag = match[3].toUpperCase();
    let value = match[4] ? match[4].trim() : '';
    
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
  parents: TreeNode[];
  spouses: TreeNode[];
  children: TreeNode[];
  x: number;
  y: number;
}

export function buildTree(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  rootId: string
): TreeNode | null {
  const nodes: Record<string, TreeNode> = {};
  const visited = new Set<string>();

  function getOrCreateNode(id: string): TreeNode {
    if (!nodes[id]) {
      const indi = individuals[id];
      nodes[id] = {
        id,
        name: indi ? indi.name : 'Desconhecido',
        birth: indi ? indi.birth : '',
        death: indi ? indi.death : '',
        parents: [],
        spouses: [],
        children: [],
        x: 0,
        y: 0
      };
    }
    return nodes[id];
  }

  const queue = [rootId];
  visited.add(rootId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = getOrCreateNode(currentId);
    const indi = individuals[currentId];

    if (!indi) continue;

    for (const f of Object.values(families)) {
      if (f.chil.includes(currentId)) {
        if (f.husb) {
          const father = getOrCreateNode(f.husb);
          if (!node.parents.includes(father)) node.parents.push(father);
          if (!father.children.includes(node)) father.children.push(node);
          if (!visited.has(f.husb)) { visited.add(f.husb); queue.push(f.husb); }
        }
        if (f.wife) {
          const mother = getOrCreateNode(f.wife);
          if (!node.parents.includes(mother)) node.parents.push(mother);
          if (!mother.children.includes(node)) mother.children.push(node);
          if (!visited.has(f.wife)) { visited.add(f.wife); queue.push(f.wife); }
        }
      }
      if (f.husb === currentId || f.wife === currentId) {
        const spouseId = f.husb === currentId ? f.wife : f.husb;
        if (spouseId) {
          const spouse = getOrCreateNode(spouseId);
          if (!node.spouses.includes(spouse)) node.spouses.push(spouse);
          if (!spouse.spouses.includes(node)) spouse.spouses.push(node);
          if (!visited.has(spouseId)) { visited.add(spouseId); queue.push(spouseId); }
        }
        for (const childId of f.chil) {
          const child = getOrCreateNode(childId);
          if (!node.children.includes(child)) node.children.push(child);
          if (!child.parents.includes(node)) child.parents.push(node);
          if (!visited.has(childId)) { visited.add(childId); queue.push(childId); }
        }
      }
    }
  }

  return nodes[rootId];
}

export function applyLayout(root: TreeNode, mode: string) {
  const SPACING = 200;
  const visited = new Set<string>();
  const queue: {node: TreeNode, x: number, y: number}[] = [{node: root, x: 0, y: 0}];
  visited.add(root.id);

  while (queue.length > 0) {
    const {node, x, y} = queue.shift()!;
    node.x = x;
    node.y = y;

    const neighbors = [...node.parents, ...node.spouses, ...node.children];
    let angle = 0;
    const angleStep = (2 * Math.PI) / (neighbors.length || 1);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        const nx = x + Math.cos(angle) * SPACING;
        const ny = y + Math.sin(angle) * SPACING;
        queue.push({node: neighbor, x: nx, y: ny});
        angle += angleStep;
      }
    }
  }
}
