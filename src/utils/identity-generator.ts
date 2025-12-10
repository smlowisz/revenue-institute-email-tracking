/**
 * Identity Generator & URL Shortener
 * Generates short tracking IDs and manages identity mapping
 */

export interface LeadIdentity {
  shortId: string;
  visitorId: string | null;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  campaignId: string;
  campaignName: string;
  sequenceStep?: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Generate a short, URL-safe ID
 */
export function generateShortId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}

/**
 * Generate a deterministic short ID from email + campaign
 * Useful for ensuring same person in same campaign always gets same ID
 */
export async function generateDeterministicId(email: string, campaignId: string): Promise<string> {
  const input = `${email.toLowerCase().trim()}-${campaignId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Take first 8 chars of hash
  return hashHex.substring(0, 8);
}

/**
 * Create a tracking URL with embedded identity
 */
export function createTrackingUrl(
  baseUrl: string,
  shortId: string,
  destination: string = '/'
): string {
  // Option 1: Direct URL with parameter
  const directUrl = new URL(destination, baseUrl);
  directUrl.searchParams.set('i', shortId);
  
  // Option 2: Redirect through /go endpoint
  const redirectUrl = new URL('/go', baseUrl);
  redirectUrl.searchParams.set('i', shortId);
  redirectUrl.searchParams.set('to', destination);
  
  // Return redirect URL (recommended for click tracking)
  return redirectUrl.toString();
}

/**
 * Batch create identities for email campaign
 */
export interface CampaignLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export interface CreateIdentitiesBatch {
  campaignId: string;
  campaignName: string;
  leads: CampaignLead[];
  expirationDays?: number;
}

export async function createIdentitiesBatch(
  batch: CreateIdentitiesBatch
): Promise<LeadIdentity[]> {
  const identities: LeadIdentity[] = [];
  const now = Date.now();
  const expiresAt = now + (batch.expirationDays || 90) * 24 * 60 * 60 * 1000;
  
  for (const lead of batch.leads) {
    // Generate deterministic ID so same lead always has same tracking
    const shortId = await generateDeterministicId(lead.email, batch.campaignId);
    
    const identity: LeadIdentity = {
      shortId,
      visitorId: null, // Will be assigned on first visit
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      campaignId: batch.campaignId,
      campaignName: batch.campaignName,
      createdAt: now,
      expiresAt
    };
    
    identities.push(identity);
  }
  
  return identities;
}

/**
 * Store identities in Cloudflare KV
 */
export async function storeIdentitiesInKV(
  identities: LeadIdentity[],
  kvNamespace: KVNamespace
): Promise<void> {
  const promises = identities.map(identity => 
    kvNamespace.put(
      identity.shortId,
      JSON.stringify(identity),
      {
        expirationTtl: Math.floor((identity.expiresAt - identity.createdAt) / 1000)
      }
    )
  );
  
  await Promise.all(promises);
}

/**
 * Store identities in Supabase
 */
export async function storeIdentitiesInSupabase(
  identities: LeadIdentity[],
  projectId: string,
  dataset: string,
  credentials: any
): Promise<void> {
  // This would use Supabase API similar to the worker
  // Simplified version - in production use Supabase client
  console.log(`Would store ${identities.length} identities in Supabase`);
  // Implementation omitted for brevity - use Supabase REST API
}

/**
 * Generate CSV export of tracking URLs for email tool
 */
export function generateCampaignCSV(
  identities: LeadIdentity[],
  baseUrl: string,
  landingPage: string = '/'
): string {
  const headers = ['Email', 'First Name', 'Last Name', 'Company', 'Tracking URL', 'Short ID'];
  const rows = identities.map(identity => [
    identity.email,
    identity.firstName || '',
    identity.lastName || '',
    identity.company || '',
    createTrackingUrl(baseUrl, identity.shortId, landingPage),
    identity.shortId
  ]);
  
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ];
  
  return csvLines.join('\n');
}

/**
 * Example usage
 */
export const example = {
  async createCampaign() {
    const leads: CampaignLead[] = [
      { email: 'john@example.com', firstName: 'John', lastName: 'Doe', company: 'Acme Inc' },
      { email: 'jane@example.com', firstName: 'Jane', lastName: 'Smith', company: 'Widget Co' }
    ];
    
    const identities = await createIdentitiesBatch({
      campaignId: 'camp_001',
      campaignName: 'Q1 Outbound Campaign',
      leads,
      expirationDays: 90
    });
    
    // Generate CSV for Smartlead/Instantly
    const csv = generateCampaignCSV(identities, 'https://yourdomain.com', '/demo');
    
    console.log('Generated tracking URLs:');
    console.log(csv);
    
    return identities;
  }
};







