import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Calculator, Database, Settings, Download, ZoomIn, Info, AlertTriangle, Cpu, Hammer, Zap, MonitorPlay, Cable, Box, Palette, Image as ImageIcon, Trash2 } from 'lucide-react';
import { LedModule, ProjectConfig, CalculationResult } from './types';
import { DEFAULT_MODULES, INITIAL_CONFIG, RIGGING_WEIGHTS } from './constants';
import CanvasVisualizer from './components/CanvasVisualizer';
import * as GeminiService from './services/geminiService';

// --- HELPER FUNCTIONS ---
const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
};

const MOTOR_LOAD_DISTRIBUTION: Record<number, number[]> = {
    2: [0.50, 0.50],
    3: [0.19, 0.62, 0.19],
    4: [0.13, 0.37, 0.37, 0.13],
    5: [0.10, 0.28, 0.24, 0.28, 0.10],
    6: [0.08, 0.23, 0.19, 0.19, 0.23, 0.08],
    8: [0.06, 0.16, 0.14, 0.14, 0.14, 0.14, 0.16, 0.06]
};

const SectionHeader = ({ title, open, onClick, icon: Icon }: any) => (
    <div 
        onClick={onClick} 
        className="flex items-center justify-between p-4 cursor-pointer bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors select-none"
    >
        <div className="flex items-center gap-2">
            {Icon && <Icon size={16} className="text-red-600" />}
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">{title}</h3>
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
    </div>
);

// Input Style Helper: White background, high contrast text
const inputClass = "w-full mt-1 p-2 border border-slate-300 bg-white rounded text-sm text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none placeholder-slate-400 transition-colors";

function App() {
    const [activeTab, setActiveTab] = useState<'calculator' | 'database' | 'settings'>('calculator');
    const [modules, setModules] = useState<LedModule[]>(DEFAULT_MODULES);
    const [config, setConfig] = useState<ProjectConfig>(INITIAL_CONFIG);
    const [sections, setSections] = useState({ project: true, config: true, rigging: true, power: true, multi: false, infra: false, video: false });
    const [showCanvasOptions, setShowCanvasOptions] = useState({ power: true, data: true });
    const [modalOpen, setModalOpen] = useState(false);
    const [aiModal, setAiModal] = useState<{open: boolean, title: string, content: string}>({ open: false, title: '', content: '' });
    const [isThinking, setIsThinking] = useState(false);

    // Database Edit State
    const [newModule, setNewModule] = useState<Partial<LedModule>>({});

    // -- Calculations --
    const result: CalculationResult = useMemo(() => {
        const module = modules.find(m => m.id === config.selectedModuleId);
        if (!module) return {} as CalculationResult;

        // Apply Overrides if present
        const effWeight = (config.overrideWeight !== undefined && config.overrideWeight > 0) ? config.overrideWeight : module.weight;
        const effPixH = (config.overridePixH !== undefined && config.overridePixH > 0) ? config.overridePixH : module.pixH;
        const effPixV = (config.overridePixV !== undefined && config.overridePixV > 0) ? config.overridePixV : module.pixV;

        const modW_m = module.width / 1000;
        const modH_m = module.height / 1000;

        const snappedW = Math.round(config.targetWidth * 2) / 2;
        const snappedH = Math.round(config.targetHeight * 2) / 2;

        const colsFull = Math.floor(snappedW / modW_m);
        const rowsFull = Math.floor(snappedH / modH_m);

        const remW = snappedW % modW_m;
        const remH = snappedH % modH_m;

        const hasHalfCol = (modW_m === 1.0 && remW >= 0.4 && remW <= 0.6);
        const hasHalfRow = (modH_m === 1.0 && remH >= 0.4 && remH <= 0.6);

        const cols = colsFull + (hasHalfCol ? 1 : 0);
        const rows = rowsFull + (hasHalfRow ? 1 : 0);

        let numFull = 0, numHalf = 0, numQuarter = 0;
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const isHalfW = (c >= colsFull);
                const isHalfH = (r >= rowsFull);
                if (!isHalfW && !isHalfH) numFull++;
                else if (isHalfW && !isHalfH) numHalf++;
                else if (!isHalfW && isHalfH) numHalf++;
                else numQuarter++;
            }
        }

        // Logic: Special modules REPLACE standard modules in the count
        const specialMods = (config.modCornerL || 0) + (config.modCornerR || 0) + (config.modFlex || 0);
        
        // Subtract special modules from full modules (ensure we don't go negative)
        const numFullAdjusted = Math.max(0, numFull - specialMods);
        
        const totalModules = numFullAdjusted + numHalf + numQuarter + specialMods;

        // Weights
        const wFull = effWeight;
        const wHalf = wFull * 0.55;
        const wQuarter = wFull * 0.30;
        
        // Calculate weight using adjusted counts
        const weightScreen = (numFullAdjusted * wFull) + (numHalf * wHalf) + (numQuarter * wQuarter) + (specialMods * wFull);

        // Rigging
        let bumpers1 = 0, bumpers05 = 0;
        let riggingWeight = 0;
        const realW = snappedW;

        // --- TRUSS CALCULATION (Available for both modes) ---
        let trussWeightPerM = RIGGING_WEIGHTS.truss40;
        if (config.trussModel === '30x30') trussWeightPerM = RIGGING_WEIGHTS.truss30;
        if (config.trussModel === '52x52') trussWeightPerM = RIGGING_WEIGHTS.truss52;

        let totalTrussSelected = 0;
        let totalTrussPieces = 0;
        Object.entries(config.trussSegments).forEach(([len, qty]) => {
            const q = qty as number;
            totalTrussSelected += (parseFloat(len) * q);
            totalTrussPieces += q;
        });

        const weightFromSelectedTruss = totalTrussSelected * trussWeightPerM;

        // Base Rigging Weight (Always add selected truss)
        riggingWeight += weightFromSelectedTruss;

        if (config.installationType === 'volada') {
            // Auto-calculate suggested truss weight ONLY if none selected in Volada mode (Safety fallback)
            const requiredTruss = Math.ceil(realW);
            if (totalTrussSelected === 0) {
                 riggingWeight += requiredTruss * trussWeightPerM;
            }

            for (let c = 0; c < cols; c++) {
                const isHalfW = (c >= colsFull);
                const colWidth = isHalfW ? 0.5 : modW_m;
                if (colWidth >= 1.0) bumpers1++; else bumpers05++;
            }
            riggingWeight += (bumpers1 * config.wBumper1) + (bumpers05 * config.wBumper05);
            riggingWeight += (bumpers1 + bumpers05) * (config.wSling + config.wShackle);
        } 
        
        // Hardware Calculation
        const numJoints = Math.max(0, totalTrussPieces - 1);
        const trussSpigots = numJoints * 4;
        const trussPins = numJoints * 8; 
        
        const stackHalfCouplers = config.stackBasePlates * 4;
        const stackPins = config.stackBasePlates * 4;

        const cableWeight = totalModules * RIGGING_WEIGHTS.cable;
        
        // Weight Breakdown: Separate Motors
        const weightSuspended = weightScreen + riggingWeight + cableWeight;
        const weightMotors = config.installationType === 'volada' ? (config.motorCount * config.motorWeight) : 0;
        const weightTotal = weightSuspended + weightMotors;

        // Power (Add special modules power - assuming same as full)
        const pFull = module.power;
        const pHalf = pFull * 0.5;
        const totalWatts = (numFullAdjusted * pFull) + (numHalf * pHalf) + (numQuarter * pHalf * 0.5) + (specialMods * pFull);
        const totalAmps = totalWatts / config.voltage;
        const amps3Phase = totalWatts / 690; // Approx 3-phase calculation

        // Lines
        const powerLines = Math.ceil(totalModules / config.feedCableInterval);
        const dataLines = Math.ceil(totalModules / config.signalReelInterval);

        // Motor Loads Breakdown
        const motorLoads: { lift: number, self: number, total: number }[] = [];
        if (config.installationType === 'volada') {
            const safeNumMotors = Math.max(2, config.motorCount);
            const dist = MOTOR_LOAD_DISTRIBUTION[safeNumMotors] || Array(safeNumMotors).fill(1 / safeNumMotors);
            
            dist.forEach(pct => {
                // Lift Load (Dynamic) * Safety Factor
                const liftLoad = (weightSuspended * config.safetyFactor) * pct;
                // Motor self weight is static
                const selfWeight = config.motorWeight;
                
                motorLoads.push({
                    lift: liftLoad,
                    self: selfWeight,
                    total: liftLoad + selfWeight
                });
            });
        }

        // Resolution & AR
        const resW = Math.round(realW * 1000 / (module.width / effPixH));
        const resH = Math.round(snappedH * 1000 / (module.height / effPixV));
        const div = gcd(resW, resH);
        const ar = `${resW / div}:${resH / div}`;

        // Multicable
        const requiredMultiCables = Math.ceil(powerLines / config.circuitsPerCable);
        let selectedMultiCables = 0;
        Object.values(config.multiCables).forEach((q: number) => selectedMultiCables += q);

        // Logistics
        const flyCasesMain = Math.ceil((numFullAdjusted + specialMods) / config.flyCaseInterval); 
        const numSmall = numHalf + numQuarter;
        const flyCasesSmall = Math.ceil(numSmall / config.flyCaseIntervalSmall);
        const powerLinks = totalModules - powerLines;
        const dataLinks = totalModules - dataLines;
        const totalBreakouts = requiredMultiCables + config.extraBreakouts;

        return {
            cols, rows, colsFull, rowsFull, hasHalfCol, hasHalfRow,
            totalModules, totalModulesFull: numFullAdjusted, totalModulesHalf: numHalf, totalModulesQuarter: numQuarter,
            realWidth: realW, realHeight: snappedH, area: realW * snappedH,
            aspectRatio: ar, resolutionX: resW, resolutionY: resH,
            weightScreen, weightRigging: riggingWeight, weightMotors, weightSuspended, weightTotal,
            powerTotal: totalWatts, ampsTotal: totalAmps, amps3Phase,
            powerLines, dataLines,
            bumpers1m: bumpers1, bumpers05m: bumpers05,
            motorLoads,
            requiredTruss: Math.ceil(realW),
            selectedTrussTotal: 0,
            trussSpigots, trussPins, stackHalfCouplers, stackPins, 
            requiredMultiCables, selectedMultiCables,
            flyCasesMain, flyCasesSmall, powerLinks, dataLinks, totalBreakouts
        };
    }, [config, modules]);

    const activeModule = modules.find(m => m.id === config.selectedModuleId) || modules[0];

    const toggleSection = (key: keyof typeof sections) => {
        setSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleConfigChange = (field: keyof ProjectConfig, value: any) => {
        if (typeof value === 'number' && isNaN(value)) value = undefined;
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleModuleChange = (newId: number) => {
        setConfig(prev => ({
            ...prev,
            selectedModuleId: newId,
            overrideWeight: undefined,
            overridePixH: undefined,
            overridePixV: undefined
        }));
    };

    const handleTrussChange = (len: string, qty: number) => {
        setConfig(prev => ({ ...prev, trussSegments: { ...prev.trussSegments, [len]: qty } }));
    };

    const handleMultiCableChange = (len: string, qty: number) => {
        setConfig(prev => ({ ...prev, multiCables: { ...prev.multiCables, [len]: qty } }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setConfig(prev => ({ ...prev, logo: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const generatePDF = () => {
        const element = document.getElementById('print-content');
        if (!element) return;
        
        // Temporarily force styles to ensure full capture of scrollable content
        const originalOverflow = element.style.overflow;
        const originalHeight = element.style.height;
        
        // This forces the container to be fully visible (no scroll) and layout as a desktop view
        element.style.overflow = 'visible';
        element.style.height = 'auto';

        const opt = {
            margin: [5, 5, 5, 5], // 5mm margins
            filename: `Reporte_${config.clientName || 'LED'}_${config.date}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                scrollY: 0,
                // Critical: Force a wide window width so grid columns don't collapse to single column
                windowWidth: 1400, 
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            // Ensure elements aren't cut in half
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        // @ts-ignore
        if (window.html2pdf) {
            // @ts-ignore
            window.html2pdf()
                .set(opt)
                .from(element)
                .save()
                .then(() => {
                    // Restore original styles after save is complete
                    element.style.overflow = originalOverflow;
                    element.style.height = originalHeight;
                });
        } else {
            alert("Librería PDF no cargada. Por favor recarga la página.");
            element.style.overflow = originalOverflow;
            element.style.height = originalHeight;
        }
    };

    // --- AI HANDLERS ---
    const handleAiSafety = async () => {
        setIsThinking(true);
        try {
            const summary = `Peso Total: ${result.weightTotal.toFixed(0)}kg, Motores: ${config.motorCount}x ${config.motorCapacity}kg, Instalación: ${config.installationType}, Dimensiones: ${result.realWidth}x${result.realHeight}m`;
            const analysis = await GeminiService.analyzeSafety(summary);
            setAiModal({ open: true, title: 'Análisis de Seguridad IA', content: analysis });
        } catch (e) {
            setAiModal({ open: true, title: 'Error', content: 'No se pudo conectar con el servicio de IA.' });
        }
        setIsThinking(false);
    };

    const handleAiFillModule = async () => {
        if (!newModule.brand || !newModule.model) return alert("Por favor introduce Marca y Modelo.");
        setIsThinking(true);
        try {
            const jsonStr = await GeminiService.getModuleSpecs(newModule.brand!, newModule.model!);
            const cleanJson = jsonStr.replace(/```json|```/g, '').trim();
            const data = JSON.parse(cleanJson);
            setNewModule(prev => ({
                ...prev,
                width: data.width_mm, height: data.height_mm, weight: data.weight_kg,
                power: data.max_power_w, pixH: data.pixels_h, pixV: data.pixels_v
            }));
        } catch (e) {
            alert("Fallo al obtener especificaciones.");
        }
        setIsThinking(false);
    };

    const saveNewModule = () => {
        if (newModule.brand && newModule.model && newModule.width) {
            const mod: LedModule = {
                id: Date.now(),
                brand: newModule.brand!,
                model: newModule.model!,
                width: newModule.width || 500,
                height: newModule.height || 500,
                weight: newModule.weight || 10,
                power: newModule.power || 150,
                pixH: newModule.pixH || 100,
                pixV: newModule.pixV || 100
            } as LedModule;
            setModules([...modules, mod]);
            setNewModule({});
            alert("Módulo guardado correctamente");
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800 md:overflow-hidden overflow-auto print:h-auto print:overflow-visible">
            {/* SIDEBAR */}
            <div className="w-full md:w-96 flex-none flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white shadow-lg z-20 h-auto md:h-full print:hidden">
                <div className="p-5 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-2 mb-4">
                        {config.logo ? (
                            <img src={config.logo} alt="Logo" className="h-8 object-contain" />
                        ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-600 rounded-md flex items-center justify-center text-white font-bold">L</div>
                        )}
                        <h1 className="text-xl font-extrabold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">Configurador LED</h1>
                    </div>
                    
                    <button onClick={() => setModalOpen(true)} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-md font-medium text-sm flex items-center justify-center gap-2 mb-4 transition-colors shadow-sm">
                        <ZoomIn size={16} /> Abrir Visor
                    </button>

                    <div className="flex border-b border-slate-100">
                        {[
                            { id: 'calculator', icon: Calculator, label: 'Calculadora' },
                            { id: 'database', icon: Database, label: 'Base Datos' },
                            { id: 'settings', icon: Settings, label: 'Ajustes' }
                        ].map((tab: any) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wide flex items-center justify-center gap-1 border-b-2 transition-all ${activeTab === tab.id ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                <tab.icon size={14} /> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll bg-slate-50 md:max-h-none max-h-[40vh]">
                    {activeTab === 'calculator' && (
                        <div className="p-4 space-y-4">
                            {/* ... Calculator Sections ... */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Proyecto" open={sections.project} onClick={() => toggleSection('project')} icon={Info} />
                                {sections.project && (
                                    <div className="p-4 space-y-3">
                                        <div><label className="text-xs font-bold text-slate-500 uppercase">Evento</label><input type="text" className={inputClass} value={config.eventName} onChange={(e) => handleConfigChange('eventName', e.target.value)} /></div>
                                        <div className="flex gap-2">
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Cliente</label><input type="text" className={inputClass} value={config.clientName} onChange={(e) => handleConfigChange('clientName', e.target.value)} /></div>
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Fecha</label><input type="date" className={inputClass} value={config.date} onChange={(e) => handleConfigChange('date', e.target.value)} /></div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Config Section */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Configuración Pantalla" open={sections.config} onClick={() => toggleSection('config')} icon={MonitorPlay} />
                                {sections.config && (
                                    <div className="p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Ancho (m)</label><input type="number" step="0.5" className={inputClass} value={config.targetWidth} onChange={(e) => handleConfigChange('targetWidth', parseFloat(e.target.value))} /></div>
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Alto (m)</label><input type="number" step="0.5" className={inputClass} value={config.targetHeight} onChange={(e) => handleConfigChange('targetHeight', parseFloat(e.target.value))} /></div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase">Modelo de Pantalla</label>
                                            <select className={inputClass} value={config.selectedModuleId} onChange={(e) => handleModuleChange(parseInt(e.target.value))}>
                                                {modules.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model} ({m.width}x{m.height}mm)</option>)}
                                            </select>
                                        </div>
                                        
                                        {/* MANUAL OVERRIDES */}
                                        <div className="flex gap-2 bg-slate-50 p-2 rounded border border-slate-100">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-400 block text-center">Peso (kg)</label>
                                                <input type="number" step="0.1" placeholder={activeModule.weight.toString()} className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white placeholder-slate-300" value={config.overrideWeight ?? ''} onChange={(e) => handleConfigChange('overrideWeight', parseFloat(e.target.value))} />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-400 block text-center">Pix H</label>
                                                <input type="number" placeholder={activeModule.pixH.toString()} className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white placeholder-slate-300" value={config.overridePixH ?? ''} onChange={(e) => handleConfigChange('overridePixH', parseFloat(e.target.value))} />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-400 block text-center">Pix V</label>
                                                <input type="number" placeholder={activeModule.pixV.toString()} className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white placeholder-slate-300" value={config.overridePixV ?? ''} onChange={(e) => handleConfigChange('overridePixV', parseFloat(e.target.value))} />
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100">
                                            <label className="text-[10px] font-bold text-red-600 uppercase mb-2 block">Módulos Especiales</label>
                                            <div className="flex gap-2">
                                                <div className="flex-1"><label className="text-[10px] text-slate-400">90° Izq</label><input type="number" className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white" value={config.modCornerL} onChange={(e) => handleConfigChange('modCornerL', parseInt(e.target.value) || 0)} /></div>
                                                <div className="flex-1"><label className="text-[10px] text-slate-400">90° Der</label><input type="number" className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white" value={config.modCornerR} onChange={(e) => handleConfigChange('modCornerR', parseInt(e.target.value) || 0)} /></div>
                                                <div className="flex-1"><label className="text-[10px] text-slate-400">Flex</label><input type="number" className="w-full p-1 border border-slate-300 rounded text-xs text-center text-slate-900 bg-white" value={config.modFlex} onChange={(e) => handleConfigChange('modFlex', parseInt(e.target.value) || 0)} /></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Rigging Section */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Rigging & Estructura" open={sections.rigging} onClick={() => toggleSection('rigging')} icon={Hammer} />
                                {sections.rigging && (
                                    <div className="p-4 space-y-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase">Modelo de Truss</label>
                                            <select className={inputClass} value={config.trussModel} onChange={(e) => handleConfigChange('trussModel', e.target.value)}>
                                                <option value="30x30">SQ-30</option>
                                                <option value="40x40">SQ-40</option>
                                                <option value="52x52">SQ-52</option>
                                            </select>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded border border-slate-200">
                                            <div className="flex justify-between text-xs font-bold mb-2 text-slate-700"><span>TRAMOS DE TRUSS</span> <span className="text-red-600">Rec: {config.installationType === 'volada' ? result.requiredTruss : '0'}m</span></div>
                                            <div className="grid grid-cols-4 gap-2">
                                                {['0.5', '1', '2', '3'].map(len => (
                                                    <div key={len}><label className="text-[10px] text-slate-500 block text-center">{len}m</label><input type="number" placeholder="0" className="w-full p-1 text-center text-xs border border-slate-300 bg-white rounded text-slate-900" value={config.trussSegments[len] || ''} onChange={(e) => handleTrussChange(len, parseInt(e.target.value))} /></div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex gap-4 mb-2 mt-4 pt-4 border-t border-slate-100">
                                            <label className="flex items-center gap-2 cursor-pointer text-slate-700"><input type="radio" name="install" checked={config.installationType === 'volada'} onChange={() => handleConfigChange('installationType', 'volada')} className="accent-red-600" /> <span className="text-sm">Volada (Flown)</span></label>
                                            <label className="flex items-center gap-2 cursor-pointer text-slate-700"><input type="radio" name="install" checked={config.installationType === 'estacada'} onChange={() => handleConfigChange('installationType', 'estacada')} className="accent-red-600" /> <span className="text-sm">Estacada (Stacked)</span></label>
                                        </div>
                                        
                                        {config.installationType === 'volada' && (
                                            <>
                                                <div className="flex gap-2">
                                                    <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Motores</label><input type="number" className={inputClass} value={config.motorCount} onChange={(e) => handleConfigChange('motorCount', parseInt(e.target.value))} /></div>
                                                    <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Capacidad (kg)</label>
                                                        <select className={inputClass} value={config.motorCapacity} onChange={(e) => handleConfigChange('motorCapacity', parseInt(e.target.value))}>
                                                            <option value="250">250</option>
                                                            <option value="500">500</option>
                                                            <option value="750">750</option>
                                                            <option value="1000">1000</option>
                                                            <option value="2000">2000</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Peso Motor (kg)</label><input type="number" className={inputClass} value={config.motorWeight} onChange={(e) => handleConfigChange('motorWeight', parseFloat(e.target.value))} /></div>
                                                    <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Coef. Seguridad</label><input type="number" step="0.1" min="1" className={inputClass} value={config.safetyFactor} onChange={(e) => handleConfigChange('safetyFactor', parseFloat(e.target.value))} /></div>
                                                </div>
                                                <button onClick={handleAiSafety} disabled={isThinking} className="w-full mt-2 bg-gradient-to-r from-slate-800 to-slate-700 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                                                    {isThinking ? 'Analizando...' : <>✨ Análisis Seguridad IA</>}
                                                </button>
                                            </>
                                        )}

                                        {config.installationType === 'estacada' && (
                                            <div className="space-y-3 mt-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase">Placas Base (Suelo)</label>
                                                    <input type="number" className={inputClass} value={config.stackBasePlates} onChange={(e) => handleConfigChange('stackBasePlates', parseInt(e.target.value) || 0)} placeholder="Cantidad de bases simples" />
                                                </div>
                                                <div className="pt-3 border-t border-slate-100">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Estructura Trasera (Bilite)</label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div><label className="text-[10px] text-slate-500 block">Bases Bilite</label><input type="number" className={inputClass} value={config.stackBiliteBase} onChange={(e) => handleConfigChange('stackBiliteBase', parseInt(e.target.value) || 0)} /></div>
                                                        <div><label className="text-[10px] text-slate-500 block">Bilite 1m</label><input type="number" className={inputClass} value={config.stackBilite1m} onChange={(e) => handleConfigChange('stackBilite1m', parseInt(e.target.value) || 0)} /></div>
                                                        <div><label className="text-[10px] text-slate-500 block">Bilite 0.5m</label><input type="number" className={inputClass} value={config.stackBilite05m} onChange={(e) => handleConfigChange('stackBilite05m', parseInt(e.target.value) || 0)} /></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Power Section */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Corriente y Señal" open={sections.power} onClick={() => toggleSection('power')} icon={Zap} />
                                {sections.power && (
                                    <div className="p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Voltaje</label><input type="number" className={inputClass} value={config.voltage} onChange={(e) => handleConfigChange('voltage', parseInt(e.target.value))} /></div>
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Max/Línea</label><input type="number" className={inputClass} value={config.feedCableInterval} onChange={(e) => handleConfigChange('feedCableInterval', parseInt(e.target.value))} /></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Max/Ramal Señal</label><input type="number" className={inputClass} value={config.signalReelInterval} onChange={(e) => handleConfigChange('signalReelInterval', parseInt(e.target.value))} /></div>
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Mód/Case (Grande)</label><input type="number" className={inputClass} value={config.flyCaseInterval} onChange={(e) => handleConfigChange('flyCaseInterval', parseInt(e.target.value))} /></div>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 mt-2">
                                            <label className="text-[10px] font-bold text-red-600 uppercase block mb-2">Rutero de Datos (Señal)</label>
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div><label className="text-[10px] text-slate-500 block">Patrón</label><select className={inputClass} value={config.dataRoute.pattern} onChange={(e) => handleConfigChange('dataRoute', {...config.dataRoute, pattern: e.target.value})}><option value="snake">Serpiente (S)</option><option value="straight">Normal (Z)</option></select></div>
                                                <div><label className="text-[10px] text-slate-500 block">Dirección</label><select className={inputClass} value={config.dataRoute.direction} onChange={(e) => handleConfigChange('dataRoute', {...config.dataRoute, direction: e.target.value})}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></div>
                                            </div>
                                            <div><label className="text-[10px] text-slate-500 block">Inicio</label><select className={inputClass} value={config.dataRoute.start} onChange={(e) => handleConfigChange('dataRoute', {...config.dataRoute, start: e.target.value})}><option value="tl">Arriba - Izquierda</option><option value="tr">Arriba - Derecha</option><option value="bl">Abajo - Izquierda</option><option value="br">Abajo - Derecha</option></select></div>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 mt-2">
                                            <label className="text-[10px] font-bold text-orange-600 uppercase block mb-2">Rutero de Corriente (Power)</label>
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div><label className="text-[10px] text-slate-500 block">Patrón</label><select className={inputClass} value={config.powerRoute.pattern} onChange={(e) => handleConfigChange('powerRoute', {...config.powerRoute, pattern: e.target.value})}><option value="snake">Serpiente (S)</option><option value="straight">Normal (Z)</option></select></div>
                                                <div><label className="text-[10px] text-slate-500 block">Dirección</label><select className={inputClass} value={config.powerRoute.direction} onChange={(e) => handleConfigChange('powerRoute', {...config.powerRoute, direction: e.target.value})}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></div>
                                            </div>
                                            <div><label className="text-[10px] text-slate-500 block">Inicio</label><select className={inputClass} value={config.powerRoute.start} onChange={(e) => handleConfigChange('powerRoute', {...config.powerRoute, start: e.target.value})}><option value="tl">Arriba - Izquierda</option><option value="tr">Arriba - Derecha</option><option value="bl">Abajo - Izquierda</option><option value="br">Abajo - Derecha</option></select></div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Multi, Infra, Video Sections (kept brief for brevity as they were unchanged) */}
                            {/* ... Multi ... */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Acometida Multicircuito" open={sections.multi} onClick={() => toggleSection('multi')} icon={Box} />
                                {sections.multi && (
                                    <div className="p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Modelo</label><select className={inputClass} value={config.multiCableType} onChange={(e) => handleConfigChange('multiCableType', e.target.value)}><option value="Socapex">Socapex</option><option value="Harting">Harting</option><option value="Cetac">Cetac</option></select></div>
                                            <div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Circuitos</label><select className={inputClass} value={config.circuitsPerCable} onChange={(e) => handleConfigChange('circuitsPerCable', parseInt(e.target.value))}><option value="6">6</option><option value="8">8</option></select></div>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded border border-slate-200">
                                            <div className="flex justify-between text-xs font-bold mb-2 text-slate-700"><span>MANGUERAS</span> <span className="text-red-600">Rec: {result.requiredMultiCables}</span></div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {['5', '10', '20', '25', '30', '50'].map(len => (
                                                    <div key={len}><label className="text-[10px] text-slate-500 block text-center">{len}m</label><input type="number" placeholder="0" className="w-full p-1 text-center text-xs border border-slate-300 bg-white rounded text-slate-900" value={config.multiCables[len] || ''} onChange={(e) => handleMultiCableChange(len, parseInt(e.target.value))} /></div>
                                                ))}
                                            </div>
                                            <div className="mt-2 text-right text-xs text-slate-500">Seleccionadas: <span className="font-bold text-red-600">{result.selectedMultiCables}</span></div>
                                        </div>
                                        <div><label className="text-xs font-bold text-slate-500 uppercase">Pulpos/Cajetines Extra</label><input type="number" className={inputClass} value={config.extraBreakouts} onChange={(e) => handleConfigChange('extraBreakouts', parseInt(e.target.value))} /></div>
                                    </div>
                                )}
                            </div>
                            {/* ... Infra & Video ... */}
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Infraestructura Eléctrica" open={sections.infra} onClick={() => toggleSection('infra')} icon={Zap} />
                                {sections.infra && <div className="p-4 space-y-3"><div><label className="text-xs font-bold text-slate-500 uppercase">Nombre Cuadro (PDU)</label><input type="text" className={inputClass} value={config.pduName} onChange={(e) => handleConfigChange('pduName', e.target.value)} /></div><div className="flex gap-2"><div className="w-1/3"><label className="text-xs font-bold text-slate-500 uppercase">Cantidad</label><input type="number" className={inputClass} value={config.pduCount} onChange={(e) => handleConfigChange('pduCount', parseInt(e.target.value))} /></div><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Conector</label><select className={inputClass} value={config.pduConnector} onChange={(e) => handleConfigChange('pduConnector', e.target.value)}><option value="Cetac 32A">Cetac 32A (3F)</option><option value="Cetac 63A">Cetac 63A (3F)</option><option value="Powerlock">Powerlock (3F)</option></select></div></div><div><label className="text-xs font-bold text-slate-500 uppercase">Distancia (m)</label><input type="number" className={inputClass} value={config.pduCableLen} onChange={(e) => handleConfigChange('pduCableLen', parseInt(e.target.value))} /></div></div>}
                            </div>
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <SectionHeader title="Control y Vídeo" open={sections.video} onClick={() => toggleSection('video')} icon={Cable} />
                                {sections.video && <div className="p-4 space-y-3"><div className="flex gap-2"><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Procesador</label><input type="text" className={inputClass} value={config.vidProcessor} onChange={(e) => handleConfigChange('vidProcessor', e.target.value)} /></div><div className="w-16"><label className="text-xs font-bold text-slate-500 uppercase">Cant.</label><input type="number" className={inputClass} value={config.vidProcessorQty} onChange={(e) => handleConfigChange('vidProcessorQty', parseInt(e.target.value))} /></div></div><div className="flex gap-2"><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase">Servidor</label><input type="text" className={inputClass} value={config.vidServer} onChange={(e) => handleConfigChange('vidServer', e.target.value)} /></div><div className="w-16"><label className="text-xs font-bold text-slate-500 uppercase">Cant.</label><input type="number" className={inputClass} value={config.vidServerQty} onChange={(e) => handleConfigChange('vidServerQty', parseInt(e.target.value))} /></div></div><div className="pt-2 border-t border-slate-100"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Interconexión</label><div className="flex gap-2 text-sm"><select className="flex-1 border border-slate-300 bg-white rounded p-1 text-slate-900" value={config.vidInterType} onChange={(e) => handleConfigChange('vidInterType', e.target.value)}><option>HDMI</option><option>DisplayPort</option><option>SDI</option></select><input type="number" className="w-16 border border-slate-300 bg-white rounded p-1 text-slate-900" placeholder="m" value={config.vidInterLen} onChange={(e) => handleConfigChange('vidInterLen', parseInt(e.target.value))} /><input type="number" className="w-12 border border-slate-300 bg-white rounded p-1 text-slate-900" value={config.vidInterQty} onChange={(e) => handleConfigChange('vidInterQty', parseInt(e.target.value))} /></div></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Distribución</label><div className="flex gap-2 text-sm"><select className="flex-1 border border-slate-300 bg-white rounded p-1 text-slate-900" value={config.vidDistType} onChange={(e) => handleConfigChange('vidDistType', e.target.value)}><option>Fibra Óptica</option><option>CAT6 (RJ45)</option></select><input type="number" className="w-16 border border-slate-300 bg-white rounded p-1 text-slate-900" placeholder="m" value={config.vidDistLen} onChange={(e) => handleConfigChange('vidDistLen', parseInt(e.target.value))} /><input type="number" className="w-12 border border-slate-300 bg-white rounded p-1 text-slate-900" value={config.vidDistQty} onChange={(e) => handleConfigChange('vidDistQty', parseInt(e.target.value))} /></div></div><div><label className="text-xs font-bold text-slate-500 uppercase">Accesorios</label><input type="text" className={inputClass} value={config.vidAccessories} onChange={(e) => handleConfigChange('vidAccessories', e.target.value)} /></div></div>}
                            </div>
                        </div>
                    )}
                    
                    {/* Database Tab */}
                    {activeTab === 'database' && (
                        <div className="p-4 space-y-4">
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <h3 className="font-bold mb-3 text-sm text-slate-800">Añadir Nuevo Módulo</h3>
                                <div className="space-y-2">
                                    <input placeholder="Marca (Ej. Absen)" className={inputClass} value={newModule.brand || ''} onChange={(e) => setNewModule({...newModule, brand: e.target.value})} />
                                    <input placeholder="Modelo (Ej. PL2.5)" className={inputClass} value={newModule.model || ''} onChange={(e) => setNewModule({...newModule, model: e.target.value})} />
                                    <button onClick={handleAiFillModule} disabled={isThinking} className="w-full bg-indigo-50 text-indigo-600 py-1.5 rounded text-xs font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors">
                                        {isThinking ? 'Pensando...' : '✨ Autocompletar con IA'}
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="number" placeholder="Ancho (mm)" className={inputClass} value={newModule.width || ''} onChange={(e) => setNewModule({...newModule, width: parseFloat(e.target.value)})} />
                                        <input type="number" placeholder="Alto (mm)" className={inputClass} value={newModule.height || ''} onChange={(e) => setNewModule({...newModule, height: parseFloat(e.target.value)})} />
                                    </div>
                                    <button onClick={saveNewModule} className="w-full bg-green-600 text-white py-2 rounded text-sm font-bold hover:bg-green-700 transition-colors">Guardar Módulo</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-xs uppercase text-slate-400">Módulos Guardados</h3>
                                {modules.map(m => (
                                    <div key={m.id} className="p-3 bg-white border border-slate-200 rounded flex justify-between items-center text-sm">
                                        <span className="text-slate-700">{m.brand} <strong>{m.model}</strong></span>
                                        <button onClick={() => setModules(modules.filter(x => x.id !== m.id))} className="text-red-400 hover:text-red-600">×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="p-4 space-y-4">
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                    <ImageIcon size={16} className="text-blue-600" />
                                    <h3 className="font-bold text-sm text-slate-800">Logo de Empresa</h3>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-4">
                                        {config.logo ? (
                                            <div className="w-20 h-20 border border-slate-200 rounded flex items-center justify-center bg-slate-50 overflow-hidden">
                                                <img src={config.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                            </div>
                                        ) : (
                                            <div className="w-20 h-20 border-2 border-dashed border-slate-200 rounded flex items-center justify-center text-slate-400 text-xs text-center p-2">
                                                Sin Logo
                                            </div>
                                        )}
                                        <div className="flex-1 space-y-2">
                                            <label className="block w-full text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-2 text-center rounded cursor-pointer transition-colors">
                                                Subir Imagen
                                                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                            </label>
                                            {config.logo && (
                                                <button onClick={() => handleConfigChange('logo', null)} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 py-2 rounded transition-colors">
                                                    <Trash2 size={12} /> Eliminar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400">Recomendado: PNG fondo transparente. Se mostrará en el encabezado del reporte.</p>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                    <Palette size={16} className="text-purple-600" />
                                    <h3 className="font-bold text-sm text-slate-800">Personalización Visual</h3>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Color Módulo (Par)</label><input type="color" value={config.moduleColorEven} onChange={(e) => handleConfigChange('moduleColorEven', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" /></div>
                                    <div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Color Módulo (Impar)</label><input type="color" value={config.moduleColorOdd} onChange={(e) => handleConfigChange('moduleColorOdd', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" /></div>
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-50"><label className="text-xs font-bold text-slate-600">Relleno Degradado</label><input type="checkbox" checked={config.moduleGradient} onChange={(e) => handleConfigChange('moduleGradient', e.target.checked)} className="accent-purple-600 w-4 h-4" /></div>
                                    <div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Tipo de Degradado</label><select className="p-1 border border-slate-300 rounded text-xs" value={config.moduleGradientType} onChange={(e) => handleConfigChange('moduleGradientType', e.target.value)} disabled={!config.moduleGradient}><option value="linear">Lineal</option><option value="radial">Radial</option><option value="conic">Cónico</option><option value="square">Cuadrado (Pirámide)</option></select></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div id="print-content" className="flex-1 flex flex-col h-full relative z-0 md:overflow-hidden print:overflow-visible print:h-auto">
                 {/* Project Header */}
                <div className="bg-white border-b border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-end print-layout gap-4">
                    <div className="flex items-center gap-4">
                        {config.logo ? (
                            <img src={config.logo} alt="Company Logo" className="h-16 object-contain" />
                        ) : null}
                        <div>
                            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Informe Técnico</h2>
                            <p className="text-xs font-medium text-red-600 uppercase tracking-widest mt-1">Cubic Light Tool v6.2</p>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-2 md:gap-8 text-left md:text-right w-full md:w-auto">
                        <div className="flex justify-between md:block"><div className="text-[10px] font-bold text-slate-400 uppercase">Evento</div><div className="font-bold text-slate-800">{config.eventName || '-'}</div></div>
                        <div className="flex justify-between md:block"><div className="text-[10px] font-bold text-slate-400 uppercase">Cliente</div><div className="font-bold text-slate-800">{config.clientName || '-'}</div></div>
                        <div className="flex justify-between md:block"><div className="text-[10px] font-bold text-slate-400 uppercase">Fecha</div><div className="font-bold text-slate-800">{config.date || '-'}</div></div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 print-layout print:overflow-visible print:h-auto">
                    {/* RESULTS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 print-grid">
                        
                        {/* DIMS CARD */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                            <h4 className="text-xs font-extrabold text-red-600 uppercase border-b border-slate-100 pb-2 mb-3">Dimensiones y Píxeles</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-500">Configuración</span> <span className="font-mono font-bold text-slate-800">{result.cols} x {result.rows}</span></div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Total Módulos</span> 
                                    <div className="text-right">
                                        <span className="font-bold text-red-600 block">{result.totalModules}</span>
                                        {(config.modCornerL > 0 || config.modCornerR > 0 || config.modFlex > 0) && (
                                            <span className="text-[10px] text-slate-400 block font-normal">
                                                ({result.totalModulesFull} Std 
                                                {config.modCornerL > 0 && ` + ${config.modCornerL} Esq.L`}
                                                {config.modCornerR > 0 && ` + ${config.modCornerR} Esq.R`}
                                                {config.modFlex > 0 && ` + ${config.modFlex} Flex`}
                                                )
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between"><span className="text-slate-500">Resolución</span> <span className="text-slate-800">{result.resolutionX} x {result.resolutionY} px</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Relación Aspecto</span> <span className="text-slate-800">{result.aspectRatio}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Dimensión Real</span> <span className="font-bold text-slate-800">{result.realWidth.toFixed(2)}m x {result.realHeight.toFixed(2)}m</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Área</span> <span className="text-slate-800">{result.area.toFixed(2)} m²</span></div>
                            </div>
                        </div>

                         {/* WEIGHT CARD */}
                         <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                            <h4 className="text-xs font-extrabold text-red-600 uppercase border-b border-slate-100 pb-2 mb-3">Pesos y Cargas</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-500">Pantalla (Solo)</span> <span className="text-slate-800">{result.weightScreen.toFixed(0)} kg</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Rigging (Est.)</span> <span className="text-slate-800">{result.weightRigging.toFixed(0)} kg</span></div>
                                {result.weightMotors > 0 && (
                                    <div className="flex justify-between"><span className="text-slate-500">Motores (Peso Propio)</span> <span className="text-slate-800">{result.weightMotors.toFixed(0)} kg</span></div>
                                )}
                                <div className="flex justify-between pt-2 border-t border-slate-50"><span className="font-bold text-slate-700">TOTAL SISTEMA (Masa)</span> <span className="font-bold text-slate-800 text-lg">{result.weightTotal.toFixed(0)} kg</span></div>
                                {config.safetyFactor > 1 && (
                                    <div className="flex justify-between bg-red-50 p-1 px-2 -mx-2 rounded">
                                        <span className="font-bold text-red-800 text-xs flex items-center gap-1"><AlertTriangle size={10} /> CARGA DINÁMICA (SF {config.safetyFactor})</span>
                                        <span className="font-bold text-red-800">{(result.weightTotal * config.safetyFactor).toFixed(0)} kg</span>
                                    </div>
                                )}
                            </div>
                            {config.installationType === 'volada' && (
                                <div className="mt-4 pt-3 border-t border-dashed border-slate-200">
                                    <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex justify-between">
                                        <span>Carga Motores (SF {config.safetyFactor}x)</span>
                                        <span className="text-xs normal-case text-slate-300">Útil / Total</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {result.motorLoads.map((load, i) => (
                                            <div key={i} className={`text-xs p-1 px-2 rounded flex flex-col ${load.lift > config.motorCapacity ? 'bg-red-50 text-red-700 font-bold border border-red-100' : 'bg-slate-50 text-slate-600'}`}>
                                                <div className="flex justify-between border-b border-slate-200 pb-1 mb-1">
                                                    <span>M{i+1}</span>
                                                    <span className={load.lift > config.motorCapacity ? 'text-red-700' : 'text-slate-400'}>{load.total.toFixed(0)}kg</span>
                                                </div>
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-400">Útil:</span>
                                                    <span>{load.lift.toFixed(0)}kg</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                         {/* POWER CARD */}
                         <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                            <h4 className="text-xs font-extrabold text-red-600 uppercase border-b border-slate-100 pb-2 mb-3">Consumo Eléctrico</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-500">Consumo Max</span> <span className="font-bold text-red-600">{(result.powerTotal/1000).toFixed(2)} kW</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Amperaje (@{config.voltage}V)</span> <span className="text-slate-800">{result.ampsTotal.toFixed(1)} A</span></div>
                                <div className="flex justify-between bg-green-50 p-1 rounded px-2 -mx-2"><span className="text-green-700 font-medium">Amperaje (3F)</span> <span className="font-bold text-green-700">{result.amps3Phase.toFixed(1)} A/fase</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Líneas Necesarias</span> <span className="text-slate-800">{result.powerLines}</span></div>
                            </div>
                            <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-100">
                                <div className="text-[10px] font-bold text-blue-800 uppercase mb-1">Cuadro de Distribución</div>
                                <div className="text-xs text-blue-900 font-medium flex justify-between mb-1">
                                    <span>{config.pduName || 'Cuadro Principal'} ({config.pduCount}x)</span>
                                </div>
                                <div className="text-xs text-blue-800 flex justify-between">
                                    <span>Acometida:</span> <span className="font-bold">{config.pduConnector}</span>
                                </div>
                            </div>
                        </div>

                         {/* VIDEO SIGNAL CARD */}
                         <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                            <h4 className="text-xs font-extrabold text-red-600 uppercase border-b border-slate-100 pb-2 mb-3">Flujo de Señal de Vídeo</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-500">Procesador</span> <span className="font-bold text-slate-800">{config.vidProcessorQty}x {config.vidProcessor || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Source/Player</span> <span className="text-slate-800">{config.vidServerQty}x {config.vidServer || '-'}</span></div>
                                
                                <div className="mt-3 pt-3 border-t border-dashed border-slate-100">
                                    <div className="flex justify-between mb-1"><span className="text-slate-500">Interconexión</span> <span className="text-slate-800">{config.vidInterQty}x {config.vidInterType} ({config.vidInterLen}m)</span></div>
                                    <div className="flex justify-between mb-1"><span className="text-slate-500">Distribución</span> <span className="text-slate-800">{config.vidDistQty}x {config.vidDistType} ({config.vidDistLen}m)</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Accesorios</span> <span className="text-slate-800">{config.vidAccessories || '-'}</span></div>
                                </div>
                            </div>
                        </div>

                        {/* LOGISTICS CARD */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow md:col-span-2">
                            <h4 className="text-xs font-extrabold text-red-600 uppercase border-b border-slate-100 pb-2 mb-3">Logística y Cableado</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-slate-50 pb-1">
                                        <span className="text-slate-500">Flycases ({activeModule.width/1000}x{activeModule.height/1000}m)</span>
                                        <span className="font-bold text-slate-800">{result.flyCasesMain} <span className="text-xs font-normal text-slate-400">({config.flyCaseInterval}/case)</span></span>
                                    </div>
                                    {result.flyCasesSmall > 0 && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1">
                                            <span className="text-slate-500">Flycases (Pequeños)</span>
                                            <span className="font-bold text-slate-800">{result.flyCasesSmall} <span className="text-xs font-normal text-slate-400">({config.flyCaseIntervalSmall}/case)</span></span>
                                        </div>
                                    )}
                                    <div className="flex justify-between"><span className="text-slate-500">Tiradas Señal (RJ45)</span> <span className="text-slate-800">{result.dataLines}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Tiradas Corriente</span> <span className="text-slate-800">{result.powerLines}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Links Corriente</span> <span className="text-slate-800">{result.powerLinks}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Links Señal</span> <span className="text-slate-800">{result.dataLinks}</span></div>
                                    <div className="flex justify-between pt-2 border-t border-slate-50"><span className="text-slate-500">Bumpers</span> <span className="text-slate-800">{result.bumpers1m}x 1m, {result.bumpers05m}x 0.5m</span></div>
                                    {config.installationType === 'estacada' && (
                                        <div className="mt-2 pt-2 border-t border-slate-50 space-y-1">
                                            <div className="flex justify-between"><span className="text-slate-500">Placas Base</span> <span className="text-slate-800">{config.stackBasePlates}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-500">Bases Bilite</span> <span className="text-slate-800">{config.stackBiliteBase}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-500">Bilite 1m</span> <span className="text-slate-800">{config.stackBilite1m}</span></div>
                                            <div className="flex justify-between"><span className="text-slate-500">Bilite 0.5m</span> <span className="text-slate-800">{config.stackBilite05m}</span></div>
                                            <div className="flex justify-between text-[10px] text-slate-500 pt-1"><span>Medios Huevos</span> <span>{result.stackHalfCouplers}</span></div>
                                            <div className="flex justify-between text-[10px] text-slate-500"><span>Balas Base</span> <span>{result.stackPins}</span></div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="bg-orange-50 p-2 rounded border border-orange-100">
                                        <div className="text-[10px] font-bold text-orange-800 uppercase mb-1">Multicircuito ({config.multiCableType})</div>
                                        <div className="text-xs space-y-1">
                                            {Object.entries(config.multiCables).map(([len, qty]) => (
                                                 (qty as number) > 0 && <div key={len} className="flex justify-between"><span>{len}m</span> <span className="font-bold">{qty as number}</span></div>
                                            ))}
                                            {result.selectedMultiCables === 0 && <div className="italic text-slate-400">Sin mangueras seleccionadas</div>}
                                            <div className="border-t border-orange-200 pt-1 mt-1 flex justify-between font-medium text-orange-900">
                                                <span>Cajetines/Pulpos</span> <span>{result.totalBreakouts}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* TRUSS LOGISTICS - VISIBLE IN BOTH MODES */}
                                    <div className="bg-purple-50 p-2 rounded border border-purple-100">
                                        <div className="text-[10px] font-bold text-purple-800 uppercase mb-1">Truss ({config.trussModel})</div>
                                        <div className="text-xs space-y-1 mb-2">
                                            {Object.entries(config.trussSegments).map(([len, qty]) => (
                                                 (qty as number) > 0 && <div key={len} className="flex justify-between"><span>{len}m</span> <span className="font-bold">{qty as number}</span></div>
                                            ))}
                                            {Object.values(config.trussSegments).every(q => q === 0) && <div className="italic text-slate-400">Sin tramos seleccionados</div>}
                                        </div>
                                        <div className="border-t border-purple-200 pt-1 mt-1 text-[10px] text-purple-900 font-medium space-y-1">
                                            <div className="flex justify-between"><span>Huevos</span> <span>{result.trussSpigots}</span></div>
                                            <div className="flex justify-between"><span>Balas</span> <span>{result.trussPins}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* CANVAS PREVIEW */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6 page-break-avoid">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-sm text-slate-700 uppercase">Esquema Técnico</h3>
                            <div className="flex gap-4 no-print">
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-slate-700"><input type="checkbox" checked={showCanvasOptions.power} onChange={() => setShowCanvasOptions(p => ({...p, power: !p.power}))} className="accent-red-600" /> Corriente</label>
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-slate-700"><input type="checkbox" checked={showCanvasOptions.data} onChange={() => setShowCanvasOptions(p => ({...p, data: !p.data}))} className="accent-red-600" /> Señal</label>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-100 flex justify-center items-center overflow-auto" style={{backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                            <CanvasVisualizer 
                                config={config} 
                                module={activeModule} 
                                result={result} 
                                showPower={showCanvasOptions.power} 
                                showData={showCanvasOptions.data} 
                            />
                        </div>
                        <div className="p-3 border-t border-slate-100 bg-white text-xs flex justify-center flex-wrap gap-4 md:gap-6 text-slate-500">
                             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{background: config.moduleColorEven}}></div> Módulo</div>
                             <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500 rounded-full border border-slate-200"></div> Línea Corriente</div>
                             <div className="flex items-center gap-2"><div className="w-6 h-1 bg-red-500 rounded-full"></div> Línea Señal</div>
                             {config.installationType === 'volada' && (
                                <div className="flex gap-4 border-l pl-4 border-slate-200">
                                    <div className="flex items-center gap-1 font-bold text-[10px] text-purple-500">● &lt;80%</div>
                                    <div className="flex items-center gap-1 font-bold text-[10px] text-yellow-500">● 80-99%</div>
                                    <div className="flex items-center gap-1 font-bold text-[10px] text-red-600">● &gt;100%</div>
                                </div>
                             )}
                        </div>
                    </div>

                    <div className="text-center text-slate-400 text-xs no-print mb-10">
                        <button onClick={generatePDF} className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-700 transition-colors">
                            <Download size={14} /> Descargar PDF
                        </button>
                    </div>

                </div>
            </div>

            {/* MODALS */}
            {modalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-800">Visualizador Detallado</h3>
                            <button onClick={() => setModalOpen(false)} className="text-3xl leading-none text-slate-400 hover:text-red-600">&times;</button>
                        </div>
                        <div className="flex-1 bg-slate-200 overflow-auto p-10 flex items-center justify-center relative">
                            <CanvasVisualizer 
                                config={config} 
                                module={activeModule} 
                                result={result} 
                                showPower={true} 
                                showData={true} 
                                modalMode={true}
                                className="shadow-2xl"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* AI INFO MODAL */}
            {aiModal.open && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><Cpu size={18} /> {aiModal.title}</h3>
                            <button onClick={() => setAiModal({...aiModal, open: false})} className="text-white hover:text-red-400">&times;</button>
                        </div>
                        <div className="p-6 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {aiModal.content}
                        </div>
                        <div className="p-4 bg-slate-50 border-t flex justify-end">
                            <button onClick={() => setAiModal({...aiModal, open: false})} className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-700">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;