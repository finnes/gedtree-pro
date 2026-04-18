function areNamesSimilar(n1: string, n2: string) {
    if (!n1 || !n2) return true;
    if (n1 === 'Desconhecido' || n2 === 'Desconhecido') return true;
    let norm1 = n1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, " ");
    let norm2 = n2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, " ");
    
    console.log("norm1:", norm1);
    console.log("norm2:", norm2);
    
    if (norm1 === norm2) return true;
    
    const parts1 = norm1.split(' ');
    const parts2 = norm2.split(' ');
    if (parts1[0] && parts2[0] && parts1[0] === parts2[0]) {
       const set2 = new Set(parts2.slice(1));
       let shared = 0;
       for (const w of parts1.slice(1)) {
          if (set2.has(w) && w.length > 2) shared++;
       }
       console.log("shared words:", shared);
       if (shared > 0) return true;
       
       if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
       
       if (parts1.length === 1 || parts2.length === 1) return true;
    }
    return false;
  }

console.log(areNamesSimilar("Débora Pusebon da Costa", "Débora Donaduzzi Pusebon"));
