import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Filter, Search } from 'lucide-react';
import { Button, Input } from '../ui';
import { useAppStore } from '../../stores/app-store';
import { api } from '../../lib/api';
import type { RelationGraph as RelationGraphType, RelationNode, RelationEdge } from '../../types';

interface GraphNode extends RelationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  dragging: boolean;
}

const SCHEMA_COLORS: Record<string, string> = {
  public: '#10B981',
  financeiro: '#06B6D4',
  auth: '#A855F7',
};

function getSchemaColor(schema: string): string {
  return SCHEMA_COLORS[schema] || '#71717A';
}

interface RelationGraphProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RelationGraph({ isOpen, onClose }: RelationGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<RelationEdge[]>([]);
  const animRef = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [activeSchemas, setActiveSchemas] = useState<Set<string>>(new Set());

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ type: 'pan' | 'node'; nodeIdx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number>(-1);

  // Load data
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.schema.relations()
      .then((data: RelationGraphType) => {
        const uniqueSchemas = [...new Set(data.nodes.map(n => n.schema))];
        setSchemas(uniqueSchemas);
        setActiveSchemas(new Set(uniqueSchemas));

        // Initialize nodes with random positions
        const cx = 600;
        const cy = 400;
        nodesRef.current = data.nodes.map((n, i) => ({
          ...n,
          x: cx + (Math.random() - 0.5) * 800,
          y: cy + (Math.random() - 0.5) * 600,
          vx: 0,
          vy: 0,
          width: Math.max(120, n.label.length * 9 + 40),
          height: 50,
          dragging: false,
        }));
        edgesRef.current = data.edges;
        setLoading(false);

        // Run force simulation
        runSimulation();
      })
      .catch((err) => {
        console.error('Failed to load relations:', err);
        setLoading(false);
      });

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [isOpen]);

  const runSimulation = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    let iterations = 0;
    const maxIterations = 200;

    function step() {
      if (iterations >= maxIterations) {
        draw();
        return;
      }
      iterations++;

      const alpha = 1 - iterations / maxIterations;
      const repulsionStrength = 8000 * alpha;
      const attractionStrength = 0.005 * alpha;
      const damping = 0.85;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].dragging) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[j].dragging) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsionStrength / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx;
          nodes[i].vy += fy;
          nodes[j].vx -= fx;
          nodes[j].vy -= fy;
        }
      }

      // Attraction along edges
      const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));
      for (const edge of edges) {
        const si = nodeMap.get(edge.from);
        const ti = nodeMap.get(edge.to);
        if (si === undefined || ti === undefined) continue;
        const source = nodes[si];
        const target = nodes[ti];
        if (source.dragging && target.dragging) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const idealDist = 250;
        const force = (dist - idealDist) * attractionStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!source.dragging) { source.vx += fx; source.vy += fy; }
        if (!target.dragging) { target.vx -= fx; target.vy -= fy; }
      }

      // Apply velocity
      for (const node of nodes) {
        if (node.dragging) continue;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
      }

      draw();
      animRef.current = requestAnimationFrame(step);
    }

    step();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const cam = cameraRef.current;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));

    // Filter by active schemas
    const visibleIds = new Set(
      nodes.filter(n => activeSchemas.has(n.schema)).map(n => n.id)
    );

    // Draw edges
    for (const edge of edges) {
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
      const si = nodeMap.get(edge.from)!;
      const ti = nodeMap.get(edge.to)!;
      const source = nodes[si];
      const target = nodes[ti];

      const isHighlighted = hoveredNode >= 0 && (si === hoveredNode || ti === hoveredNode);

      ctx.beginPath();
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2 - 30;
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.strokeStyle = isHighlighted ? '#10B981' : '#52525B';
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();

      // Arrow at target
      const angle = Math.atan2(target.y - midY, target.x - midX);
      const arrowSize = 8;
      ctx.beginPath();
      ctx.moveTo(target.x, target.y);
      ctx.lineTo(target.x - arrowSize * Math.cos(angle - 0.3), target.y - arrowSize * Math.sin(angle - 0.3));
      ctx.lineTo(target.x - arrowSize * Math.cos(angle + 0.3), target.y - arrowSize * Math.sin(angle + 0.3));
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? '#10B981' : '#52525B';
      ctx.fill();

      // Edge label
      if (isHighlighted) {
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = '#A1A1AA';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, midX, midY - 5);
      }
    }

    // Draw nodes
    nodes.forEach((node, i) => {
      if (!visibleIds.has(node.id)) return;
      const isHovered = i === hoveredNode;
      const isSearchMatch = search && node.label.toLowerCase().includes(search.toLowerCase());
      const color = getSchemaColor(node.schema);

      const x = node.x - node.width / 2;
      const y = node.y - node.height / 2;

      // Shadow
      if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
      }

      // Background
      ctx.beginPath();
      ctx.roundRect(x, y, node.width, node.height, 8);
      ctx.fillStyle = isHovered ? '#27272A' : '#18181B';
      ctx.fill();
      ctx.strokeStyle = isSearchMatch ? '#F59E0B' : color;
      ctx.lineWidth = isHovered || isSearchMatch ? 2 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Title
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#FAFAFA';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, node.x, node.y - 6);

      // Subtitle
      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = '#71717A';
      ctx.fillText(`${node.columnCount} cols • ${node.rowCount > 1000 ? `${(node.rowCount / 1000).toFixed(1)}k` : node.rowCount} rows`, node.x, node.y + 10);
    });

    ctx.restore();

    // Minimap
    if (nodes.length > 0) {
      const mmW = 150;
      const mmH = 100;
      const mmX = rect.width - mmW - 10;
      const mmY = rect.height - mmH - 10;

      ctx.fillStyle = 'rgba(9,9,11,0.8)';
      ctx.strokeStyle = '#3F3F46';
      ctx.lineWidth = 1;
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeRect(mmX, mmY, mmW, mmH);

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (!visibleIds.has(n.id)) continue;
        minX = Math.min(minX, n.x - n.width / 2);
        minY = Math.min(minY, n.y - n.height / 2);
        maxX = Math.max(maxX, n.x + n.width / 2);
        maxY = Math.max(maxY, n.y + n.height / 2);
      }
      const graphW = maxX - minX || 1;
      const graphH = maxY - minY || 1;
      const scale = Math.min((mmW - 10) / graphW, (mmH - 10) / graphH);

      for (const n of nodes) {
        if (!visibleIds.has(n.id)) continue;
        const nx = mmX + 5 + (n.x - minX) * scale;
        const ny = mmY + 5 + (n.y - minY) * scale;
        ctx.fillStyle = getSchemaColor(n.schema);
        ctx.fillRect(nx - 2, ny - 1.5, 4, 3);
      }

      // Viewport indicator
      const vpX = mmX + 5 + (cam.x - rect.width / 2 / cam.zoom - minX) * scale;
      const vpY = mmY + 5 + (cam.y - rect.height / 2 / cam.zoom - minY) * scale;
      const vpW = (rect.width / cam.zoom) * scale;
      const vpH = (rect.height / cam.zoom) * scale;
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1;
      ctx.strokeRect(vpX, vpY, vpW, vpH);
    }
  }, [hoveredNode, activeSchemas, search]);

  // Mouse handlers
  const getWorldPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - rect.width / 2) / cam.zoom + cam.x;
    const worldY = (screenY - rect.height / 2) / cam.zoom + cam.y;
    return { worldX, worldY };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): number => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!activeSchemas.has(n.schema)) continue;
      if (wx >= n.x - n.width / 2 && wx <= n.x + n.width / 2 &&
          wy >= n.y - n.height / 2 && wy <= n.y + n.height / 2) {
        return i;
      }
    }
    return -1;
  }, [activeSchemas]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { worldX, worldY } = getWorldPos(e.clientX, e.clientY);
    const nodeIdx = findNodeAt(worldX, worldY);

    if (nodeIdx >= 0) {
      const n = nodesRef.current[nodeIdx];
      dragRef.current = { type: 'node', nodeIdx, startX: worldX, startY: worldY, origX: n.x, origY: n.y };
      n.dragging = true;
    } else {
      dragRef.current = { type: 'pan', nodeIdx: -1, startX: e.clientX, startY: e.clientY, origX: cameraRef.current.x, origY: cameraRef.current.y };
    }
  }, [getWorldPos, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag) {
      if (drag.type === 'node') {
        const { worldX, worldY } = getWorldPos(e.clientX, e.clientY);
        const n = nodesRef.current[drag.nodeIdx];
        n.x = drag.origX + (worldX - drag.startX);
        n.y = drag.origY + (worldY - drag.startY);
        draw();
      } else {
        const dx = (e.clientX - drag.startX) / cameraRef.current.zoom;
        const dy = (e.clientY - drag.startY) / cameraRef.current.zoom;
        cameraRef.current.x = drag.origX - dx;
        cameraRef.current.y = drag.origY - dy;
        draw();
      }
    } else {
      const { worldX, worldY } = getWorldPos(e.clientX, e.clientY);
      const idx = findNodeAt(worldX, worldY);
      if (idx !== hoveredNode) {
        setHoveredNode(idx);
      }
    }
  }, [getWorldPos, findNodeAt, hoveredNode, draw]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.type === 'node') {
      nodesRef.current[dragRef.current.nodeIdx].dragging = false;
    }
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.zoom = Math.max(0.1, Math.min(5, cameraRef.current.zoom * factor));
    draw();
  }, [draw]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const { worldX, worldY } = getWorldPos(e.clientX, e.clientY);
    const idx = findNodeAt(worldX, worldY);
    if (idx >= 0) {
      const node = nodesRef.current[idx];
      const parts = node.id.split('.');
      useAppStore.getState().selectTable(parts[0] || node.schema, parts[1] || node.label);
      onClose();
    }
  }, [getWorldPos, findNodeAt, onClose]);

  const centerView = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 };

    // Center on nodes
    const nodes = nodesRef.current;
    if (nodes.length > 0) {
      let sumX = 0, sumY = 0, count = 0;
      for (const n of nodes) {
        if (activeSchemas.has(n.schema)) {
          sumX += n.x;
          sumY += n.y;
          count++;
        }
      }
      if (count > 0) {
        cameraRef.current.x = sumX / count;
        cameraRef.current.y = sumY / count;
      }
    }
    draw();
  }, [activeSchemas, draw]);

  const toggleSchema = (schema: string) => {
    setActiveSchemas(prev => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  };

  // Redraw on filter/search changes
  useEffect(() => {
    draw();
  }, [activeSchemas, search, draw]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg-base/95 backdrop-blur-sm flex flex-col animate-fadeIn">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Grafo de Relacoes</h2>
          <div className="flex items-center gap-1">
            {schemas.map(s => (
              <button
                key={s}
                onClick={() => toggleSchema(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                  activeSchemas.has(s)
                    ? 'text-white'
                    : 'text-text-muted bg-bg-elevated'
                }`}
                style={activeSchemas.has(s) ? { backgroundColor: getSchemaColor(s) + '33', color: getSchemaColor(s), border: `1px solid ${getSchemaColor(s)}44` } : {}}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-48">
            <Input
              placeholder="Buscar tabela..."
              icon={<Search className="w-3.5 h-3.5" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!py-1 !text-xs"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={centerView}>
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { cameraRef.current.zoom *= 1.2; draw(); }}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { cameraRef.current.zoom *= 0.8; draw(); }}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Carregando grafo...
          </div>
        ) : nodesRef.current.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Nenhuma relacao encontrada.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
          />
        )}
      </div>
    </div>
  );
}
