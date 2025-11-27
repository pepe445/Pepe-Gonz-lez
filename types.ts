
export interface LedModule {
    id: number;
    brand: string;
    model: string;
    width: number; // mm
    height: number; // mm
    weight: number; // kg
    power: number; // watts
    pixH: number;
    pixV: number;
}

export interface ProjectConfig {
    eventName: string;
    clientName: string;
    date: string;
    logo: string | null; // Base64 logo string
    
    // Screen Dims
    targetWidth: number; // m
    targetHeight: number; // m
    selectedModuleId: number;

    // Manual Overrides (Quick Edits)
    overrideWeight?: number;
    overridePixH?: number;
    overridePixV?: number;
    
    // Special Modules
    modCornerL: number;
    modCornerR: number;
    modFlex: number;
    
    // Visuals
    moduleColorEven: string;
    moduleColorOdd: string;
    moduleGradient: boolean;
    moduleGradientType: 'linear' | 'radial' | 'conic' | 'square';
    
    // Rigging
    installationType: 'volada' | 'estacada';
    trussModel: '30x30' | '40x40' | '52x52';
    truss52ConnType: 'burlones' | 'tornillo';
    motorCount: number;
    motorCapacity: number;
    motorWeight: number; // New: Self weight of motor
    slingLength: number;
    safetyFactor: number;
    
    // Rigging Weights Custom
    wBumper1: number;
    wBumper05: number;
    wSling: number;
    wShackle: number;
    
    // Estacada Specifics
    stackBasePlates: number;
    stackBiliteBase: number;
    stackBilite1m: number;
    stackBilite05m: number;

    // Truss Segments (Store as map: length -> quantity)
    trussSegments: Record<string, number>;
    
    // Power & Signal
    voltage: number;
    feedCableInterval: number;
    signalReelInterval: number;
    flyCaseInterval: number;
    flyCaseIntervalSmall: number;
    
    // Routes
    dataRoute: {
        pattern: 'snake' | 'straight';
        direction: 'vertical' | 'horizontal';
        start: 'tl' | 'tr' | 'bl' | 'br';
    };
    powerRoute: {
        pattern: 'snake' | 'straight';
        direction: 'vertical' | 'horizontal';
        start: 'tl' | 'tr' | 'bl' | 'br';
    };

    // Multicable
    multiCableType: 'Socapex' | 'Harting' | 'Cetac';
    circuitsPerCable: number;
    extraBreakouts: number;
    multiCables: Record<string, number>;

    // PDU
    pduName: string;
    pduCount: number;
    pduConnector: string;
    pduCableLen: number;

    // Video
    vidProcessor: string;
    vidProcessorQty: number;
    vidServer: string;
    vidServerQty: number;
    vidInterType: string;
    vidInterLen: number;
    vidInterQty: number;
    vidDistType: string;
    vidDistLen: number;
    vidDistQty: number;
    vidAccessories: string;
}

export interface CalculationResult {
    cols: number;
    rows: number;
    colsFull: number;
    rowsFull: number;
    hasHalfCol: boolean;
    hasHalfRow: boolean;
    
    totalModules: number;
    totalModulesFull: number;
    totalModulesHalf: number;
    totalModulesQuarter: number;
    
    realWidth: number;
    realHeight: number;
    area: number;
    aspectRatio: string;
    resolutionX: number;
    resolutionY: number;
    
    weightScreen: number;
    weightRigging: number;
    weightMotors: number; // New: Total weight of motors themselves
    weightSuspended: number; // New: Weight hanging FROM motors
    weightTotal: number; // Total weight on structure
    
    powerTotal: number;
    ampsTotal: number;
    amps3Phase: number;
    powerLines: number;
    dataLines: number;
    
    bumpers1m: number;
    bumpers05m: number;
    
    // Updated: Detailed breakdown
    motorLoads: {
        lift: number; // Load the motor is lifting (Capacity check)
        self: number; // Weight of the motor
        total: number; // Total load on point
    }[];
    
    requiredTruss: number;
    selectedTrussTotal: number;
    
    // Hardware
    trussSpigots: number;
    trussPins: number;
    stackHalfCouplers: number;
    stackPins: number;

    requiredMultiCables: number;
    selectedMultiCables: number;
    
    // Logistics
    flyCasesMain: number;
    flyCasesSmall: number;
    powerLinks: number;
    dataLinks: number;
    totalBreakouts: number;
}