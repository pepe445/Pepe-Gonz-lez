import { LedModule, ProjectConfig } from './types';

export const DEFAULT_MODULES: LedModule[] = [
    { id: 1, brand: "Generic", model: "P3.91 Indoor", width: 500, height: 500, weight: 8.5, power: 150, pixH: 128, pixV: 128 },
    { id: 2, brand: "Generic", model: "P2.6 Indoor", width: 500, height: 500, weight: 7.5, power: 140, pixH: 192, pixV: 192 },
    { id: 3, brand: "Absen", model: "PL2.5 Pro", width: 500, height: 500, weight: 7.5, power: 130, pixH: 200, pixV: 200 },
    { id: 4, brand: "Absen", model: "PL2.5 Lite", width: 500, height: 500, weight: 6.5, power: 120, pixH: 200, pixV: 200 },
    { id: 5, brand: "Absen", model: "PL3.9 Lite", width: 500, height: 1000, weight: 14, power: 250, pixH: 128, pixV: 256 },
    { id: 6, brand: "ROE", model: "Black Pearl BP2V2", width: 500, height: 500, weight: 9.4, power: 180, pixH: 176, pixV: 176 },
    { id: 7, brand: "ROE", model: "Carbon CB3", width: 600, height: 1200, weight: 13.8, power: 300, pixH: 160, pixV: 320 },
    { id: 8, brand: "Gloshine", model: "Legend 3.9", width: 500, height: 1000, weight: 11, power: 200, pixH: 128, pixV: 256 },
];

export const INITIAL_CONFIG: ProjectConfig = {
    eventName: '',
    clientName: '',
    date: new Date().toISOString().split('T')[0],
    logo: null, // Default no logo
    targetWidth: 4,
    targetHeight: 2.5,
    selectedModuleId: 3,
    modCornerL: 0,
    modCornerR: 0,
    modFlex: 0,
    moduleColorEven: '#dc2626',
    moduleColorOdd: '#991b1b',
    moduleGradient: true,
    moduleGradientType: 'linear',
    installationType: 'volada',
    trussModel: '40x40',
    truss52ConnType: 'burlones',
    motorCount: 2,
    motorCapacity: 1000,
    motorWeight: 50, // Default 50kg
    slingLength: 1.5,
    safetyFactor: 1,
    wBumper1: 12,
    wBumper05: 6,
    wSling: 2,
    wShackle: 0.5,
    stackBasePlates: 0,
    stackBiliteBase: 0,
    stackBilite1m: 0,
    stackBilite05m: 0,
    trussSegments: { '0.5': 0, '1': 0, '2': 0, '3': 0 },
    voltage: 230,
    feedCableInterval: 12,
    signalReelInterval: 16,
    flyCaseInterval: 8,
    flyCaseIntervalSmall: 10,
    dataRoute: { pattern: 'snake', direction: 'vertical', start: 'tl' },
    powerRoute: { pattern: 'straight', direction: 'vertical', start: 'tl' },
    multiCableType: 'Socapex',
    circuitsPerCable: 6,
    extraBreakouts: 0,
    multiCables: { '5': 0, '10': 0, '20': 0, '25': 0, '30': 0, '50': 0 },
    pduName: '',
    pduCount: 1,
    pduConnector: 'Cetac 63A',
    pduCableLen: 10,
    vidProcessor: '',
    vidProcessorQty: 1,
    vidServer: '',
    vidServerQty: 1,
    vidInterType: 'HDMI',
    vidInterLen: 2,
    vidInterQty: 1,
    vidDistType: 'Fibra Óptica',
    vidDistLen: 100,
    vidDistQty: 2,
    vidAccessories: ''
};

export const RIGGING_WEIGHTS = {
    truss30: 4.5,
    truss40: 6.5,
    truss52: 10,
    motor: 45,
    cable: 0.2, // kg per module
};

export const LINE_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#6366f1', '#a855f7', '#d946ef', '#f43f5e'
];