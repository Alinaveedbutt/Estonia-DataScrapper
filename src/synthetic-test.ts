import http from 'http';
import { EnrichmentPipeline } from './pipeline/enrichment-pipeline';
import { prisma, connectDb, disconnectDb } from './database/client';
import { WebsiteDiscovery } from './discovery/website-discovery';
import { NoWebsiteEnrichment } from './discovery/no-website-enrichment';

const MOCK_PORT = 9999;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>Acme Corp</h1><a href="/contact">Contact</a></body></html>`);
  } else if (req.url === '/contact') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body>
        <h1>Acme Corp 12345678 London</h1>
        <a href="mailto:info@acmecorp.co.uk">info@acmecorp.co.uk</a>
        <a href="tel:02071234567">020 7123 4567</a>
      </body></html>
    `);
  } else {
    res.writeHead(404);
    res.end();
  }
});

class MockWebsiteDiscovery extends WebsiteDiscovery {
  constructor(private websiteUrl: string | null) {
    super();
  }

  public async discover(companyName: string) {
    if (this.websiteUrl && companyName === 'Acme Corp') {
      return { website: this.websiteUrl, confidence: 90, source: 'mock_search' };
    }
    return { website: null, confidence: 0, source: null };
  }
}

async function runTest() {
  await new Promise<void>((resolve) => server.listen(MOCK_PORT, resolve));

  try {
    await connectDb();
    await prisma.processingLog.deleteMany();
    await prisma.company.deleteMany();

    const pipeline = new EnrichmentPipeline();
    (pipeline as any).discovery = new MockWebsiteDiscovery(MOCK_URL);

    console.log('Test 1: Company WITH website — stored with WEBSITE EXISTS...');
    const websiteResult = await pipeline.processCompany({
      company_number: '12345678',
      company_name: 'Acme Corp',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2023-01-01',
      registered_office_address: { locality: 'London', postal_code: 'SW1A 1AA' },
    });

    const acme = await prisma.company.findUnique({ where: { company_number: '12345678' } });
    if (websiteResult.outcome === 'stored_with_website' && acme?.website_status === 'WEBSITE_EXISTS' && acme?.website_url) {
      console.log('✅ PASS: Website company kept in Company table with WEBSITE EXISTS');
    } else {
      throw new Error(`Website test failed: ${JSON.stringify({ websiteResult, acme })}`);
    }

    console.log('Test 2: Company WITHOUT website — enrichment attempted...');
    (pipeline as any).discovery = new MockWebsiteDiscovery(null);
    (pipeline as any).noWebsiteEnrichment = new NoWebsiteEnrichment(null, { maxCompanyMs: 10000 }, [
      {
        name: 'MockDirectory',
        async fetchPages() {
          return [
            {
              url: 'https://www.yell.com/biz/missing-corp',
              title: 'Missing Corp Manchester',
              text: 'Missing Corp company number 87654321 Manchester M1 phone 0161 496 0000 email enquiries@missingcorp.co.uk',
              sourceType: 'mock_directory',
            },
          ];
        },
      },
    ]);

    await pipeline.processCompany({
      company_number: '87654321',
      company_name: 'Missing Corp',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2023-01-01',
      registered_office_address: { locality: 'Manchester', postal_code: 'M1 1AA' },
    });

    const missing = await prisma.company.findUnique({ where: { company_number: '87654321' } });
    if (missing?.website_status === 'NO_WEBSITE' && missing?.phone && missing?.email) {
      console.log('✅ PASS: No-website company stored with verified contacts');
    } else {
      throw new Error(`No-website test failed: ${JSON.stringify(missing)}`);
    }

    console.log('Test 3: Null overwrite protection...');
    (pipeline as any).noWebsiteEnrichment = new NoWebsiteEnrichment(null, { maxCompanyMs: 5000 }, []);

    await pipeline.processCompany({
      company_number: '87654321',
      company_name: 'Missing Corp',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2023-01-01',
      registered_office_address: { locality: 'Manchester', postal_code: 'M1 1AA' },
    });

    const preserved = await prisma.company.findUnique({ where: { company_number: '87654321' } });
    if (preserved?.phone && preserved?.email) {
      console.log('✅ PASS: Existing phone/email preserved on empty re-enrichment');
    } else {
      throw new Error('Null overwrite protection failed');
    }

    console.log('\n✅ All synthetic tests passed');
  } finally {
    await disconnectDb();
    server.close();
  }
}

runTest().catch((e) => {
  console.error('❌ Synthetic test failed:', e.message);
  process.exit(1);
});
