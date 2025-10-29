import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoofingRules {
  permit_types: {
    exact_matches: string[];
    partial_matches: string[];
  };
  work_description_tokens: {
    primary: string[];
    materials: string[];
    actions: string[];
  };
  min_token_matches: number;
  case_sensitive: boolean;
}

let roofingRules: RoofingRules | null = null;

function loadRoofingRules(): RoofingRules {
  if (roofingRules) return roofingRules;

  const rulesPath = path.join(__dirname, 'roofing_rules.yaml');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  roofingRules = yaml.load(rulesContent) as RoofingRules;
  
  return roofingRules;
}

export function classifyAsRoofing(permitType: string | null, workDescription: string | null): boolean {
  const rules = loadRoofingRules();
  
  // Check permit type first
  if (permitType) {
    const normalizedType = rules.case_sensitive ? permitType : permitType.toLowerCase();
    
    // Exact match
    for (const exactMatch of rules.permit_types.exact_matches) {
      const normalizedMatch = rules.case_sensitive ? exactMatch : exactMatch.toLowerCase();
      if (normalizedType === normalizedMatch) {
        return true;
      }
    }
    
    // Partial match
    for (const partialMatch of rules.permit_types.partial_matches) {
      const normalizedMatch = rules.case_sensitive ? partialMatch : partialMatch.toLowerCase();
      if (normalizedType.includes(normalizedMatch)) {
        return true;
      }
    }
  }
  
  // Check work description
  if (workDescription) {
    const normalizedDesc = rules.case_sensitive ? workDescription : workDescription.toLowerCase();
    
    // Collect all tokens to check
    const allTokens = [
      ...rules.work_description_tokens.primary,
      ...rules.work_description_tokens.materials,
      ...rules.work_description_tokens.actions,
    ];
    
    let matches = 0;
    for (const token of allTokens) {
      const normalizedToken = rules.case_sensitive ? token : token.toLowerCase();
      if (normalizedDesc.includes(normalizedToken)) {
        matches++;
        if (matches >= rules.min_token_matches) {
          return true;
        }
      }
    }
  }
  
  return false;
}
