/**
 * Supabase Client for web_visitor Architecture
 * Handles anonymous visitors in web_visitor table and identified leads in lead table
 */

import { Env } from './index';

interface SupabaseResponse {
  data?: any;
  error?: {
    message: string;
    details?: string;
    hint?: string;
    code?: string;
  };
}

export class SupabaseClient {
  private env: Env;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(env: Env) {
    this.env = env;
    this.baseUrl = env.SUPABASE_URL.endsWith('/')
      ? env.SUPABASE_URL.slice(0, -1)
      : env.SUPABASE_URL;
    
    this.headers = {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  /**
   * Generic Supabase request handler
   */
  async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}/rest/v1${path}`;
    
    const options: RequestInit = {
      method,
      headers: this.headers
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    console.log(`[Supabase] ${method} ${path}`);
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Supabase] Error: ${response.status} - ${errorText}`);
      throw new Error(`Supabase error: ${response.status} - ${errorText}`);
    }

    // If 204 No Content, return empty array
    if (response.status === 204) {
      return [];
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get or create a web_visitor record for an anonymous visitor
   * Returns web_visitor_id (UUID)
   */
  async getOrCreateWebVisitor(
    visitorId: string,
    deviceFingerprint?: string,
    browserId?: string
  ): Promise<string> {
    try {
      // Try to find existing web_visitor
      const existingVisitor = await this.request(
        'GET',
        `/web_visitor?visitor_id=eq.${encodeURIComponent(visitorId)}&select=id,is_identified,lead_id&limit=1`
      );

      if (existingVisitor && existingVisitor.length > 0) {
        const visitor = existingVisitor[0];
        
        // Update last_seen_at
        await this.request(
          'PATCH',
          `/web_visitor?id=eq.${visitor.id}`,
          { last_seen_at: new Date().toISOString() }
        );
        
        console.log(`✅ Found existing web_visitor: ${visitor.id} (identified: ${visitor.is_identified})`);
        return visitor.id;
      }

      // Create new web_visitor
      const newVisitor = await this.request(
        'POST',
        '/web_visitor',
        {
          visitor_id: visitorId,
          device_fingerprint: deviceFingerprint || null,
          browser_id: browserId || null,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          is_identified: false
        }
      );

      if (newVisitor && newVisitor.length > 0) {
        console.log(`✅ Created new web_visitor: ${newVisitor[0].id}`);
        return newVisitor[0].id;
      }

      throw new Error('Failed to create web_visitor');
    } catch (error: any) {
      console.error('❌ Error in getOrCreateWebVisitor:', error);
      throw error;
    }
  }

  /**
   * Get or create a lead record (identified visitors only)
   * If trackingId is provided, tries to find by tracking_id
   * If email is provided, tries to find by email
   * Returns lead_id (UUID)
   */
  async getOrCreateLead(
    trackingId?: string | null,
    email?: string | null,
    firstName?: string | null,
    lastName?: string | null
  ): Promise<string> {
    try {
      // Try to find existing lead by tracking_id
      if (trackingId) {
        const leadsByTrackingId = await this.request(
          'GET',
          `/lead?tracking_id=eq.${encodeURIComponent(trackingId)}&select=id&limit=1`
        );

        if (leadsByTrackingId && leadsByTrackingId.length > 0) {
          console.log(`✅ Found lead by tracking_id: ${leadsByTrackingId[0].id}`);
          return leadsByTrackingId[0].id;
        }
      }

      // Try to find existing lead by email
      if (email) {
        const leadsByEmail = await this.request(
          'GET',
          `/lead?or=(work_email.eq.${encodeURIComponent(email)},personal_email.eq.${encodeURIComponent(email)})&select=id&limit=1`
        );

        if (leadsByEmail && leadsByEmail.length > 0) {
          console.log(`✅ Found lead by email: ${leadsByEmail[0].id}`);
          return leadsByEmail[0].id;
        }
      }

      // Create new lead
      const newLead = await this.request(
        'POST',
        '/lead',
        {
          tracking_id: trackingId || null,
          work_email: email || null,
          first_name: firstName || null,
          last_name: lastName || null,
          identified_at: new Date().toISOString(),
          identification_method: email ? 'email_capture' : 'tracking_id'
        }
      );

      if (newLead && newLead.length > 0) {
        console.log(`✅ Created new lead: ${newLead[0].id}`);
        return newLead[0].id;
      }

      throw new Error('Failed to create lead');
    } catch (error: any) {
      console.error('❌ Error in getOrCreateLead:', error);
      throw error;
    }
  }

  /**
   * Identify a visitor - transition from web_visitor to lead
   * Uses the identify_visitor PostgreSQL function
   */
  async identifyVisitor(
    visitorId: string,
    email: string,
    firstName?: string,
    lastName?: string,
    identificationMethod: string = 'email_capture'
  ): Promise<string> {
    try {
      // Call the identify_visitor function via RPC
      const result = await this.request(
        'POST',
        '/rpc/identify_visitor',
        {
          p_visitor_id: visitorId,
          p_email: email,
          p_first_name: firstName || null,
          p_last_name: lastName || null,
          p_identification_method: identificationMethod
        }
      );

      console.log(`✅ Identified visitor ${visitorId} as lead ${result}`);
      return result;
    } catch (error: any) {
      console.error('❌ Error identifying visitor:', error);
      throw error;
    }
  }

  /**
   * Get or create a session
   * Sessions can belong to either web_visitor_id OR lead_id (not both)
   */
  async getOrCreateSession(
    sessionIdString: string,
    webVisitId?: string | null,
    leadId?: string | null
  ): Promise<string> {
    try {
      // Validate: must have exactly one of webVisitorId or leadId
      if ((webVisitId && leadId) || (!webVisitId && !leadId)) {
        throw new Error('Session must have exactly one of webVisitorId or leadId');
      }

      // Try to find existing session by matching session data
      // We'll use a unique constraint on a combination of fields
      // For now, just create new sessions each time
      
      const sessionData: any = {
        start_time: new Date().toISOString(),
        web_visitor_id: webVisitId || null,
        lead_id: leadId || null
      };

      const newSession = await this.request('POST', '/session', sessionData);

      if (newSession && newSession.length > 0) {
        console.log(`✅ Created session: ${newSession[0].id} (web_visitor: ${webVisitId}, lead: ${leadId})`);
        return newSession[0].id;
      }

      throw new Error('Failed to create session');
    } catch (error: any) {
      console.error('❌ Error in getOrCreateSession:', error);
      throw error;
    }
  }

  /**
   * Insert events (batch)
   * Events can belong to either web_visitor_id OR lead_id (not both)
   */
  async insertEvents(events: any[]): Promise<void> {
    if (events.length === 0) return;

    try {
      // Validate events have exactly one of web_visitor_id or lead_id
      for (const event of events) {
        if ((event.web_visitor_id && event.lead_id) || (!event.web_visitor_id && !event.lead_id)) {
          throw new Error(`Event must have exactly one of web_visitor_id or lead_id: ${JSON.stringify(event)}`);
        }
      }

      await this.request('POST', '/event', events);
      console.log(`✅ Inserted ${events.length} events`);
    } catch (error: any) {
      console.error('❌ Error inserting events:', error);
      throw error;
    }
  }

  /**
   * Update web_visitor aggregates from events
   * This should be called periodically or after event insertion
   */
  async updateWebVisitorAggregates(webVisitorId: string): Promise<void> {
    try {
      // Get event counts
      const pageviews = await this.request(
        'GET',
        `/event?web_visitor_id=eq.${webVisitId}&type=eq.page_view&select=id`,
        undefined
      );
      
      const clicks = await this.request(
        'GET',
        `/event?web_visitor_id=eq.${webVisitId}&type=eq.click&select=id`,
        undefined
      );

      const sessions = await this.request(
        'GET',
        `/session?web_visitor_id=eq.${webVisitId}&select=id`,
        undefined
      );

      // Update web_visitor record
      await this.request(
        'PATCH',
        `/web_visitor?id=eq.${webVisitId}`,
        {
          total_pageviews: pageviews?.length || 0,
          total_clicks: clicks?.length || 0,
          total_sessions: sessions?.length || 0,
          last_seen_at: new Date().toISOString()
        }
      );

      console.log(`✅ Updated web_visitor aggregates for ${webVisitorId}`);
    } catch (error: any) {
      console.error('❌ Error updating web_visitor aggregates:', error);
      // Don't throw - aggregates are nice-to-have
    }
  }

  /**
   * Check if a visitor is identified
   * Returns { isIdentified: boolean, leadId?: string }
   */
  async checkVisitorIdentification(visitorId: string): Promise<{ isIdentified: boolean; leadId?: string }> {
    try {
      const visits = await this.request(
        'GET',
        `/web_visitor?visitor_id=eq.${encodeURIComponent(visitorId)}&select=is_identified,lead_id&limit=1`
      );

      if (visits && visits.length > 0) {
        return {
          isIdentified: visits[0].is_identified,
          leadId: visits[0].lead_id
        };
      }

      return { isIdentified: false };
    } catch (error: any) {
      console.error('❌ Error checking visitor identification:', error);
      return { isIdentified: false };
    }
  }

  /**
   * Find visitor by email hash (for de-anonymization)
   */
  async findVisitorByEmailHash(emailHash: string): Promise<string | null> {
    try {
      const visits = await this.request(
        'GET',
        `/web_visitor?email_hash=eq.${encodeURIComponent(emailHash)}&select=visitor_id,is_identified,lead_id&limit=1`
      );

      if (visits && visits.length > 0) {
        return visits[0].visitor_id;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Error finding visitor by email hash:', error);
      return null;
    }
  }

  /**
   * Update web_visitor with email hashes for later de-anonymization
   */
  async updateWebVisitorEmailHashes(
    webVisitorId: string,
    sha256: string,
    sha1?: string,
    md5?: string,
    emailDomain?: string
  ): Promise<void> {
    try {
      await this.request(
        'POST',
        '/rpc/add_email_hashes',
        {
          p_table_name: 'web_visitor',
          p_record_id: webVisitorId,
          p_sha256: sha256,
          p_sha1: sha1 || null,
          p_md5: md5 || null,
          p_email_domain: emailDomain || null
        }
      );

      console.log(`✅ Updated web_visitor ${webVisitorId} with email hashes`);
    } catch (error: any) {
      console.error('❌ Error updating email hashes:', error);
      // Don't throw - email hashes are for de-anonymization
    }
  }
}
