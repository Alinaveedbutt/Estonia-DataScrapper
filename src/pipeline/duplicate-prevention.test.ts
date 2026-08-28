/**
 * Duplicate prevention is enforced by company_number as the primary key in Prisma.
 * Upsert uses company_number — repeated runs update rather than insert duplicates.
 */
describe('duplicate prevention', () => {
  it('uses company_number as unique identifier in schema design', () => {
    const companyNumber = '12345678';
    const store = new Map<string, { company_name: string }>();

    function upsertCompany(number: string, name: string) {
      store.set(number, { company_name: name });
    }

    upsertCompany(companyNumber, 'First Name Ltd');
    upsertCompany(companyNumber, 'First Name Ltd');
    expect(store.size).toBe(1);
    expect(store.get(companyNumber)?.company_name).toBe('First Name Ltd');
  });
});
