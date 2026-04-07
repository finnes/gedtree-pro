import { jsPDF } from 'jspdf';
import { Individual } from './gedcom';

export function generateTreePDF(individuals: Individual[]) {
  const PAGE_WIDTH = 420; // A3 Landscape
  const PAGE_HEIGHT = 297;
  const TOTAL_WIDTH = PAGE_WIDTH * 4;
  const BOX_WIDTH = 100;
  const BOX_HEIGHT = 20;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3'
  });

  for (let page = 0; page < 4; page++) {
    if (page > 0) doc.addPage('a3', 'landscape');
    
    const offsetX = page * PAGE_WIDTH;

    // Draw cut guide on pages 1, 2, 3
    if (page < 3) {
      doc.setDrawColor(255, 0, 0);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(PAGE_WIDTH - 0.5, 0, PAGE_WIDTH - 0.5, PAGE_HEIGHT);
      doc.setLineDashPattern([], 0);
      
      doc.setFontSize(8);
      doc.setTextColor(255, 0, 0);
      doc.text('CORTE E COLE AQUI', PAGE_WIDTH - 5, PAGE_HEIGHT / 2, { angle: 90 });
    }

    // Draw individuals and connectors
    individuals.forEach(indi => {
      const x = indi.x - offsetX;
      const y = indi.y;

      // Only draw if it's within the current page view (plus some margin for connectors)
      if (x + BOX_WIDTH > -100 && x < PAGE_WIDTH + 100) {
        // Draw Box
        if (x >= 0 && x <= PAGE_WIDTH - BOX_WIDTH) {
           doc.setDrawColor(0);
           doc.setLineWidth(0.2);
           doc.rect(x, y - BOX_HEIGHT / 2, BOX_WIDTH, BOX_HEIGHT);
           
           doc.setFont('helvetica', 'bold');
           doc.setFontSize(10);
           doc.setTextColor(0);
           doc.text(indi.name, x + 2, y - 2);
           
           doc.setFont('helvetica', 'normal');
           doc.setFontSize(8);
           const dates = `${indi.birthDate || ''} ${indi.deathDate ? '- ' + indi.deathDate : ''}`;
           doc.text(dates, x + 2, y + 5);
        } else if (x < 0 && x + BOX_WIDTH > 0) {
           // Partial box on the left
           const visibleWidth = BOX_WIDTH + x;
           doc.rect(0, y - BOX_HEIGHT / 2, visibleWidth, BOX_HEIGHT);
           // Text might be clipped, but we draw it anyway
           doc.setFont('helvetica', 'bold');
           doc.text(indi.name, x + 2, y - 2);
        } else if (x < PAGE_WIDTH && x + BOX_WIDTH > PAGE_WIDTH) {
           // Partial box on the right
           const visibleWidth = PAGE_WIDTH - x;
           doc.rect(x, y - BOX_HEIGHT / 2, visibleWidth, BOX_HEIGHT);
           doc.setFont('helvetica', 'bold');
           doc.text(indi.name, x + 2, y - 2);
        }

        // Draw Connectors to parents
        const drawConnector = (parentId: string | undefined) => {
          if (!parentId) return;
          const parent = individuals.find(i => i.id === parentId);
          if (!parent) return;

          const startX = indi.x + BOX_WIDTH - offsetX;
          const startY = indi.y;
          const endX = parent.x - offsetX;
          const endY = parent.y;
          const midX = startX + (endX - startX) / 2;

          doc.setDrawColor(0);
          doc.setLineWidth(0.2);
          // Orthogonal line (L-shape or Z-shape)
          doc.line(startX, startY, midX, startY);
          doc.line(midX, startY, midX, endY);
          doc.line(midX, endY, endX, endY);
        };

        drawConnector(indi.fatherId);
        drawConnector(indi.motherId);
      }
    });

    // Page info
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Página ${page + 1} de 4`, 10, PAGE_HEIGHT - 10);
  }

  doc.save('arvore_genealogica.pdf');
}
