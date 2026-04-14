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

  const queue = [{id: rootId, gen: 0, role: 'root'}];
  visited.add(rootId);

  while (queue.length > 0) {
    const {id: currentId, gen, role} = queue.shift()!;
    const node = getOrCreateNode(currentId, gen);
    const indi = individuals[currentId];

    if (!indi) continue;

    for (const f of Object.values(families)) {
      if (f.chil.includes(currentId)) {
        if (gen < maxGen && (role === 'root' || role === 'ancestor' || role === 'root_spouse' || role === 'spouse_ancestor')) {
          const nextRole = (role === 'root' || role === 'ancestor') ? 'ancestor' : 'spouse_ancestor';
          if (f.husb) {
            const father = getOrCreateNode(f.husb, gen + 1);
            if (!node.parents.includes(father)) node.parents.push(father);
            if (!father.children.includes(node)) father.children.push(node);
            node.father = father;
            if (!visited.has(f.husb)) { visited.add(f.husb); queue.push({id: f.husb, gen: gen + 1, role: nextRole}); }
          }
          if (f.wife) {
            const mother = getOrCreateNode(f.wife, gen + 1);
            if (!node.parents.includes(mother)) node.parents.push(mother);
            if (!mother.children.includes(node)) mother.children.push(node);
            node.mother = mother;
            if (!visited.has(f.wife)) { visited.add(f.wife); queue.push({id: f.wife, gen: gen + 1, role: nextRole}); }
          }
        }
      }
      
      if (f.husb === currentId || f.wife === currentId) {
        const spouseId = f.husb === currentId ? f.wife : f.husb;
        if (spouseId) {
          if (role === 'root' || role === 'descendant') {
            const nextRole = role === 'root' ? 'root_spouse' : 'descendant';
            const spouse = getOrCreateNode(spouseId, gen);
            if (!node.spouses.includes(spouse)) node.spouses.push(spouse);
            if (!spouse.spouses.includes(node)) spouse.spouses.push(node);
            if (!visited.has(spouseId)) { visited.add(spouseId); queue.push({id: spouseId, gen, role: nextRole}); }
          }
        }
        if (gen > -maxGen && (role === 'root' || role === 'descendant' || role === 'root_spouse')) {
          for (const childId of f.chil) {
            const child = getOrCreateNode(childId, gen - 1);
            if (!node.children.includes(child)) node.children.push(child);
            if (!child.parents.includes(node)) child.parents.push(node);
            if (!visited.has(childId)) { visited.add(childId); queue.push({id: childId, gen: gen - 1, role: 'descendant'}); }
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
  
  // Reset all positions
  const resetQueue = [root];
  const resetVisited = new Set<string>();
  resetVisited.add(root.id);
  while(resetQueue.length > 0) {
    const n = resetQueue.shift()!;
    n.x = 0; n.y = 0; n.subtreeHeight = 0;
    for (const neighbor of [...n.parents, ...n.spouses, ...n.children]) {
      if (!resetVisited.has(neighbor.id)) {
        resetVisited.add(neighbor.id);
        resetQueue.push(neighbor);
      }
    }
  }

  if (mode === 'horizontal') {
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    const visitedAnc = new Set<string>();
    
    function doLayout(node: TreeNode | null, startY: number, currentX: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = currentX;
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayout(node.father, startY, currentX + GEN_WIDTH);
      const hM = doLayout(node.mother, startY + hF, currentX + GEN_WIDTH);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = currentX;
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    
    let currentY = 0;
    
    const hRF = doLayout(root.father, currentY, GEN_WIDTH);
    const hRM = doLayout(root.mother, currentY + hRF, GEN_WIDTH);
    const rootAncHeight = Math.max(hRF + hRM, BOX_HEIGHT + SPACING_Y);
    currentY += rootAncHeight;

    for (const spouse of root.spouses) {
      const hSF = doLayout(spouse.father, currentY, GEN_WIDTH);
      const hSM = doLayout(spouse.mother, currentY + hSF, GEN_WIDTH);
      const spouseAncHeight = Math.max(hSF + hSM, BOX_HEIGHT + SPACING_Y);
      currentY += spouseAncHeight;
    }

    // Cluster root and spouses in the center of the ancestor block
    const totalCenterNodes = 1 + root.spouses.length;
    const centerSpacing = BOX_HEIGHT + 20;
    const totalCenterHeight = totalCenterNodes * centerSpacing;
    
    let startCenterY = (currentY / 2) - (totalCenterHeight / 2) + (centerSpacing / 2);

    root.x = 0;
    root.y = startCenterY;
    visitedAnc.add(root.id);
    startCenterY += centerSpacing;

    for (const spouse of root.spouses) {
      spouse.x = 0;
      spouse.y = startCenterY;
      visitedAnc.add(spouse.id);
      startCenterY += centerSpacing;
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
    function doLayoutDescendants(node: TreeNode | null, startX: number, centerY: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalHeight = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_HEIGHT + SPACING_Y), 0);
      let currentChildY = centerY - totalHeight / 2;
      const nextX = startX - GEN_WIDTH;
      for (const child of node.children) {
        child.x = nextX;
        child.y = currentChildY + (child.subtreeHeight || BOX_HEIGHT + SPACING_Y) / 2;
        currentChildY += (child.subtreeHeight || BOX_HEIGHT + SPACING_Y);
        doLayoutDescendants(child, nextX, child.y);
      }
    }
    calcDescendantHeight(root);
    doLayoutDescendants(root, 0, root.y);
    
  } else if (mode === 'vertical') {
    const GEN_HEIGHT = BOX_HEIGHT + SPACING_Y;
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    const visitedAnc = new Set<string>();
    
    function doLayoutV(node: TreeNode | null, startX: number, currentY: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_WIDTH + SPACING_X;
        node.y = currentY;
        node.x = startX + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const wF = doLayoutV(node.father, startX, currentY - GEN_HEIGHT);
      const wM = doLayoutV(node.mother, startX + wF, currentY - GEN_HEIGHT);
      node.subtreeHeight = Math.max(BOX_WIDTH + SPACING_X, wF + wM);
      node.y = currentY;
      if (node.father && node.mother) node.x = (node.father.x + node.mother.x) / 2;
      else if (node.father) node.x = node.father.x;
      else if (node.mother) node.x = node.mother.x;
      else node.x = startX + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }
    
    let currentX = 0;
    
    const wRF = doLayoutV(root.father, currentX, -GEN_HEIGHT);
    const wRM = doLayoutV(root.mother, currentX + wRF, -GEN_HEIGHT);
    const rootAncWidth = Math.max(wRF + wRM, BOX_WIDTH + SPACING_X);
    currentX += rootAncWidth;

    for (const spouse of root.spouses) {
      const wSF = doLayoutV(spouse.father, currentX, -GEN_HEIGHT);
      const wSM = doLayoutV(spouse.mother, currentX + wSF, -GEN_HEIGHT);
      const spouseAncWidth = Math.max(wSF + wSM, BOX_WIDTH + SPACING_X);
      currentX += spouseAncWidth;
    }

    // Cluster root and spouses in the center of the ancestor block
    const totalCenterNodes = 1 + root.spouses.length;
    const centerSpacing = BOX_WIDTH + 20;
    const totalCenterWidth = totalCenterNodes * centerSpacing;
    
    let startCenterX = (currentX / 2) - (totalCenterWidth / 2) + (centerSpacing / 2);

    root.y = 0;
    root.x = startCenterX;
    visitedAnc.add(root.id);
    startCenterX += centerSpacing;

    for (const spouse of root.spouses) {
      spouse.y = 0;
      spouse.x = startCenterX;
      visitedAnc.add(spouse.id);
      startCenterX += centerSpacing;
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
    function doLayoutDescendantsV(node: TreeNode | null, startY: number, centerX: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalWidth = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_WIDTH + SPACING_X), 0);
      let currentChildX = centerX - totalWidth / 2;
      const nextY = startY + GEN_HEIGHT;
      for (const child of node.children) {
        child.y = nextY;
        child.x = currentChildX + (child.subtreeHeight || BOX_WIDTH + SPACING_X) / 2;
        currentChildX += (child.subtreeHeight || BOX_WIDTH + SPACING_X);
        doLayoutDescendantsV(child, nextY, child.x);
      }
    }
    calcDescendantWidth(root);
    doLayoutDescendantsV(root, 0, root.x);
    
  } else if (mode === 'butterfly') {
    const GEN_WIDTH = BOX_WIDTH + SPACING_X;
    const visitedAnc = new Set<string>();
    
    function doLayoutB(node: TreeNode | null, startY: number, direction: -1 | 1, currentX: number): number {
      if (!node || visitedAnc.has(node.id)) return node?.subtreeHeight || 0;
      visitedAnc.add(node.id);
      if (!node.father && !node.mother) {
        node.subtreeHeight = BOX_HEIGHT + SPACING_Y;
        node.x = currentX;
        node.y = startY + node.subtreeHeight / 2;
        return node.subtreeHeight;
      }
      const hF = doLayoutB(node.father, startY, direction, currentX + direction * GEN_WIDTH);
      const hM = doLayoutB(node.mother, startY + hF, direction, currentX + direction * GEN_WIDTH);
      node.subtreeHeight = Math.max(BOX_HEIGHT + SPACING_Y, hF + hM);
      node.x = currentX;
      if (node.father && node.mother) node.y = (node.father.y + node.mother.y) / 2;
      else if (node.father) node.y = node.father.y;
      else if (node.mother) node.y = node.mother.y;
      else node.y = startY + node.subtreeHeight / 2;
      return node.subtreeHeight;
    }

    const ROOT_X = -(BOX_WIDTH / 2 + 20);
    const SPOUSE_X = (BOX_WIDTH / 2 + 20);

    const hRF = doLayoutB(root.father, 0, -1, ROOT_X - GEN_WIDTH);
    const hRM = doLayoutB(root.mother, hRF, -1, ROOT_X - GEN_WIDTH);
    const rootAncHeight = Math.max(hRF + hRM, BOX_HEIGHT + SPACING_Y);
    
    root.x = ROOT_X;
    root.y = rootAncHeight / 2;
    visitedAnc.add(root.id);

    let spouseY = 0;
    for (let i = 0; i < root.spouses.length; i++) {
      const spouse = root.spouses[i];
      const shF = doLayoutB(spouse.father, spouseY, 1, SPOUSE_X + GEN_WIDTH);
      const shM = doLayoutB(spouse.mother, spouseY + shF, 1, SPOUSE_X + GEN_WIDTH);
      const spouseAncHeight = Math.max(shF + shM, BOX_HEIGHT + SPACING_Y);
      
      spouse.x = SPOUSE_X;
      spouse.y = spouseY + spouseAncHeight / 2;
      spouseY += spouseAncHeight;
      visitedAnc.add(spouse.id);
    }

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
    function doLayoutDescendantsB(node: TreeNode | null, startY: number, centerX: number) {
      if (!node || node.children.length === 0 || visitedDescLayout.has(node.id)) return;
      visitedDescLayout.add(node.id);
      const totalWidth = node.children.reduce((sum, c) => sum + (c.subtreeHeight || BOX_WIDTH + SPACING_Y), 0);
      let currentChildX = centerX - totalWidth / 2;
      const nextY = startY + GEN_HEIGHT;
      for (const child of node.children) {
        child.y = nextY;
        child.x = currentChildX + (child.subtreeHeight || BOX_WIDTH + SPACING_Y) / 2;
        currentChildX += (child.subtreeHeight || BOX_WIDTH + SPACING_Y);
        doLayoutDescendantsB(child, nextY, child.x);
      }
    }
    calcDescendantWidthB(root);
    const maxRootY = Math.max(rootAncHeight, spouseY);
    doLayoutDescendantsB(root, maxRootY + SPACING_Y, 0);
    
  } else if (mode === 'fan') {
    const RADIUS_STEP = 250;
    const visitedAnc = new Set<string>();
    const visitedAncLeaves = new Set<string>();
    
    function calcAncestorLeaves(node: TreeNode | null): number {
      if (!node || visitedAncLeaves.has(node.id)) return node?.subtreeHeight || 0;
      visitedAncLeaves.add(node.id);
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

    function doLayoutFan(node: TreeNode | null, angleStart: number, angleEnd: number, radius: number) {
      if (!node || visitedAnc.has(node.id)) return;
      visitedAnc.add(node.id);
      const angle = (angleStart + angleEnd) / 2;
      node.x = Math.cos(angle) * radius;
      node.y = -Math.sin(angle) * radius;
      
      const totalLeaves = node.subtreeHeight || 1;
      let currentAngle = angleStart;
      for (let i = 0; i < node.parents.length; i++) {
        const parent = node.parents[i];
        const parentLeaves = parent.subtreeHeight || 1;
        const angleShare = (parentLeaves / totalLeaves) * (angleEnd - angleStart);
        doLayoutFan(parent, currentAngle, currentAngle + angleShare, radius + RADIUS_STEP);
        currentAngle += angleShare;
      }
    }
    
    // Spouses and their ancestors (Right: 0 to 90 degrees)
    const spouseAngleStart = 0; // 0 deg
    const spouseAngleEnd = Math.PI / 2; // 90 deg
    const spouseSlice = (spouseAngleEnd - spouseAngleStart) / (root.spouses.length || 1);
    
    // Calculate total width needed for root + spouses
    const totalCenterNodes = 1 + root.spouses.length;
    const centerSpacing = BOX_WIDTH + 20;
    const startX = -((totalCenterNodes - 1) * centerSpacing) / 2;

    root.x = startX;
    root.y = 0;
    visitedAnc.add(root.id);
    
    calcAncestorLeaves(root);
    
    // Root's ancestors (Left: 90 to 180 degrees)
    const rootAngleStart = Math.PI / 2; // 90 deg
    const rootAngleEnd = Math.PI; // 180 deg
    const totalRootLeaves = root.parents.reduce((sum, p) => sum + (p.subtreeHeight || 1), 0) || 1;
    let currentRootAngle = rootAngleStart;
    
    for (let i = 0; i < root.parents.length; i++) {
      const parent = root.parents[i];
      const parentLeaves = parent.subtreeHeight || 1;
      const angleShare = (parentLeaves / totalRootLeaves) * (rootAngleEnd - rootAngleStart);
      doLayoutFan(parent, currentRootAngle, currentRootAngle + angleShare, RADIUS_STEP);
      currentRootAngle += angleShare;
    }

    for (let i = 0; i < root.spouses.length; i++) {
      const spouse = root.spouses[i];
      visitedAnc.add(spouse.id);
      spouse.x = startX + (i + 1) * centerSpacing;
      spouse.y = 0;
      
      const sStart = spouseAngleStart + i * spouseSlice;
      const sEnd = spouseAngleStart + (i + 1) * spouseSlice;
      
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

    // Descendants (Bottom: 180 to 360 degrees)
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
    doLayoutFanDescendants(root, Math.PI, 2 * Math.PI, 0); // 180 to 360 deg
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
