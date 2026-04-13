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
  
  // Deduplicate individuals based on normalized name
  const nameMap = new Map<string, string[]>();
  const idReplacements: Record<string, string> = {};

  for (const [id, indi] of Object.entries(individuals)) {
    if (!indi.name || indi.name === 'Desconhecido') continue;
    
    let normName = indi.name.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, " ");

    // Custom fixes for specific typos in the user's GEDCOM
    if (normName === 'antonio castanho manzini') normName = 'antonia castanho manzini';
    if (normName.startsWith('lea manzini')) normName = 'lea manzini gontijo da costa';

    if (!nameMap.has(normName)) nameMap.set(normName, []);
    nameMap.get(normName)!.push(id);
  }

  for (const [normName, ids] of nameMap.entries()) {
    if (ids.length > 1) {
      // Sort by data richness so the primary record is the most complete one
      ids.sort((a, b) => {
        const scoreA = (individuals[a].birth ? 1 : 0) + (individuals[a].famc?.length || 0);
        const scoreB = (individuals[b].birth ? 1 : 0) + (individuals[b].famc?.length || 0);
        return scoreB - scoreA;
      });

      const primaryId = ids[0];
      const primary = individuals[primaryId];

      for (let i = 1; i < ids.length; i++) {
        const dupId = ids[i];
        const dup = individuals[dupId];

        idReplacements[dupId] = primaryId;

        // Merge data
        if (!primary.birth && dup.birth) primary.birth = dup.birth;
        if (!primary.death && dup.death) primary.death = dup.death;
        if (dup.famc && dup.famc.length > 0) {
          primary.famc = Array.from(new Set([...(primary.famc || []), ...dup.famc]));
        }

        delete individuals[dupId];
      }
    }
  }

  // Update families with replaced IDs
  for (const fam of Object.values(families)) {
    if (fam.husb && idReplacements[fam.husb]) fam.husb = idReplacements[fam.husb];
    if (fam.wife && idReplacements[fam.wife]) fam.wife = idReplacements[fam.wife];
    fam.chil = fam.chil.map(childId => idReplacements[childId] || childId);
    // Remove duplicate children if any
    fam.chil = Array.from(new Set(fam.chil));
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
    const visitedAnc = new Set<string>();
    function doLayout(node: TreeNode | null, startY: number, baseX: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = baseX + Math.abs(node.generation) * GEN_WIDTH;
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayout(node.father, startY, baseX);
      const hM = doLayout(node.mother, startY + hF, baseX);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = baseX + Math.abs(node.generation) * GEN_WIDTH;
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    
    const hF = doLayout(root.father, 0, 0);
    const hM = doLayout(root.mother, hF, 0);
    root.x = 0;
    root.y = Math.max(hF + hM, BOX_HEIGHT) / 2;
    visitedAnc.add(root.id);

    let spouseY = hF + hM + SPACING_Y;
    for (const spouse of root.spouses) {
      spouse.x = 0;
      const shF = doLayout(spouse.father, spouseY, 0);
      const shM = doLayout(spouse.mother, spouseY + shF, 0);
      const spouseHeight = Math.max(shF + shM, BOX_HEIGHT + SPACING_Y);
      spouse.y = spouseY + spouseHeight / 2;
      spouseY += spouseHeight;
      visitedAnc.add(spouse.id);
    }

    const visitedDesc = new Set<string>();
    function calcDescendantHeight(node: TreeNode | null): number {
      if (!node || visitedDesc.has(node.id)) return node?.subtreeHeight || 0;
      visitedDesc.add(node.id);
      if (node.children.length === 0) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        return node.subtreeHeight;
      }
      let h = 0;
      for (const child of node.children) {
        h += calcDescendantHeight(child);
      }
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, h);
      return node.subtreeHeight;
    }
    
    const visitedDescLayout = new Set<string>();
    function doLayoutDescendants(node: TreeNode | null, startX: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalHeight = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_HEIGHT + SPACING_Y), 0);
      let currentY = node.y - totalHeight / 2;
      const nextX = startX - GEN_WIDTH;
      for (const child of node.children) {
        child.x = nextX;
        child.y = currentY + (child.subtreeHeight || BOX_HEIGHT + SPACING_Y) / 2;
        currentY += (child.subtreeHeight || BOX_HEIGHT + SPACING_Y);
        doLayoutDescendants(child, nextX);
      }
    }
    calcDescendantHeight(root);
    doLayoutDescendants(root, 0);
  } else if (mode === 'vertical') {
    const GEN_HEIGHT = BOX_HEIGHT + SPACING_Y; // Note: using SPACING_Y for height
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    
    const visitedAnc = new Set<string>();
    function doLayoutV(node: TreeNode | null, startX: number, baseY: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_WIDTH + SPACING_X; // Using subtreeHeight for width
        node.y = baseY - Math.abs(node.generation) * GEN_HEIGHT;
        node.x = startX + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const wF = doLayoutV(node.father, startX, baseY);
      const wM = doLayoutV(node.mother, startX + wF, baseY);
      node.subtreeHeight = Math.max(BOX_WIDTH + SPACING_X, wF + wM);
      node.y = baseY - Math.abs(node.generation) * GEN_HEIGHT;
      if (node.father && node.mother) node.x = (node.father.x + node.mother.x) / 2;
      else if (node.father) node.x = node.father.x;
      else if (node.mother) node.x = node.mother.x;
      else node.x = startX + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    
    const wF = doLayoutV(root.father, 0, 0);
    const wM = doLayoutV(root.mother, wF, 0);
    root.y = 0;
    root.x = Math.max(wF + wM, BOX_WIDTH) / 2;
    visitedAnc.add(root.id);

    let spouseX = wF + wM + SPACING_X;
    for (const spouse of root.spouses) {
      spouse.y = 0;
      const swF = doLayoutV(spouse.father, spouseX, 0);
      const swM = doLayoutV(spouse.mother, spouseX + swF, 0);
      const spouseWidth = Math.max(swF + swM, BOX_WIDTH + SPACING_X);
      spouse.x = spouseX + spouseWidth / 2;
      spouseX += spouseWidth;
      visitedAnc.add(spouse.id);
    }

    const visitedDesc = new Set<string>();
    function calcDescendantWidth(node: TreeNode | null): number {
      if (!node || visitedDesc.has(node.id)) return node?.subtreeHeight || 0;
      visitedDesc.add(node.id);
      if (node.children.length === 0) {
        node.subtreeHeight = BOX_WIDTH + SPACING_X;
        return node.subtreeHeight;
      }
      let w = 0;
      for (const child of node.children) {
        w += calcDescendantWidth(child);
      }
      node.subtreeHeight = Math.max(BOX_WIDTH + SPACING_X, w);
      return node.subtreeHeight;
    }
    
    const visitedDescLayout = new Set<string>();
    function doLayoutDescendantsV(node: TreeNode | null, startY: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalWidth = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_WIDTH + SPACING_X), 0);
      let currentX = node.x - totalWidth / 2;
      const nextY = startY + GEN_HEIGHT;
      for (const child of node.children) {
        child.y = nextY;
        child.x = currentX + (child.subtreeHeight || BOX_WIDTH + SPACING_X) / 2;
        currentX += (child.subtreeHeight || BOX_WIDTH + SPACING_X);
        doLayoutDescendantsV(child, nextY);
      }
    }
    calcDescendantWidth(root);
    doLayoutDescendantsV(root, 0);
  } else if (mode === 'butterfly') {
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    
    const visitedAnc = new Set<string>();
    function doLayoutB(node: TreeNode | null, startY: number, direction: -1 | 1, baseX: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = baseX + direction * (Math.abs(node.generation) * GEN_WIDTH);
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayoutB(node.father, startY, direction, baseX);
      const hM = doLayoutB(node.mother, startY + hF, direction, baseX);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = baseX + direction * (Math.abs(node.generation) * GEN_WIDTH);
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }

    // Root's ancestors to the left (-1)
    const hF = doLayoutB(root.father, 0, -1, 0);
    const hM = doLayoutB(root.mother, hF, -1, 0);
    root.x = 0;
    root.y = Math.max(hF + hM, BOX_HEIGHT) / 2;
    visitedAnc.add(root.id);

    // Spouses and their ancestors to the right (1)
    let spouseY = 0;
    for (let i = 0; i < root.spouses.length; i++) {
      const spouse = root.spouses[i];
      // Spouse is at generation 0, but we want them to the right of root
      spouse.x = GEN_WIDTH; 
      
      const shF = doLayoutB(spouse.father, spouseY, 1, GEN_WIDTH);
      const shM = doLayoutB(spouse.mother, spouseY + shF, 1, GEN_WIDTH);
      
      const spouseHeight = Math.max(shF + shM, BOX_HEIGHT + SPACING_Y);
      spouse.y = spouseY + spouseHeight / 2;
      spouseY += spouseHeight;
      visitedAnc.add(spouse.id);
    }

    // Descendants go down
    const GEN_HEIGHT = BOX_HEIGHT + SPACING_X;
    const visitedDesc = new Set<string>();
    function calcDescendantWidthB(node: TreeNode | null): number {
      if (!node || visitedDesc.has(node.id)) return node?.subtreeHeight || 0;
      visitedDesc.add(node.id);
      if (node.children.length === 0) {
        node.subtreeHeight = BOX_WIDTH + SPACING_Y;
        return node.subtreeHeight;
      }
      let w = 0;
      for (const child of node.children) {
        w += calcDescendantWidthB(child);
      }
      node.subtreeHeight = Math.max(BOX_WIDTH + SPACING_Y, w);
      return node.subtreeHeight;
    }
    
    const visitedDescLayout = new Set<string>();
    function doLayoutDescendantsB(node: TreeNode | null, startY: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalWidth = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_WIDTH + SPACING_Y), 0);
      let currentX = node.x - totalWidth / 2;
      const nextY = startY + GEN_HEIGHT;
      for (const child of node.children) {
        child.y = nextY;
        child.x = currentX + (child.subtreeHeight || BOX_WIDTH + SPACING_Y) / 2;
        currentX += (child.subtreeHeight || BOX_WIDTH + SPACING_Y);
        doLayoutDescendantsB(child, nextY);
      }
    }
    calcDescendantWidthB(root);
    // Start descendants below the lowest of root or spouses
    const maxRootY = Math.max(root.y, spouseY);
    doLayoutDescendantsB(root, maxRootY + SPACING_Y);
  } else if (mode === 'fan') {
    const RADIUS_STEP = 250;
    const visitedAnc = new Set<string>();
    
    // Helper to calculate number of leaves in ancestor tree to allocate angle proportionally
    function calcAncestorLeaves(node: TreeNode | null): number {
      if (!node) return 0;
      if (node.parents.length === 0) {
        node.subtreeHeight = 1;
        return 1;
      }
      let leaves = 0;
      for (const parent of node.parents) {
        leaves += calcAncestorLeaves(parent);
      }
      node.subtreeHeight = leaves;
      return leaves;
    }

    function doLayoutFan(node: TreeNode | null, angleStart: number, angleEnd: number, baseRadius: number) {
      if (!node || visitedAnc.has(node.id)) return;
      visitedAnc.add(node.id);
      const radius = baseRadius + Math.abs(node.generation) * RADIUS_STEP;
      const angle = (angleStart + angleEnd) / 2;
      node.x = Math.cos(angle) * radius;
      node.y = -Math.sin(angle) * radius;
      
      const totalLeaves = node.subtreeHeight || 1;
      let currentAngle = angleStart;
      for (let i = 0; i < node.parents.length; i++) {
        const parent = node.parents[i];
        const parentLeaves = parent.subtreeHeight || 1;
        const angleShare = (parentLeaves / totalLeaves) * (angleEnd - angleStart);
        doLayoutFan(parent, currentAngle, currentAngle + angleShare, baseRadius);
        currentAngle += angleShare;
      }
    }
    
    root.x = 0;
    root.y = 0;
    visitedAnc.add(root.id);
    
    calcAncestorLeaves(root);
    
    // Root's ancestors (Left: 90 to 270 degrees)
    const rootAngleStart = Math.PI / 2; // 90 deg
    const rootAngleEnd = (3 * Math.PI) / 2; // 270 deg
    const totalRootLeaves = root.parents.reduce((sum, p) => sum + (p.subtreeHeight || 1), 0) || 1;
    let currentRootAngle = rootAngleStart;
    
    for (let i = 0; i < root.parents.length; i++) {
      const parent = root.parents[i];
      const parentLeaves = parent.subtreeHeight || 1;
      const angleShare = (parentLeaves / totalRootLeaves) * (rootAngleEnd - rootAngleStart);
      doLayoutFan(parent, currentRootAngle, currentRootAngle + angleShare, 0);
      currentRootAngle += angleShare;
    }

    // Spouses and their ancestors (Right: -90 to 90 degrees)
    const spouseAngleStart = -Math.PI / 2; // -90 deg
    const spouseAngleEnd = Math.PI / 2;    // 90 deg
    const spouseSlice = (spouseAngleEnd - spouseAngleStart) / (root.spouses.length || 1);
    
    for (let i = 0; i < root.spouses.length; i++) {
      const spouse = root.spouses[i];
      visitedAnc.add(spouse.id);
      const sStart = spouseAngleStart + i * spouseSlice;
      const sEnd = spouseAngleStart + (i + 1) * spouseSlice;
      const sAngle = (sStart + sEnd) / 2;
      spouse.x = Math.cos(sAngle) * RADIUS_STEP;
      spouse.y = -Math.sin(sAngle) * RADIUS_STEP;
      
      calcAncestorLeaves(spouse);
      const totalSpouseLeaves = spouse.parents.reduce((sum, p) => sum + (p.subtreeHeight || 1), 0) || 1;
      let currentSpouseAngle = sStart;
      
      for (let j = 0; j < spouse.parents.length; j++) {
        const parent = spouse.parents[j];
        const parentLeaves = parent.subtreeHeight || 1;
        const angleShare = (parentLeaves / totalSpouseLeaves) * (sEnd - sStart);
        doLayoutFan(parent, currentSpouseAngle, currentSpouseAngle + angleShare, RADIUS_STEP);
        currentSpouseAngle += angleShare;
      }
    }

    // Descendants (Bottom: 210 to 330 degrees)
    const visitedDesc = new Set<string>();
    function calcDescendantLeaves(node: TreeNode | null): number {
      if (!node || visitedDesc.has(node.id)) return node?.subtreeHeight || 0;
      visitedDesc.add(node.id);
      if (node.children.length === 0) {
        node.subtreeHeight = 1;
        return 1;
      }
      let leaves = 0;
      for (const child of node.children) {
        leaves += calcDescendantLeaves(child);
      }
      node.subtreeHeight = leaves;
      return leaves;
    }
    
    const visitedDescLayout = new Set<string>();
    function doLayoutFanDescendants(node: TreeNode | null, angleStart: number, angleEnd: number, baseRadius: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const radius = baseRadius + RADIUS_STEP;
      const totalLeaves = node.subtreeHeight || 1;
      let currentAngle = angleStart;
      for (const child of node.children) {
        const childLeaves = child.subtreeHeight || 1;
        const angleShare = (childLeaves / totalLeaves) * (angleEnd - angleStart);
        const childAngle = currentAngle + angleShare / 2;
        child.x = Math.cos(childAngle) * radius;
        child.y = -Math.sin(childAngle) * radius;
        doLayoutFanDescendants(child, currentAngle, currentAngle + angleShare, radius);
        currentAngle += angleShare;
      }
    }
    calcDescendantLeaves(root);
    doLayoutFanDescendants(root, (7 * Math.PI) / 6, (11 * Math.PI) / 6, 0); // 210 to 330 deg
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

  function findEmptyCell(startX: number, startY: number, preferHorizontal: boolean): { x: number, y: number } {
    let radius = 0;
    while (radius < 50) { // Search up to 50 cells away
      // Check preferred direction first
      if (preferHorizontal) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) === radius) {
            const testX = startX + dx * CELL_W;
            const testY = startY;
            if (!occupied.has(getCell(testX, testY))) return { x: testX, y: testY };
          }
        }
      } else {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dy) === radius) {
            const testX = startX;
            const testY = startY + dy * CELL_H;
            if (!occupied.has(getCell(testX, testY))) return { x: testX, y: testY };
          }
        }
      }

      // Then check all other cells in radius
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
    
    // Process spouses first (prefer horizontal)
    for (const spouse of node.spouses) {
      if (!visited.has(spouse.id)) {
        visited.add(spouse.id);
        if (spouse.x === 0 && spouse.y === 0) {
          const pos = findEmptyCell(node.x, node.y, true);
          spouse.x = pos.x;
          spouse.y = pos.y;
          occupied.add(getCell(pos.x, pos.y));
        }
        queue.push(spouse);
      }
    }

    // Process children (prefer vertical down)
    for (const child of node.children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        if (child.x === 0 && child.y === 0) {
          const pos = findEmptyCell(node.x, node.y + CELL_H, false);
          child.x = pos.x;
          child.y = pos.y;
          occupied.add(getCell(pos.x, pos.y));
        }
        queue.push(child);
      }
    }

    // Process parents (prefer vertical up)
    for (const parent of node.parents) {
      if (!visited.has(parent.id)) {
        visited.add(parent.id);
        if (parent.x === 0 && parent.y === 0) {
          const pos = findEmptyCell(node.x, node.y - CELL_H, false);
          parent.x = pos.x;
          parent.y = pos.y;
          occupied.add(getCell(pos.x, pos.y));
        }
        queue.push(parent);
      }
    }
  }
}
