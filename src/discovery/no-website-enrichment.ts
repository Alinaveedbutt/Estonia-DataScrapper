import { PhoneExtractor, ExtractedPhone } from '../contacts/phone-extractor';
import { EmailExtractor, ExtractedEmail } from '../contacts/email-extractor';
import { CompanyContext, verifyContactBelongsToCompany } from '../contacts/contact-verifier';
import { pickBestVerifiedEmail, pickBestVerifiedPhone } from '../pipeline/enrichment-merge';
import { EnrichmentBudget, EnrichmentBudgetConfig } from '../enrichment/budget';
import {
  PublicSourceProvider,
  CompaniesHousePageProvider,
  CompaniesHouseFilingsProvider,
  OpenCorporatesProvider,
  SearchResultProvider,
} from './public-sources';
import { PublicSourceSession, globalPublicSourceSession } from './public-sources/session';
import { SearchProvider } from './search-provider';
import { CouncilRatesProvider } from './council-rates/provider';
import { YolistProvider } from './yolist/provider';
import { FsaRatingsProvider } from './fsa-ratings/provider';
import { EnrichmentSession } from './enrichment-session';
import { config } from '../config/env';

export interface NoWebsiteEnrichmentResult {
  phone: ExtractedPhone | null;
  email: ExtractedEmail | null;
  phoneMissingReason: string | null;
  emailMissingReason: string | null;
  providersAttempted: string[];
  providerOutcomes: Record<string, { pages: number; blocked?: boolean }>;
  diagnostics: {
    councilDataAvailable: boolean;
    councilMatchFound: boolean;
    councilName: string | null;
    hadProviderError: boolean;
  };
}

export class NoWebsiteEnrichment {
  private phoneExtractor = new PhoneExtractor();
  private emailExtractor = new EmailExtractor();
  private providers: PublicSourceProvider[];
  private budgetDefaults: EnrichmentBudgetConfig;
  private session: PublicSourceSession;
  private enrichmentSession = new EnrichmentSession();

  constructor(
    searchProvider?: SearchProvider | null,
    budgetConfig?: Partial<EnrichmentBudgetConfig>,
    customProviders?: PublicSourceProvider[],
    session?: PublicSourceSession
  ) {
    const cfg: EnrichmentBudgetConfig = {
      maxSearchRequests: budgetConfig?.maxSearchRequests ?? config.app.noWebsiteMaxSearchRequests,
      maxPageFetches: budgetConfig?.maxPageFetches ?? config.app.noWebsiteMaxPageFetches,
      maxCompanyMs: budgetConfig?.maxCompanyMs ?? config.app.noWebsiteCompanyTimeoutMs,
      searchTimeoutMs: budgetConfig?.searchTimeoutMs ?? config.app.noWebsiteSearchTimeoutMs,
      pageTimeoutMs: budgetConfig?.pageTimeoutMs ?? config.app.noWebsitePageTimeoutMs,
    };

    this.session = session ?? globalPublicSourceSession;

    if (customProviders) {
      this.providers = customProviders;
    } else {
      this.providers = [
        new CompaniesHousePageProvider(),
        new CompaniesHouseFilingsProvider(),
        new YolistProvider(),
        new FsaRatingsProvider(),
        new CouncilRatesProvider(this.enrichmentSession),
        new OpenCorporatesProvider(),
      ];

      if (searchProvider && cfg.maxSearchRequests > 0) {
        this.providers.push(new SearchResultProvider(searchProvider, cfg.maxSearchRequests));
      }
    }

    this.budgetDefaults = cfg;
  }

  public async enrich(ctx: CompanyContext): Promise<NoWebsiteEnrichmentResult> {
    this.enrichmentSession.councilDataAvailable = false;
    this.enrichmentSession.councilMatchFound = false;
    this.enrichmentSession.councilName = null;
    this.enrichmentSession.councilTradingAddress = null;
    this.enrichmentSession.hadProviderError = false;
    this.enrichmentSession.providerErrors = [];

    const budget = new EnrichmentBudget(this.budgetDefaults);
    const phoneCandidates: Array<ExtractedPhone & { verifyScore: number }> = [];
    const emailCandidates: Array<ExtractedEmail & { verifyScore: number }> = [];
    const providersAttempted: string[] = [];
    const providerOutcomes: Record<string, { pages: number; blocked?: boolean }> = {};

    for (const provider of this.providers) {
      if (budget.isExpired()) break;

      providersAttempted.push(provider.name);
      providerOutcomes[provider.name] = { pages: 0 };

      let pages = [];
      try {
        pages = await provider.fetchPages(ctx, budget, this.session);
      } catch (error: any) {
        console.warn(`[NoWebsite] Provider ${provider.name} failed: ${error.message}`);
        providerOutcomes[provider.name].blocked = true;
        this.enrichmentSession.recordProviderError(provider.name, error.message);
        continue;
      }

      providerOutcomes[provider.name].pages = pages.length;

      for (const page of pages) {
        if (budget.isExpired()) break;

        const block = {
          text: page.text,
          sourceUrl: page.url,
          title: page.title,
          sourceType: page.sourceType,
        };

        if (page.sourceType === 'council_business_rates') {
          continue;
        }

        this.collectVerifiedPhones(ctx, block, phoneCandidates);
        this.collectVerifiedEmails(ctx, block, emailCandidates);
      }
    }

    const phone = pickBestVerifiedPhone(phoneCandidates);
    const email = pickBestVerifiedEmail(emailCandidates);

    return {
      phone,
      email,
      phoneMissingReason: phone ? null : 'no_public_phone',
      emailMissingReason: email ? null : 'no_public_email',
      providersAttempted,
      providerOutcomes,
      diagnostics: {
        councilDataAvailable: this.enrichmentSession.councilDataAvailable,
        councilMatchFound: this.enrichmentSession.councilMatchFound,
        councilName: this.enrichmentSession.councilName,
        hadProviderError: this.enrichmentSession.hadProviderError,
      },
    };
  }

  private verificationOptions() {
    return {
      councilTradingAddress: this.enrichmentSession.councilMatchFound
        ? this.enrichmentSession.councilTradingAddress
        : null,
    };
  }

  private collectVerifiedPhones(
    ctx: CompanyContext,
    block: { text: string; sourceUrl: string; title: string; sourceType: string },
    out: Array<ExtractedPhone & { verifyScore: number }>
  ) {
    const verification = verifyContactBelongsToCompany(ctx, block, this.verificationOptions());
    if (!verification.verified) return;

    for (const phone of [
      ...this.phoneExtractor.extractPhonesFromText(block.text, block.sourceUrl),
      ...this.phoneExtractor.extractPhones(block.text, block.sourceUrl),
    ]) {
      if (block.sourceType === 'yolist' && phone.raw?.includes('*')) continue;

      out.push({
        ...phone,
        confidence:
          verification.confidence === 'high' && phone.confidence === 'high' ? 'high' : verification.confidence === 'low' ? 'low' : 'medium',
        sourceType: block.sourceType,
        verifyScore: verification.score,
      });
    }
  }

  private collectVerifiedEmails(
    ctx: CompanyContext,
    block: { text: string; sourceUrl: string; title: string; sourceType: string },
    out: Array<ExtractedEmail & { verifyScore: number }>
  ) {
    const verification = verifyContactBelongsToCompany(ctx, block, this.verificationOptions());
    if (!verification.verified) return;

    for (const email of [
      ...this.emailExtractor.extractEmailsFromText(block.text, block.sourceUrl),
      ...this.emailExtractor.extractEmails(block.text, block.sourceUrl),
    ]) {
      out.push({
        ...email,
        confidence:
          verification.confidence === 'high' && email.confidence === 'high' ? 'high' : verification.confidence === 'low' ? 'low' : 'medium',
        sourceType: block.sourceType,
        verifyScore: verification.score,
      });
    }
  }
}
