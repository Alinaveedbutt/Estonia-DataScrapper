import { verifyContactBelongsToCompany } from './contact-verifier';

describe('verifyContactBelongsToCompany', () => {
  const company = {
    companyName: 'Missing Corp Ltd',
    companyNumber: '87654321',
    locality: 'Manchester',
    postalCode: 'M1 1AA',
  };

  it('verifies contact when company number and name appear in source', () => {
    const result = verifyContactBelongsToCompany(company, {
      title: 'Missing Corp listing',
      text: 'Missing Corp 87654321 Manchester M1 phone 0161 496 0000',
      sourceUrl: 'https://yell.com/biz/missing-corp',
    });
    expect(result.verified).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it('rejects contact when only generic name token matches unrelated company', () => {
    const result = verifyContactBelongsToCompany(company, {
      title: 'Global Services',
      text: 'Missing phone 020 7946 0000 London',
      sourceUrl: 'https://unrelated.com',
    });
    expect(result.verified).toBe(false);
  });

  it('accepts strong match with registration number alone in context', () => {
    const result = verifyContactBelongsToCompany(company, {
      text: 'Company 87654321 contact details Manchester',
      sourceUrl: 'https://directory.example',
    });
    expect(result.verified).toBe(true);
  });
});
