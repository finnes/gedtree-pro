import { jsPDF } from 'jspdf';
import { TreeNode, getMaxGen } from './gedcom';

export function generateTreePDF(rootNode: TreeNode) {
  // Layout Constants (in mm)
  const PAGE_WIDTH = 420; // A3 Landscape
  const PAGE_HEIGHT = 297;
  const PRINT_MARGIN = 10;
  const BOX_WIDTH = 70;
  const BOX_HEIGHT = 12;
  const BOX_SPACING = 2;
  const GEN_WIDTH = 80;

  // Calculate dimensions
  const maxGen = getMaxGen(rootNode);
  const treeWidth = (maxGen * GEN_WIDTH) + BOX_WIDTH + 40;
  const treeHeight = rootNode.subtreeHeight;

  // Adjust scale to fit vertically in max 2 pages
  const maxAllowedHeight = (PAGE_HEIGHT - 2 * PRINT_MARGIN) * 1.9;
  let scale = 1.0;
  if (treeHeight > maxAllowedHeight) {
    scale = maxAllowedHeight / treeHeight;
    scale = Math.max(scale, 0.6); // Minimum scale 60%
  }

  const effWidth = PAGE_WIDTH - 2 * PRINT_MARGIN;
  const effHeight = PAGE_HEIGHT - 2 * PRINT_MARGIN;

  const cols = Math.ceil((treeWidth * scale) / effWidth);
  const rows = Math.ceil((treeHeight * scale) / effHeight);

  // Safety limits
  const safeCols = Math.min(cols, 8);
  const safeRows = Math.min(rows, 2);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3'
  });

  // Helper to draw a rounded rect with shadow
  function drawBox(x: number, y: number, name: string, birth: string, death: string) {
    // Shadow
    doc.setFillColor(226, 232, 240); // slate-200
    doc.roundedRect(x + 1, y + 1, BOX_WIDTH, BOX_HEIGHT, 2, 2, 'F');
    
    // Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, BOX_WIDTH, BOX_HEIGHT, 2, 2, 'FD');

    // Name
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const nameStr = name.length > 30 ? name.substring(0, 30) + '...' : name;
    doc.text(nameStr, x + 2, y + 4.5);

    // Dates
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const bStr = birth ? `★ ${birth}` : '';
    const dStr = death ? ` ✝ ${death}` : '';
    let dateStr = `${bStr}   ${dStr}`.trim();
    if (!dateStr) dateStr = 'Datas desconhecidas';
    if (dateStr.length > 40) dateStr = dateStr.substring(0, 40) + '...';
    doc.text(dateStr, x + 2, y + 9);
  }

  function drawConnectors(node: TreeNode) {
    if (node.father) {
      const startX = node.x + BOX_WIDTH;
      const startY = node.y;
      const endX = node.father.x;
      const endY = node.father.y;
      const midX = startX + (endX - startX) / 2;

      doc.setDrawColor(148, 163, 184); // slate-400
      doc.setLineWidth(0.4);
      
      doc.line(startX, startY, midX, startY);
      doc.line(midX, startY, midX, endY);
      doc.line(midX, endY, endX, endY);
      
      drawConnectors(node.father);
    }
    
    if (node.mother) {
      const startX = node.x + BOX_WIDTH;
      const startY = node.y;
      const endX = node.mother.x;
      const endY = node.mother.y;
      const midX = startX + (endX - startX) / 2;

      doc.setDrawColor(148, 163, 184); // slate-400
      doc.setLineWidth(0.4);
      
      doc.line(startX, startY, midX, startY);
      doc.line(midX, startY, midX, endY);
      doc.line(midX, endY, endX, endY);
      
      drawConnectors(node.mother);
    }
  }

  function drawNodes(node: TreeNode) {
    // Draw connectors first so they are behind boxes
    drawConnectors(node);
    
    // Then draw boxes
    function drawBoxRecursive(n: TreeNode) {
      drawBox(n.x, n.y - BOX_HEIGHT / 2, n.name, n.birth, n.death);
      if (n.father) drawBoxRecursive(n.father);
      if (n.mother) drawBoxRecursive(n.mother);
    }
    drawBoxRecursive(node);
  }

  let pageCount = 0;

  for (let r = 0; r < safeRows; r++) {
    for (let col = 0; col < safeCols; col++) {
      if (pageCount > 0) {
        doc.addPage('a3', 'landscape');
      }
      pageCount++;

      // Tiling logic
      const tx = -(col * effWidth);
      const ty = -((safeRows - 1 - r) * effHeight);

      // We need to apply translation and scaling manually because jsPDF doesn't have a full transform stack like ReportLab
      // But jsPDF has advanced API for this: doc.advancedAPI()
      
      doc.advancedAPI(api => {
        api.saveGraphicsState();
        
        // Print margin
        api.setCurrentTransformationMatrix(api.Matrix(1, 0, 0, 1, PRINT_MARGIN, PRINT_MARGIN));
        
        // Clip to effective area
        api.rect(0, 0, effWidth, effHeight);
        api.clip();
        
        // Apply tiling translation and scale
        api.setCurrentTransformationMatrix(api.Matrix(scale, 0, 0, scale, tx, ty));
        
        // Draw the tree
        drawNodes(rootNode);
        
        api.restoreGraphicsState();
      });

      // Draw Margins and Guides
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(PRINT_MARGIN, PRINT_MARGIN, effWidth, effHeight);

      doc.setDrawColor(255, 0, 0);
      doc.setLineDashPattern([2, 2], 0);
      
      if (col < safeCols - 1) {
        doc.line(PAGE_WIDTH - PRINT_MARGIN, PRINT_MARGIN, PAGE_WIDTH - PRINT_MARGIN, PAGE_HEIGHT - PRINT_MARGIN);
      }
      if (r < safeRows - 1) {
        doc.line(PRINT_MARGIN, PRINT_MARGIN, PAGE_WIDTH - PRINT_MARGIN, PRINT_MARGIN);
      }
      
      doc.setLineDashPattern([], 0);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(255, 0, 0);
      const infoText = `Página ${r * safeCols + col + 1} (L${r + 1}, C${col + 1})`;
      doc.text(infoText, PRINT_MARGIN, 5);
      
      if (col < safeCols - 1) {
        doc.text("CORTE E COLE ->", PAGE_WIDTH - PRINT_MARGIN - 25, PAGE_HEIGHT / 2);
      }
      if (r < safeRows - 1) {
        doc.text("V CORTE E COLE V", PAGE_WIDTH / 2 - 15, 8);
      }
    }
  }

  doc.save('arvore_genealogica.pdf');
}
