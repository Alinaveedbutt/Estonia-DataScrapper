import axios from 'axios';
import { config } from '../config/env';
import { rateLimitedFetch } from './rate-limiter';
import { format, subDays, addDays, isBefore } from 'date-fns';

const BASE_URL = 'https://api.company-information.service.gov.uk';

export interface CompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  type: string;
  date_of_creation: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

export class CompaniesHouseClient {
  private getAuth() {
    return {
      username: config.companiesHouse.apiKey,
      password: '',
    };
  }

  public async getCompanyProfile(companyNumber: string): Promise<CompanyProfile | null> {
    try {
      const response = await rateLimitedFetch(() =>
        axios.get(`${BASE_URL}/company/${companyNumber}`, {
          auth: this.getAuth(),
          timeout: 15000,
          validateStatus: (s) => s < 500,
        })
      );
      if (response.status === 404) return null;
      if (response.status === 429) {
         throw Object.assign(new Error('Rate limited'), { response });
      }
      if (response.status !== 200) {
        throw new Error(`CH API error: status ${response.status}`);
      }
      return response.data as CompanyProfile;
    } catch (error: any) {
      console.error(`[CH] Error fetching ${companyNumber}:`, error.message);
      throw error;
    }
  }

  public async searchCompaniesByDate(
    dateStr: string,
    startIndex = 0,
    size = 50
  ): Promise<{ items: CompanyProfile[]; total: number }> {
    try {
      const response = await rateLimitedFetch(() =>
        axios.get(`${BASE_URL}/advanced-search/companies`, {
          auth: this.getAuth(),
          timeout: 15000,
          params: {
            incorporated_from: dateStr,
            incorporated_to: dateStr,
            start_index: startIndex,
            size,
          },
          validateStatus: (s) => s < 500,
        })
      );
      if (response.status === 429) {
         throw Object.assign(new Error('Rate limited'), { response });
      }
      if (response.status !== 200) {
        throw new Error(`CH advanced search error: status ${response.status}`);
      }
      
      // Fix field name difference in search vs profile
      const items = (response.data.items || []).map((item: any) => ({
        ...item,
        type: item.company_type || item.type,
      }));

      return {
        items,
        total: response.data.total_results || response.data.hits || 0,
      };
    } catch (error: any) {
      console.error(`[CH] Search error for ${dateStr}:`, error.message);
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      // Use a known company (Companies House itself) to test
      const response = await rateLimitedFetch(() =>
        axios.get(`${BASE_URL}/company/00000006`, {
          auth: this.getAuth(),
          timeout: 10000,
          validateStatus: (s) => s < 500,
        })
      );
      if (response.status === 429) {
         throw Object.assign(new Error('Rate limited'), { response });
      }
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const chClient = new CompaniesHouseClient();
