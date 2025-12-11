# Event Tracking Architecture: web_visitor vs lead

## The Core Concept

Events can belong to **EITHER** anonymous visitors **OR** identified leads - never both at the same time.

## Database Structure

### Events Table Has Two Foreign Keys (Mutually Exclusive)

```sql
CREATE TABLE event (
  id UUID PRIMARY KEY,
  
  -- Event details
  type event_type NOT NULL,
  category event_category NOT NULL,
  session_id UUID NOT NULL,
  
  -- OWNERSHIP: Either web_visitor_id OR lead_id (NOT BOTH!)
  web_visitor_id UUID,  -- Set if visitor is still anonymous
  lead_id UUID,         -- Set if visitor is identified
  
  -- Event data
  url TEXT,
  data JSON,
  -- ... other fields ...
  
  -- Foreign keys
  CONSTRAINT fk_web_visitor
    FOREIGN KEY (web_visitor_id)
    REFERENCES web_visitor(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE CASCADE,
    
  -- CRITICAL: Ensure only one owner
  CONSTRAINT check_event_owner CHECK (
    (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visitor_id IS NULL AND lead_id IS NOT NULL)
  )
);
```

## How It Works

### Scenario 1: Anonymous Visitor (No Email Yet)

```
Visitor arrives → Browser generates visitor_id → Creates web_visitor record

Event Flow:
┌─────────────────┐
│  web_visitor    │
│  id: abc-123    │ ← Creates record on first visit
│  visitor_id: v1 │
│  is_identified: FALSE
└────────┬────────┘
         │
         │ web_visitor_id = abc-123
         │ lead_id = NULL
         ▼
┌─────────────────┐
│     event       │
│  type: page_view│ ← All events point to web_visitor
│  web_visitor_id: abc-123
│  lead_id: NULL  │
└─────────────────┘
```

**Database Record:**
```sql
-- web_visitor table
INSERT INTO web_visitor (visitor_id, is_identified) 
VALUES ('v1', FALSE);

-- event table
INSERT INTO event (web_visitor_id, lead_id, type) 
VALUES ('abc-123', NULL, 'page_view');
       ↑          ↑
       SET      NULL
```

### Scenario 2: Visitor Gets Identified (Email Captured)

```
Visitor submits email → identify_visitor() function called → Transitions to lead

Before Identification:
┌─────────────────┐
│  web_visitor    │
│  id: abc-123    │
│  is_identified: FALSE
│  lead_id: NULL  │
└────────┬────────┘
         │
         │ Events point here
         ▼
┌─────────────────┐
│     event       │
│  web_visitor_id: abc-123
│  lead_id: NULL  │
└─────────────────┘

After Identification (identify_visitor() function):
┌─────────────────┐     ┌─────────────────┐
│  web_visitor    │     │     lead        │
│  id: abc-123    │────→│  id: xyz-789    │
│  is_identified: TRUE  │  email: john@... │
│  lead_id: xyz-789│    │  first_name: John│
└─────────────────┘     └────────┬────────┘
                                 │
         OLD EVENTS MOVED HERE   │
                ┌────────────────┘
                ▼
┌─────────────────┐
│     event       │
│  web_visitor_id: NULL  ← Cleared!
│  lead_id: xyz-789      ← Updated!
└─────────────────┘
```

**SQL Transition (automatic via function):**
```sql
-- 1. Create lead record
INSERT INTO lead (email, original_visitor_id) 
VALUES ('john@example.com', 'v1');

-- 2. Update web_visitor to link to lead
UPDATE web_visitor 
SET is_identified = TRUE, 
    lead_id = 'xyz-789' 
WHERE id = 'abc-123';

-- 3. Move ALL past events from web_visitor to lead
UPDATE event 
SET web_visitor_id = NULL,
    lead_id = 'xyz-789'
WHERE web_visitor_id = 'abc-123';

-- 4. Move ALL sessions from web_visitor to lead
UPDATE session
SET web_visitor_id = NULL,
    lead_id = 'xyz-789'
WHERE web_visitor_id = 'abc-123';
```

### Scenario 3: Identified Visitor Returns

```
Known lead clicks email link → Worker detects tracking_id → Routes to lead

Event Flow:
┌─────────────────┐
│     lead        │
│  id: xyz-789    │ ← Lead already exists
│  tracking_id: t1│
│  email: john@...│
└────────┬────────┘
         │
         │ lead_id = xyz-789
         │ web_visitor_id = NULL
         ▼
┌─────────────────┐
│     event       │
│  type: page_view│ ← New events go straight to lead
│  web_visitor_id: NULL
│  lead_id: xyz-789
└─────────────────┘
```

**Database Record:**
```sql
-- event table
INSERT INTO event (web_visitor_id, lead_id, type) 
VALUES (NULL, 'xyz-789', 'page_view');
        ↑      ↑
       NULL   SET
```

## Worker Logic: How to Decide

```typescript
async function storeEvents(events: TrackingEvent[], env: Env) {
  const visitorId = events[0].visitorId;
  const trackingId = events[0].data?.tracking_id;
  const email = extractEmail(events);
  
  // DECISION TREE:
  
  // 1. Do we have a tracking_id? (from email campaign)
  if (trackingId) {
    const lead = await findLeadByTrackingId(trackingId);
    if (lead) {
      // Route to lead
      insertEvents(events, { lead_id: lead.id, web_visitor_id: null });
      return;
    }
  }
  
  // 2. Do we have an email? (form submit, browser scan)
  if (email) {
    // Check if this visitor is already identified
    const webVisitor = await findWebVisitor(visitorId);
    
    if (webVisitor?.is_identified) {
      // Already identified! Route to their lead
      insertEvents(events, { lead_id: webVisitor.lead_id, web_visitor_id: null });
      return;
    } else {
      // NEW IDENTIFICATION!
      const leadId = await identifyVisitor(visitorId, email);
      // identifyVisitor() automatically moves all past events to lead
      // Route new events to lead
      insertEvents(events, { lead_id: leadId, web_visitor_id: null });
      return;
    }
  }
  
  // 3. Still anonymous - route to web_visitor
  const webVisitorId = await getOrCreateWebVisitor(visitorId);
  insertEvents(events, { web_visitor_id: webVisitorId, lead_id: null });
}
```

## Query Patterns

### Get All Events for an Anonymous Visitor
```sql
SELECT * FROM event 
WHERE web_visitor_id = 'abc-123';
```

### Get All Events for an Identified Lead
```sql
SELECT * FROM event 
WHERE lead_id = 'xyz-789';
```

### Get Complete History (Anonymous + Identified)
```sql
-- First get the lead_id from web_visitor
SELECT lead_id FROM web_visitor WHERE visitor_id = 'v1';

-- Then get all events
SELECT * FROM event 
WHERE lead_id = 'xyz-789'  -- Their identified events
ORDER BY created_at;

-- Note: Old anonymous events were already moved to lead_id during identification
```

### Get All Events (Both States) - Using JOIN
```sql
SELECT 
  e.*,
  wv.visitor_id as anonymous_visitor_id,
  l.email as identified_email
FROM event e
LEFT JOIN web_visitor wv ON e.web_visitor_id = wv.id
LEFT JOIN lead l ON e.lead_id = l.id
ORDER BY e.created_at DESC;
```

## Sessions Work the Same Way

Sessions also have the same mutually exclusive relationship:

```sql
CREATE TABLE session (
  id UUID PRIMARY KEY,
  
  -- OWNERSHIP: Either web_visitor_id OR lead_id (NOT BOTH!)
  web_visitor_id UUID,  -- Set if visitor is still anonymous
  lead_id UUID,         -- Set if visitor is identified
  
  -- ... other fields ...
  
  CONSTRAINT check_session_owner CHECK (
    (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visitor_id IS NULL AND lead_id IS NOT NULL)
  )
);
```

## Summary

| State | web_visitor_id | lead_id | Description |
|-------|---------------|---------|-------------|
| Anonymous | `abc-123` | `NULL` | Visitor not yet identified |
| Identified | `NULL` | `xyz-789` | Visitor has email/info |

**Key Rules:**
1. ✅ Event can have `web_visitor_id` set and `lead_id = NULL`
2. ✅ Event can have `lead_id` set and `web_visitor_id = NULL`
3. ❌ Event CANNOT have both set
4. ❌ Event CANNOT have both NULL (enforced by CHECK constraint)
5. 🔄 During identification, ALL past events move from `web_visitor_id` to `lead_id`
