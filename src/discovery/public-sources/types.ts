export interface PublicSourcePage {
  url: string;
  title: string;
  text: string;
  sourceType: string;
}

export interface PublicSourceProvider {
  name: string;
  fetchPages(
    ctx: import('../../contacts/contact-verifier').CompanyContext,
    budget: import('../../enrichment/budget').EnrichmentBudget,
    session?: import('./session').PublicSourceSession
  ): Promise<PublicSourcePage[]>;
}
