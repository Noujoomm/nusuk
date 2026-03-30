import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * BioTime 8.5 API Client — handles JWT auth + data fetching.
 * All endpoint paths are configurable via AttendanceConfig table.
 */
@Injectable()
export class BioTimeClient {
  private readonly logger = new Logger(BioTimeClient.name);
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(private prisma: PrismaService) {}

  private async getConfig() {
    let config = await this.prisma.attendanceConfig.findUnique({ where: { id: 'default' } });
    if (!config) {
      config = await this.prisma.attendanceConfig.create({ data: { id: 'default' } });
    }
    return config;
  }

  /** Authenticate with BioTime and cache JWT token */
  private async authenticate(baseUrl: string): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) return this.token;

    const config = await this.getConfig();
    const username = config.username || process.env.BIOTIME_USERNAME || '';
    const password = process.env.BIOTIME_PASSWORD || '';

    if (!baseUrl || !username || !password) {
      throw new Error('BioTime credentials not configured');
    }

    this.logger.log(`Authenticating with BioTime at ${baseUrl}`);

    const res = await fetch(`${baseUrl}/jwt-api-token-auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(parseInt(process.env.BIOTIME_TIMEOUT || '15000')),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`BioTime auth failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    this.token = data.token || data.access;
    if (!this.token) throw new Error('No token in BioTime response');

    // Cache for 23 hours (BioTime JWT typically valid 24h)
    this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    this.logger.log('BioTime authenticated successfully');
    return this.token;
  }

  /** Make authenticated GET request to BioTime */
  private async get(endpoint: string, params?: Record<string, string>): Promise<any> {
    const config = await this.getConfig();
    const baseUrl = (config.baseUrl || process.env.BIOTIME_BASE_URL || '').replace(/\/$/, '');
    const token = await this.authenticate(baseUrl);

    const url = new URL(endpoint, baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(parseInt(process.env.BIOTIME_TIMEOUT || '30000')),
    });

    if (res.status === 401) {
      // Token expired — retry once
      this.token = null;
      this.tokenExpiry = 0;
      const newToken = await this.authenticate(baseUrl);
      const retry = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${newToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!retry.ok) throw new Error(`BioTime request failed after retry (${retry.status})`);
      return retry.json();
    }

    if (!res.ok) throw new Error(`BioTime request failed (${res.status})`);
    return res.json();
  }

  /** Test connection to BioTime */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getConfig();
      const baseUrl = (config.baseUrl || process.env.BIOTIME_BASE_URL || '').replace(/\/$/, '');
      await this.authenticate(baseUrl);
      return { success: true, message: 'تم الاتصال بنجاح' };
    } catch (e: any) {
      return { success: false, message: e.message || 'فشل الاتصال' };
    }
  }

  /**
   * Fetch attendance transactions from BioTime.
   * Endpoint path is configurable in AttendanceConfig.
   */
  async fetchTransactions(fromDate: string, toDate: string): Promise<any[]> {
    const config = await this.getConfig();
    const endpoint = config.transactionsEndpoint || '/api/v2/iclock/api/transactions/';

    // BioTime may paginate — fetch all pages
    let allResults: any[] = [];
    let page = 1;
    const pageSize = 1000;

    while (true) {
      const data = await this.get(endpoint, {
        start_date: fromDate,
        end_date: toDate,
        page: String(page),
        page_size: String(pageSize),
      });

      const results = data.data || data.results || data || [];
      if (Array.isArray(results)) {
        allResults = allResults.concat(results);
      }

      // Check for next page
      if (data.next || (Array.isArray(results) && results.length === pageSize)) {
        page++;
      } else {
        break;
      }
    }

    return allResults;
  }

  /** Fetch employees from BioTime */
  async fetchEmployees(): Promise<any[]> {
    const config = await this.getConfig();
    const endpoint = config.employeesEndpoint || '/api/v2/iclock/api/employees/';
    const data = await this.get(endpoint, { page_size: '10000' });
    return data.data || data.results || data || [];
  }
}
