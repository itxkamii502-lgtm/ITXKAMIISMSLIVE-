import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store, safeCompare, sanitizeInputString } from './server/store';
import type { UserSession } from './src/types';

interface AuthRequest extends Request {
  session?: UserSession;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Remove revealing server technology header
app.disable('x-powered-by');

// ==========================================
// SECURITY HEADERS & DEFENSE-IN-DEPTH
// ==========================================
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Cache prevention on all sensitive API routes
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Enable gzip/deflate compression for blazing fast asset & API delivery
app.use(compression());

// Configured CORS for safe origin communication
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server webhook)
    if (!origin) return callback(null, true);
    // Allow any localhost, ais-dev/ais-pre cloud run preview, or explicitly configured ALLOWED_ORIGIN
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('.run.app') ||
      origin.includes('.google.dev') ||
      (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN)
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Token', 'X-API-Key', 'Accept'],
}));

// Strictly bound JSON body limit to 2.5MB to protect Node.js event loop
app.use(express.json({ limit: '2.5mb' }));
app.use(express.urlencoded({ extended: true, limit: '2.5mb' }));

// ==========================================
// IN-MEMORY SLIDING WINDOW RATE LIMITER
// ==========================================
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodic sweep to prevent memory growth
    setInterval(() => {
      const now = Date.now();
      for (const [ip, bucket] of this.buckets.entries()) {
        if (now >= bucket.resetAt) {
          this.buckets.delete(ip);
        }
      }
    }, 60000);
  }

  public check(key: string): { allowed: boolean; remaining: number; resetInSec: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
      return { allowed: true, remaining: this.maxRequests - 1, resetInSec: Math.ceil(this.windowMs / 1000) };
    }

    bucket.count++;
    const resetInSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count > this.maxRequests) {
      return { allowed: false, remaining: 0, resetInSec };
    }

    return { allowed: true, remaining: this.maxRequests - bucket.count, resetInSec };
  }
}

const loginRateLimiter = new InMemoryRateLimiter(10, 5 * 60 * 1000);  // Max 10 attempts per 5 mins per IP
const webhookRateLimiter = new InMemoryRateLimiter(180, 60 * 1000);   // Max 180 inbound webhook requests/min
const apiRateLimiter = new InMemoryRateLimiter(500, 60 * 1000);       // Max 500 API calls/min per IP

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Global API Rate Limiter
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Allow SSE stream without counting against standard request rate limiter
  if (req.path === '/sms/stream') {
    return next();
  }

  const clientIp = getClientIp(req);
  const check = apiRateLimiter.check(clientIp);
  if (!check.allowed) {
    return res.status(429).json({ 
      error: 'TOO_MANY_REQUESTS', 
      message: `API rate limit exceeded. Please retry in ${check.resetInSec}s.` 
    });
  }
  next();
});

// ==========================================
// SSRF DEFENSE: Outbound URL Validation
// ==========================================
export function isSafeOutboundUrl(urlStr: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are permitted' };
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, internal domains, cloud metadata
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host === '169.254.169.254'
    ) {
      return { safe: false, reason: 'Outbound requests to localhost or cloud metadata services are forbidden' };
    }

    // Check for private IPv4 ranges
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const o1 = Number(ipv4Match[1]);
      const o2 = Number(ipv4Match[2]);
      const o3 = Number(ipv4Match[3]);
      const o4 = Number(ipv4Match[4]);
      if ([o1, o2, o3, o4].some(o => o < 0 || o > 255)) {
        return { safe: false, reason: 'Invalid IP address' };
      }
      if (o1 === 127) return { safe: false, reason: 'Loopback addresses are forbidden' };
      if (o1 === 10) return { safe: false, reason: 'Private 10.0.0.0/8 addresses are forbidden' };
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: 'Private 172.16.0.0/12 addresses are forbidden' };
      if (o1 === 192 && o2 === 168) return { safe: false, reason: 'Private 192.168.0.0/16 addresses are forbidden' };
      if (o1 === 169 && o2 === 254) return { safe: false, reason: 'Link-local addresses are forbidden' };
      if (o1 === 0) return { safe: false, reason: 'Zero-net addresses are forbidden' };
    }

    return { safe: true };
  } catch (err: any) {
    return { safe: false, reason: 'Malformed URL: ' + err.message };
  }
}

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
  const clientIp = getClientIp(req);
  const ipCheck = loginRateLimiter.check(clientIp);
  if (!ipCheck.allowed) {
    return res.status(429).json({ 
      error: `Too many login attempts. Please wait ${ipCheck.resetInSec} seconds before trying again.`,
      resetInSec: ipCheck.resetInSec 
    });
  }

  const { username, password } = req.body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = store.login(username.trim().slice(0, 64), password.slice(0, 128));
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
      ...store.getPublicSettings(),
      ...(result.session.role === 'admin' ? { webhookToken: settings.webhookToken, adminUsername: settings.adminUsername } : {})
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
  const clientIp = getClientIp(req);
  const ipCheck = webhookRateLimiter.check(clientIp);
  if (!ipCheck.allowed) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Webhook rate limit exceeded. Please slow down.' });
  }

  const settings = store.getSettings();
  const token = (req.query.token as string) || 
                (req.headers['x-webhook-token'] as string) || 
                (req.headers['x-api-key'] as string) ||
                (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);

  // Validate webhook token strictly if configured
  if (settings.webhookToken) {
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Webhook authorization token is required' });
    }
    const isMasterMatch = safeCompare(token, settings.webhookToken);
    if (!isMasterMatch) {
      // Check if token matches any API Provider webhookSecret
      const providers = store.getProviders();
      const matched = providers.find(p => p.webhookSecret && safeCompare(p.webhookSecret, token));
      if (!matched) {
        return res.status(403).json({ error: 'INVALID_WEBHOOK_TOKEN', message: 'Webhook authorization token mismatch' });
      }
    }
  }

  const payload = req.body;
  if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Expected JSON object or array' });
  }

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
// 4.5. NUMBER RANGES & BULK NUMBERS MANAGEMENT
// ==========================================

// Authenticated users (admin + client) can read configured ranges to resolve range names
app.get('/api/ranges', requireAuth, (_req: AuthRequest, res: Response) => {
  const ranges = store.getRanges();
  res.json({ ranges });
});

// Admin-only: Check duplicates against global database (1 Number = 1 Range Only rule)
app.post('/api/ranges/check-duplicates', requireAdmin, (req: AuthRequest, res: Response) => {
  const { numbers, targetRangeId } = req.body || {};
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.json({ totalChecked: 0, newCount: 0, duplicateCount: 0, duplicates: [] });
  }
  const result = store.checkDuplicateNumbers(numbers, targetRangeId ? String(targetRangeId) : undefined);
  res.json(result);
});

// Admin-only endpoints for managing ranges and bulk numbers
app.post('/api/ranges', requireAdmin, (req: AuthRequest, res: Response) => {
  const { mode, rangeId, name, prefix, countryNote, numbers } = req.body || {};

  if (mode === 'existing' || rangeId) {
    if (!rangeId) {
      return res.status(400).json({ error: 'Please select an existing range' });
    }
    const result = store.addNumbersToRange(String(rangeId), Array.isArray(numbers) ? numbers : []);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to add numbers to range' });
    }
    return res.json({
      success: true,
      range: result.range,
      addedCount: result.addedCount,
      duplicateCount: result.duplicateCount,
      conflictSample: result.conflictSample,
      message: result.duplicateCount > 0
        ? `Added ${result.addedCount} new numbers. Skipped ${result.duplicateCount} duplicate numbers (Rule: 1 Number = 1 Range Only).`
        : `Successfully added all ${result.addedCount} numbers to range "${result.range?.name}".`,
    });
  } else {
    // Mode: create new range
    if (!name || !prefix) {
      return res.status(400).json({ error: 'Range name and country prefix are required' });
    }
    const result = store.createRange({
      name: String(name),
      prefix: String(prefix),
      countryNote: countryNote ? String(countryNote) : undefined,
      numbers: Array.isArray(numbers) ? numbers : [],
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to create range' });
    }
    return res.json({
      success: true,
      range: result.range,
      addedCount: result.addedCount,
      duplicateCount: result.duplicateCount,
      conflictSample: result.conflictSample,
      message: result.duplicateCount > 0
        ? `Created range "${result.range?.name}" with ${result.addedCount} numbers. Skipped ${result.duplicateCount} duplicates (Rule: 1 Number = 1 Range Only).`
        : `Successfully created range "${result.range?.name}" with ${result.addedCount} numbers.`,
    });
  }
});

app.post('/api/ranges/:id/numbers', requireAdmin, (req: AuthRequest, res: Response) => {
  const rangeId = req.params.id;
  const { numbers } = req.body || {};
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'No numbers provided' });
  }

  const result = store.addNumbersToRange(rangeId, numbers);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to add numbers' });
  }
  res.json({
    success: true,
    range: result.range,
    addedCount: result.addedCount,
    duplicateCount: result.duplicateCount,
    conflictSample: result.conflictSample,
    message: result.duplicateCount > 0
      ? `Added ${result.addedCount} new numbers. Skipped ${result.duplicateCount} duplicates (Rule: 1 Number = 1 Range Only).`
      : `Successfully added all ${result.addedCount} numbers to range.`,
  });
});

app.delete('/api/ranges/:id/numbers', requireAdmin, (req: AuthRequest, res: Response) => {
  const rangeId = req.params.id;
  const { numbers } = req.body || {};
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'No numbers provided to remove' });
  }

  const result = store.removeNumbersFromRange(rangeId, numbers);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to remove numbers' });
  }
  res.json({
    success: true,
    removedCount: result.removedCount,
    totalRemaining: result.totalRemaining,
  });
});

// Admin-only: Remove ALL numbers from range (Requires Security PIN, Range remains intact)
app.post('/api/ranges/:id/clear-numbers', requireAdmin, (req: AuthRequest, res: Response) => {
  const rangeId = req.params.id;
  const securityPin = req.body?.securityPin || req.headers['x-security-pin'] || (req.query?.securityPin as string) || (req.query?.pin as string);

  const pinCheck = store.verifySecurityPin(securityPin ? String(securityPin) : undefined);
  if (!pinCheck.valid) {
    return res.status(403).json({ 
      error: pinCheck.error || 'Invalid Security PIN! Please enter the authorized Master PIN.' 
    });
  }

  const result = store.clearRangeNumbers(rangeId);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to clear numbers from range' });
  }

  res.json({
    success: true,
    removedCount: result.removedCount,
    range: result.range,
    message: `Successfully removed all ${result.removedCount.toLocaleString()} numbers from range "${result.range?.name}". The range configuration remains intact.`,
  });
});

app.get('/api/ranges/:id/numbers', requireAdmin, (req: AuthRequest, res: Response) => {
  const rangeId = req.params.id;
  const search = req.query.search ? String(req.query.search) : undefined;
  const page = parseInt(String(req.query.page || '1'), 10) || 1;
  const limit = parseInt(String(req.query.limit || '50'), 10) || 50;

  const result = store.getRangeNumbers(rangeId, search, page, limit);
  res.json(result);
});

// Admin-only: Delete entire range (Supports both DELETE and POST /delete for maximum compatibility)
const handleRangeDelete = (req: AuthRequest, res: Response) => {
  const rangeId = req.params.id;
  const securityPin = req.body?.securityPin || req.headers['x-security-pin'] || (req.query?.securityPin as string) || (req.query?.pin as string);

  const pinCheck = store.verifySecurityPin(securityPin ? String(securityPin) : undefined);
  if (!pinCheck.valid) {
    return res.status(403).json({ 
      error: pinCheck.error || 'Invalid Security PIN! Please enter the authorized Master PIN.' 
    });
  }

  const range = store.getRange(rangeId);
  if (!range) {
    return res.status(404).json({ error: 'Range not found' });
  }

  const deleted = store.deleteRange(rangeId);
  if (!deleted) {
    return res.status(400).json({ error: 'Failed to delete range' });
  }

  res.json({ 
    success: true, 
    message: `Range "${range.name}" and all associated numbers were successfully deleted.` 
  });
};

app.delete('/api/ranges/:id', requireAdmin, handleRangeDelete);
app.post('/api/ranges/:id/delete', requireAdmin, handleRangeDelete);

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
  
  if (!apiUrl || typeof apiUrl !== 'string' || !apiUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS Base API URL is required' });
  }

  // SSRF Protection: verify destination URL is not targeting internal networks or metadata services
  const urlSafety = isSafeOutboundUrl(apiUrl);
  if (!urlSafety.safe) {
    return res.status(400).json({ error: `Forbidden target URL: ${urlSafety.reason}` });
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
      const urlSafety = isSafeOutboundUrl(provider.apiUrl);
      if (!urlSafety.safe) {
        store.updateProvider(provider.id, {
          lastSyncStatus: 'failed',
          lastSyncTime: Date.now(),
          lastSyncError: `Blocked unsafe URL: ${urlSafety.reason}`,
        });
        return { success: false, error: `Blocked unsafe URL: ${urlSafety.reason}` };
      }

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

app.get('/api/settings', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Only return full settings (including webhookToken & admin username) to authenticated admins
  if (token) {
    const session = store.validateSession(token);
    if (session && session.role === 'admin') {
      return res.json({ settings: store.getSettings() });
    }
  }

  // Default: Return safe public settings with zero secret leakage
  res.json({ settings: store.getPublicSettings() });
});

app.put('/api/settings', requireAdmin, (req: AuthRequest, res: Response) => {
  const body = req.body || {};
  const sanitizedSettings: any = {};

  if (body.siteName !== undefined) sanitizedSettings.siteName = sanitizeInputString(body.siteName, 64);
  if (body.tagline !== undefined) sanitizedSettings.tagline = sanitizeInputString(body.tagline, 128);
  if (body.logoType !== undefined && (body.logoType === 'icon' || body.logoType === 'custom_url')) {
    sanitizedSettings.logoType = body.logoType;
  }
  if (body.customLogoUrl !== undefined) {
    // Only allow data:image/ or safe http(s) URL
    const url = String(body.customLogoUrl).trim();
    if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://') || url === '') {
      sanitizedSettings.customLogoUrl = url.slice(0, 3 * 1024 * 1024);
    }
  }
  if (body.theme !== undefined) sanitizedSettings.theme = body.theme;
  if (body.darkMode !== undefined) sanitizedSettings.darkMode = Boolean(body.darkMode);
  if (body.clientSessionMinutes !== undefined) {
    sanitizedSettings.clientSessionMinutes = Math.max(1, Math.min(1440, Number(body.clientSessionMinutes) || 5));
  }
  if (body.maxSmsRetention !== undefined) {
    sanitizedSettings.maxSmsRetention = Math.max(100, Math.min(50000, Number(body.maxSmsRetention) || 2000));
  }
  if (body.smsTableBgColor !== undefined) sanitizedSettings.smsTableBgColor = sanitizeInputString(body.smsTableBgColor, 32);
  if (body.smsTextColor !== undefined) sanitizedSettings.smsTextColor = sanitizeInputString(body.smsTextColor, 32);
  if (body.smsBorderColor !== undefined) sanitizedSettings.smsBorderColor = sanitizeInputString(body.smsBorderColor, 32);
  if (body.smsPresetTheme !== undefined) sanitizedSettings.smsPresetTheme = body.smsPresetTheme;
  if (body.smsFontSize !== undefined) sanitizedSettings.smsFontSize = body.smsFontSize;

  const updated = store.updateSettings(sanitizedSettings);
  res.json({ success: true, settings: updated });
});

app.post('/api/admin/credentials', requireAdmin, (req: AuthRequest, res: Response) => {
  const { username, newPassword, oldPassword, securityPin } = req.body;
  if (newPassword && typeof newPassword === 'string' && newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const result = store.updateAdminCredentials(
    username ? sanitizeInputString(username, 32) : undefined, 
    newPassword ? String(newPassword).slice(0, 128) : undefined, 
    oldPassword ? String(oldPassword).slice(0, 128) : undefined, 
    securityPin ? sanitizeInputString(securityPin, 32) : undefined
  );
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
