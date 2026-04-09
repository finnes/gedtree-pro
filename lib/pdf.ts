import { jsPDF } from 'jspdf';
import { Node, Edge } from '@xyflow/react';

export function generateFlowPDF(nodes: Node[], edges: Edge[], exportFormat: 'A3_GRID' | 'A0_POSTER', pageSize: string = 'A3') {
  if (nodes.length === 0) return;

  // Find bounding box of all nodes (excluding boundary)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const BOX_WIDTH = 160;
  const BOX_HEIGHT = 50; // Approximate height of the custom node

  const treeNodes = nodes.filter(n => n.type !== 'boundary');
  if (treeNodes.length === 0) return;

  treeNodes.forEach(n => {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.y > maxY) maxY = n.position.y;
  });

  // Add padding around the bounding box
  const PADDING = 50;
  minX -= PADDING;
  minY -= PADDING;
  maxX += BOX_WIDTH + PADDING;
  maxY += BOX_HEIGHT + PADDING;

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  const PAGE_SIZES: Record<string, {w: number, h: number}> = {
    'A4': { w: 297, h: 210 },
    'A3': { w: 420, h: 297 },
    'A2': { w: 594, h: 420 },
    'A1': { w: 841, h: 594 },
    'A0': { w: 1189, h: 841 },
    '2A0': { w: 1682, h: 1189 },
    '4A0': { w: 2378, h: 1682 },
    'POSTER_2M': { w: 2000, h: 1000 },
    'POSTER_3M': { w: 3000, h: 1000 },
    'POSTER_5M': { w: 5000, h: 1000 },
  };
  
  const PAGE_WIDTH = PAGE_SIZES[pageSize]?.w || 420;
  const PAGE_HEIGHT = PAGE_SIZES[pageSize]?.h || 297;

  if (exportFormat === 'A0_POSTER') {
    // Generate a single giant page
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [PAGE_WIDTH, PAGE_HEIGHT]
    });

    const scaleX = PAGE_WIDTH / totalWidth;
    const scaleY = PAGE_HEIGHT / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1.0); // Don't scale up, only down if needed

    drawNodesAndEdges(doc, nodes, edges, minX, minY, scale, PAGE_WIDTH, PAGE_HEIGHT, 0, 0);
    doc.save(`GEDTree_poster_${pageSize}.pdf`);

  } else {
    // Generate Grid
    const PRINT_MARGIN = 10;
    
    const effWidth = PAGE_WIDTH - 2 * PRINT_MARGIN;
    const effHeight = PAGE_HEIGHT - 2 * PRINT_MARGIN;

    // Calculate scale to fit vertically in max 6 pages
    const maxAllowedHeight = effHeight * 6;
    let scale = 0.35; // Base scale: 1 pixel = 0.35 mm (approx 72 DPI)
    if (totalHeight * scale > maxAllowedHeight) {
      scale = maxAllowedHeight / totalHeight;
      scale = Math.max(scale, 0.1); // Minimum scale 10%
    }

    const cols = Math.ceil((totalWidth * scale) / effWidth);
    const rows = Math.ceil((totalHeight * scale) / effHeight);

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: pageSize.toLowerCase()
    });

    let pageCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (pageCount > 0) doc.addPage(pageSize.toLowerCase(), 'landscape');
        pageCount++;

        const currentOffsetX = minX + (col * effWidth - PRINT_MARGIN) / scale;
        const currentOffsetY = minY + (r * effHeight - PRINT_MARGIN) / scale;

        drawNodesAndEdges(doc, nodes, edges, currentOffsetX, currentOffsetY, scale, effWidth, effHeight, col, r);

        // Draw white margins to hide overflow (manual clipping)
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, PAGE_WIDTH, PRINT_MARGIN, 'F'); // Top
        doc.rect(0, PAGE_HEIGHT - PRINT_MARGIN, PAGE_WIDTH, PRINT_MARGIN, 'F'); // Bottom
        doc.rect(0, 0, PRINT_MARGIN, PAGE_HEIGHT, 'F'); // Left
        doc.rect(PAGE_WIDTH - PRINT_MARGIN, 0, PRINT_MARGIN, PAGE_HEIGHT, 'F'); // Right

        // Draw Margins and Guides
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(PRINT_MARGIN, PRINT_MARGIN, effWidth, effHeight);

        doc.setDrawColor(255, 0, 0);
        doc.setLineDashPattern([2, 2], 0);
        
        if (col < cols - 1) {
          doc.line(PAGE_WIDTH - PRINT_MARGIN, PRINT_MARGIN, PAGE_WIDTH - PRINT_MARGIN, PAGE_HEIGHT - PRINT_MARGIN);
        }
        if (r < rows - 1) {
          doc.line(PRINT_MARGIN, PAGE_HEIGHT - PRINT_MARGIN, PAGE_WIDTH - PRINT_MARGIN, PAGE_HEIGHT - PRINT_MARGIN);
        }
        
        doc.setLineDashPattern([], 0);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(255, 0, 0);
        doc.text(`Página ${r * cols + col + 1} (L${r + 1}, C${col + 1})`, PRINT_MARGIN, 5);
        
        if (col < cols - 1) doc.text("CORTE E COLE ->", PAGE_WIDTH - PRINT_MARGIN - 25, PAGE_HEIGHT / 2);
        if (r < rows - 1) doc.text("V CORTE E COLE V", PAGE_WIDTH / 2 - 15, PAGE_HEIGHT - 3);
      }
    }

    doc.save(`GEDTree_grid_${pageSize}.pdf`);
  }
}

function drawNodesAndEdges(
  doc: jsPDF, 
  nodes: Node[], 
  edges: Edge[], 
  offsetX: number, 
  offsetY: number, 
  scale: number,
  pageW: number,
  pageH: number,
  col: number,
  row: number
) {
  const BOX_WIDTH = 160 * scale;
  const BOX_HEIGHT = 50 * scale;

  // Draw Edges
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      const sourceW = sourceNode.type === 'family' ? 8 : 160;
      const sourceH = sourceNode.type === 'family' ? 8 : 50;
      const targetW = targetNode.type === 'family' ? 8 : 160;
      const targetH = targetNode.type === 'family' ? 8 : 50;

      let startX = (sourceNode.position.x + sourceW / 2 - offsetX) * scale;
      let startY = (sourceNode.position.y + sourceH / 2 - offsetY) * scale;
      let endX = (targetNode.position.x + targetW / 2 - offsetX) * scale;
      let endY = (targetNode.position.y + targetH / 2 - offsetY) * scale;

      // Adjust start/end points based on handles if available
      if (edge.sourceHandle === 'source-right') startX = (sourceNode.position.x + sourceW - offsetX) * scale;
      if (edge.sourceHandle === 'source-left') startX = (sourceNode.position.x - offsetX) * scale;
      if (edge.sourceHandle === 'source-bottom') startY = (sourceNode.position.y + sourceH - offsetY) * scale;
      if (edge.sourceHandle === 'source-top') startY = (sourceNode.position.y - offsetY) * scale;

      if (edge.targetHandle === 'target-right') endX = (targetNode.position.x + targetW - offsetX) * scale;
      if (edge.targetHandle === 'target-left') endX = (targetNode.position.x - offsetX) * scale;
      if (edge.targetHandle === 'target-bottom') endY = (targetNode.position.y + targetH - offsetY) * scale;
      if (edge.targetHandle === 'target-top') endY = (targetNode.position.y - offsetY) * scale;

      const style = edge.style || {};
      const strokeColor = style.stroke as string || '#94a3b8';
      const strokeWidth = (style.strokeWidth as number || 1) * scale;
      const isDashed = style.strokeDasharray === '5,5';

      // Convert hex to rgb for jsPDF
      const r = parseInt(strokeColor.slice(1, 3), 16);
      const g = parseInt(strokeColor.slice(3, 5), 16);
      const b = parseInt(strokeColor.slice(5, 7), 16);

      doc.setDrawColor(r, g, b);
      doc.setLineWidth(strokeWidth);
      
      if (isDashed) {
        doc.setLineDashPattern([5 * scale, 5 * scale], 0);
      } else {
        doc.setLineDashPattern([], 0);
      }

      if (
        (edge.sourceHandle === 'source-bottom' && edge.targetHandle === 'target-top') ||
        (edge.sourceHandle === 'source-top' && edge.targetHandle === 'target-bottom')
      ) {
        const midY = (startY + endY) / 2;
        doc.line(startX, startY, startX, midY);
        doc.line(startX, midY, endX, midY);
        doc.line(endX, midY, endX, endY);
      } else if (
        (edge.sourceHandle === 'source-right' && edge.targetHandle === 'target-left') ||
        (edge.sourceHandle === 'source-left' && edge.targetHandle === 'target-right')
      ) {
        const midX = (startX + endX) / 2;
        doc.line(startX, startY, midX, startY);
        doc.line(midX, startY, midX, endY);
        doc.line(midX, endY, endX, endY);
      } else {
        doc.line(startX, startY, endX, endY);
      }
    }
  });

  // Reset line dash for nodes
  doc.setLineDashPattern([], 0);

  // Draw Nodes
  nodes.filter(n => n.type !== 'boundary').forEach(node => {
    const x = (node.position.x - offsetX) * scale;
    const y = (node.position.y - offsetY) * scale;

    if (node.type === 'family') {
      doc.setFillColor(148, 163, 184); // slate-400
      doc.circle(x + 4 * scale, y + 4 * scale, 4 * scale, 'F');
      return;
    }

    // Shadow
    doc.setFillColor(226, 232, 240); // slate-200
    doc.roundedRect(x + 2 * scale, y + 2 * scale, BOX_WIDTH, BOX_HEIGHT, 4 * scale, 4 * scale, 'F');
    
    // Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(1 * scale);
    doc.roundedRect(x, y, BOX_WIDTH, BOX_HEIGHT, 4 * scale, 4 * scale, 'FD');

    // Name
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12 * scale);
    const nameStr = (node.data?.name as string) || 'Sem nome';
    const shortName = nameStr.length > 30 ? nameStr.substring(0, 30) + '...' : nameStr;
    
    // Center text manually
    const textWidth = doc.getTextWidth(shortName);
    doc.text(shortName, x + (BOX_WIDTH - textWidth) / 2, y + 20 * scale);

    // Dates
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10 * scale);
    
    const birth = node.data.birth as string;
    const death = node.data.death as string;
    
    const bStr = birth ? `★ ${birth.substring(0, 10)}` : '';
    const dStr = death ? ` ✝ ${death.substring(0, 10)}` : '';
    let dateStr = `${bStr}   ${dStr}`.trim();
    if (!dateStr) dateStr = 'Datas desconhecidas';
    
    const dateWidth = doc.getTextWidth(dateStr);
    doc.text(dateStr, x + (BOX_WIDTH - dateWidth) / 2, y + 35 * scale);
  });
}
