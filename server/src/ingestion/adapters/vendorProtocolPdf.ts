import type { ProtocolPdfExtraction, ExtractedProtocolStep, MaterialReference } from '../types.js';

// Valid verb keywords for protocol steps
const VERB_KEYWORDS = [
  'add',
  'vortex',
  'incubate',
  'centrifuge',
  'pipette',
  'wash',
  'elute',
  'mix',
  'transfer',
  'aspirate',
  'discard',
] as const;

type VerbKeyword = (typeof VERB_KEYWORDS)[number] | 'other';

// Equipment hints mapping - keywords that indicate equipment usage
const EQUIPMENT_KEYWORDS: Record<string, string[]> = {
  centrifuge: ['centrifuge', 'microcentrifuge', 'spin column', 'centrifugation'],
  vortex: ['vortex', 'vortexing', 'vortex mixer'],
  'heat block': ['heat block', 'heating block', 'dry bath'],
  'water bath': ['water bath', 'incubator'],
  pipette: ['pipette', 'pipetting', 'pipet'],
  'microcentrifuge tube': ['microcentrifuge tube', '1.5 mL tube', '2 mL tube', 'collection tube'],
  'spin column': ['spin column', 'DNeasy Mini spin column'],
  incubator: ['incubate', 'incubation', 'room temperature'],
};

// Material patterns for extraction
const VOLUME_PATTERN = /([0-9,]+(?:\.[0-9]+)?)\s*(µL|uL|mL|L|μL)\b/gi;
const MATERIAL_PATTERN = /(?:buffer|reagent|solution|ethanol|proteinase|enzyme)\s+([A-Za-z][A-Za-z0-9\s\-()%]+?)(?:\.|,|;|$|at|to|into|in)/gi;

/**
 * Extract verb keyword from step text
 */
function extractVerbKeyword(text: string): VerbKeyword {
  const lower = text.toLowerCase();
  
  // First, look for verbs at the start of the text
  for (const verb of VERB_KEYWORDS) {
    const verbRegex = new RegExp(`^${verb}\\b`, 'i');
    if (verbRegex.test(lower)) {
      return verb;
    }
  }
  
  // Handle "pipet" as an alias for "pipette" anywhere in the text
  if (/\b(pipet|pipette)\b/.test(lower)) {
    return 'pipette';
  }
  
  return 'other';
}

/**
 * Extract equipment hints from step text
 */
function extractEquipmentHints(text: string): string[] {
  const lower = text.toLowerCase();
  const hints: string[] = [];
  
  for (const [equipment, keywords] of Object.entries(EQUIPMENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        if (!hints.includes(equipment)) {
          hints.push(equipment);
        }
        break;
      }
    }
  }
  
  return hints;
}

/**
 * Extract parameters (temperature, duration, speed, volume) from step text
 */
function extractParameters(text: string): ExtractedProtocolStep['parameters'] {
  const params: ExtractedProtocolStep['parameters'] = {};
  
  // Temperature pattern: e.g., "56°C", "56 C", "room temperature"
  const tempMatch = text.match(/(\d+\s*°?C|room\s+temperature)/i);
  if (tempMatch?.[1]) {
    const tempValue = tempMatch[1];
    params.temperature = tempValue.toLowerCase().includes('room') 
      ? 'room temperature' 
      : tempValue;
  }
  
  // Duration pattern: e.g., "10 min", "1 min", "30 seconds"
  const durationMatch = text.match(/(\d+(?:,\d+)?\s*(?:min|minute|sec|second|hour|h)\b)/i);
  if (durationMatch?.[1]) {
    params.duration = durationMatch[1];
  }
  
  // Speed pattern: e.g., "6000 x g", "20,000 x g"
  const speedMatch = text.match(/(\d+(?:,\d+)?\s*x\s*g)/i);
  if (speedMatch?.[1]) {
    params.speed = speedMatch[1];
  }
  
  // Volume pattern: e.g., "200 µL", "500 µL"
  const volumeMatch = text.match(/(\d+(?:,\d+)?\s*(?:µL|uL|mL|L|μL))/i);
  if (volumeMatch?.[1]) {
    params.volume = volumeMatch[1];
  }
  
  return params;
}

/**
 * Extract materials from step text
 */
function extractMaterials(text: string): MaterialReference[] {
  const materials: MaterialReference[] = [];
  
  // First, extract volume information
  const volumeMatches = [...text.matchAll(VOLUME_PATTERN)];
  const volumes: Record<number, string> = {};
  
  volumeMatches.forEach((match, index) => {
    volumes[index] = match[0];
  });
  
  // Extract material names using patterns
  const materialMatches = [...text.matchAll(MATERIAL_PATTERN)];
  
  materialMatches.forEach((match, index) => {
    const name = match[1]?.trim();
    if (name) {
      const material: MaterialReference = { name };
      const vol = volumes[index];
      if (vol) {
        material.volume = vol as string;
      }
      materials.push(material);
    }
  });
  
  // Also look for specific material patterns like "Buffer AL", "Buffer AW1"
  const bufferMatches = [...text.matchAll(/(Buffer\s+[A-Za-z0-9]+)/gi)];
  bufferMatches.forEach((match) => {
    const name = match[1];
    if (name && !materials.some(m => m.name === name)) {
      // Check if there's a volume before this buffer name
      const volumeBefore = text.substring(0, match.index).match(/(\d+(?:,\d+)?\s*(?:µL|uL|mL|L|μL))\s*$/i);
      const material: MaterialReference = { name };
      if (volumeBefore?.[1]) {
        material.volume = volumeBefore[1] as string;
      }
      materials.push(material);
    }
  });
  
  // Look for ethanol and other common reagents
  const ethanolMatch = text.match(/(ethanol\s*\([^)]+\)|ethanol\s+\d+%)/i);
  const ethanolName = ethanolMatch?.[1];
  if (ethanolName && !materials.some(m => m.name.toLowerCase().includes('ethanol'))) {
    const volumeBefore = text.substring(0, ethanolMatch.index).match(/(\d+(?:,\d+)?\s*(?:µL|uL|mL|L|μL))\s*$/i);
    const material: MaterialReference = { name: ethanolName };
    if (volumeBefore?.[1]) {
      material.volume = volumeBefore[1] as string;
    }
    materials.push(material);
  }
  
  return materials;
}

/**
 * Parse a single step text into structured data
 */
function parseStep(stepNumber: number, rawText: string): ExtractedProtocolStep {
  return {
    stepNumber,
    rawText,
    verbKeyword: extractVerbKeyword(rawText),
    materials: extractMaterials(rawText),
    equipmentHints: extractEquipmentHints(rawText),
    parameters: extractParameters(rawText),
  };
}

/**
 * Extract title from protocol text (first non-empty line that's not a numbered step)
 */
function extractTitle(text: string): string {
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Skip numbered steps
    if (/^\d+\./.test(line.trim())) {
      continue;
    }
    // First non-empty, non-step line is likely the title
    if (line.trim().length > 5) {
      return line.trim();
    }
  }
  
  return 'Untitled Protocol';
}

/**
 * Parse numbered steps from protocol text
 */
function extractSteps(text: string): ExtractedProtocolStep[] {
  const steps: ExtractedProtocolStep[] = [];
  
  // Match numbered steps: "1. ", "2. ", etc.
  const stepRegex = /(\d+)\.\s*([^]+?)(?=\n\d+\.|\n\n|$)/g;
  
  let match;
  while ((match = stepRegex.exec(text)) !== null) {
    const stepNumber = parseInt(match[1]!, 10);
    const stepText = match[2]?.trim() || '';
    
    if (stepText) {
      steps.push(parseStep(stepNumber, stepText));
    }
  }
  
  return steps;
}

/**
 * Create a deduplicated materials index from all steps
 */
function createMaterialsIndex(steps: ExtractedProtocolStep[]): MaterialReference[] {
  const seen = new Map<string, MaterialReference>();
  
  for (const step of steps) {
    for (const material of step.materials) {
      const key = material.name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, material);
      }
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Create a deduplicated equipment index from all steps
 */
function createEquipmentIndex(steps: ExtractedProtocolStep[]): string[] {
  const seen = new Set<string>();
  
  for (const step of steps) {
    for (const hint of step.equipmentHints) {
      seen.add(hint);
    }
  }
  
  return Array.from(seen);
}

/**
 * Parse vendor protocol PDF extracted text into structured protocol data
 * 
 * @param text - The extracted text content from a vendor protocol PDF
 * @returns ProtocolPdfExtraction with parsed steps, materials, and equipment references
 */
export function parseVendorProtocolPdf(text: string): ProtocolPdfExtraction {
  // Handle empty or whitespace-only input
  if (!text || !text.trim()) {
    return {
      title: 'Untitled Protocol',
      steps: [],
      materialsIndex: [],
      equipmentIndex: [],
    };
  }
  
  const title = extractTitle(text);
  const steps = extractSteps(text);
  const materialsIndex = createMaterialsIndex(steps);
  const equipmentIndex = createEquipmentIndex(steps);
  
  return {
    title,
    steps,
    materialsIndex,
    equipmentIndex,
  };
}
