import { Company } from '@prisma/client';
import { ExtractedEmail } from '../contacts/email-extractor';
import { ExtractedPhone } from '../contacts/phone-extractor';

export type Confidence = 'high' | 'medium' | 'low';

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export interface EnrichmentContactFields {
  phone: string | null;
  phone_normalized: string | null;
  phone_source_url: string | null;
  phone_source_type: string | null;
  phone_confidence: string | null;
  phone_missing_reason: string | null;
  email: string | null;
  email_source_url: string | null;
  email_source_type: string | null;
  email_confidence: string | null;
  email_missing_reason: string | null;
}

export interface NewEnrichmentResult {
  phone: string | null;
  phoneSourceUrl: string | null;
  phoneSourceType: string | null;
  phoneConfidence: string | null;
  phoneMissingReason: string | null;
  email: string | null;
  emailSourceUrl: string | null;
  emailSourceType: string | null;
  emailConfidence: string | null;
  emailMissingReason: string | null;
  contactStatus: string;
  missingReason: string | null;
  enrichmentSucceeded?: boolean;
}

function isBetterConfidence(
  newConf: string | null | undefined,
  existingConf: string | null | undefined
): boolean {
  if (!newConf) return false;
  if (!existingConf) return true;
  const a = CONFIDENCE_RANK[newConf as Confidence] || 0;
  const b = CONFIDENCE_RANK[existingConf as Confidence] || 0;
  return a > b;
}

/**
 * Merge new enrichment results with existing DB values.
 * Never overwrite a valid phone/email with null or empty data.
 */
export function mergeEnrichmentResults(
  existing: Company | null,
  incoming: NewEnrichmentResult
): EnrichmentContactFields & {
  contact_status: string;
  missing_reason: string | null;
} {
  const merged = {
    phone: incoming.phone,
    phone_normalized: incoming.phone,
    phone_source_url: incoming.phoneSourceUrl,
    phone_source_type: incoming.phoneSourceType,
    phone_confidence: incoming.phoneConfidence,
    phone_missing_reason: incoming.phoneMissingReason,
    email: incoming.email,
    email_source_url: incoming.emailSourceUrl,
    email_source_type: incoming.emailSourceType,
    email_confidence: incoming.emailConfidence,
    email_missing_reason: incoming.emailMissingReason,
    contact_status: incoming.contactStatus,
    missing_reason: incoming.missingReason,
  };

  if (existing?.phone && !incoming.phone) {
    merged.phone = existing.phone;
    merged.phone_normalized = existing.phone_normalized ?? existing.phone;
    merged.phone_source_url = existing.phone_source_url;
    merged.phone_source_type = existing.phone_source_type;
    merged.phone_confidence = existing.phone_confidence;
    merged.phone_missing_reason = existing.phone_missing_reason;
  } else if (existing?.phone && incoming.phone && !isBetterConfidence(incoming.phoneConfidence, existing.phone_confidence)) {
    merged.phone = existing.phone;
    merged.phone_normalized = existing.phone_normalized ?? existing.phone;
    merged.phone_source_url = existing.phone_source_url;
    merged.phone_source_type = existing.phone_source_type;
    merged.phone_confidence = existing.phone_confidence;
  }

  if (existing?.email && !incoming.email) {
    merged.email = existing.email;
    merged.email_source_url = existing.email_source_url;
    merged.email_source_type = existing.email_source_type;
    merged.email_confidence = existing.email_confidence;
    merged.email_missing_reason = existing.email_missing_reason;
  } else if (existing?.email && incoming.email && !isBetterConfidence(incoming.emailConfidence, existing.email_confidence)) {
    merged.email = existing.email;
    merged.email_source_url = existing.email_source_url;
    merged.email_source_type = existing.email_source_type;
    merged.email_confidence = existing.email_confidence;
  }

  const hasPhone = !!merged.phone;
  const hasEmail = !!merged.email;

  if (hasPhone && hasEmail) {
    merged.contact_status = 'COMPLETE';
    merged.missing_reason = null;
  } else if (hasPhone || hasEmail) {
    merged.contact_status = 'PARTIAL';
    merged.missing_reason = !hasPhone ? 'no_public_phone' : 'no_public_email';
  } else {
    merged.contact_status = incoming.enrichmentSucceeded === false ? 'EXTRACTION_FAILURE' : 'NOT_YET_PUBLIC';
    merged.missing_reason = incoming.enrichmentSucceeded === false ? 'extraction_failure' : 'not_yet_public';
  }

  return merged;
}

function rankConfidence(value: string): number {
  return CONFIDENCE_RANK[value as Confidence] || 0;
}

export function pickBestVerifiedPhone(
  candidates: Array<ExtractedPhone & { verifyScore: number }>
): ExtractedPhone | null {
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const confOrder = rankConfidence(b.confidence) - rankConfidence(a.confidence);
    if (confOrder !== 0) return confOrder;
    return b.verifyScore - a.verifyScore;
  })[0];
}

export function pickBestVerifiedEmail(
  candidates: Array<ExtractedEmail & { verifyScore: number }>
): ExtractedEmail | null {
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const confOrder = rankConfidence(b.confidence) - rankConfidence(a.confidence);
    if (confOrder !== 0) return confOrder;
    return b.verifyScore - a.verifyScore;
  })[0];
}
