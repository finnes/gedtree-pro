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
  generation: number;
  father: TreeNode | null;
  mother: TreeNode | null;
  parents: TreeNode[];
  spouses: TreeNode[];
  children: TreeNode[];
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
  const nodes: Record<string, TreeNode> = {};
  const visited = new Set<string>();

  function getOrCreateNode(id: string, gen: number): TreeNode {
    if (!nodes[id]) {
      const indi = individuals[id];
      nodes[id] = {
        id,
        name: indi ? indi.name : 'Desconhecido',
        birth: indi ? indi.birth : '',
        death: indi ? indi.death : '',
        generation: gen,
        father: null,
        mother: null,
        parents: [],
        spouses: [],
        children: [],
        subtreeHeight: 0,
        x: 0,
        y: 0
      };
    }
    return nodes[id];
  }

  const queue = [{id: rootId, gen: 0}];
  visited.add(rootId);

  while (queue.length > 0) {
    const {id: currentId, gen} = queue.shift()!;
    const node = getOrCreateNode(currentId, gen);
    const indi = individuals[currentId];

    if (!indi) continue;

    for (const f of Object.values(families)) {
      if (f.chil.includes(currentId)) {
        if (gen < maxGen) {
          if (f.husb) {
            const father = getOrCreateNode(f.husb, gen + 1);
            if (!node.parents.includes(father)) node.parents.push(father);
            if (!father.children.includes(node)) father.children.push(node);
            node.father = father;
            if (!visited.has(f.husb)) { visited.add(f.husb); queue.push({id: f.husb, gen: gen + 1}); }
          }
          if (f.wife) {
            const mother = getOrCreateNode(f.wife, gen + 1);
            if (!node.parents.includes(mother)) node.parents.push(mother);
            if (!mother.children.includes(node)) mother.children.push(node);
            node.mother = mother;
            if (!visited.has(f.wife)) { visited.add(f.wife); queue.push({id: f.wife, gen: gen + 1}); }
          }
        }
      }
      if (f.husb === currentId || f.wife === currentId) {
        const spouseId = f.husb === currentId ? f.wife : f.husb;
        if (spouseId) {
          const spouse = getOrCreateNode(spouseId, gen);
          if (!node.spouses.includes(spouse)) node.spouses.push(spouse);
          if (!spouse.spouses.includes(node)) spouse.spouses.push(node);
          if (!visited.has(spouseId)) { visited.add(spouseId); queue.push({id: spouseId, gen}); }
        }
        if (gen > -maxGen) {
          for (const childId of f.chil) {
            const child = getOrCreateNode(childId, gen - 1);
            if (!node.children.includes(child)) node.children.push(child);
            if (!child.parents.includes(node)) child.parents.push(node);
            if (!visited.has(childId)) { visited.add(childId); queue.push({id: childId, gen: gen - 1}); }
          }
        }
      }
    }
  }

  return nodes[rootId];
}

export function applyLayout(root: TreeNode, mode: string) {
  const BOX_WIDTH = 160;
  const BOX_HEIGHT = 50;
  const SPACING_X = 100;
  const SPACING_Y = 50;

  if (mode === 'horizontal') {
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    function doLayout(node: TreeNode | null, startY: number): number {
      if (!node) return 0;
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = node.generation * GEN_WIDTH;
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayout(node.father, startY);
      const hM = doLayout(node.mother, startY + hF);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = node.generation * GEN_WIDTH;
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    doLayout(root, 0);
  } else if (mode === 'vertical') {
    const GEN_HEIGHT = BOX_HEIGHT + SPACING_X;
    function doLayoutV(node: TreeNode | null, startX: number): number {
      if (!node) return 0;
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_WIDTH + SPACING_Y; // Using subtreeHeight as a generic size
        node.y = -(node.generation * GEN_HEIGHT);
        node.x = startX + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const wF = doLayoutV(node.father, startX);
      const wM = doLayoutV(node.mother, startX + wF);
      node.subtreeHeight = Math.max(BOX_WIDTH + SPACING_Y, wF + wM);
      node.y = -(node.generation * GEN_HEIGHT);
      if (node.father && node.mother) node.x = (node.father.x + node.mother.x) / 2;
      else if (node.father) node.x = node.father.x;
      else if (node.mother) node.x = node.mother.x;
      else node.x = startX + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    doLayoutV(root, 0);
  } else if (mode === 'butterfly') {
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    function doLayoutB(node: TreeNode | null, startY: number, direction: -1 | 1): number {
      if (!node) return 0;
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = direction * (node.generation * GEN_WIDTH);
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayoutB(node.father, startY, direction);
      const hM = doLayoutB(node.mother, startY + hF, direction);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = direction * (node.generation * GEN_WIDTH);
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    const hF = doLayoutB(root.father, 0, -1);
    const hM = doLayoutB(root.mother, 0, 1);
    root.x = 0;
    root.y = Math.max(hF, hM) / 2;
  } else if (mode === 'fan') {
    const RADIUS_STEP = 200;
    function doLayoutFan(node: TreeNode | null, angleStart: number, angleEnd: number) {
      if (!node) return;
      const radius = node.generation * RADIUS_STEP;
      const angle = (angleStart + angleEnd) / 2;
      node.x = Math.cos(angle) * radius;
      node.y = -Math.sin(angle) * radius;
      const angleStep = (angleEnd - angleStart) / (node.parents.length || 1);
      for (let i = 0; i < node.parents.length; i++) {
        doLayoutFan(node.parents[i], angleStart + i * angleStep, angleStart + (i + 1) * angleStep);
      }
    }
    root.x = 0;
    root.y = 0;
    const angleStep = Math.PI / (root.parents.length || 1);
    for (let i = 0; i < root.parents.length; i++) {
      doLayoutFan(root.parents[i], Math.PI - (i + 1) * angleStep, Math.PI - i * angleStep);
    }
  }

  // Post-processing to position unpositioned nodes
  const queue = [root];
  const visited = new Set<string>();
  visited.add(root.id);

  const occupied = new Set<string>();
  const CELL_W = 200;
  const CELL_H = 100;

  function getCell(x: number, y: number) {
    return `${Math.round(x / CELL_W)},${Math.round(y / CELL_H)}`;
  }

  // Mark initially positioned nodes
  const allNodes = [root];
  let qIdx = 0;
  while (qIdx < allNodes.length) {
    const n = allNodes[qIdx++];
    if (n.x !== 0 || n.y !== 0 || n === root) {
      occupied.add(getCell(n.x, n.y));
    }
    for (const neighbor of [...n.parents, ...n.spouses, ...n.children]) {
      if (!allNodes.includes(neighbor)) {
        allNodes.push(neighbor);
      }
    }
  }

  function findEmptyCell(startX: number, startY: number): { x: number, y: number } {
    let radius = 0;
    while (radius < 50) { // Search up to 50 cells away
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
            const testX = startX + dx * CELL_W;
            const testY = startY + dy * CELL_H;
            if (!occupied.has(getCell(testX, testY))) {
              return { x: testX, y: testY };
            }
          }
        }
      }
      radius++;
    }
    return { x: startX, y: startY }; // Fallback
  }
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    const neighbors = [...node.parents, ...node.spouses, ...node.children];
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        if (neighbor.x === 0 && neighbor.y === 0) {
          // Find nearest empty spot
          const pos = findEmptyCell(node.x, node.y + CELL_H);
          neighbor.x = pos.x;
          neighbor.y = pos.y;
          occupied.add(getCell(pos.x, pos.y));
        }
        queue.push(neighbor);
      }
    }
  }
}
