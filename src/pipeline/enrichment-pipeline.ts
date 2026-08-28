import { CompanyProfile } from '../companies-house/client';
import { WebsiteDiscovery } from '../discovery/website-discovery';
import { NoWebsiteEnrichment } from '../discovery/no-website-enrichment';
import { prisma } from '../database/client';
import { mergeEnrichmentResults, NewEnrichmentResult } from './enrichment-merge';
import { BudgetedSearchProvider, DuckDuckGoSearchProvider, SearchProvider } from '../discovery/search-provider';
import { PublicSourceSession } from '../discovery/public-sources/session';
import { config } from '../config/env';

export type WebsiteStatus = 'WEBSITE_EXISTS' | 'NO_WEBSITE' | 'PENDING';

export interface ProcessCompanyResult {
  outcome: 'stored_with_website' | 'stored_no_website' | 'already_processed' | 'error';
  companyNumber: string;
  websiteStatus?: WebsiteStatus;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  contactStatus?: string;
  enrichmentAttempted?: boolean;
  enrichmentDiagnostics?: {
    councilDataAvailable: boolean;
    councilMatchFound: boolean;
    councilName: string | null;
  };
}

function buildOptionalSearchProvider(): SearchProvider | null {
  if (!config.app.enableOptionalSearch) return null;
  return new BudgetedSearchProvider(new DuckDuckGoSearchProvider(), {
    timeoutMs: config.app.noWebsiteSearchTimeoutMs,
    throttleMs: 0,
  });
}

function baseCompanyFields(profile: CompanyProfile, fullAddress: string) {
  const addr = profile.registered_office_address || {};
  return {
    company_name: profile.company_name,
    company_status: profile.company_status,
    company_type: profile.type,
    address_line_1: addr.address_line_1 || null,
    address_line_2: addr.address_line_2 || null,
    locality: addr.locality || null,
    region: addr.region || null,
    postal_code: addr.postal_code || null,
    country: addr.country || null,
    full_address: fullAddress || null,
    last_checked: new Date(),
  };
}

export class EnrichmentPipeline {
  private discovery: WebsiteDiscovery;
  private noWebsiteEnrichment: NoWebsiteEnrichment;
  private sourceSession = new PublicSourceSession();

  constructor(searchProvider?: SearchProvider | null) {
    const optionalSearch = searchProvider ?? buildOptionalSearchProvider();
    this.discovery = new WebsiteDiscovery(optionalSearch);
    this.noWebsiteEnrichment = new NoWebsiteEnrichment(optionalSearch, undefined, undefined, this.sourceSession);
  }

  public async processCompany(profile: CompanyProfile): Promise<ProcessCompanyResult> {
    const companyNumber = profile.company_number;

    try {
      const addr = profile.registered_office_address || {};
      const parts = [
        addr.address_line_1,
        addr.address_line_2,
        addr.locality,
        addr.region,
        addr.postal_code,
        addr.country,
      ].filter(Boolean);
      const fullAddress = parts.join(', ');

      const existing = await prisma.company.findUnique({ where: { company_number: companyNumber } });

      const discoveryResult = await this.discovery.discover(
        profile.company_name,
        addr.locality,
        addr.postal_code,
        companyNumber,
        this.sourceSession
      );

      if (discoveryResult.website) {
        await prisma.company.upsert({
          where: { company_number: companyNumber },
          update: {
            ...baseCompanyFields(profile, fullAddress),
            website_status: 'WEBSITE_EXISTS',
            website_url: discoveryResult.website,
            website_source: discoveryResult.source,
            website_confidence: String(discoveryResult.confidence),
            contact_status: 'NOT_APPLICABLE',
            processing_status: 'completed',
          },
          create: {
            company_number: companyNumber,
            date_of_creation: profile.date_of_creation ? new Date(profile.date_of_creation) : null,
            ...baseCompanyFields(profile, fullAddress),
            website_status: 'WEBSITE_EXISTS',
            website_url: discoveryResult.website,
            website_source: discoveryResult.source,
            website_confidence: String(discoveryResult.confidence),
            contact_status: 'NOT_APPLICABLE',
            processing_status: 'completed',
          },
        });

        await prisma.processingLog.create({
          data: {
            company_number: companyNumber,
            company_name: profile.company_name,
            stage: 'website_check',
            status: 'website_exists',
            source_url: discoveryResult.website,
          },
        });

        console.log(
          `  [${companyNumber}] WEBSITE EXISTS: ${discoveryResult.website} [${discoveryResult.source}, conf=${discoveryResult.confidence}]`
        );

        return {
          outcome: 'stored_with_website',
          companyNumber,
          websiteStatus: 'WEBSITE_EXISTS',
          website: discoveryResult.website,
          enrichmentAttempted: false,
        };
      }

      await prisma.company.upsert({
        where: { company_number: companyNumber },
        update: {
          ...baseCompanyFields(profile, fullAddress),
          website_status: 'NO_WEBSITE',
          website_url: null,
          website_source: null,
          website_confidence: null,
        },
        create: {
          company_number: companyNumber,
          date_of_creation: profile.date_of_creation ? new Date(profile.date_of_creation) : null,
          ...baseCompanyFields(profile, fullAddress),
          website_status: 'NO_WEBSITE',
        },
      });

      console.log(`  [${companyNumber}] NO WEBSITE — running public-source enrichment...`);

      const alt = await this.noWebsiteEnrichment.enrich({
        companyName: profile.company_name,
        companyNumber,
        locality: addr.locality,
        postalCode: addr.postal_code,
        region: addr.region,
        fullAddress,
      });

      const providerSummary = alt.providersAttempted
        .map((p) => {
          const o = alt.providerOutcomes[p];
          return `${p}:${o?.pages ?? 0}pg${o?.blocked ? '(blocked)' : ''}`;
        })
        .join(', ');
      console.log(`  [${companyNumber}] Enrichment attempted via [${providerSummary}]`);

      const incoming: NewEnrichmentResult = {
        phone: alt.phone?.normalized ?? null,
        phoneSourceUrl: alt.phone?.sourceUrl ?? null,
        phoneSourceType: alt.phone?.sourceType ?? null,
        phoneConfidence: alt.phone?.confidence ?? null,
        phoneMissingReason: alt.phoneMissingReason,
        email: alt.email?.email ?? null,
        emailSourceUrl: alt.email?.sourceUrl ?? null,
        emailSourceType: alt.email?.sourceType ?? null,
        emailConfidence: alt.email?.confidence ?? null,
        emailMissingReason: alt.emailMissingReason,
        contactStatus: 'PENDING',
        missingReason: null,
        enrichmentSucceeded: !alt.diagnostics.hadProviderError,
      };

      const merged = mergeEnrichmentResults(existing, incoming);

      await prisma.company.update({
        where: { company_number: companyNumber },
        data: {
          phone: merged.phone,
          phone_normalized: merged.phone_normalized,
          phone_source_url: merged.phone_source_url,
          phone_source_type: merged.phone_source_type,
          phone_confidence: merged.phone_confidence,
          phone_last_checked: merged.phone ? new Date() : existing?.phone_last_checked ?? null,
          phone_missing_reason: merged.phone_missing_reason,
          email: merged.email,
          email_source_url: merged.email_source_url,
          email_source_type: merged.email_source_type,
          email_confidence: merged.email_confidence,
          email_last_checked: merged.email ? new Date() : existing?.email_last_checked ?? null,
          email_missing_reason: merged.email_missing_reason,
          contact_status: merged.contact_status,
          missing_reason: merged.missing_reason,
          processing_status: 'completed',
          enrichment_attempts: { increment: 1 },
          last_enrichment_attempt: new Date(),
          last_checked: new Date(),
        },
      });

      await prisma.processingLog.create({
        data: {
          company_number: companyNumber,
          company_name: profile.company_name,
          stage: 'enrichment',
          status: merged.contact_status,
          source_url: merged.phone_source_url || merged.email_source_url,
        },
      });

      console.log(
        `  [${companyNumber}] NO WEBSITE | ${profile.company_name} | Phone: ${merged.phone || 'Not Found'} | Email: ${merged.email || 'Not Found'} | ${merged.contact_status}`
      );

      return {
        outcome: 'stored_no_website',
        companyNumber,
        websiteStatus: 'NO_WEBSITE',
        phone: merged.phone,
        email: merged.email,
        contactStatus: merged.contact_status,
        enrichmentAttempted: true,
        enrichmentDiagnostics: alt.diagnostics,
      };
    } catch (error: any) {
      console.error(`  [${companyNumber}] Error: ${error.message}`);

      try {
        const exists = await prisma.company.findUnique({ where: { company_number: companyNumber } });
        if (exists) {
          await prisma.company.update({
            where: { company_number: companyNumber },
            data: {
              processing_status: 'error',
              enrichment_attempts: { increment: 1 },
              last_enrichment_attempt: new Date(),
              missing_reason: 'extraction_failure',
            },
          });
        }
        await prisma.processingLog.create({
          data: {
            company_number: companyNumber,
            company_name: profile.company_name,
            stage: 'enrichment',
            status: 'error',
            error_message: error.message?.substring(0, 500),
          },
        });
      } catch {
        /* preserve existing data */
      }

      return { outcome: 'error', companyNumber, enrichmentAttempted: false };
    }
  }
}
