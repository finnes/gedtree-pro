import { mergeParsedGedcoms } from './lib/gedcom';
import fs from 'fs';

const g1 = {
  individuals: {
    "I1": { id: "I1", name: "Samuel Manzini Gontijo da Costa", birth: "3 JUL 1979", death: "", famc: [] },
    "I2": { id: "I2", name: "Débora Pusebon da Costa", birth: "14 JAN 198", death: "", famc: [] }
  },
  families: {
    "F1": { id: "F1", husb: "I1", wife: "I2", chil: [] }
  }
};

const g2 = {
  individuals: {
    "I1": { id: "I1", name: "Samuel Manzini Gontijo da Costa", birth: "3 JUL 1979", death: "", famc: [] },
    "I2": { id: "I2", name: "Débora Donaduzzi Pusebon", birth: "14 JAN 198", death: "", famc: ["F2"] },
    "I3": { id: "I3", name: "Sergio Luiz Pusebon", birth: "4 JUL 1968", death: "", famc: [] },
    "I4": { id: "I4", name: "Marisa Salete Donaduzzi Pusebon", birth: "25 JAN 209", death: "", famc: [] }
  },
  families: {
    "F1": { id: "F1", husb: "I1", wife: "I2", chil: [] },
    "F2": { id: "F2", husb: "I3", wife: "I4", chil: ["I2"] }
  }
};

const merged = mergeParsedGedcoms([g1 as any, g2 as any]);
console.log(Object.keys(merged.individuals).map(k => merged.individuals[k].name));
