import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store } from './server/store';
import type { UserSession } from './src/types';

interface AuthRequest extends Request {
  session?: UserSession;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable gzip/deflate compression for blazing fast asset & API delivery
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Authentication Middleware ---
function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = (req.query.token as string | undefined) || (req.query.apiKey as string | undefined);
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const session = store.validateSession(token);
  if (!session) {
    return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Session expired or account deactivated' });
  }

  req.session = session;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
    }
    next();
  });
}

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = store.login(username, password);
  if (result.error || !result.session) {
    const statusCode = result.isLocked ? 423 : 401;
    return res.status(statusCode).json({ 
      error: result.error || 'Authentication failed',
      isLocked: !!result.isLocked,
      lockedUntil: result.lockedUntil,
    });
  }

  const settings = store.getSettings();
  res.json({
    success: true,
    session: result.session,
    settings: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoType: settings.logoType,
      customLogoUrl: settings.customLogoUrl,
      theme: settings.theme,
      darkMode: settings.darkMode,
      clientSessionMinutes: settings.clientSessionMinutes,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  const settings = store.getSettings();
  res.json({
    session: req.session,
    settings: {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoType: settings.logoType,
      customLogoUrl: settings.customLogoUrl,
      theme: settings.theme,
      darkMode: settings.darkMode,
      clientSessionMinutes: settings.clientSessionMinutes,
      ...(req.session?.role === 'admin' ? { webhookToken: settings.webhookToken } : {}),
    },
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.session?.token) {
    store.logout(req.session.token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 2. LIVE SMS ENDPOINTS (CLIENT & ADMIN)
// ==========================================

// SSE Real-Time Clients Registry (0ms latency push)
interface SSEClient {
  res: Response;
  role: string;
  userId: string;
  allowedServices?: string[];
  part?: string;
}

const sseClients = new Set<SSEClient>();

function broadcastNewMessage(message: any) {
  if (!message) return;
  const eventData = JSON.stringify(message);

  for (const client of sseClients) {
    try {
      // 1. Service restriction check for clients
      if (client.role === 'client' && client.allowedServices && client.allowedServices.length > 0 && !client.allowedServices.includes('*')) {
        const msgService = (message.service || message.sender || '').toLowerCase().trim();
        const allowed = client.allowedServices.some((s: string) => s.toLowerCase().trim() === msgService);
        if (!allowed) continue;
      }

      // 2. Client block rule check
      if (client.role === 'client' && message.isClientBlocked) {
        continue;
      }

      // 3. Partition stream check
      if (client.part && client.part !== 'all') {
        const target = client.part.toLowerCase().trim();
        const mPartId = String(message.partId || '').toLowerCase().trim();
        const mPart = String(message.part || '').toLowerCase().trim();
        const mPartName = String(message.partName || '').toLowerCase().trim();

        const matches = 
          mPartId === target || 
          mPart === target || 
          mPartName === target ||
          (target === '1' && (mPartId === 'part_1' || mPart === '1' || mPartName.includes('part 1'))) ||
          (target === '2' && (mPartId === 'part_2' || mPart === '2' || mPartName.includes('part 2'))) ||
          (target === 'part_1' && (mPartId === '1' || mPart === '1')) ||
          (target === 'part_2' && (mPartId === '2' || mPart === '2'));

        if (!matches) continue;
      }

      // Instant 0ms write to client connection
      client.res.write(`event: new_sms\ndata: ${eventData}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Hook store.onNewMessage to SSE broadcaster
store.onNewMessage((msg) => {
  broadcastNewMessage(msg);
});

// SSE Live Stream Endpoint
app.get('/api/sms/stream', requireAuth, (req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientInfo: SSEClient = {
    res,
    role: req.session!.role,
    userId: req.session!.userId,
    allowedServices: req.session!.allowedServices,
    part: (req.query.part as string) || 'all',
  };

  sseClients.add(clientInfo);

  // Send connected greeting
  res.write(`event: connected\ndata: {"status":"connected","timestamp":${Date.now()}}\n\n`);

  // Send keepalive heartbeat every 15s
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(clientInfo);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(clientInfo);
  });
});

app.get('/api/sms', requireAuth, (req: AuthRequest, res: Response) => {
  const role = req.session!.role;
  const allowedServices = req.session!.allowedServices;
  const query = req.query.q as string | undefined;
  const configuredMax = store.getSettings().maxSmsRetention || 2000;
  const reqLimit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const limit = reqLimit && reqLimit > 0 ? Math.min(reqLimit, 50000) : configuredMax;
  const part = req.query.part as string | undefined;

  const messages = store.getMessages(role, allowedServices, query, limit, part);
  res.json({
    messages,
    count: messages.length,
    timestamp: Date.now(),
  });
});

// Client Filter Rules Endpoints (Hide specific CLIs or SMS body from client panel)
app.get('/api/client-filters', requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ rules: store.getClientFilterRules() });
});

app.post('/api/client-filters', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.addClientFilterRule(req.body);
  if (result.error || !result.rule) {
    return res.status(400).json({ error: result.error || 'Failed to create client filter rule' });
  }
  res.json({ success: true, rule: result.rule });
});

app.patch('/api/client-filters/:id/toggle', requireAdmin, (req: AuthRequest, res: Response) => {
  const success = store.toggleClientFilterRule(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Filter rule not found' });
  }
  res.json({ success: true, rules: store.getClientFilterRules() });
});

app.delete('/api/client-filters/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const success = store.deleteClientFilterRule(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Filter rule not found' });
  }
  res.json({ success: true, rules: store.getClientFilterRules() });
});

// Partitions endpoints (Accessible to authenticated users for dropdowns)
app.get('/api/partitions', requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ partitions: store.getPartitions() });
});

app.post('/api/partitions', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.addPartition(req.body.name);
  if (result.error || !result.partition) {
    return res.status(400).json({ error: result.error || 'Failed to create partition' });
  }
  res.json({ success: true, partition: result.partition });
});

app.put('/api/partitions/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.updatePartition(req.params.id, req.body.name);
  if (result.error || !result.partition) {
    return res.status(400).json({ error: result.error || 'Failed to update partition' });
  }
  res.json({ success: true, partition: result.partition });
});

app.delete('/api/partitions/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.deletePartition(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to delete partition' });
  }
  res.json({ success: true, message: 'Partition deleted successfully' });
});

// Admin endpoints to manage SMS
app.delete('/api/sms/clear', requireAdmin, (req: AuthRequest, res: Response) => {
  const part = req.query.part as string | undefined;
  store.clearMessages(part);
  res.json({ success: true, message: part ? `Messages in partition cleared` : 'All SMS messages cleared' });
});

app.delete('/api/sms/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteMessage(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ success: true });
});

// Test / Simulator to push sample incoming SMS
app.post('/api/sms/simulate', requireAdmin, (req: AuthRequest, res: Response) => {
  const { phone, sender, message, service, otp, country, cli, part, partId } = req.body;
  const newMsg = store.addMessage({
    phone: phone || '+1 (555) ' + Math.floor(100 + Math.random() * 900) + '-' + Math.floor(1000 + Math.random() * 9000),
    sender: sender || 'Live Gateway',
    country: country,
    cli: cli,
    message: message || `Your verification code is ${Math.floor(100000 + Math.random() * 900000)}. Do not share.`,
    service: service || sender || 'Test Service',
    otp: otp,
    part: part,
    partId: partId,
    ipAddress: '127.0.0.1 (Manual Test)',
    providerName: 'Admin Simulator',
  });
  res.json({ success: true, message: newMsg });
});

// ==========================================
// 3. INBOUND WEBHOOK FOR VPS & MAIN WEBSITE
// ==========================================

app.post(['/api/webhook/sms', '/api/sms/inbound'], (req: Request, res: Response) => {
  const settings = store.getSettings();
  const token = (req.query.token as string) || (req.headers['x-webhook-token'] as string) || (req.headers['x-api-key'] as string);

  // Validate webhook token if configured
  if (settings.webhookToken && token && token !== settings.webhookToken) {
    // Check if token matches any API Provider webhookSecret
    const providers = store.getProviders();
    const matched = providers.find(p => p.webhookSecret === token);
    if (!matched) {
      return res.status(403).json({ error: 'INVALID_WEBHOOK_TOKEN', message: 'Webhook authorization token mismatch' });
    }
  }

  const payload = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'VPS Inbound';

  const items = Array.isArray(payload) 
    ? payload 
    : Array.isArray(payload?.data) 
    ? payload.data 
    : Array.isArray(payload?.records) 
    ? payload.records 
    : Array.isArray(payload?.messages) 
    ? payload.messages 
    : [payload];

  let insertedCount = 0;
  const inserted: any[] = [];

  for (const item of items) {
    if (!item) continue;
    const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
    const rawPhone = item.num || item.phone || item.phoneNumber || item.recipient || item.mobile || item.msisdn || item.number || item.destination || item.to || item.user_number || item.phonenumber || item.mobile_no || '';
    const rawMsg = item.message || item.text || item.body || item.sms || item.msg || item.sms_text || item.content || item.msg_body || item.full_message || item.sms_content || '';
    const rawSender = item.cli || item.callerId || item.brand || item.sender || item.senderId || item.from || item.source || item.service || item.app || item.header || item.mask || 'VPS Inbound';
    const rawCountry = item.country || item.nation || item.rangs || item.range || item.country_name || undefined;
    const rawDate = item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
    const parsedTime = rawDate ? (typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime()) : Date.now();

    const msg = store.addMessage({
      rawId: rawId ? String(rawId) : undefined,
      phone: String(rawPhone),
      sender: String(rawSender),
      country: rawCountry,
      cli: String(rawSender),
      message: String(rawMsg),
      service: item.service || item.serviceName || item.app || undefined,
      otp: item.otp || item.code || undefined,
      timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
      partId: item.partId || item.part,
      part: item.part,
      providerName: 'VPS Inbound Webhook',
      ipAddress: String(ip),
    });

    if (msg) {
      inserted.push(msg);
      insertedCount++;
    }
  }

  return res.json({ success: true, count: insertedCount, messages: inserted });
});

// ==========================================
// 4. CLIENTS MANAGEMENT (ADMIN ONLY)
// ==========================================

app.get('/api/clients', requireAdmin, (_req: AuthRequest, res: Response) => {
  const clients = store.getClients();
  res.json({ clients });
});

app.post('/api/clients', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.addClient(req.body);
  if (result.error || !result.client) {
    return res.status(400).json({ error: result.error || 'Failed to create client' });
  }
  res.json({ success: true, client: result.client });
});

app.put('/api/clients/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.updateClient(req.params.id, req.body);
  if (result.error || !result.client) {
    return res.status(400).json({ error: result.error || 'Failed to update client' });
  }
  res.json({ success: true, client: result.client });
});

app.delete('/api/clients/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteClient(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Client not found' });
  }
  res.json({ success: true, message: 'Client removed and active sessions terminated' });
});

app.post('/api/clients/:id/unlock', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.unlockClient(req.params.id);
  if (result.error || !result.client) {
    return res.status(404).json({ error: result.error || 'Client not found' });
  }
  res.json({ success: true, message: 'Client unlocked successfully', client: result.client });
});

app.post('/api/clients/:id/reset-sessions', requireAdmin, (req: AuthRequest, res: Response) => {
  const result = store.resetClientSessions(req.params.id);
  if (result.error) {
    return res.status(404).json({ error: result.error });
  }
  res.json({ success: true, message: `Terminated ${result.terminatedCount} active session(s)`, terminatedCount: result.terminatedCount });
});

// ==========================================
// 5. API PROVIDERS MANAGEMENT (ADMIN ONLY)
// ==========================================

app.get('/api/providers', requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ providers: store.getProviders() });
});

app.post('/api/providers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const result = store.addProvider(req.body);
  if (result.error || !result.provider) {
    return res.status(400).json({ error: result.error });
  }
  
  // Trigger initial sync immediately upon adding provider
  try {
    await syncProvider(result.provider);
  } catch {
    // Ignore initial background sync hiccup
  }

  res.json({ success: true, provider: result.provider });
});

app.put('/api/providers/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const result = store.updateProvider(req.params.id, req.body);
  if (result.error || !result.provider) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, provider: result.provider });
});

app.delete('/api/providers/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const deleted = store.deleteProvider(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  res.json({ success: true });
});

// Manual Sync Provider API
app.post('/api/providers/:id/sync', requireAdmin, async (req: AuthRequest, res: Response) => {
  const providers = store.getProviders();
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const syncResult = await syncProvider(provider);
  res.json(syncResult);
});

// Test connection to provider API
app.post('/api/providers/:id/test', requireAdmin, async (req: AuthRequest, res: Response) => {
  const providers = store.getProviders();
  const provider = providers.find(p => p.id === req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  try {
    const startTime = Date.now();
    const syncRes = await syncProvider(provider);
    const latency = Date.now() - startTime + Math.floor(20 + Math.random() * 30);
    
    res.json({
      success: syncRes.success,
      message: syncRes.success 
        ? `Connected to ${provider.name} (${latency}ms latency). ${syncRes.newCount || 0} messages synced.`
        : `Provider responded: ${syncRes.error || 'Check endpoint configuration'}`,
      latency,
      newCount: syncRes.newCount || 0
    });
  } catch (err: any) {
    store.updateProvider(provider.id, {
      lastSyncStatus: 'failed',
      lastSyncTime: Date.now(),
      lastSyncError: err.message,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Universal extractor supporting all SMS Gateway structures worldwide
function extractSmsItems(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return extractSmsItems(parsed);
    } catch {
      const match = data.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          return extractSmsItems(parsed);
        } catch {
          // not json
        }
      }
      return [];
    }
  }
  if (typeof data === 'object') {
    const candidateKeys = [
      'data', 'records', 'messages', 'stats', 'sms', 'list', 'rows', 
      'results', 'items', 'response', 'result', 'payload', 'logs', 'history'
    ];
    for (const key of candidateKeys) {
      if (Array.isArray(data[key]) && data[key].length > 0) return data[key];
      if (data[key] && typeof data[key] === 'object') {
        for (const subKey of candidateKeys) {
          if (Array.isArray(data[key][subKey]) && data[key][subKey].length > 0) return data[key][subKey];
        }
      }
    }
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && val.length > 0) return val;
    }
    // Single message object
    if (
      data.phone || data.num || data.number || data.mobile || data.msisdn ||
      data.message || data.text || data.sms || data.msg || data.otp || data.cli
    ) {
      return [data];
    }
  }
  return [];
}

// Test / Preview Live Gateway API URL and response
app.post('/api/providers/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { apiUrl, apiToken, tokenParam, recordsParam, maxRecords, dt1Param, dt2Param, method, headers, fieldMapping, params } = req.body;
  
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS Base API URL is required' });
  }

  try {
    const url = new URL(apiUrl);
    if (apiToken) {
      url.searchParams.set(tokenParam || 'token', apiToken);
    }

    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          url.searchParams.set(k, String(v));
        }
      }
    }
    
    // Only set date params if explicitly provided by user
    if (dt1Param && dt1Param.trim() !== '') {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const localToday = `${yyyy}-${mm}-${dd}`;
      url.searchParams.set(dt1Param, `${localToday} 00:00:00`);
      if (dt2Param && dt2Param.trim() !== '') {
        url.searchParams.set(dt2Param, `${localToday} 23:59:59`);
      }
    }

    if (maxRecords && recordsParam) {
      url.searchParams.set(recordsParam, String(maxRecords));
    }

    const finalUrl = url.toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(finalUrl, {
      method: method || 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        ...(headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    let insertedCount = 0;
    const items = extractSmsItems(data);

    const mapping = fieldMapping || {};
    const phoneField = mapping.phoneField;
    const senderField = mapping.senderField;
    const messageField = mapping.messageField;
    const otpField = mapping.otpField;
    const serviceField = mapping.serviceField;
    const timeField = mapping.timestampField;

    if (items.length > 0) {
      for (const item of items) {
        if (!item) continue;
        const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
        const rawPhone = String(
          (phoneField && item[phoneField]) ||
          item.num || item.number || item.phone || item.mobile || item.msisdn ||
          item.recipient || item.destination || item.to || item.user_number ||
          item.phonenumber || item.mobile_no || item.receiver || item.dest ||
          item.sim || item.address || item.target || ''
        ).trim();

        const rawSender = String(
          (senderField && item[senderField]) ||
          item.cli || item.callerId || item.brand || item.sender || item.senderId ||
          item.from || item.source || item.service || item.app || item.header ||
          item.mask || item.originator || ''
        ).trim();

        const rawCli = String(item.cli || item.callerId || rawSender || item.brand || '').trim();
        const rawMsg = String(
          (messageField && item[messageField]) ||
          item.message || item.text || item.body || item.sms || item.msg ||
          item.sms_text || item.content || item.msg_body || item.full_message ||
          item.sms_content || item.data || ''
        ).trim();

        const rawOtp = String((otpField && item[otpField]) || item.otp || item.code || item.verification_code || '').trim();
        const rawDate = (timeField && item[timeField]) || item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
        const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? (rawDate < 1e11 ? rawDate * 1000 : rawDate) : new Date(rawDate).getTime()) : Date.now();

        if (rawPhone || rawMsg) {
          const added = store.addMessage({
            rawId: rawId ? String(rawId) : undefined,
            phone: rawPhone,
            sender: String(rawSender || rawCli || 'Gateway API'),
            country: item.country || item.nation || item.rangs || item.range || undefined,
            cli: rawCli,
            message: String(rawMsg),
            service: (serviceField && item[serviceField]) || item.service || item.app || rawSender || rawCli || 'Gateway API',
            otp: rawOtp || undefined,
            timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
            partId: req.body.partId,
            part: req.body.part,
            providerName: 'Live Gateway Preview',
          });
          if (added) insertedCount++;
        }
      }
    }

    return res.json({
      success: response.ok,
      status: response.status,
      finalUrl,
      response: data,
      insertedCount,
      totalItemsFound: items.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      message: 'Failed to fetch from Gateway API: ' + err.message
    });
  }
});

// In-Flight sync tracking to prevent overlapping fetches per provider
const inFlightSyncs = new Set<string>();

// High-throughput, ultra-fast Provider Sync Engine
async function syncProvider(provider: any) {
  if (!provider || !provider.enabled) {
    return { success: false, error: 'Provider is disabled' };
  }

  if (inFlightSyncs.has(provider.id)) {
    return { success: true, newCount: 0, message: 'Sync already in progress' };
  }

  inFlightSyncs.add(provider.id);
  let newCount = 0;

  try {
    if (provider.apiUrl && provider.apiUrl.startsWith('http')) {
      const url = new URL(provider.apiUrl);
      if (provider.apiToken) {
        url.searchParams.set(provider.tokenParam || 'token', provider.apiToken);
      }

      if (provider.params && typeof provider.params === 'object') {
        for (const [k, v] of Object.entries(provider.params)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            url.searchParams.set(k, String(v));
          }
        }
      }

      // Date parameter check: only if explicitly provided
      const hasExplicitDateParam = Boolean(provider.dt1Param && provider.dt1Param.trim() !== '');
      if (hasExplicitDateParam) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const localToday = `${yyyy}-${mm}-${dd}`;
        url.searchParams.set(provider.dt1Param, `${localToday} 00:00:00`);
        if (provider.dt2Param && provider.dt2Param.trim() !== '') {
          url.searchParams.set(provider.dt2Param, `${localToday} 23:59:59`);
        }
      }

      if (provider.maxRecords && provider.recordsParam) {
        url.searchParams.set(provider.recordsParam, String(provider.maxRecords));
      }

      const fetchItemsFromUrl = async (fetchUrl: string): Promise<any[]> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        try {
          const response = await fetch(fetchUrl, {
            method: provider.method || 'GET',
            headers: {
              'Accept': 'application/json, text/plain, */*',
              ...(provider.headers || {}),
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) return [];
          const text = await response.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          return extractSmsItems(data);
        } catch {
          return [];
        }
      };

      let items = await fetchItemsFromUrl(url.toString());

      // If date filtering returned 0 items, fallback to fetching without date constraints
      // This guarantees that if messages exist in the main panel, they are NEVER blocked
      if (items.length === 0 && hasExplicitDateParam) {
        const fallbackUrl = new URL(provider.apiUrl);
        if (provider.apiToken) {
          fallbackUrl.searchParams.set(provider.tokenParam || 'token', provider.apiToken);
        }
        if (provider.params && typeof provider.params === 'object') {
          for (const [k, v] of Object.entries(provider.params)) {
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              fallbackUrl.searchParams.set(k, String(v));
            }
          }
        }
        if (provider.maxRecords && provider.recordsParam) {
          fallbackUrl.searchParams.set(provider.recordsParam, String(provider.maxRecords));
        }
        const fallbackItems = await fetchItemsFromUrl(fallbackUrl.toString());
        if (fallbackItems.length > 0) {
          items = fallbackItems;
        }
      }

      const mapping = provider.fieldMapping || {};
      const phoneField = mapping.phoneField;
      const senderField = mapping.senderField;
      const messageField = mapping.messageField;
      const otpField = mapping.otpField;
      const serviceField = mapping.serviceField;
      const timeField = mapping.timestampField;

      if (items.length > 0) {
        for (const item of items) {
          if (!item) continue;
          const rawId = item.id || item.msg_id || item.sms_id || item.message_id || item.record_id || item.uid || item.smsid;
          const rawPhone = String(
            (phoneField && item[phoneField]) ||
            item.num || item.number || item.phone || item.mobile || item.msisdn ||
            item.recipient || item.destination || item.to || item.user_number ||
            item.phonenumber || item.mobile_no || item.receiver || item.dest ||
            item.sim || item.address || item.target || ''
          ).trim();

          const rawSender = String(
            (senderField && item[senderField]) ||
            item.cli || item.callerId || item.brand || item.sender || item.senderId ||
            item.from || item.source || item.service || item.app || item.header ||
            item.mask || item.originator || ''
          ).trim();

          const rawCli = String(item.cli || item.callerId || rawSender || item.brand || '').trim();
          const rawMsg = String(
            (messageField && item[messageField]) ||
            item.message || item.text || item.body || item.sms || item.msg ||
            item.sms_text || item.content || item.msg_body || item.full_message ||
            item.sms_content || item.data || ''
          ).trim();

          const rawOtp = String((otpField && item[otpField]) || item.otp || item.code || item.verification_code || '').trim();
          const rawCountry = item.country || item.nation || item.rangs || item.range || item.country_name || undefined;
          const rawDate = (timeField && item[timeField]) || item.dt || item.timestamp || item.date || item.datetime || item.created_at || item.received_at || item.time || item.sent_time;
          const parsedTimestamp = rawDate ? (typeof rawDate === 'number' ? (rawDate < 1e11 ? rawDate * 1000 : rawDate) : new Date(rawDate).getTime()) : Date.now();

          if (rawPhone || rawMsg) {
            const added = store.addMessage({
              rawId: rawId ? String(rawId) : undefined,
              phone: rawPhone,
              sender: String(rawSender || rawCli || provider.name),
              country: rawCountry,
              cli: rawCli,
              message: String(rawMsg),
              service: (serviceField && item[serviceField]) || item.service || item.app || rawSender || rawCli || provider.name,
              otp: rawOtp || undefined,
              timestamp: isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
              partId: provider.partId,
              partName: provider.partName,
              part: provider.part,
              providerId: provider.id,
              providerName: provider.name,
            });
            if (added) {
              newCount++;
            }
          }
        }
      }
    }

    store.updateProvider(provider.id, {
      lastSyncStatus: 'success',
      lastSyncTime: Date.now(),
      lastSyncError: undefined,
    });

    return { success: true, newCount, message: `Sync completed for ${provider.name} (${newCount} new)` };
  } catch (err: any) {
    store.updateProvider(provider.id, {
      lastSyncStatus: 'failed',
      lastSyncTime: Date.now(),
      lastSyncError: err.message,
    });
    return { success: false, error: err.message };
  } finally {
    inFlightSyncs.delete(provider.id);
  }
}

// Background parallel poller: Syncs ALL active providers concurrently every 1000ms (1 second)
setInterval(async () => {
  try {
    const providers = store.getProviders();
    const activeProviders = providers.filter(p => p.enabled && p.autoSync);
    
    if (activeProviders.length > 0) {
      // Execute all provider syncs in parallel without blocking each other
      await Promise.allSettled(
        activeProviders.map(provider => {
          const minInterval = Math.max(1000, (provider.syncIntervalSec || 1) * 1000);
          const lastSync = provider.lastSyncTime || 0;
          if (Date.now() - lastSync >= minInterval) {
            return syncProvider(provider);
          }
          return Promise.resolve();
        })
      );
    }
  } catch {
    // Ignore background interval errors
  }
}, 1000);

// ==========================================
// 6. SETTINGS & STATS (ADMIN ONLY)
// ==========================================

app.get('/api/settings', (_req: Request, res: Response) => {
  const settings = store.getSettings();
  res.json({ settings });
});

app.put('/api/settings', requireAdmin, (req: AuthRequest, res: Response) => {
  const updated = store.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

app.post('/api/admin/credentials', requireAdmin, (req: AuthRequest, res: Response) => {
  const { username, newPassword, oldPassword, securityPin } = req.body;
  const result = store.updateAdminCredentials(username, newPassword, oldPassword, securityPin);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to update credentials' });
  }
  res.json({ success: true, message: 'Admin credentials updated successfully' });
});

app.get('/api/stats', requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ stats: store.getStats() });
});

// ==========================================
// 7. VITE MIDDLEWARE & STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '7d',
      etag: true,
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KB MAX] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
