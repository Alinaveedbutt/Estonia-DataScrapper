export interface CompanyContext {
  companyName: string;
  companyNumber: string;
  locality?: string;
  postalCode?: string;
  region?: string;
  fullAddress?: string;
}

export interface ContactVerificationInput {
  text: string;
  sourceUrl: string;
  title?: string;
  sourceType?: string;
}

export interface ContactVerificationOptions {
  /** Trading address confirmed via council business rates register */
  councilTradingAddress?: string | null;
}

export interface ContactVerificationResult {
  verified: boolean;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
}

const MIN_VERIFY_SCORE = 35;

function cleanCompanyName(name: string): string {
  return name
    .replace(/\b(ltd|limited|llp|plc|inc)\.?\s*$/gi, '')
    .trim();
}

function nameTokens(name: string): string[] {
  return cleanCompanyName(name)
    .toLowerCase()
    .split(/[\s\-_&,]+/)
    .filter((t) => t.length > 2);
}

export function verifyContactBelongsToCompany(
  company: CompanyContext,
  input: ContactVerificationInput,
  options: ContactVerificationOptions = {}
): ContactVerificationResult {
  const reasons: string[] = [];
  let score = 0;

  const contextText = `${input.title || ''} ${input.text} ${input.sourceUrl}`.toLowerCase();
  const tokens = nameTokens(company.companyName);

  if (company.companyNumber && contextText.includes(company.companyNumber.toLowerCase())) {
    score += 50;
    reasons.push('Company registration number found in source');
  }

  if (tokens.length > 0) {
    const matchedTokens = tokens.filter((t) => contextText.includes(t));
    const matchRatio = matchedTokens.length / tokens.length;

    if (matchRatio >= 0.75) {
      score += 35;
      reasons.push('Strong company name match in source');
    } else if (matchRatio >= 0.5 && (matchedTokens.length >= 2 || tokens.length === 1)) {
      score += 20;
      reasons.push('Partial company name match in source');
    } else if (matchedTokens.length >= 1 && tokens.length === 1) {
      score += 10;
      reasons.push('Weak company name match in source');
    }
  }

  if (company.locality && contextText.includes(company.locality.toLowerCase())) {
    score += 15;
    reasons.push('Locality match in source');
  }

  if (company.region && contextText.includes(company.region.toLowerCase())) {
    score += 10;
    reasons.push('Region match in source');
  }

  if (company.postalCode) {
    const pcBase = company.postalCode.split(' ')[0].toLowerCase();
    if (contextText.includes(pcBase)) {
      score += 15;
      reasons.push('Postal code match in source');
    }
  }

  if (options.councilTradingAddress) {
    const councilText = options.councilTradingAddress.toLowerCase();
    if (company.postalCode && councilText.includes(company.postalCode.replace(/\s+/g, '').toLowerCase())) {
      score += 10;
      reasons.push('Council rates trading address aligns with company postcode');
    }
    if (company.locality && councilText.includes(company.locality.toLowerCase())) {
      score += 10;
      reasons.push('Council rates trading address aligns with locality');
    }
    if (input.sourceType === 'google_cse') {
      score += 5;
      reasons.push('Google CSE result with council identity confirmation available');
    }
  }

  const confidence: 'high' | 'medium' | 'low' =
    score >= 60 ? 'high' : score >= MIN_VERIFY_SCORE ? 'medium' : 'low';

  return {
    verified: score >= MIN_VERIFY_SCORE,
    confidence,
    score,
    reasons,
  };
}
