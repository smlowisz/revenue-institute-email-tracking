/**
 * Supabase Client and Helper Functions
 * Handles all database operations for the tracking system
 */

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Supabase REST API client
 * Uses service role key for full database access
 */
export class SupabaseClient {
  private url: string;
  private key: string;

  constructor(env: SupabaseEnv) {
    this.url = env.SUPABASE_URL;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  /**
   * Make a request to Supabase REST API
   */
  async request(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const response = await fetch(`${this.url}/rest/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Prefer': 'return=representation'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase error: ${response.status} - ${error}`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }

    return await response.json();
  }

  /**
   * Get or create a lead record
   * Returns the lead UUID
   * Uses proper URL encoding to prevent SQL injection
   */
  async getOrCreateLead(
    trackingId: string | null,
    email?: string,
    enrichmentData?: any
  ): Promise<string> {
    // If we have a tracking_id, try to find existing lead
    if (trackingId) {
      const existing = await this.request(
        'GET',
        `/lead?tracking_id=eq.${encodeURIComponent(trackingId)}&select=id&limit=1`
      );
      if (existing && existing.length > 0) {
        return existing[0].id;
      }
    }

    // If we have an email, try to find by email
    if (email) {
      const encodedEmail = encodeURIComponent(email);
      const byEmail = await this.request(
        'GET',
        `/lead?or=(work_email.eq.${encodedEmail},personal_email.eq.${encodedEmail})&select=id&limit=1`
      );
      if (byEmail && byEmail.length > 0) {
        return byEmail[0].id;
      }
    }

    // Create new lead (anonymous or identified)
    const newLead: any = {
      tracking_id: trackingId || this.generateTrackingId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (email) {
      // Determine if work or personal email (simple heuristic: check domain)
      const domain = email.split('@')[1]?.toLowerCase();
      const commonPersonalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
      if (commonPersonalDomains.includes(domain)) {
        newLead.personal_email = email;
      } else {
        newLead.work_email = email;
      }
    }

    // Add enrichment data if provided
    if (enrichmentData) {
      if (enrichmentData.firstName) newLead.first_name = enrichmentData.firstName;
      if (enrichmentData.lastName) newLead.last_name = enrichmentData.lastName;
      if (enrichmentData.phone) newLead.phone = enrichmentData.phone;
      if (enrichmentData.linkedin) newLead.linkedin_url = enrichmentData.linkedin;
      if (enrichmentData.jobTitle) newLead.job_title = enrichmentData.jobTitle;
      if (enrichmentData.jobSeniority) newLead.job_seniority = enrichmentData.jobSeniority;
      if (enrichmentData.jobDepartment) newLead.job_department = enrichmentData.jobDepartment;
      if (enrichmentData.companyName) newLead.company_name = enrichmentData.companyName;
      if (enrichmentData.companyWebsite) newLead.company_website = enrichmentData.companyWebsite;
      if (enrichmentData.companyLinkedin) newLead.company_linkedin = enrichmentData.companyLinkedin;
      if (enrichmentData.companyDescription) newLead.company_description = enrichmentData.companyDescription;
      if (enrichmentData.companySize) newLead.company_headcount = enrichmentData.companySize;
      if (enrichmentData.companyRevenue) newLead.company_revenue = enrichmentData.companyRevenue;
      if (enrichmentData.companyIndustry) newLead.company_industry = enrichmentData.companyIndustry;
      if (enrichmentData.companyAddress) newLead.company_address = enrichmentData.companyAddress;
      if (enrichmentData.personalAddress) newLead.personal_address = enrichmentData.personalAddress;
    }

    const result = await this.request('POST', '/lead', newLead);
    return result[0].id;
  }

  /**
   * Update lead with identity information
   */
  async updateLeadIdentity(leadId: string, email: string, enrichmentData?: any): Promise<void> {
    const update: any = {
      updated_at: new Date().toISOString()
    };

    // Add email
    const domain = email.split('@')[1]?.toLowerCase();
    const commonPersonalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
    if (commonPersonalDomains.includes(domain)) {
      update.personal_email = email;
    } else {
      update.work_email = email;
    }

    // Add enrichment data
    if (enrichmentData) {
      if (enrichmentData.firstName) update.first_name = enrichmentData.firstName;
      if (enrichmentData.lastName) update.last_name = enrichmentData.lastName;
      if (enrichmentData.phone) update.phone = enrichmentData.phone;
      if (enrichmentData.linkedin) update.linkedin_url = enrichmentData.linkedin;
      if (enrichmentData.jobTitle) update.job_title = enrichmentData.jobTitle;
      if (enrichmentData.jobSeniority) update.job_seniority = enrichmentData.jobSeniority;
      if (enrichmentData.jobDepartment) update.job_department = enrichmentData.jobDepartment;
      if (enrichmentData.companyName) update.company_name = enrichmentData.companyName;
      if (enrichmentData.companyWebsite) update.company_website = enrichmentData.companyWebsite;
      if (enrichmentData.companyLinkedin) update.company_linkedin = enrichmentData.companyLinkedin;
      if (enrichmentData.companyDescription) update.company_description = enrichmentData.companyDescription;
      if (enrichmentData.companySize) update.company_headcount = enrichmentData.companySize;
      if (enrichmentData.companyRevenue) update.company_revenue = enrichmentData.companyRevenue;
      if (enrichmentData.companyIndustry) update.company_industry = enrichmentData.companyIndustry;
      if (enrichmentData.companyAddress) update.company_address = enrichmentData.companyAddress;
      if (enrichmentData.personalAddress) update.personal_address = enrichmentData.personalAddress;
    }

    await this.request('PATCH', `/lead?id=eq.${leadId}`, update);
  }

  // In-memory cache for sessions (per-request cache to avoid re-creating sessions)
  private sessionCache: Map<string, string> = new Map();

  /**
   * Get or create a session record
   * Returns the session UUID
   * Uses in-memory caching to avoid creating duplicate sessions per event batch
   */
  async getOrCreateSession(originalSessionId: string, leadId: string): Promise<string> {
    // Check cache first (same originalSessionId within this request)
    const cacheKey = `${originalSessionId}-${leadId}`;
    if (this.sessionCache.has(cacheKey)) {
      return this.sessionCache.get(cacheKey)!;
    }

    // For now, we create ONE session per batch
    // The original sessionId is tracked separately in a session mapping table if needed
    // This approach avoids the N+1 problem of creating sessions for each event
    const newSession = {
      lead_id: leadId,
      start_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await this.request('POST', '/session', newSession);
    const sessionUuid = result[0].id;
    
    // Cache for this request
    this.sessionCache.set(cacheKey, sessionUuid);
    
    return sessionUuid;
  }

  /**
   * Insert events into Supabase
   */
  async insertEvents(events: any[]): Promise<void> {
    if (events.length === 0) return;

    // Prepare events for insertion - ensure data is JSONB compatible
    const eventsForInsert = events.map(event => ({
      ...event,
      data: event.data ? (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) : {}
    }));

    // Batch insert events (Supabase supports up to 1000 rows per request)
    const batchSize = 1000;
    for (let i = 0; i < eventsForInsert.length; i += batchSize) {
      const batch = eventsForInsert.slice(i, i + batchSize);
      await this.request('POST', '/event', batch);
    }
  }

  /**
   * Generate a random 8-character tracking ID
   */
  private generateTrackingId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Query leads for KV sync
   */
  async getLeadsForKVSync(limit: number = 1000, offset: number = 0): Promise<any[]> {
    const result = await this.request(
      'GET',
      `/lead?tracking_id=not.is.null&limit=${limit}&offset=${offset}&order=updated_at.desc`
    );
    return result || [];
  }
}

