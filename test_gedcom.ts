import { mergeParsedGedcoms } from './lib/gedcom';

const g1 = {
  individuals: {
    "I1": { id: "I1", name: "Samuel", birth: "", death: "", famc: [] },
    "I2": { id: "I2", name: "Debora Pusebon da Costa", birth: "", death: "", famc: [] }
  },
  families: {
    "F1": { id: "F1", husb: "I1", wife: "I2", chil: [] }
  }
};

const g2 = {
  individuals: {
    "I1": { id: "I1", name: "Samuel", birth: "", death: "", famc: [] },
    "I2": { id: "I2", name: "Debora Donaduzzi Pusebon", birth: "", death: "", famc: ["F2"] },
    "I3": { id: "I3", name: "Sergio Luiz Pusebon", birth: "", death: "", famc: [] },
    "I4": { id: "I4", name: "Marisa Salete Donaduzzi Pusebon", birth: "", death: "", famc: [] }
  },
  families: {
    "F1": { id: "F1", husb: "I1", wife: "I2", chil: [] },
    "F2": { id: "F2", husb: "I3", wife: "I4", chil: ["I2"] }
  }
};

const merged = mergeParsedGedcoms([g1 as any, g2 as any]);
console.log(JSON.stringify(merged.individuals, null, 2));
console.log(JSON.stringify(merged.families, null, 2));
