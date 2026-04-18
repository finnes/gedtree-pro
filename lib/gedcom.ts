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

export function normalizeName(name: string): string {
  if (!name || name === 'Desconhecido') return name;
  let norm = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (norm === 'antonio castanho manzini') norm = 'antonia castanho manzini';
  if (norm.startsWith('lea manzini')) norm = 'lea manzini gontijo da costa';
  return norm;
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
    
    let normName = normalizeName(indi.name);

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

export function namespaceParsedGedcom(parsed: ParsedGedcom, prefix: string): ParsedGedcom {
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};

  for (const [id, ind] of Object.entries(parsed.individuals)) {
    individuals[`${prefix}_${id}`] = {
      ...ind,
      id: `${prefix}_${id}`,
      famc: ind.famc.map(fId => `${prefix}_${fId}`)
    };
  }

  for (const [id, fam] of Object.entries(parsed.families)) {
    families[`${prefix}_${id}`] = {
      ...fam,
      id: `${prefix}_${id}`,
      husb: fam.husb ? `${prefix}_${fam.husb}` : null,
      wife: fam.wife ? `${prefix}_${fam.wife}` : null,
      chil: fam.chil.map(cId => `${prefix}_${cId}`)
    };
  }

  return { individuals, families };
}

export function mergeParsedGedcoms(parsedList: ParsedGedcom[]): ParsedGedcom {
  if (parsedList.length === 0) return { individuals: {}, families: {} };
  if (parsedList.length === 1) return parsedList[0];

  const mergedIndividuals: Record<string, Individual> = {};
  const mergedFamilies: Record<string, Family> = {};

  // First, namespace and merge everything blindly
  parsedList.forEach((parsed, index) => {
    const namespaced = namespaceParsedGedcom(parsed, `f${index}`);
    Object.assign(mergedIndividuals, namespaced.individuals);
    Object.assign(mergedFamilies, namespaced.families);
  });

  // Now perform deduplication akin to parseGedcom
  const nameMap = new Map<string, string[]>();
  const idReplacements: Record<string, string> = {};

  for (const [id, indi] of Object.entries(mergedIndividuals)) {
    if (!indi.name || indi.name === 'Desconhecido') continue;
    
    let normName = normalizeName(indi.name);

    if (!nameMap.has(normName)) nameMap.set(normName, []);
    nameMap.get(normName)!.push(id);
  }

  for (const [normName, ids] of nameMap.entries()) {
    if (ids.length > 1) {
      ids.sort((a, b) => {
        const scoreA = (mergedIndividuals[a].birth ? 1 : 0) + (mergedIndividuals[a].famc?.length || 0);
        const scoreB = (mergedIndividuals[b].birth ? 1 : 0) + (mergedIndividuals[b].famc?.length || 0);
        return scoreB - scoreA;
      });

      const primaryId = ids[0];
      const primary = mergedIndividuals[primaryId];

      for (let i = 1; i < ids.length; i++) {
        const dupId = ids[i];
        const dup = mergedIndividuals[dupId];

        idReplacements[dupId] = primaryId;

        // Merge data
        if (!primary.birth && dup.birth) primary.birth = dup.birth;
        if (!primary.death && dup.death) primary.death = dup.death;
        if (dup.famc && dup.famc.length > 0) {
          primary.famc = Array.from(new Set([...(primary.famc || []), ...dup.famc]));
        }

        delete mergedIndividuals[dupId];
      }
    }
  }

  // Update families with replaced IDs
  for (const fam of Object.values(mergedFamilies)) {
    if (fam.husb && idReplacements[fam.husb]) fam.husb = idReplacements[fam.husb];
    if (fam.wife && idReplacements[fam.wife]) fam.wife = idReplacements[fam.wife];
    fam.chil = fam.chil.map(childId => idReplacements[childId] || childId);
    fam.chil = Array.from(new Set(fam.chil));
  }

  function areNamesSimilar(n1: string, n2: string) {
    if (!n1 || !n2) return true;
    if (n1 === 'Desconhecido' || n2 === 'Desconhecido') return true;
    let norm1 = normalizeName(n1);
    let norm2 = normalizeName(n2);
    if (norm1 === norm2) return true;
    
    const parts1 = norm1.split(' ');
    const parts2 = norm2.split(' ');
    if (parts1[0] && parts2[0] && parts1[0] === parts2[0]) {
       // Check if they share any other word in the name
       const set2 = new Set(parts2.slice(1));
       let shared = 0;
       for (const w of parts1.slice(1)) {
          if (set2.has(w) && w.length > 2) shared++;
       }
       if (shared > 0) return true;
       
       if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
       
       if (parts1.length === 1 || parts2.length === 1) return true;
    }
    return false;
  }

  // SECOND PASS: Context-based individual deduplication
  let madeChanges = true;
  while (madeChanges) {
    madeChanges = false;
    
    const husbToFamilies = new Map<string, string[]>();
    const wifeToFamilies = new Map<string, string[]>();
    for (const [fId, fam] of Object.entries(mergedFamilies)) {
      if (fam.husb) {
        if (!husbToFamilies.has(fam.husb)) husbToFamilies.set(fam.husb, []);
        husbToFamilies.get(fam.husb)!.push(fId);
      }
      if (fam.wife) {
        if (!wifeToFamilies.has(fam.wife)) wifeToFamilies.set(fam.wife, []);
        wifeToFamilies.get(fam.wife)!.push(fId);
      }
    }

    const mergeIndividualPair = (id1: string, id2: string) => {
       const score1 = (mergedIndividuals[id1].birth ? 1 : 0) + (mergedIndividuals[id1].famc?.length || 0);
       const score2 = (mergedIndividuals[id2].birth ? 1 : 0) + (mergedIndividuals[id2].famc?.length || 0);
       const primaryId = score1 >= score2 ? id1 : id2;
       const dupId = score1 >= score2 ? id2 : id1;
       
       const primary = mergedIndividuals[primaryId];
       const dup = mergedIndividuals[dupId];
       
       if (!primary.birth && dup.birth) primary.birth = dup.birth;
       if (!primary.death && dup.death) primary.death = dup.death;
       if (dup.famc && dup.famc.length > 0) {
         primary.famc = Array.from(new Set([...(primary.famc || []), ...dup.famc]));
       }
       if (primary.name === 'Desconhecido' && dup.name !== 'Desconhecido') primary.name = dup.name;
       else if (primary.name.length < dup.name.length && dup.name !== 'Desconhecido') primary.name = dup.name; 
       
       delete mergedIndividuals[dupId];
       
       for (const fam of Object.values(mergedFamilies)) {
         if (fam.husb === dupId) fam.husb = primaryId;
         if (fam.wife === dupId) fam.wife = primaryId;
         fam.chil = fam.chil.map(childId => childId === dupId ? primaryId : childId);
         fam.chil = Array.from(new Set(fam.chil));
       }
       madeChanges = true;
    };

    for (const [husbId, fIds] of husbToFamilies.entries()) {
      if (fIds.length > 1) {
         for (let i = 0; i < fIds.length; i++) {
           for (let j = i + 1; j < fIds.length; j++) {
              const w1 = mergedFamilies[fIds[i]]?.wife;
              const w2 = mergedFamilies[fIds[j]]?.wife;
              if (w1 && w2 && w1 !== w2 && mergedIndividuals[w1] && mergedIndividuals[w2]) {
                 if (areNamesSimilar(mergedIndividuals[w1].name, mergedIndividuals[w2].name)) {
                   mergeIndividualPair(w1, w2);
                   break;
                 }
              }
           }
           if (madeChanges) break;
         }
      }
      if (madeChanges) break;
    }
    
    if (madeChanges) continue;
    
    for (const [wifeId, fIds] of wifeToFamilies.entries()) {
      if (fIds.length > 1) {
         for (let i = 0; i < fIds.length; i++) {
           for (let j = i + 1; j < fIds.length; j++) {
              const h1 = mergedFamilies[fIds[i]]?.husb;
              const h2 = mergedFamilies[fIds[j]]?.husb;
              if (h1 && h2 && h1 !== h2 && mergedIndividuals[h1] && mergedIndividuals[h2]) {
                 if (areNamesSimilar(mergedIndividuals[h1].name, mergedIndividuals[h2].name)) {
                   mergeIndividualPair(h1, h2);
                   break;
                 }
              }
           }
           if (madeChanges) break;
         }
      }
      if (madeChanges) break;
    }
  }

  // Deduplicate families (couples)
  // Clean identical or partial families
  let familyChanged = true;
  while(familyChanged) {
    familyChanged = false;
    const fKeys = Object.keys(mergedFamilies);
    for (let i = 0; i < fKeys.length; i++) {
       for (let j = i + 1; j < fKeys.length; j++) {
          const f1 = mergedFamilies[fKeys[i]];
          const f2 = mergedFamilies[fKeys[j]];
          if (!f1 || !f2) continue;
          
          const sameHusb = f1.husb === f2.husb && f1.husb !== null;
          const sameWife = f1.wife === f2.wife && f1.wife !== null;
          
          if ((sameHusb && sameWife) || (sameHusb && (!f1.wife || !f2.wife)) || (sameWife && (!f1.husb || !f2.husb))) {
             if (f2.wife) f1.wife = f2.wife;
             if (f2.husb) f1.husb = f2.husb;
             f1.chil = Array.from(new Set([...f1.chil, ...f2.chil]));
             
             const targetFid = fKeys[i];
             const deadFid = fKeys[j];
             for (const indi of Object.values(mergedIndividuals)) {
               if (indi.famc && indi.famc.includes(deadFid)) {
                 indi.famc = indi.famc.map(id => id === deadFid ? targetFid : id);
                 indi.famc = Array.from(new Set(indi.famc));
               }
             }
             delete mergedFamilies[deadFid];
             familyChanged = true;
             break;
          }
       }
       if (familyChanged) break;
    }
  }

  return { individuals: mergedIndividuals, families: mergedFamilies };
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
    (n as any).logicalY = 0;
    (n as any).ancUnits = 0;
    (n as any).descUnits = 0;
    for (const neighbor of [...n.parents, ...n.spouses, ...n.children]) {
      if (!resetVisited.has(neighbor.id)) {
        resetVisited.add(neighbor.id);
        resetQueue.push(neighbor);
      }
    }
  }

  // Unified Logical Layout
  const visitedAnc = new Set<string>();
  function calcAncUnits(node: TreeNode | null): number {
    if (!node) return 0;
    if ((node as any).ancUnits) return (node as any).ancUnits;
    if (visitedAnc.has(node.id)) return 1;
    visitedAnc.add(node.id);
    const fU = calcAncUnits(node.father);
    const mU = calcAncUnits(node.mother);
    // Reserve space for the node itself and any extra spouses it might have
    const extraSpouses = Math.max(0, node.spouses.length - 1);
    const units = Math.max(1 + extraSpouses, fU + mU + extraSpouses);
    (node as any).ancUnits = units;
    return units;
  }
  calcAncUnits(root);
  for (const spouse of root.spouses) {
    calcAncUnits(spouse);
  }

  const visitedDesc = new Set<string>();
  function calcDescUnits(node: TreeNode | null): number {
    if (!node) return 0;
    if ((node as any).descUnits) return (node as any).descUnits;
    if (visitedDesc.has(node.id)) return 1;
    visitedDesc.add(node.id);
    
    const allChildren = new Set<TreeNode>();
    for (const c of node.children) allChildren.add(c);
    for (const s of node.spouses) {
      for (const c of s.children) allChildren.add(c);
    }
    
    let childrenU = 0;
    for (const child of Array.from(allChildren)) {
      childrenU += calcDescUnits(child);
    }
    
    const nodesInFamily = [node, ...node.spouses];
    const familyU = nodesInFamily.reduce((sum, n) => sum + Math.max(1, calcAncUnits(n)), 0);
    
    const units = Math.max(familyU, childrenU);
    (node as any).descUnits = units;
    return units;
  }
  calcDescUnits(root);

  const visitedAncLayout = new Set<string>();
  function layoutAncLogical(node: TreeNode, nodeY: number, minY: number, maxY: number) {
    if (visitedAncLayout.has(node.id)) return;
    visitedAncLayout.add(node.id);
    (node as any).logicalY = nodeY;
    
    const fU = node.father ? (node.father as any).ancUnits : 0;
    const mU = node.mother ? (node.mother as any).ancUnits : 0;
    const totalU = fU + mU;
    
    if (totalU > 0) {
      if (node.father && node.mother) {
        // Flawless math to keep couples exactly 1 unit apart while respecting their required space
        const B = (minY + fU + maxY - mU) / 2;
        layoutAncLogical(node.father, B - 0.5, minY, B);
        layoutAncLogical(node.mother, B + 0.5, B, maxY);
      } else if (node.father) {
        layoutAncLogical(node.father, (minY + maxY) / 2, minY, maxY);
      } else if (node.mother) {
        layoutAncLogical(node.mother, (minY + maxY) / 2, minY, maxY);
      }
    }
  }

  const visitedDescLayout = new Set<string>();
  function layoutDescLogical(node: TreeNode, nodeY: number, minY: number, maxY: number) {
    if (visitedDescLayout.has(node.id)) return;
    visitedDescLayout.add(node.id);

    const nodesInFamily = [node, ...node.spouses];
    
    // 1. Spouses should be physically close (1 unit apart)
    const familyVisualHeight = nodesInFamily.length;
    let currentVisualY = nodeY - familyVisualHeight / 2;
    
    // 2. Ancestors need their full logical space
    const totalAncUnits = nodesInFamily.reduce((sum, n) => sum + Math.max(1, (n as any).ancUnits || 1), 0);
    let currentAncMinY = nodeY - totalAncUnits / 2;

    for (let i = 0; i < nodesInFamily.length; i++) {
      const n = nodesInFamily[i];
      
      (n as any).logicalY = currentVisualY + 0.5;
      currentVisualY += 1;
      
      const ancU = Math.max(1, (n as any).ancUnits || 1);
      const ancMaxY = currentAncMinY + ancU;
      
      if (n.father && n.mother) {
        const fU = (n.father as any).ancUnits || 0;
        const mU = (n.mother as any).ancUnits || 0;
        const B = (currentAncMinY + fU + ancMaxY - mU) / 2;
        layoutAncLogical(n.father, B - 0.5, currentAncMinY, B);
        layoutAncLogical(n.mother, B + 0.5, B, ancMaxY);
      } else if (n.father) {
        layoutAncLogical(n.father, (currentAncMinY + ancMaxY) / 2, currentAncMinY, ancMaxY);
      } else if (n.mother) {
        layoutAncLogical(n.mother, (currentAncMinY + ancMaxY) / 2, currentAncMinY, ancMaxY);
      }
      
      currentAncMinY = ancMaxY;
    }
    
    const allChildren = new Set<TreeNode>();
    for (const c of node.children) allChildren.add(c);
    for (const s of node.spouses) {
      for (const c of s.children) allChildren.add(c);
    }
    const childrenArray = Array.from(allChildren);
    
    if (childrenArray.length > 0) {
      const totalChildrenU = childrenArray.reduce((sum, c) => sum + ((c as any).descUnits || 1), 0);
      
      // Pack children tightly in the center of the allocated space
      const center = (minY + maxY) / 2;
      let currentMinY = center - totalChildrenU / 2;
      
      for (const child of childrenArray) {
        const cU = (child as any).descUnits || 1;
        const cMaxY = currentMinY + cU;
        
        const cMidY = currentMinY + cU / 2;
        layoutDescLogical(child, cMidY, currentMinY, cMaxY);
        
        currentMinY = cMaxY;
      }
    }
  }

  const totalDescU = calcDescUnits(root);
  layoutDescLogical(root, 0, -totalDescU/2, totalDescU/2);

  // Collect all nodes
  const allNodes: TreeNode[] = [];
  const q = [root];
  const visitedNodes = new Set<string>();
  visitedNodes.add(root.id);
  while(q.length > 0) {
    const n = q.shift()!;
    allNodes.push(n);
    for (const neighbor of [...n.parents, ...n.spouses, ...n.children]) {
      if (!visitedNodes.has(neighbor.id)) {
        visitedNodes.add(neighbor.id);
        q.push(neighbor);
      }
    }
  }

  // Safety net: assign logicalY to any nodes that were missed (e.g. spouses of ancestors)
  let maxLogicalY = 0;
  for (const n of allNodes) {
    if ((n as any).logicalY !== undefined) {
      maxLogicalY = Math.max(maxLogicalY, (n as any).logicalY);
    }
  }
  
  // First pass: try to place missed nodes near their spouses
  for (const n of allNodes) {
    if ((n as any).logicalY !== undefined) {
      for (const s of n.spouses) {
        if ((s as any).logicalY === undefined) {
          let offset = 0.8;
          let placed = false;
          while (!placed && offset < 10) {
            const posRight = (n as any).logicalY + offset;
            const posLeft = (n as any).logicalY - offset;
            
            const rightOccupied = allNodes.some(x => x.generation === s.generation && Math.abs(((x as any).logicalY || -999) - posRight) < 0.4);
            if (!rightOccupied) {
              (s as any).logicalY = posRight;
              placed = true;
              break;
            }
            
            const leftOccupied = allNodes.some(x => x.generation === s.generation && Math.abs(((x as any).logicalY || -999) - posLeft) < 0.4);
            if (!leftOccupied) {
              (s as any).logicalY = posLeft;
              placed = true;
              break;
            }
            offset += 0.8;
          }
          if (!placed) {
            (s as any).logicalY = (n as any).logicalY + 0.8;
          }
        }
      }
    }
  }
  
  // Second pass: place any remaining missed nodes at the bottom
  for (const n of allNodes) {
    if ((n as any).logicalY === undefined) {
      maxLogicalY += 1;
      (n as any).logicalY = maxLogicalY;
    }
  }

  // Map logical coordinates to physical coordinates based on mode
  if (mode === 'horizontal') {
    for (const n of allNodes) {
      n.x = n.generation * (BOX_WIDTH + SPACING_X);
      n.y = (n as any).logicalY * (BOX_HEIGHT + SPACING_Y);
    }
  } else if (mode === 'butterfly') {
    // Determine paternal and maternal sides
    const leftSide = new Set<string>();
    const rightSide = new Set<string>();
    
    // Root's ancestors go Left
    const qLeft = [...root.parents];
    for (const p of root.parents) leftSide.add(p.id);
    while(qLeft.length > 0) {
      const curr = qLeft.shift()!;
      if (curr.father && !leftSide.has(curr.father.id)) {
        leftSide.add(curr.father.id);
        qLeft.push(curr.father);
      }
      if (curr.mother && !leftSide.has(curr.mother.id)) {
        leftSide.add(curr.mother.id);
        qLeft.push(curr.mother);
      }
    }
    
    // Spouses' ancestors go Right
    const qRight: TreeNode[] = [];
    for (const spouse of root.spouses) {
      for (const p of spouse.parents) {
        if (!rightSide.has(p.id)) {
          rightSide.add(p.id);
          qRight.push(p);
        }
      }
    }
    while(qRight.length > 0) {
      const curr = qRight.shift()!;
      if (curr.father && !rightSide.has(curr.father.id)) {
        rightSide.add(curr.father.id);
        qRight.push(curr.father);
      }
      if (curr.mother && !rightSide.has(curr.mother.id)) {
        rightSide.add(curr.mother.id);
        qRight.push(curr.mother);
      }
    }

    for (const n of allNodes) {
      if (n.generation > 0) {
        if (leftSide.has(n.id)) {
          n.x = -n.generation * (BOX_WIDTH + SPACING_X);
          n.y = (n as any).logicalY * (BOX_HEIGHT + SPACING_Y);
        } else if (rightSide.has(n.id)) {
          n.x = n.generation * (BOX_WIDTH + SPACING_X);
          n.y = (n as any).logicalY * (BOX_HEIGHT + SPACING_Y);
        } else {
          n.x = -n.generation * (BOX_WIDTH + SPACING_X);
          n.y = (n as any).logicalY * (BOX_HEIGHT + SPACING_Y);
        }
      } else if (n.generation < 0) {
        n.x = (n as any).logicalY * (BOX_WIDTH + SPACING_X);
        n.y = -n.generation * (BOX_HEIGHT + SPACING_Y);
      } else {
        n.x = 0;
        n.y = (n as any).logicalY * (BOX_HEIGHT + SPACING_Y);
      }
    }
  } else if (mode === 'vertical') {
    for (const n of allNodes) {
      n.x = (n as any).logicalY * (BOX_WIDTH + SPACING_X);
      n.y = -n.generation * (BOX_HEIGHT + SPACING_Y);
    }
  } else if (mode === 'fan') {
    const ancNodes = allNodes.filter(n => n.generation > 0);
    const descNodes = allNodes.filter(n => n.generation < 0);
    
    let ancMinY = 0, ancMaxY = 0;
    if (ancNodes.length > 0) {
      ancMinY = Math.min(...ancNodes.map(n => (n as any).logicalY));
      ancMaxY = Math.max(...ancNodes.map(n => (n as any).logicalY));
    }
    const ancRange = ancMaxY - ancMinY || 1;
    
    let descMinY = 0, descMaxY = 0;
    if (descNodes.length > 0) {
      descMinY = Math.min(...descNodes.map(n => (n as any).logicalY));
      descMaxY = Math.max(...descNodes.map(n => (n as any).logicalY));
    }
    const descRange = descMaxY - descMinY || 1;

    let maxGen = 0;
    for (const n of allNodes) maxGen = Math.max(maxGen, Math.abs(n.generation));
    
    let RADIUS_STEP = 350;
    for (let g = 1; g <= maxGen; g++) {
      const requiredStep = (80 * Math.max(ancRange, descRange)) / (Math.PI * g);
      if (requiredStep > RADIUS_STEP) {
        RADIUS_STEP = requiredStep;
      }
    }
    
    for (const n of allNodes) {
      let radiusOffset = 0;
      
      if (n.generation > 0) {
        const isMother = n.children.some(c => c.mother?.id === n.id);
        if (isMother) radiusOffset = 65;
      } else if (n.spouses.length > 0) {
        const group = [n, ...n.spouses].sort((a, b) => a.id.localeCompare(b.id));
        const idx = group.indexOf(n);
        radiusOffset = idx * 65; // Offset spouses radially to prevent overlap
      }
      
      const radius = Math.abs(n.generation) * RADIUS_STEP + radiusOffset;
      
      if (n.generation > 0) {
        let angle = Math.PI / 2;
        if (ancMaxY > ancMinY) {
          angle = 0.05 * Math.PI + (((n as any).logicalY - ancMinY) / ancRange) * 0.9 * Math.PI;
        }
        n.x = Math.cos(angle) * radius;
        n.y = -Math.sin(angle) * radius;
      } else if (n.generation < 0) {
        let angle = 1.5 * Math.PI;
        if (descMaxY > descMinY) {
          angle = 1.05 * Math.PI + (((n as any).logicalY - descMinY) / descRange) * 0.9 * Math.PI;
        }
        n.x = Math.cos(angle) * radius;
        n.y = -Math.sin(angle) * radius;
      } else {
        // Generation 0 (Root and spouses)
        // In Fan layout, place them in the center but offset horizontally to prevent overlap
        const group = [n, ...n.spouses].sort((a, b) => a.id.localeCompare(b.id));
        const idx = group.indexOf(n);
        const total = group.length;
        n.x = (idx - (total - 1) / 2) * (BOX_WIDTH + 20);
        n.y = 0;
      }
    }
  }
}
