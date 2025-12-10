# Smartlead → BigQuery Message Sync

## Purpose
Sync email messages from Smartlead to BigQuery automatically.

---

## N8N Workflow Setup

### Node 1: HTTP Request (Get Smartlead Messages)

**Type:** HTTP Request  
**Method:** GET  
**URL:** `https://api.smartlead.ai/api/v1/campaigns/{{ $json.smartleadCampaignId }}/sequences`

**Headers:**
```
Authorization: Bearer YOUR_SMARTLEAD_API_KEY
Content-Type: application/json
```

**Response:** Smartlead returns sequences with messages

---

### Node 2: Code (Parse Smartlead Response)

**Type:** Code  
**Language:** JavaScript

```javascript
// Smartlead API response structure (adjust based on actual API)
const sequences = $input.item.json.sequences || [];
const campaignId = $('Set Campaign Name').first().json.campaignId;
const smartleadCampaignId = $('Set Campaign Name').first().json.smartleadCampaignId;

const messages = [];

sequences.forEach((sequence, seqIndex) => {
  const steps = sequence.steps || sequence.messages || [];
  
  steps.forEach((step, stepIndex) => {
    messages.push({
      messageId: `${campaignId}-step-${stepIndex + 1}`,
      smartleadMessageId: step.id || step.messageId || null,
      campaignId: campaignId,
      subject: step.subject || step.emailSubject || '',
      body: step.body || step.emailBody || step.content || '',
      sequenceStep: stepIndex + 1,
      delayDays: step.delayDays || step.delay || 0,
      isAbTest: step.isAbTest || false,
      variantId: step.variantId || step.variant || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
});

return messages.map(msg => ({ json: msg }));
```

**Note:** Adjust field names based on actual Smartlead API response structure.

---

### Node 3: BigQuery (Upsert Messages)

**Type:** Google BigQuery  
**Operation:** Execute Query  
**Project ID:** `n8n-revenueinstitute`

**Query:**
```sql
MERGE `outbound_sales.email_messages` AS target
USING (
  SELECT 
    '{{ $json.messageId }}' as messageId,
    '{{ $json.smartleadMessageId }}' as smartleadMessageId,
    '{{ $json.campaignId }}' as campaignId,
    '{{ $json.subject }}' as subject,
    '{{ $json.body }}' as body,
    {{ $json.sequenceStep }} as sequenceStep,
    {{ $json.delayDays }} as delayDays,
    {{ $json.isAbTest }} as isAbTest,
    '{{ $json.variantId }}' as variantId
) AS source
ON target.messageId = source.messageId
WHEN MATCHED THEN
  UPDATE SET
    subject = source.subject,
    body = source.body,
    delayDays = source.delayDays,
    updatedAt = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (
    messageId, smartleadMessageId, campaignId, subject, body,
    sequenceStep, delayDays, isAbTest, variantId
  )
  VALUES (
    source.messageId, source.smartleadMessageId, source.campaignId,
    source.subject, source.body, source.sequenceStep, source.delayDays,
    source.isAbTest, source.variantId
  );
```

**Mode:** Execute for Each Item

---

## Trigger Options

### Option 1: Manual Trigger
- Click "Execute Workflow" in N8N
- Pass `smartleadCampaignId` and `campaignId`

### Option 2: Scheduled (Cron)
- **Schedule:** Every hour or daily
- **Node:** Cron Trigger
- Gets all active campaigns from BigQuery, syncs each

### Option 3: Webhook (After Campaign Creation)
- When campaign created in N8N
- Automatically sync messages

---

## Scheduled Sync Workflow

### Node 1: Cron Trigger
**Schedule:** `0 * * * *` (every hour)

### Node 2: BigQuery (Get Active Campaigns)
```sql
SELECT campaignId, smartleadCampaignId
FROM `outbound_sales.campaigns`
WHERE status = 'active'
  AND smartleadCampaignId IS NOT NULL;
```

### Node 3: Loop Over Campaigns
**Type:** Split In Batches  
**Batch Size:** 1

### Node 4: HTTP Request (Get Messages)
Same as above, but use `{{ $json.smartleadCampaignId }}`

### Node 5: Code (Parse)
Same as above

### Node 6: BigQuery (Upsert)
Same as above

---

## Testing

**Manual test:**
```bash
curl -X POST https://your-n8n.com/webhook/sync-messages \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "q1-outreach-2025",
    "smartleadCampaignId": "12345"
  }'
```

---

## Notes

- **Upsert logic:** Updates existing messages, inserts new ones
- **Field mapping:** Adjust based on actual Smartlead API response
- **A/B tests:** Each variant becomes separate row with variantId
- **Schedule:** Run hourly to catch message updates in Smartlead

