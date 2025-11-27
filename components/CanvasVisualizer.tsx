import React, { useRef, useEffect } from 'react';
import { ProjectConfig, CalculationResult, LedModule } from '../types';
import { LINE_COLORS } from '../constants';

interface CanvasVisualizerProps {
    config: ProjectConfig;
    module: LedModule;
    result: CalculationResult;
    showPower: boolean;
    showData: boolean;
    className?: string;
    modalMode?: boolean;
}

const CanvasVisualizer: React.FC<CanvasVisualizerProps> = ({ config, module, result, showPower, showData, className, modalMode }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Helper to darken color slightly for gradient end
    const adjustColor = (hex: string, percent: number) => {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);
        r = Math.floor(r * (100 + percent) / 100);
        g = Math.floor(g * (100 + percent) / 100);
        b = Math.floor(b * (100 + percent) / 100);
        r = r < 255 ? r : 255;  
        g = g < 255 ? g : 255;  
        b = b < 255 ? b : 255;  
        const rr = ((r.toString(16).length === 1) ? "0" + r.toString(16) : r.toString(16));
        const gg = ((g.toString(16).length === 1) ? "0" + g.toString(16) : g.toString(16));
        const bb = ((b.toString(16).length === 1) ? "0" + b.toString(16) : b.toString(16));
        return "#" + rr + gg + bb;
    }

    const getOrderedModuleListMixed = (
        startX: number, startY: number, boxW: number, boxH: number, 
        routeConfig: { pattern: string; direction: string; start: string }
    ) => {
        const { colsFull, rowsFull } = result;
        const cols = result.cols;
        const rows = result.rows;

        let grid: any[][] = [];
        for (let c = 0; c < cols; c++) {
            grid[c] = [];
            for (let r = 0; r < rows; r++) {
                const isHalfW = (c >= colsFull);
                const isHalfH = (r >= rowsFull);
                const cellW = isHalfW ? boxW * 0.5 : boxW;
                const cellH = isHalfH ? boxH * 0.5 : boxH;

                let posX = startX;
                if (c < colsFull) posX += c * boxW;
                else posX += colsFull * boxW + (c - colsFull) * (boxW * 0.5);

                let posY = startY;
                if (r < rowsFull) posY += r * boxH;
                else posY += rowsFull * boxH + (r - rowsFull) * (boxH * 0.5);

                grid[c][r] = {
                    x: posX, y: posY, w: cellW, h: cellH, c, r,
                    cx: posX + cellW / 2, cy: posY + cellH / 2,
                    isHalfW, isHalfH
                };
            }
        }

        let orderedModules: any[] = [];
        let colOrder = Array.from({ length: cols }, (_, i) => i);
        let rowOrder = Array.from({ length: rows }, (_, i) => i);

        if (routeConfig.start.includes('r')) colOrder.reverse();
        if (routeConfig.start.includes('b')) rowOrder.reverse();

        if (routeConfig.direction === 'vertical') {
            colOrder.forEach((c, cIdx) => {
                let currentRows = [...rowOrder];
                if (routeConfig.pattern === 'snake' && cIdx % 2 !== 0) currentRows.reverse();
                currentRows.forEach(r => orderedModules.push(grid[c][r]));
            });
        } else {
            rowOrder.forEach((r, rIdx) => {
                let currentCols = [...colOrder];
                if (routeConfig.pattern === 'snake' && rIdx % 2 !== 0) currentCols.reverse();
                currentCols.forEach(c => orderedModules.push(grid[c][r]));
            });
        }
        return orderedModules;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const container = canvas.parentElement;
        if (!container) return;

        let availW = container.clientWidth;
        if (modalMode) availW = Math.min(1200, window.innerWidth * 0.95);
        if (availW === 0) availW = 800;

        const padding = 40;
        // Increase top space for motors (labels above)
        const topSpace = config.installationType === 'volada' ? 120 : 30;
        const modAspect = module.width / module.height;
        if (modAspect === 0) return;

        const drawAreaW = availW - (padding * 2);
        const logicalWidthUnits = result.colsFull + (result.hasHalfCol ? 0.5 : 0);
        const logicalHeightUnits = result.rowsFull + (result.hasHalfRow ? 0.5 : 0);

        if (logicalWidthUnits === 0) return;

        let boxW = drawAreaW / logicalWidthUnits;
        let boxH = boxW / modAspect;
        let requiredHeight = topSpace + (boxH * logicalHeightUnits) + (padding * 2);

        canvas.width = availW;
        canvas.height = Math.max(450, requiredHeight);

        const finalW = canvas.width;
        const finalH = canvas.height;

        ctx.clearRect(0, 0, finalW, finalH);

        const totalDrawW = boxW * logicalWidthUnits;
        const totalDrawH = boxH * logicalHeightUnits;
        const startX = (finalW - totalDrawW) / 2;
        let startY = topSpace + padding;
        if (finalH > requiredHeight) startY = topSpace + ((finalH - topSpace - totalDrawH) / 2);

        const dataOrdered = getOrderedModuleListMixed(startX, startY, boxW, boxH, config.dataRoute);
        const powerOrdered = getOrderedModuleListMixed(startX, startY, boxW, boxH, config.powerRoute);

        const colEven = config.moduleColorEven || '#dc2626';
        const colOdd = config.moduleColorOdd || '#991b1b';

        // Draw Modules
        dataOrdered.forEach(mod => {
            const baseColor = (mod.c + mod.r) % 2 === 0 ? colEven : colOdd;
            const darkColor = adjustColor(baseColor, -30);
            
            if (config.moduleGradient) {
                const cx = mod.x + mod.w / 2;
                const cy = mod.y + mod.h / 2;
                const type = config.moduleGradientType || 'linear';

                if (type === 'linear') {
                    const gradient = ctx.createLinearGradient(mod.x, mod.y, mod.x, mod.y + mod.h);
                    gradient.addColorStop(0, baseColor);
                    gradient.addColorStop(1, darkColor);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(mod.x, mod.y, mod.w, mod.h);
                } 
                else if (type === 'radial') {
                    const radius = Math.max(mod.w, mod.h) * 0.8;
                    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                    gradient.addColorStop(0, baseColor);
                    gradient.addColorStop(1, darkColor);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(mod.x, mod.y, mod.w, mod.h);
                } 
                else if (type === 'conic') {
                    const gradient = ctx.createConicGradient(0, cx, cy);
                    gradient.addColorStop(0, baseColor);
                    gradient.addColorStop(0.25, darkColor);
                    gradient.addColorStop(0.5, baseColor);
                    gradient.addColorStop(0.75, darkColor);
                    gradient.addColorStop(1, baseColor);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(mod.x, mod.y, mod.w, mod.h);
                }
                else if (type === 'square') {
                    // Simulated Square/Pyramid Gradient using 4 triangles
                    // Top Triangle
                    ctx.beginPath(); ctx.moveTo(mod.x, mod.y); ctx.lineTo(mod.x + mod.w, mod.y); ctx.lineTo(cx, cy); ctx.closePath();
                    const gTop = ctx.createLinearGradient(mod.x, mod.y, mod.x, cy);
                    gTop.addColorStop(0, baseColor); gTop.addColorStop(1, darkColor);
                    ctx.fillStyle = gTop; ctx.fill();

                    // Bottom Triangle
                    ctx.beginPath(); ctx.moveTo(mod.x, mod.y + mod.h); ctx.lineTo(mod.x + mod.w, mod.y + mod.h); ctx.lineTo(cx, cy); ctx.closePath();
                    const gBot = ctx.createLinearGradient(mod.x, mod.y + mod.h, mod.x, cy);
                    gBot.addColorStop(0, baseColor); gBot.addColorStop(1, darkColor);
                    ctx.fillStyle = gBot; ctx.fill();

                    // Left Triangle
                    ctx.beginPath(); ctx.moveTo(mod.x, mod.y); ctx.lineTo(mod.x, mod.y + mod.h); ctx.lineTo(cx, cy); ctx.closePath();
                    const gLeft = ctx.createLinearGradient(mod.x, mod.y, cx, mod.y);
                    gLeft.addColorStop(0, baseColor); gLeft.addColorStop(1, darkColor);
                    ctx.fillStyle = gLeft; ctx.fill();

                    // Right Triangle
                    ctx.beginPath(); ctx.moveTo(mod.x + mod.w, mod.y); ctx.lineTo(mod.x + mod.w, mod.y + mod.h); ctx.lineTo(cx, cy); ctx.closePath();
                    const gRight = ctx.createLinearGradient(mod.x + mod.w, mod.y, cx, mod.y);
                    gRight.addColorStop(0, baseColor); gRight.addColorStop(1, darkColor);
                    ctx.fillStyle = gRight; ctx.fill();
                }
            } else {
                ctx.fillStyle = baseColor;
                ctx.fillRect(mod.x, mod.y, mod.w, mod.h);
            }
            
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(mod.x, mod.y, mod.w, mod.h);

            if (mod.isHalfW || mod.isHalfH) {
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.font = "10px Arial";
                ctx.textAlign = "center";
                ctx.fillText("0.5", mod.cx, mod.cy);
            }
        });

        // Draw Data Lines
        if (showData) {
            ctx.lineWidth = 2;
            for (let i = 0; i < dataOrdered.length; i++) {
                const mod = dataOrdered[i];
                const dataGroup = Math.floor(i / config.signalReelInterval);
                const nextMod = dataOrdered[i + 1];
                const nextDataGroup = nextMod ? Math.floor((i + 1) / config.signalReelInterval) : -1;
                const color = LINE_COLORS[dataGroup % LINE_COLORS.length];

                if (i % config.signalReelInterval === 0) {
                    ctx.fillStyle = '#fff';
                    ctx.shadowColor = "rgba(0,0,0,0.8)";
                    ctx.shadowBlur = 4;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`D${dataGroup + 1}`, mod.x + 4, mod.y + mod.h - 4);
                    ctx.shadowBlur = 0;
                }
                if (nextMod && dataGroup === nextDataGroup) {
                    ctx.beginPath();
                    ctx.moveTo(mod.cx, mod.cy);
                    ctx.lineTo(nextMod.cx, nextMod.cy);
                    ctx.strokeStyle = color;
                    ctx.stroke();
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(nextMod.cx, nextMod.cy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw Power Lines
        if (showPower) {
            for (let i = 0; i < powerOrdered.length; i++) {
                const mod = powerOrdered[i];
                const powerGroup = Math.floor(i / config.feedCableInterval);
                const color = LINE_COLORS[powerGroup % LINE_COLORS.length];
                const radius = Math.min(mod.w, mod.h) * 0.15;
                const cx = mod.x + mod.w - radius - 2;
                const cy = mod.y + radius + 2;

                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
                if (radius > 8) {
                    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(`P${powerGroup + 1}`, cx, cy);
                }
            }
        }

        // Outline
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, totalDrawW, totalDrawH);

        // --- MOTORS DRAWING LOGIC ---
        if (config.installationType === 'volada') {
            const bumperH = boxH * 0.2;
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(startX, startY - bumperH - 2, totalDrawW, bumperH);

            let safeNumMotors = Math.max(2, config.motorCount);
            const motorSpacing = totalDrawW / (safeNumMotors - 1);
            const mRad = 16; 

            for (let m = 0; m < safeNumMotors; m++) {
                const mx = startX + (m * motorSpacing);
                const my = startY - bumperH - 50; // Center of Motor

                // Chain line
                ctx.beginPath(); 
                ctx.moveTo(mx, my + mRad); // Start below the shape
                ctx.lineTo(mx, startY - bumperH - 2);
                ctx.strokeStyle = "#64748b"; 
                ctx.lineWidth = 2; 
                ctx.stroke();

                // 1. Calculate Load Status & Color
                // FIX: Use object structure for motorLoads
                const loadData = result.motorLoads[m];
                const capacity = config.motorCapacity;
                const pct = (loadData?.lift || 0) / capacity;

                let statusColor = '#a855f7'; // Lila (< 80%)
                if (pct > 1.0) statusColor = '#dc2626'; // Red (> 100%)
                else if (pct >= 0.8) statusColor = '#eab308'; // Yellow (80-99%)

                // 2. Define Path based on Shape
                ctx.beginPath();
                switch (capacity) {
                    case 250: // Rhombus
                        ctx.moveTo(mx, my - mRad);
                        ctx.lineTo(mx + mRad, my);
                        ctx.lineTo(mx, my + mRad);
                        ctx.lineTo(mx - mRad, my);
                        break;
                    case 500: // Triangle
                        const tOffset = mRad * 0.5;
                        ctx.moveTo(mx, my - mRad - tOffset);
                        ctx.lineTo(mx + mRad, my + mRad - tOffset);
                        ctx.lineTo(mx - mRad, my + mRad - tOffset);
                        break;
                    case 750: // Octagon
                        const sides = 8;
                        const step = (Math.PI * 2) / sides;
                        const startAngle = -Math.PI / 2 + (step / 2);
                        for (let i = 0; i < sides; i++) {
                            const angle = startAngle + (i * step);
                            const px = mx + mRad * Math.cos(angle);
                            const py = my + mRad * Math.sin(angle);
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        break;
                    case 1000: // Circle
                        ctx.arc(mx, my, mRad, 0, Math.PI * 2);
                        break;
                    case 2000: // Square
                        ctx.rect(mx - mRad, my - mRad, mRad * 2, mRad * 2);
                        break;
                    default: // Circle fallback
                        ctx.arc(mx, my, mRad, 0, Math.PI * 2);
                }
                ctx.closePath();

                // 3. Draw Checkerboard Fill (using Clip)
                ctx.save();
                ctx.clip(); // Restrict drawing to the shape

                // Full Black Background
                ctx.fillStyle = '#000000';
                ctx.fillRect(mx - mRad - 5, my - mRad - 5, (mRad * 2) + 10, (mRad * 2) + 10);

                // Draw Colored Quadrants (Top-Left and Bottom-Right)
                ctx.fillStyle = statusColor;
                // Top-Left
                ctx.fillRect(mx - mRad - 5, my - mRad - 5, mRad + 5, mRad + 5);
                // Bottom-Right
                ctx.fillRect(mx, my, mRad + 5, mRad + 5);

                // 4. Draw FULL Cross (+)
                // The drawing is clipped to the shape, so we can draw large lines
                // and they will be neatly trimmed to the shape's edge.
                ctx.beginPath();
                ctx.moveTo(mx, my - mRad * 2);
                ctx.lineTo(mx, my + mRad * 2);
                ctx.moveTo(mx - mRad * 2, my);
                ctx.lineTo(mx + mRad * 2, my);
                ctx.strokeStyle = "rgba(255,255,255,0.9)"; // White cross for contrast
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.restore(); // Remove clip

                // 5. Stroke Outline
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#000"; 
                ctx.stroke();

                // 6. Draw Text Labels
                ctx.textAlign = "center";
                
                // TOP: Load Info
                ctx.font = "bold 10px Arial";
                ctx.fillStyle = statusColor; 
                if(pct > 1.0) ctx.fillStyle = '#dc2626'; // Force red text if danger

                // Percentage
                ctx.fillText(`${(pct * 100).toFixed(0)}%`, mx, my - mRad - 22);
                // Weight (Display Total Point Load)
                ctx.fillStyle = "#000";
                ctx.fillText(`${loadData?.total.toFixed(0)}kg`, mx, my - mRad - 10);

                // BOTTOM: ID
                ctx.font = "bold 11px Arial"; 
                ctx.fillStyle = "#000"; 
                ctx.fillText(`M${m + 1}`, mx, my + mRad + 14);
            }
        }

        // Dimensions Text
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`${result.realWidth.toFixed(2)}m`, finalW / 2, startY - (config.installationType === 'volada' ? 65 : 10));

        ctx.textAlign = 'left';
        ctx.fillText(`${result.realHeight.toFixed(2)}m`, startX + totalDrawW + 10, startY + totalDrawH / 2);

    }, [config, module, result, showPower, showData, modalMode]);

    return (
        <canvas ref={canvasRef} className={`${className} bg-white shadow-lg rounded-md border border-slate-200`} />
    );
};

export default CanvasVisualizer;