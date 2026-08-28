import axios from 'axios';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

async function probe(name: string, url: string) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: HEADERS,
      maxContentLength: 256 * 1024,
      validateStatus: () => true,
    });
    const body = typeof res.data === 'string' ? res.data : '';
    console.log(`${name}: HTTP ${res.status}, ${body.length} bytes`);
    if (body.length > 500) {
      const hasPhone = /\d{5}\s?\d{6}|\+44|tel:/i.test(body);
      const hasEmail = /@[a-z0-9.-]+\.[a-z]{2,}/i.test(body);
      console.log(`  phone hints: ${hasPhone}, email hints: ${hasEmail}`);
    }
  } catch (e: any) {
    console.log(`${name}: ERROR ${e.code || e.message}`);
  }
}

async function main() {
  const q = encodeURIComponent('Plumbing Services London');
  const cn = '12345678';
  await probe('Hotfrog search', `https://www.hotfrog.co.uk/search/gb/${q}`);
  await probe('Thomson Local', `https://www.thomsonlocal.com/search/${q}`);
  await probe('Checkatrade search', `https://www.checkatrade.com/Search?q=${q}`);
  await probe('CH page', `https://find-and-update.company-information.service.gov.uk/company/06356544`);
  await probe('OpenCorporates', `https://opencorporates.com/companies/gb/06356544`);
  await probe('FreeIndex', `https://www.freeindex.co.uk/searchresults.htm?search=${q}`);
  await probe('Cylex', `https://www.cylex-uk.co.uk/search?q=${q}`);
}

main();
