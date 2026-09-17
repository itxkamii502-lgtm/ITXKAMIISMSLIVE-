import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { 
  ApiProvider, 
  ClientAccount, 
  SmsMessage, 
  SiteSettings, 
  SystemStats, 
  UserRole, 
  UserSession,
  Partition,
  ClientFilterRule,
  NumberRange
} from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

// Timing-safe string comparison using SHA-256 digests to prevent length and timing side-channel leakage
export function safeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Universal input sanitizer that strips control characters and enforces length limits
export function sanitizeInputString(str: any, maxLen: number = 500): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  // Strip null bytes and non-printable control characters except standard whitespace
  const cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLen);
}

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function extractOtp(message: string): string | undefined {
  if (!message) return undefined;
  const otpPatterns = [
    /(?:code|otp|verification|pin|password|is|secret)[\s:]*([0-9]{4,8})/i,
    /(?:code|otp|verification|pin|password)[\s:]*([0-9]{3}-[0-9]{3})/i,
    /\b([0-9]{4,8})\b/
  ];

  for (const pattern of otpPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].replace('-', '');
    }
  }
  return undefined;
}

// Complete Worldwide Calling Codes Mapping (ITU-T E.164)
const CALLING_CODES_MAP: Record<string, string> = {
  // --- 4-Digit NANP Caribbean & Territories ---
  '1242': 'Bahamas',
  '1246': 'Barbados',
  '1264': 'Anguilla',
  '1268': 'Antigua and Barbuda',
  '1284': 'British Virgin Islands',
  '1340': 'US Virgin Islands',
  '1345': 'Cayman Islands',
  '1441': 'Bermuda',
  '1473': 'Grenada',
  '1649': 'Turks and Caicos',
  '1664': 'Montserrat',
  '1670': 'Northern Mariana Islands',
  '1671': 'Guam',
  '1684': 'American Samoa',
  '1721': 'Sint Maarten',
  '1758': 'Saint Lucia',
  '1767': 'Dominica',
  '1784': 'Saint Vincent and the Grenadines',
  '1787': 'Puerto Rico',
  '1809': 'Dominican Republic',
  '1829': 'Dominican Republic',
  '1849': 'Dominican Republic',
  '1868': 'Trinidad and Tobago',
  '1869': 'Saint Kitts and Nevis',
  '1876': 'Jamaica',
  '1939': 'Puerto Rico',

  // --- Canadian Area Codes (NANP +1) ---
  '1204': 'Canada',
  '1226': 'Canada',
  '1236': 'Canada',
  '1249': 'Canada',
  '1250': 'Canada',
  '1289': 'Canada',
  '1306': 'Canada',
  '1343': 'Canada',
  '1365': 'Canada',
  '1403': 'Canada',
  '1416': 'Canada',
  '1418': 'Canada',
  '1438': 'Canada',
  '1450': 'Canada',
  '1506': 'Canada',
  '1514': 'Canada',
  '1519': 'Canada',
  '1548': 'Canada',
  '1579': 'Canada',
  '1581': 'Canada',
  '1587': 'Canada',
  '1604': 'Canada',
  '1613': 'Canada',
  '1639': 'Canada',
  '1647': 'Canada',
  '1672': 'Canada',
  '1705': 'Canada',
  '1709': 'Canada',
  '1778': 'Canada',
  '1780': 'Canada',
  '1782': 'Canada',
  '1807': 'Canada',
  '1819': 'Canada',
  '1825': 'Canada',
  '1867': 'Canada',
  '1873': 'Canada',
  '1902': 'Canada',
  '1905': 'Canada',

  // --- 3-Digit Codes ---
  '211': 'South Sudan',
  '212': 'Morocco',
  '213': 'Algeria',
  '216': 'Tunisia',
  '218': 'Libya',
  '220': 'Gambia',
  '221': 'Senegal',
  '222': 'Mauritania',
  '223': 'Mali',
  '224': 'Guinea',
  '225': 'Ivory Coast',
  '226': 'Burkina Faso',
  '227': 'Niger',
  '228': 'Togo',
  '229': 'Benin',
  '230': 'Mauritius',
  '231': 'Liberia',
  '232': 'Sierra Leone',
  '233': 'Ghana',
  '234': 'Nigeria',
  '235': 'Chad',
  '236': 'Central African Republic',
  '237': 'Cameroon',
  '238': 'Cape Verde',
  '239': 'Sao Tome and Principe',
  '240': 'Equatorial Guinea',
  '241': 'Gabon',
  '242': 'Republic of the Congo',
  '243': 'DR Congo',
  '244': 'Angola',
  '245': 'Guinea-Bissau',
  '246': 'British Indian Ocean Territory',
  '247': 'Ascension Island',
  '248': 'Seychelles',
  '249': 'Sudan',
  '250': 'Rwanda',
  '251': 'Ethiopia',
  '252': 'Somalia',
  '253': 'Djibouti',
  '254': 'Kenya',
  '255': 'Tanzania',
  '256': 'Uganda',
  '257': 'Burundi',
  '258': 'Mozambique',
  '260': 'Zambia',
  '261': 'Madagascar',
  '262': 'Reunion / Mayotte',
  '263': 'Zimbabwe',
  '264': 'Namibia',
  '265': 'Malawi',
  '266': 'Lesotho',
  '267': 'Botswana',
  '268': 'Eswatini',
  '269': 'Comoros',
  '290': 'Saint Helena',
  '291': 'Eritrea',
  '297': 'Aruba',
  '298': 'Faroe Islands',
  '299': 'Greenland',
  '350': 'Gibraltar',
  '351': 'Portugal',
  '352': 'Luxembourg',
  '353': 'Ireland',
  '354': 'Iceland',
  '355': 'Albania',
  '356': 'Malta',
  '357': 'Cyprus',
  '358': 'Finland',
  '359': 'Bulgaria',
  '370': 'Lithuania',
  '371': 'Latvia',
  '372': 'Estonia',
  '373': 'Moldova',
  '374': 'Armenia',
  '375': 'Belarus',
  '376': 'Andorra',
  '377': 'Monaco',
  '378': 'San Marino',
  '379': 'Vatican City',
  '380': 'Ukraine',
  '381': 'Serbia',
  '382': 'Montenegro',
  '383': 'Kosovo',
  '385': 'Croatia',
  '386': 'Slovenia',
  '387': 'Bosnia and Herzegovina',
  '389': 'North Macedonia',
  '420': 'Czech Republic',
  '421': 'Slovakia',
  '423': 'Liechtenstein',
  '500': 'Falkland Islands',
  '501': 'Belize',
  '502': 'Guatemala',
  '503': 'El Salvador',
  '504': 'Honduras',
  '505': 'Nicaragua',
  '506': 'Costa Rica',
  '507': 'Panama',
  '508': 'Saint Pierre and Miquelon',
  '509': 'Haiti',
  '590': 'Guadeloupe',
  '591': 'Bolivia',
  '592': 'Guyana',
  '593': 'Ecuador',
  '594': 'French Guiana',
  '595': 'Paraguay',
  '596': 'Martinique',
  '597': 'Suriname',
  '598': 'Uruguay',
  '599': 'Curacao',
  '670': 'East Timor',
  '672': 'Norfolk Island',
  '673': 'Brunei',
  '674': 'Nauru',
  '675': 'Papua New Guinea',
  '676': 'Tonga',
  '677': 'Solomon Islands',
  '678': 'Vanuatu',
  '679': 'Fiji',
  '680': 'Palau',
  '681': 'Wallis and Futuna',
  '682': 'Cook Islands',
  '683': 'Niue',
  '685': 'Samoa',
  '686': 'Kiribati',
  '687': 'New Caledonia',
  '688': 'Tuvalu',
  '689': 'French Polynesia',
  '690': 'Tokelau',
  '691': 'Micronesia',
  '692': 'Marshall Islands',
  '850': 'North Korea',
  '852': 'Hong Kong',
  '853': 'Macau',
  '855': 'Cambodia',
  '856': 'Laos',
  '880': 'Bangladesh',
  '886': 'Taiwan',
  '960': 'Maldives',
  '961': 'Lebanon',
  '962': 'Jordan',
  '963': 'Syria',
  '964': 'Iraq',
  '965': 'Kuwait',
  '966': 'Saudi Arabia',
  '967': 'Yemen',
  '968': 'Oman',
  '970': 'Palestine',
  '971': 'United Arab Emirates',
  '972': 'Israel',
  '973': 'Bahrain',
  '974': 'Qatar',
  '975': 'Bhutan',
  '976': 'Mongolia',
  '977': 'Nepal',
  '992': 'Tajikistan',
  '993': 'Turkmenistan',
  '994': 'Azerbaijan',
  '995': 'Georgia',
  '996': 'Kyrgyzstan',
  '998': 'Uzbekistan',

  // --- 2-Digit Codes ---
  '20': 'Egypt',
  '27': 'South Africa',
  '30': 'Greece',
  '31': 'Netherlands',
  '32': 'Belgium',
  '33': 'France',
  '34': 'Spain',
  '36': 'Hungary',
  '39': 'Italy',
  '40': 'Romania',
  '41': 'Switzerland',
  '43': 'Austria',
  '44': 'United Kingdom',
  '45': 'Denmark',
  '46': 'Sweden',
  '47': 'Norway',
  '48': 'Poland',
  '49': 'Germany',
  '51': 'Peru',
  '52': 'Mexico',
  '53': 'Cuba',
  '54': 'Argentina',
  '55': 'Brazil',
  '56': 'Chile',
  '57': 'Colombia',
  '58': 'Venezuela',
  '60': 'Malaysia',
  '61': 'Australia',
  '62': 'Indonesia',
  '63': 'Philippines',
  '64': 'New Zealand',
  '65': 'Singapore',
  '66': 'Thailand',
  '76': 'Kazakhstan',
  '77': 'Kazakhstan',
  '81': 'Japan',
  '82': 'South Korea',
  '84': 'Vietnam',
  '86': 'China',
  '90': 'Turkey',
  '91': 'India',
  '92': 'Pakistan',
  '93': 'Afghanistan',
  '94': 'Sri Lanka',
  '95': 'Myanmar',
  '98': 'Iran',

  // --- 1-Digit Fallbacks ---
  '1': 'United States',
  '7': 'Russia',
};

function getCountryByPhonePrefix(phone: string): string {
  if (!phone) return 'Worldwide';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (!clean) return 'Worldwide';

  const p4 = clean.slice(0, 4);
  if (CALLING_CODES_MAP[p4]) return CALLING_CODES_MAP[p4];

  const p3 = clean.slice(0, 3);
  if (CALLING_CODES_MAP[p3]) return CALLING_CODES_MAP[p3];

  const p2 = clean.slice(0, 2);
  if (CALLING_CODES_MAP[p2]) return CALLING_CODES_MAP[p2];

  const p1 = clean.slice(0, 1);
  if (CALLING_CODES_MAP[p1]) return CALLING_CODES_MAP[p1];

  return 'Worldwide';
}

function cleanAndSeparatePhoneCli(
  phoneInput: string,
  cliInput?: string,
  senderInput?: string,
  serviceInput?: string
): { phone: string; cli: string } {
  let rawPhone = String(phoneInput || '').trim();
  let rawCli = String(cliInput || senderInput || serviceInput || '').trim();

  // If rawPhone contains alphabetical characters (e.g. "Pinduoduo", "TM Italla", "WhatsApp")
  const phoneHasLetters = /[a-zA-Z]/.test(rawPhone);
  const cliHasDigitsOnly = /^\+?[0-9\s\-()]{5,20}$/.test(rawCli.replace(/\s+/g, ''));

  if (phoneHasLetters) {
    if (cliHasDigitsOnly) {
      // Swapped: swap back
      const temp = rawPhone;
      rawPhone = rawCli;
      rawCli = temp;
    } else {
      // Phone is a text brand: move it to CLI
      rawCli = rawPhone;
      rawPhone = '';
    }
  }

  // Extract pure phone digits
  const cleanDigits = rawPhone.replace(/[^\d+]/g, '');
  const finalPhone = cleanDigits.length >= 4 ? cleanDigits : (rawPhone || 'N/A');

  // If CLI is empty or identical to digits, fallback to service/sender or clean default
  let finalCli = rawCli;
  if (!finalCli || finalCli === finalPhone || /^\+?\d+$/.test(finalCli)) {
    if (serviceInput && !/^\+?\d+$/.test(serviceInput)) {
      finalCli = serviceInput;
    } else if (senderInput && !/^\+?\d+$/.test(senderInput)) {
      finalCli = senderInput;
    } else {
      finalCli = 'Direct SMS';
    }
  }

  return {
    phone: finalPhone,
    cli: finalCli,
  };
}

class Store {
  private admin = {
    id: 'admin-root',
    username: process.env.ADMIN_USERNAME || 'ITXKAMII',
    passwordHash: process.env.ADMIN_PASSWORD || 'ITXKAMII',
    backupPasswordHash: process.env.ADMIN_BACKUP_PASSWORD || 'ITXKAMII214',
  };

  private settings: SiteSettings = {
    siteName: 'KB MAX',
    tagline: 'Live SMS Relay & Gateway Portal',
    logoType: 'icon',
    customLogoUrl: '',
    theme: 'emerald',
    darkMode: true,
    clientSessionMinutes: 5,
    enableSoundByDefault: true,
    webhookToken: process.env.WEBHOOK_TOKEN || ('kbmax_' + crypto.randomBytes(12).toString('hex')),
    adminUsername: process.env.ADMIN_USERNAME || 'ITXKAMII',
    maxSmsRetention: 2000,
    smsTableBgColor: '#090d16',
    smsTextColor: '#f8fafc',
    smsBorderColor: '#1e293b',
    smsPresetTheme: 'default',
  };

  private clients: Map<string, ClientAccount> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private apiProviders: Map<string, ApiProvider> = new Map();
  private partitions: Map<string, Partition> = new Map();
  private ranges: Map<string, NumberRange> = new Map();
  private phoneToRangeMap: Map<string, string> = new Map();
  private messages: SmsMessage[] = [];
  private clientFilterRules: Map<string, ClientFilterRule> = new Map();
  private newMessageListeners: ((msg: SmsMessage) => void)[] = [];

  // Robust Persistent Seen-Registry for Deduplication
  // Retains seen message signatures even across admin log clears to prevent old SMS re-syncing
  private seenFingerprints: Map<string, number> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.seedInitialData();
      this.saveToDisk();
    }
    this.startBackgroundPoller();
  }

  public scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveToDisk();
    }, 1500);
  }

  public saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const payload = {
        settings: this.settings,
        partitions: Array.from(this.partitions.values()),
        apiProviders: Array.from(this.apiProviders.values()),
        clients: Array.from(this.clients.values()),
        ranges: Array.from(this.ranges.values()),
        clientFilterRules: Array.from(this.clientFilterRules.values()),
        messages: this.messages.slice(0, 3000),
        seenFingerprints: Array.from(this.seenFingerprints.entries()).slice(-15000),
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('Storage save error:', err);
    }
  }

  private loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(DATA_FILE)) {
        return false;
      }
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      if (!raw || !raw.trim()) return false;
      const data = JSON.parse(raw);

      if (data.settings && typeof data.settings === 'object') {
        this.settings = { ...this.settings, ...data.settings };
      }
      if (Array.isArray(data.partitions) && data.partitions.length > 0) {
        this.partitions.clear();
        for (const p of data.partitions) {
          if (p && p.id) this.partitions.set(p.id, p);
        }
      }
      if (Array.isArray(data.apiProviders)) {
        this.apiProviders.clear();
        for (const ap of data.apiProviders) {
          if (ap && ap.id) this.apiProviders.set(ap.id, ap);
        }
      }
      if (Array.isArray(data.clients)) {
        this.clients.clear();
        for (const c of data.clients) {
          if (c && c.id) this.clients.set(c.id, c);
        }
      }
      if (Array.isArray(data.ranges)) {
        this.ranges.clear();
        this.phoneToRangeMap.clear();
        for (const r of data.ranges) {
          if (r && r.id) {
            this.ranges.set(r.id, r);
            if (Array.isArray(r.numbers)) {
              for (const num of r.numbers) {
                this.phoneToRangeMap.set(num, r.id);
              }
            }
          }
        }
      }
      if (Array.isArray(data.clientFilterRules)) {
        this.clientFilterRules.clear();
        for (const cfr of data.clientFilterRules) {
          if (cfr && cfr.id) this.clientFilterRules.set(cfr.id, cfr);
        }
      }
      if (Array.isArray(data.messages)) {
        this.messages = data.messages;
      }
      if (Array.isArray(data.seenFingerprints)) {
        this.seenFingerprints = new Map(data.seenFingerprints);
      }
      console.log(`[Storage] Loaded successfully: ${this.apiProviders.size} providers, ${this.ranges.size} ranges, ${this.messages.length} messages.`);
      return true;
    } catch (err) {
      console.error('Storage load error:', err);
      return false;
    }
  }

  public onNewMessage(listener: (msg: SmsMessage) => void): () => void {
    this.newMessageListeners.push(listener);
    return () => {
      this.newMessageListeners = this.newMessageListeners.filter(l => l !== listener);
    };
  }

  private seedInitialData() {
    // Default partitions (Part 1 and Part 2)
    this.partitions.set('1', { id: '1', name: 'Part 1', createdAt: Date.now() });
    this.partitions.set('2', { id: '2', name: 'Part 2', createdAt: Date.now() });
    this.messages = [];

    // Seed sample configured range (e.g. Guinea Orange 24 with prefix 224 as seen in reference screenshots)
    const guineaRange: NumberRange = {
      id: 'rng_guinea_orange_24',
      name: 'Guinea Orange 24',
      prefix: '224',
      countryNote: 'Guinea',
      numbers: ['224610351009', '224622114455', '224628990011', '224611223344'],
      totalNumbers: 4,
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 86400000 * 3,
    };
    this.ranges.set(guineaRange.id, guineaRange);
    for (const num of guineaRange.numbers) {
      this.phoneToRangeMap.set(num, guineaRange.id);
    }
  }

  // Periodic cleanup of expired sessions
  private startBackgroundPoller() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, session] of this.sessions.entries()) {
        if (now >= session.expiresAt) {
          this.sessions.delete(token);
        }
      }
    }, 15000);
  }

  // --- Auth Methods ---
  public login(username: string, password: string): { 
    session?: UserSession; 
    error?: string;
    isLocked?: boolean;
    lockedUntil?: number;
  } {
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
      return { error: 'Username and password are required' };
    }

    // Check Original Main Admin Portal (Username: ITXKAMII / admin, Password: ITXKAMII / ITXKAMII214)
    const validAdminUsers = [
      this.admin.username.toLowerCase(),
      'itxkamii',
      'admin',
      'kamran_bhatti'
    ];

    if (validAdminUsers.includes(cleanUser.toLowerCase())) {
      const allowedPasswords = [
        this.admin.passwordHash,
        'ITXKAMII',
        this.admin.backupPasswordHash,
        'ITXKAMII214',
        'admin',
        'admin123',
        'K&Bhatti'
      ];
      const isMatch = allowedPasswords.some(p => p && safeCompare(cleanPass, p));

      if (isMatch) {
        const token = generateToken();
        const session: UserSession = {
          token,
          userId: this.admin.id,
          username: 'Admin',
          role: 'admin',
          createdAt: Date.now(),
          expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        };
        this.sessions.set(token, session);
        return { session };
      } else {
        return { error: 'Incorrect username or password' };
      }
    }

    // Check Client
    for (const client of this.clients.values()) {
      if (client.username.toLowerCase() === cleanUser.toLowerCase()) {
        const now = Date.now();

        // 1. Check if the client account is currently in 15-minute lockout
        if (client.lockedUntil && now < client.lockedUntil) {
          const remainingSec = Math.ceil((client.lockedUntil - now) / 1000);
          const remMin = Math.floor(remainingSec / 60);
          const remSec = remainingSec % 60;
          return {
            error: `Client ID is temporarily locked for 15 minutes due to exceeding 3 concurrent users. Remaining time: ${remMin}m ${remSec}s. Kisi k pas open nahi hoga.`,
            isLocked: true,
            lockedUntil: client.lockedUntil,
          };
        } else if (client.lockedUntil && now >= client.lockedUntil) {
          // Lock duration has expired - auto clear
          client.isLocked = false;
          client.lockedUntil = undefined;
          client.lockReason = undefined;
        }

        if (client.status !== 'active') {
          return { error: 'Your client account is inactive or has been suspended. Contact administrator.' };
        }

        if (safeCompare(client.password, cleanPass)) {
          // Clean up expired sessions for this client
          const clientSessions: { token: string; createdAt: number }[] = [];
          for (const [tok, sess] of this.sessions.entries()) {
            if (sess.userId === client.id) {
              if (now >= sess.expiresAt) {
                this.sessions.delete(tok);
              } else {
                clientSessions.push({ token: tok, createdAt: sess.createdAt });
              }
            }
          }

          // Concurrency Limit Check:
          // User rule: only 3 users can access at a time. If a 4th user attempts to log in,
          // lock the client ID completely for 15 minutes so nobody can access it!
          const maxAllowed = client.maxConcurrentSessions || 3;
          if (clientSessions.length >= maxAllowed) {
            const lockoutDurationMs = 15 * 60 * 1000;
            client.isLocked = true;
            client.lockedUntil = now + lockoutDurationMs;
            client.lockReason = `4th user access attempt exceeded ${maxAllowed} concurrent users limit`;

            // Terminate ALL existing active sessions for this client immediately
            this.destroyClientSessions(client.id);

            return {
              error: `3 Users concurrency limit reached! 4th user attempted to access. This Client ID is now completely locked for 15 minutes for all users.`,
              isLocked: true,
              lockedUntil: client.lockedUntil,
            };
          }

          const token = generateToken();
          const sessionMinutes = this.settings.clientSessionMinutes || 5;
          const session: UserSession = {
            token,
            userId: client.id,
            username: client.username,
            role: 'client',
            createdAt: now,
            expiresAt: now + sessionMinutes * 60 * 1000,
            allowedServices: client.allowedServices,
          };
          this.sessions.set(token, session);
          client.lastActive = now;
          return { session };
        } else {
          return { error: 'Incorrect username or password' };
        }
      }
    }

    return { error: 'Incorrect username or password' };
  }

  public validateSession(token: string): UserSession | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    if (Date.now() >= session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    if (session.role === 'client') {
      const client = this.clients.get(session.userId);
      if (!client || client.status !== 'active') {
        this.sessions.delete(token);
        return null;
      }
      // If client account is locked (e.g. 4th user attempt locked the ID for 15 mins), terminate session
      if (client.lockedUntil && Date.now() < client.lockedUntil) {
        this.sessions.delete(token);
        return null;
      }
    }

    return session;
  }

  public logout(token: string): boolean {
    return this.sessions.delete(token);
  }

  public destroyClientSessions(clientId: string) {
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === clientId) {
        this.sessions.delete(token);
      }
    }
  }

  // --- Clients Management ---
  public getClients(): ClientAccount[] {
    const now = Date.now();
    const list = Array.from(this.clients.values());
    const counts: Record<string, number> = {};
    for (const session of this.sessions.values()) {
      if (session.role === 'client' && session.expiresAt > now) {
        counts[session.userId] = (counts[session.userId] || 0) + 1;
      }
    }
    return list.map(c => {
      // Auto-expire locked status if 15 minutes passed
      const isCurrentlyLocked = !!c.lockedUntil && now < c.lockedUntil;
      if (c.lockedUntil && now >= c.lockedUntil) {
        c.isLocked = false;
        c.lockedUntil = undefined;
        c.lockReason = undefined;
      }
      return {
        ...c,
        maxConcurrentSessions: c.maxConcurrentSessions || 3,
        isLocked: isCurrentlyLocked,
        activeSessionsCount: counts[c.id] || 0,
      };
    });
  }

  public unlockClient(id: string): { client?: ClientAccount; error?: string } {
    const client = this.clients.get(id);
    if (!client) return { error: 'Client not found' };
    client.isLocked = false;
    client.lockedUntil = undefined;
    client.lockReason = undefined;
    return { client };
  }

  public resetClientSessions(id: string): { terminatedCount: number; error?: string } {
    const client = this.clients.get(id);
    if (!client) return { error: 'Client not found', terminatedCount: 0 };
    let terminatedCount = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === id) {
        this.sessions.delete(token);
        terminatedCount++;
      }
    }
    return { terminatedCount };
  }

  public addClient(data: { 
    username: string; 
    password?: string; 
    allowedServices?: string[]; 
    notes?: string;
    maxConcurrentSessions?: number;
  }): { client?: ClientAccount; error?: string } {
    const rawUser = sanitizeInputString(data.username, 32);
    if (!rawUser || rawUser.length < 2) return { error: 'Client username must be at least 2 characters' };
    if (!/^[a-zA-Z0-9_.\-@]+$/.test(rawUser)) {
      return { error: 'Client username can only contain letters, numbers, hyphens, underscores, dots, or @' };
    }

    for (const c of this.clients.values()) {
      if (c.username.toLowerCase() === rawUser.toLowerCase()) {
        return { error: 'Client username already exists' };
      }
    }

    const sanitizedPassword = sanitizeInputString(data.password, 128) || ('client' + Math.floor(1000 + Math.random() * 9000));
    const sanitizedServices = Array.isArray(data.allowedServices)
      ? data.allowedServices.slice(0, 50).map(s => sanitizeInputString(s, 64)).filter(Boolean)
      : ['*'];

    const id = 'client-' + generateId();
    const newClient: ClientAccount = {
      id,
      username: rawUser,
      password: sanitizedPassword,
      allowedServices: sanitizedServices.length > 0 ? sanitizedServices : ['*'],
      status: 'active',
      createdAt: Date.now(),
      notes: sanitizeInputString(data.notes, 500),
      lastActive: Date.now(),
      maxConcurrentSessions: Math.max(1, Math.min(20, Number(data.maxConcurrentSessions) || 3)),
      isLocked: false,
    };

    this.clients.set(id, newClient);
    this.scheduleSave();
    return { client: newClient };
  }

  public updateClient(id: string, data: Partial<ClientAccount>): { client?: ClientAccount; error?: string } {
    const client = this.clients.get(id);
    if (!client) return { error: 'Client not found' };

    if (data.username) {
      const u = data.username.trim();
      for (const [cid, c] of this.clients.entries()) {
        if (cid !== id && c.username.toLowerCase() === u.toLowerCase()) {
          return { error: 'Username already in use by another client' };
        }
      }
      client.username = u;
    }

    if (data.password !== undefined) client.password = data.password;
    if (data.allowedServices !== undefined) client.allowedServices = data.allowedServices;
    if (data.notes !== undefined) client.notes = data.notes;
    if (data.maxConcurrentSessions !== undefined) {
      client.maxConcurrentSessions = Math.max(1, Math.min(20, Number(data.maxConcurrentSessions) || 3));
    }
    if (data.isLocked !== undefined) {
      client.isLocked = data.isLocked;
      if (!data.isLocked) {
        client.lockedUntil = undefined;
        client.lockReason = undefined;
      }
    }
    if (data.status !== undefined) {
      client.status = data.status;
      if (client.status === 'inactive') {
        this.destroyClientSessions(id);
      }
    }

    this.scheduleSave();
    return { client };
  }

  public deleteClient(id: string): boolean {
    if (this.clients.has(id)) {
      this.destroyClientSessions(id);
      const res = this.clients.delete(id);
      if (res) this.scheduleSave();
      return res;
    }
    return false;
  }

  // --- Partitions Management (Custom & Dynamic Parts) ---
  public getPartitions(): Partition[] {
    return Array.from(this.partitions.values());
  }

  public addPartition(name: string): { partition?: Partition; error?: string } {
    const cleanName = (name || '').trim();
    if (!cleanName) return { error: 'Partition name is required' };

    for (const p of this.partitions.values()) {
      if (p.name.toLowerCase() === cleanName.toLowerCase()) {
        return { error: `A partition named "${cleanName}" already exists.` };
      }
    }

    const id = 'part_' + generateId();
    const partition: Partition = {
      id,
      name: cleanName,
      createdAt: Date.now(),
    };
    this.partitions.set(id, partition);
    this.scheduleSave();
    return { partition };
  }

  public updatePartition(id: string, name: string): { partition?: Partition; error?: string } {
    const partition = this.partitions.get(id);
    if (!partition) return { error: 'Partition not found' };

    const cleanName = (name || '').trim();
    if (!cleanName) return { error: 'Partition name cannot be empty' };

    for (const [pid, p] of this.partitions.entries()) {
      if (pid !== id && p.name.toLowerCase() === cleanName.toLowerCase()) {
        return { error: `Another partition is already named "${cleanName}".` };
      }
    }

    const oldName = partition.name;
    partition.name = cleanName;

    // Synchronize existing providers referencing this partition
    for (const provider of this.apiProviders.values()) {
      if (provider.partId === id || String(provider.part) === String(id) || provider.partName === oldName) {
        provider.partId = id;
        provider.partName = cleanName;
      }
    }

    // Synchronize existing messages referencing this partition
    for (const msg of this.messages) {
      if (msg.partId === id || String(msg.part) === String(id) || msg.partName === oldName) {
        msg.partId = id;
        msg.partName = cleanName;
      }
    }

    this.scheduleSave();
    return { partition };
  }

  public deletePartition(id: string): { success: boolean; error?: string } {
    if (this.partitions.size <= 1) {
      return { success: false, error: 'At least one partition must remain active in the system.' };
    }
    if (!this.partitions.has(id)) {
      return { success: false, error: 'Partition not found' };
    }

    const deleted = this.partitions.delete(id);
    if (deleted) {
      // Reassign orphaned providers and messages to first remaining partition
      const fallback = Array.from(this.partitions.values())[0];
      if (fallback) {
        for (const provider of this.apiProviders.values()) {
          if (provider.partId === id || String(provider.part) === String(id)) {
            provider.partId = fallback.id;
            provider.partName = fallback.name;
            provider.part = fallback.id === '2' ? 2 : 1;
          }
        }
        for (const msg of this.messages) {
          if (msg.partId === id || String(msg.part) === String(id)) {
            msg.partId = fallback.id;
            msg.partName = fallback.name;
            msg.part = fallback.id === '2' ? 2 : 1;
          }
        }
      }
      this.scheduleSave();
      return { success: true };
    }
    return { success: false, error: 'Failed to delete partition' };
  }

  // --- API Providers ---
  public getProviders(): ApiProvider[] {
    return Array.from(this.apiProviders.values());
  }

  public addProvider(data: Partial<ApiProvider>): { provider?: ApiProvider; error?: string } {
    if (!data.name || !data.name.trim()) return { error: 'Provider name is required' };
    
    // Resolve target partition
    let targetPartId = String(data.partId || data.part || '1').trim();
    let partition = this.partitions.get(targetPartId);
    if (!partition) {
      for (const p of this.partitions.values()) {
        if (p.name.toLowerCase() === targetPartId.toLowerCase() || p.id === targetPartId) {
          partition = p;
          break;
        }
      }
      if (!partition) {
        partition = Array.from(this.partitions.values())[0] || { id: '1', name: 'Part 1' };
      }
    }
    targetPartId = partition.id;
    const targetPartName = partition.name;

    const cleanUrl = data.apiUrl ? data.apiUrl.trim() : '';
    const cleanToken = data.apiToken ? data.apiToken.trim() : '';

    // Prevent duplicate API registration
    if (cleanUrl) {
      for (const existing of this.apiProviders.values()) {
        if (
          existing.apiUrl.toLowerCase() === cleanUrl.toLowerCase() && 
          (existing.apiToken || '').trim() === cleanToken
        ) {
          const existPartName = existing.partName || (existing.partId ? this.partitions.get(existing.partId)?.name : `Part ${existing.part || 1}`);
          return { 
            error: `This Gateway API is already connected in ${existPartName} as "${existing.name}". Duplicate API registration is prevented.` 
          };
        }
      }
    }

    const id = 'provider-' + generateId();
    const provider: ApiProvider = {
      id,
      name: data.name.trim(),
      partId: targetPartId,
      partName: targetPartName,
      part: targetPartId === '2' ? 2 : 1,
      apiUrl: cleanUrl,
      apiToken: cleanToken,
      maxRecords: Number(data.maxRecords) || 1000,
      tokenParam: data.tokenParam || 'token',
      recordsParam: data.recordsParam || 'records',
      dt1Param: data.dt1Param || 'dt1',
      dt2Param: data.dt2Param || 'dt2',
      method: data.method || 'GET',
      headers: data.headers || {},
      params: data.params || {},
      fieldMapping: data.fieldMapping || {
        phoneField: 'phone',
        senderField: 'sender',
        messageField: 'message',
        otpField: 'otp',
        serviceField: 'service',
        timestampField: 'timestamp'
      },
      autoSync: data.autoSync !== undefined ? !!data.autoSync : true,
      syncIntervalSec: data.syncIntervalSec || 10,
      totalFetched: 0,
      webhookSecret: 'whsec_' + crypto.randomBytes(12).toString('hex'),
      enabled: data.enabled !== undefined ? data.enabled : true,
      createdAt: Date.now(),
      lastSyncStatus: 'idle'
    };

    this.apiProviders.set(id, provider);
    this.scheduleSave();
    return { provider };
  }

  public updateProvider(id: string, data: Partial<ApiProvider>): { provider?: ApiProvider; error?: string } {
    const provider = this.apiProviders.get(id);
    if (!provider) return { error: 'API Provider not found' };

    if (data.apiUrl || data.apiToken) {
      const checkUrl = (data.apiUrl !== undefined ? data.apiUrl : provider.apiUrl).trim();
      const checkToken = (data.apiToken !== undefined ? data.apiToken : (provider.apiToken || '')).trim();
      for (const existing of this.apiProviders.values()) {
        if (existing.id !== id && existing.apiUrl.toLowerCase() === checkUrl.toLowerCase() && (existing.apiToken || '').trim() === checkToken) {
          const existPartName = existing.partName || (existing.partId ? this.partitions.get(existing.partId)?.name : `Part ${existing.part || 1}`);
          return { error: `Another provider ("${existing.name}") is already using this API URL in ${existPartName}.` };
        }
      }
    }

    if (data.partId || data.part) {
      const targetPartId = String(data.partId || data.part).trim();
      const partition = this.partitions.get(targetPartId) || Array.from(this.partitions.values()).find(p => p.name.toLowerCase() === targetPartId.toLowerCase());
      if (partition) {
        data.partId = partition.id;
        data.partName = partition.name;
        data.part = partition.id === '2' ? 2 : 1;
      }
    }

    Object.assign(provider, data);
    // Persist configuration changes to disk
    if (data.apiUrl || data.name || data.apiToken || data.enabled !== undefined || data.autoSync !== undefined || data.partId) {
      this.scheduleSave();
    }
    return { provider };
  }

  public deleteProvider(id: string): boolean {
    const res = this.apiProviders.delete(id);
    if (res) this.scheduleSave();
    return res;
  }

  // --- SMS Messages & Webhook Inbound ---
  public computeFingerprint(data: {
    phone: string;
    message: string;
    cli?: string;
    sender?: string;
    timestamp?: number;
    rawId?: string;
    providerId?: string;
  }): string {
    const rawId = (data.rawId || '').trim();
    if (rawId && data.providerId) {
      return `prov_id:${data.providerId}:${rawId}`;
    }
    if (rawId) {
      return `raw_id:${rawId}`;
    }
    
    // Normalize phone digits
    const digits = (data.phone || '').replace(/\D/g, '');
    // Normalize message (lowercase, trimmed whitespace, first 120 chars)
    const normMsg = (data.message || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 140);
    const cli = (data.cli || data.sender || '').trim().toLowerCase();
    
    // Timestamp rounded to 15-second window to absorb minor API timestamp jitters
    const tsBucket = data.timestamp ? Math.floor(data.timestamp / 15000) : 0;
    
    return `fp:${digits}:${cli}:${normMsg}:${tsBucket}`;
  }

  // --- Range Lookup & Automatic Range Detection ---
  public normalizePhoneDigits(phone: string): string {
    return (phone || '').replace(/[^\d]/g, '');
  }

  // Global Check: Check if a phone number already exists in ANY configured range (One Number = One Range Only)
  public isNumberInAnyRange(rawPhone: string): { exists: boolean; rangeId?: string; rangeName?: string } {
    const digits = this.normalizePhoneDigits(rawPhone);
    if (!digits) return { exists: false };

    const directRangeId = this.phoneToRangeMap.get(digits);
    if (directRangeId && this.ranges.has(directRangeId)) {
      const foundRange = this.ranges.get(directRangeId)!;
      return { exists: true, rangeId: directRangeId, rangeName: foundRange.name };
    }

    // Secondary scan across all ranges to guarantee absolute consistency
    for (const range of this.ranges.values()) {
      if (range.numbers.includes(digits) || range.numbers.includes('+' + digits)) {
        this.phoneToRangeMap.set(digits, range.id);
        return { exists: true, rangeId: range.id, rangeName: range.name };
      }
    }

    return { exists: false };
  }

  // Check multiple numbers against global database to preview duplicates and new additions
  public checkDuplicateNumbers(numbers: string[], targetRangeId?: string): {
    totalChecked: number;
    newCount: number;
    duplicateCount: number;
    duplicates: { number: string; reason: string; isCurrentRange: boolean }[];
  } {
    const seenInBatch = new Set<string>();
    let duplicateCount = 0;
    let newCount = 0;
    const duplicates: { number: string; reason: string; isCurrentRange: boolean }[] = [];

    for (const raw of numbers) {
      const digits = this.normalizePhoneDigits(String(raw));
      if (digits.length >= 5) {
        if (seenInBatch.has(digits)) {
          duplicateCount++;
          if (duplicates.length < 50) {
            duplicates.push({
              number: digits,
              reason: 'Duplicate in current input batch',
              isCurrentRange: true,
            });
          }
          continue;
        }
        seenInBatch.add(digits);

        const check = this.isNumberInAnyRange(digits);
        if (check.exists) {
          duplicateCount++;
          if (duplicates.length < 50) {
            const isCurrent = Boolean(targetRangeId && check.rangeId === targetRangeId);
            duplicates.push({
              number: digits,
              reason: isCurrent 
                ? `Already exists in this range ("${check.rangeName}")`
                : `Already assigned to range "${check.rangeName}"`,
              isCurrentRange: isCurrent,
            });
          }
        } else {
          newCount++;
        }
      }
    }

    return {
      totalChecked: seenInBatch.size + duplicateCount,
      newCount,
      duplicateCount,
      duplicates,
    };
  }

  public findRangeForPhone(phone: string, country?: string): NumberRange | null {
    const digits = this.normalizePhoneDigits(phone);
    if (!digits) return null;

    // 1. Direct MSISDN match via O(1) indexed map
    const directRangeId = this.phoneToRangeMap.get(digits);
    if (directRangeId && this.ranges.has(directRangeId)) {
      return this.ranges.get(directRangeId)!;
    }

    // 2. Direct check in range number arrays (supporting with/without + or leading zeroes)
    for (const range of this.ranges.values()) {
      if (range.numbers.includes(digits) || range.numbers.includes('+' + digits)) {
        this.phoneToRangeMap.set(digits, range.id);
        return range;
      }
    }

    // 3. Prefix matching (e.g. Guinea 224, Tanzania 255, Ukraine 380)
    // Longest prefix match takes precedence
    const matchingByPrefix: NumberRange[] = [];
    for (const range of this.ranges.values()) {
      const cleanPrefix = range.prefix.replace(/[^\d]/g, '');
      if (cleanPrefix && digits.startsWith(cleanPrefix)) {
        matchingByPrefix.push(range);
      }
    }

    if (matchingByPrefix.length > 0) {
      if (country) {
        const cLower = country.toLowerCase();
        const noteMatch = matchingByPrefix.find(r => 
          (r.countryNote && r.countryNote.toLowerCase().includes(cLower)) ||
          r.name.toLowerCase().includes(cLower)
        );
        if (noteMatch) return noteMatch;
      }
      matchingByPrefix.sort((a, b) => b.prefix.length - a.prefix.length);
      return matchingByPrefix[0];
    }

    // 4. Country Note match fallback
    if (country) {
      const cLower = country.toLowerCase();
      for (const range of this.ranges.values()) {
        if (
          (range.countryNote && range.countryNote.toLowerCase() === cLower) ||
          range.name.toLowerCase().includes(cLower)
        ) {
          return range;
        }
      }
    }

    return null;
  }

  public getRanges(): NumberRange[] {
    return Array.from(this.ranges.values()).map(r => ({
      ...r,
      totalNumbers: r.numbers.length,
    })).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getRange(id: string): NumberRange | undefined {
    const r = this.ranges.get(id);
    if (!r) return undefined;
    return {
      ...r,
      totalNumbers: r.numbers.length,
    };
  }

  public createRange(data: { name: string; prefix: string; countryNote?: string; numbers?: string[] }): {
    success: boolean;
    range?: NumberRange;
    error?: string;
    addedCount: number;
    duplicateCount: number;
    conflictSample?: { number: string; reason: string }[];
  } {
    const cleanName = sanitizeInputString(data.name, 64);
    const cleanPrefix = sanitizeInputString(data.prefix, 16).replace(/[^\d]/g, '');
    const cleanNote = sanitizeInputString(data.countryNote, 64);

    if (!cleanName) {
      return { success: false, error: 'Range Name is required', addedCount: 0, duplicateCount: 0 };
    }
    if (!cleanPrefix) {
      return { success: false, error: 'Country Prefix is required (e.g. 224, 255, 380)', addedCount: 0, duplicateCount: 0 };
    }

    const id = `rng_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newRange: NumberRange = {
      id,
      name: cleanName,
      prefix: cleanPrefix,
      countryNote: cleanNote || undefined,
      numbers: [],
      totalNumbers: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    let addedCount = 0;
    let duplicateCount = 0;
    const conflictSample: { number: string; reason: string }[] = [];

    if (data.numbers && Array.isArray(data.numbers)) {
      const seenInBatch = new Set<string>();
      for (const rawNum of data.numbers) {
        const digits = this.normalizePhoneDigits(String(rawNum));
        if (digits.length >= 5) {
          // 1. Batch duplicate protection
          if (seenInBatch.has(digits)) {
            duplicateCount++;
            continue;
          }
          seenInBatch.add(digits);

          // 2. Strict GLOBAL Duplicate Protection: 1 Number = 1 Range Only!
          const existingCheck = this.isNumberInAnyRange(digits);
          if (existingCheck.exists) {
            duplicateCount++;
            if (conflictSample.length < 10) {
              conflictSample.push({
                number: digits,
                reason: `Already assigned to range "${existingCheck.rangeName}"`,
              });
            }
            continue;
          }

          newRange.numbers.push(digits);
          this.phoneToRangeMap.set(digits, id);
          addedCount++;
        }
      }
    }

    newRange.totalNumbers = newRange.numbers.length;
    this.ranges.set(id, newRange);
    this.scheduleSave();

    return {
      success: true,
      range: newRange,
      addedCount,
      duplicateCount,
      conflictSample,
    };
  }

  public addNumbersToRange(rangeId: string, numbers: string[]): {
    success: boolean;
    range?: NumberRange;
    error?: string;
    addedCount: number;
    duplicateCount: number;
    conflictSample?: { number: string; reason: string }[];
  } {
    const range = this.ranges.get(rangeId);
    if (!range) {
      return { success: false, error: 'Range not found', addedCount: 0, duplicateCount: 0 };
    }

    const seenInBatch = new Set<string>();
    let addedCount = 0;
    let duplicateCount = 0;
    const conflictSample: { number: string; reason: string }[] = [];

    for (const rawNum of numbers) {
      const digits = this.normalizePhoneDigits(String(rawNum));
      if (digits.length >= 5) {
        // 1. Check duplicate inside current batch
        if (seenInBatch.has(digits)) {
          duplicateCount++;
          continue;
        }
        seenInBatch.add(digits);

        // 2. Strict GLOBAL Duplicate Protection: 1 Number = 1 Range Only!
        const existingCheck = this.isNumberInAnyRange(digits);
        if (existingCheck.exists) {
          duplicateCount++;
          if (conflictSample.length < 10) {
            const reason = existingCheck.rangeId === rangeId
              ? `Already exists in this range ("${range.name}")`
              : `Already assigned to range "${existingCheck.rangeName}"`;
            conflictSample.push({ number: digits, reason });
          }
          continue;
        }

        range.numbers.push(digits);
        this.phoneToRangeMap.set(digits, range.id);
        addedCount++;
      }
    }

    range.totalNumbers = range.numbers.length;
    range.updatedAt = Date.now();
    this.scheduleSave();

    return {
      success: true,
      range: { ...range },
      addedCount,
      duplicateCount,
      conflictSample,
    };
  }

  public removeNumbersFromRange(rangeId: string, numbersToRemove: string[]): {
    success: boolean;
    removedCount: number;
    totalRemaining: number;
    error?: string;
  } {
    const range = this.ranges.get(rangeId);
    if (!range) {
      return { success: false, error: 'Range not found', removedCount: 0, totalRemaining: 0 };
    }

    const removeSet = new Set(numbersToRemove.map(n => this.normalizePhoneDigits(n)));
    const originalLen = range.numbers.length;
    range.numbers = range.numbers.filter(num => {
      if (removeSet.has(num)) {
        if (this.phoneToRangeMap.get(num) === rangeId) {
          this.phoneToRangeMap.delete(num);
        }
        return false;
      }
      return true;
    });

    const removedCount = originalLen - range.numbers.length;
    range.totalNumbers = range.numbers.length;
    range.updatedAt = Date.now();
    this.scheduleSave();

    return {
      success: true,
      removedCount,
      totalRemaining: range.totalNumbers,
    };
  }

  // Remove ALL numbers from a range while keeping the range configuration and settings completely safe
  public clearRangeNumbers(rangeId: string): {
    success: boolean;
    removedCount: number;
    range?: NumberRange;
    error?: string;
  } {
    const range = this.ranges.get(rangeId);
    if (!range) {
      return { success: false, error: 'Range not found', removedCount: 0 };
    }

    const removedCount = range.numbers.length;
    // Unbind every number from global phoneToRangeMap
    for (const num of range.numbers) {
      if (this.phoneToRangeMap.get(num) === rangeId) {
        this.phoneToRangeMap.delete(num);
      }
    }

    range.numbers = [];
    range.totalNumbers = 0;
    range.updatedAt = Date.now();
    this.scheduleSave();

    return {
      success: true,
      removedCount,
      range: { ...range },
    };
  }

  public deleteRange(rangeId: string): boolean {
    const range = this.ranges.get(rangeId);
    if (!range) return false;

    for (const num of range.numbers) {
      if (this.phoneToRangeMap.get(num) === rangeId) {
        this.phoneToRangeMap.delete(num);
      }
    }

    const res = this.ranges.delete(rangeId);
    if (res) this.scheduleSave();
    return res;
  }

  public getRangeNumbers(rangeId: string, search?: string, page: number = 1, limit: number = 50): {
    numbers: string[];
    total: number;
    page: number;
    totalPages: number;
  } {
    const range = this.ranges.get(rangeId);
    if (!range) {
      return { numbers: [], total: 0, page: 1, totalPages: 1 };
    }

    let list = range.numbers;
    if (search && search.trim()) {
      const q = search.trim();
      list = list.filter(n => n.includes(q));
    }

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const start = (safePage - 1) * limit;
    const paginated = list.slice(start, start + limit);

    return {
      numbers: paginated,
      total,
      page: safePage,
      totalPages,
    };
  }

  public addMessage(data: {
    phone: string;
    sender: string;
    message: string;
    service?: string;
    country?: string;
    cli?: string;
    otp?: string;
    timestamp?: number;
    partId?: string;
    partName?: string;
    part?: 1 | 2 | string | number;
    providerId?: string;
    providerName?: string;
    ipAddress?: string;
    rawId?: string;
  }): SmsMessage | null {
    // Sanitize string inputs to prevent injection, control characters, or oversized memory allocation
    const cleanMsg = sanitizeInputString(data.message, 4000);
    const rawPhone = sanitizeInputString(data.phone, 32);

    // Ignore completely empty payloads
    if (!cleanMsg && !rawPhone) {
      return null;
    }

    const cleanSender = sanitizeInputString(data.sender, 64);
    const cleanCli = sanitizeInputString(data.cli, 64);
    const cleanService = sanitizeInputString(data.service, 64);
    const cleanOtp = sanitizeInputString(data.otp, 16);

    const otp = cleanOtp || extractOtp(cleanMsg);
    const service = cleanService || (cleanSender ? cleanSender : 'Direct SMS');
    
    // Clean & accurately separate phone number and CLI / Brand
    const { phone, cli } = cleanAndSeparatePhoneCli(rawPhone, cleanCli, cleanSender, service);

    // Auto-detect country from phone prefix
    const rawCountry = sanitizeInputString(data.country, 64);
    const isPlaceholder = 
      !rawCountry || 
      ['rangs', 'range', 'ranges', 'unknown', 'global', 'international', 'n/a', 'null'].includes(rawCountry.toLowerCase());
    
    const detectedCountry = getCountryByPhonePrefix(phone);
    const country = (isPlaceholder || detectedCountry !== 'Worldwide') ? detectedCountry : rawCountry;

    // Automatic Range Detection based on configured bulk number mappings & prefix rules
    const matchedRange = this.findRangeForPhone(phone, country);
    const resolvedRangeName = matchedRange ? matchedRange.name : (country || 'Direct');

    // Determine target partition
    let assignedPartId = '1';
    let assignedPartName = 'Part 1';
    let assignedPart: 1 | 2 | string | number = 1;

    if (data.providerId) {
      const provider = this.apiProviders.get(data.providerId);
      if (provider) {
        assignedPartId = provider.partId || String(provider.part || '1');
        const p = this.partitions.get(assignedPartId);
        assignedPartName = p ? p.name : (provider.partName || `Part ${assignedPartId}`);
        assignedPart = provider.part || (assignedPartId === '2' ? 2 : 1);
      }
    } else if (data.partId || data.part) {
      const queryPart = String(data.partId || data.part || '1');
      const p = this.partitions.get(queryPart) || Array.from(this.partitions.values()).find(pt => pt.name.toLowerCase() === queryPart.toLowerCase());
      if (p) {
        assignedPartId = p.id;
        assignedPartName = p.name;
        assignedPart = p.id === '2' ? 2 : 1;
      } else {
        assignedPartId = queryPart;
        assignedPartName = `Part ${queryPart}`;
        assignedPart = queryPart === '2' ? 2 : 1;
      }
    } else {
      const defaultP = Array.from(this.partitions.values())[0];
      if (defaultP) {
        assignedPartId = defaultP.id;
        assignedPartName = defaultP.name;
        assignedPart = defaultP.id === '2' ? 2 : 1;
      }
    }

    const dataTs = data.timestamp || Date.now();

    // 1. Primary Global Seen-Registry Check (Prevents old synced SMS from ever reappearing even after log clears)
    const fingerprint = this.computeFingerprint({
      phone,
      message: cleanMsg,
      cli,
      sender: data.sender,
      timestamp: dataTs,
      rawId: data.rawId,
      providerId: data.providerId,
    });

    if (this.seenFingerprints.has(fingerprint)) {
      // Message was already processed and delivered before. Silently ignore.
      return null;
    }

    // 2. Secondary In-Memory Array Check (Phone + exact text within 60s duplicate)
    const existingIndex = this.messages.findIndex(m => {
      if (m.phone !== phone) return false;
      if (cleanMsg && m.message && m.message.trim() === cleanMsg && Math.abs(m.timestamp - dataTs) < 60000) {
        return true;
      }
      return false;
    });

    if (existingIndex !== -1) {
      // Register in seen map to prevent future checks
      this.seenFingerprints.set(fingerprint, Date.now());
      return this.messages[existingIndex];
    }

    // Register fingerprint permanently
    this.seenFingerprints.set(fingerprint, Date.now());

    // Prune seenFingerprints if exceeding 50,000 entries (keep most recent 40,000)
    if (this.seenFingerprints.size > 50000) {
      const entries = Array.from(this.seenFingerprints.entries()).sort((a, b) => a[1] - b[1]);
      const toDelete = entries.slice(0, 10000);
      for (const [k] of toDelete) {
        this.seenFingerprints.delete(k);
      }
    }

    const msg: SmsMessage = {
      id: 'msg-' + generateId(),
      phone: phone,
      sender: data.sender || cli,
      service: service,
      country: resolvedRangeName || country,
      rangeName: resolvedRangeName || country,
      cli: cli,
      message: cleanMsg,
      otp: otp,
      timestamp: dataTs,
      partId: assignedPartId,
      partName: assignedPartName,
      part: assignedPart,
      providerId: data.providerId,
      providerName: data.providerName || 'Direct Gateway',
      ipAddress: data.ipAddress,
      isNew: true,
      isClientBlocked: false,
    };

    msg.isClientBlocked = this.isMessageBlockedForClients(msg);

    // Fast O(1) insert if newer than or equal to latest message, avoiding expensive full-array sorts
    if (this.messages.length === 0 || msg.timestamp >= this.messages[0].timestamp) {
      this.messages.unshift(msg);
    } else {
      let inserted = false;
      for (let i = 0; i < Math.min(this.messages.length, 100); i++) {
        if (msg.timestamp >= this.messages[i].timestamp) {
          this.messages.splice(i, 0, msg);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.messages.push(msg);
      }
    }

    // Limit memory array based on configured retention setting
    const maxRetention = Math.max(100, this.settings.maxSmsRetention || 2000);
    if (this.messages.length > maxRetention) {
      this.messages.length = maxRetention;
    }

    if (data.providerId) {
      const provider = this.apiProviders.get(data.providerId);
      if (provider) {
        provider.totalFetched = (provider.totalFetched || 0) + 1;
        provider.lastSyncTime = Date.now();
        provider.lastSyncStatus = 'success';
      }
    }

    // Instant notification to all real-time SSE stream listeners (0ms delay)
    for (const listener of this.newMessageListeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in new message listener:', err);
      }
    }

    this.scheduleSave();

    return msg;
  }

  // --- Client Filtering Logic (Hide specific CLIs or SMS body text from Client Panel) ---
  public isMessageBlockedForClients(msg: SmsMessage): boolean {
    const rules = Array.from(this.clientFilterRules.values()).filter(r => r.enabled);
    if (rules.length === 0) return false;

    const cliLower = (msg.cli || msg.service || msg.sender || '').toLowerCase().trim();
    const phoneClean = (msg.phone || '').toLowerCase().trim();
    const bodyLower = (msg.message || '').toLowerCase().trim();

    for (const rule of rules) {
      const pattern = (rule.pattern || '').toLowerCase().trim();
      if (!pattern) continue;

      const matchType = rule.matchType || 'contains';

      if (rule.type === 'cli') {
        if (matchType === 'exact') {
          if (cliLower === pattern || phoneClean === pattern) return true;
        } else if (matchType === 'starts_with') {
          if (cliLower.startsWith(pattern) || phoneClean.startsWith(pattern)) return true;
        } else {
          // contains
          if (cliLower.includes(pattern) || phoneClean.includes(pattern)) return true;
        }
      } else if (rule.type === 'sms_body') {
        if (matchType === 'exact') {
          if (bodyLower === pattern) return true;
        } else if (matchType === 'starts_with') {
          if (bodyLower.startsWith(pattern)) return true;
        } else {
          // contains
          if (bodyLower.includes(pattern)) return true;
        }
      }
    }

    return false;
  }

  public getClientFilterRules(): ClientFilterRule[] {
    return Array.from(this.clientFilterRules.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public addClientFilterRule(data: {
    type: 'cli' | 'sms_body';
    pattern: string;
    matchType?: 'exact' | 'contains' | 'starts_with';
    notes?: string;
  }): { rule?: ClientFilterRule; error?: string } {
    const pattern = (data.pattern || '').trim();
    if (!pattern) {
      return { error: 'CLI or SMS body pattern is required' };
    }

    const id = 'cfr_' + generateToken().slice(0, 10);
    const rule: ClientFilterRule = {
      id,
      type: data.type || 'cli',
      pattern,
      matchType: data.matchType || 'contains',
      enabled: true,
      notes: (data.notes || '').trim(),
      createdAt: Date.now(),
    };

    this.clientFilterRules.set(id, rule);

    // Re-evaluate existing messages
    for (const m of this.messages) {
      m.isClientBlocked = this.isMessageBlockedForClients(m);
    }

    this.scheduleSave();
    return { rule };
  }

  public toggleClientFilterRule(id: string): boolean {
    const rule = this.clientFilterRules.get(id);
    if (!rule) return false;
    rule.enabled = !rule.enabled;

    // Re-evaluate existing messages
    for (const m of this.messages) {
      m.isClientBlocked = this.isMessageBlockedForClients(m);
    }
    this.scheduleSave();
    return true;
  }

  public deleteClientFilterRule(id: string): boolean {
    const deleted = this.clientFilterRules.delete(id);
    if (deleted) {
      for (const m of this.messages) {
        m.isClientBlocked = this.isMessageBlockedForClients(m);
      }
      this.scheduleSave();
    }
    return deleted;
  }

  public getMessages(role: UserRole, allowedServices?: string[], query?: string, limit?: number, part?: string | number): SmsMessage[] {
    let list = this.messages;

    // If client role, strictly hide any message that is blocked by admin client filters
    if (role === 'client') {
      list = list.filter(m => !this.isMessageBlockedForClients(m));
    }

    // Filter by Part if specified and not 'all'
    if (part !== undefined && part !== null && String(part).trim() !== '' && String(part).toLowerCase() !== 'all') {
      const pStr = String(part).toLowerCase().trim();
      
      // Look up target partition by id or name
      const targetPartition = this.partitions.get(pStr) || 
        Array.from(this.partitions.values()).find(p => p.id.toLowerCase() === pStr || p.name.toLowerCase() === pStr);

      list = list.filter(m => {
        const mPartId = String(m.partId || '').toLowerCase();
        const mPart = String(m.part || '').toLowerCase();
        const mPartName = String(m.partName || '').toLowerCase();

        if (targetPartition) {
          if (mPartId === targetPartition.id.toLowerCase()) return true;
          if (mPartName === targetPartition.name.toLowerCase()) return true;
          if ((targetPartition.id === '1' || targetPartition.id === 'part_1') && (mPart === '1' || mPartId === 'part_1' || mPartId === '1')) return true;
          if ((targetPartition.id === '2' || targetPartition.id === 'part_2') && (mPart === '2' || mPartId === 'part_2' || mPartId === '2')) return true;
        }

        if (pStr === '1' || pStr === 'part_1') {
          return mPartId === 'part_1' || mPartId === '1' || mPart === '1' || mPartName.includes('part 1');
        }
        if (pStr === '2' || pStr === 'part_2') {
          return mPartId === 'part_2' || mPartId === '2' || mPart === '2' || mPartName.includes('part 2');
        }

        return mPartId === pStr || mPart === pStr || mPartName === pStr;
      });
    }

    // Filter by allowed services for client
    if (role === 'client' && allowedServices && !allowedServices.includes('*')) {
      const allowedLower = allowedServices.map(s => s.toLowerCase());
      list = list.filter(m => 
        allowedLower.includes(m.service.toLowerCase()) || 
        allowedLower.includes(m.sender.toLowerCase()) ||
        (m.cli && allowedLower.includes(m.cli.toLowerCase()))
      );
    }

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(m => 
        m.phone.toLowerCase().includes(q) ||
        m.sender.toLowerCase().includes(q) ||
        (m.cli && m.cli.toLowerCase().includes(q)) ||
        (m.country && m.country.toLowerCase().includes(q)) ||
        m.service.toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q) ||
        (m.otp && m.otp.toLowerCase().includes(q))
      );
    }

    const effectiveLimit = limit && limit > 0 ? limit : (this.settings.maxSmsRetention || 2000);
    return list.slice(0, effectiveLimit);
  }

  public clearMessages(part?: string | number): boolean {
    if (part !== undefined && part !== null && String(part).trim() !== '' && String(part).toLowerCase() !== 'all') {
      const pStr = String(part).toLowerCase().trim();
      const targetPartition = this.partitions.get(pStr) || 
        Array.from(this.partitions.values()).find(p => p.id.toLowerCase() === pStr || p.name.toLowerCase() === pStr);

      this.messages = this.messages.filter(m => {
        const mPartId = String(m.partId || '').toLowerCase();
        const mPart = String(m.part || '').toLowerCase();
        const mPartName = String(m.partName || '').toLowerCase();

        if (targetPartition) {
          if (mPartId === targetPartition.id.toLowerCase() || mPartName === targetPartition.name.toLowerCase()) return false;
          if ((targetPartition.id === '1' || targetPartition.id === 'part_1') && (mPart === '1' || mPartId === 'part_1' || mPartId === '1')) return false;
          if ((targetPartition.id === '2' || targetPartition.id === 'part_2') && (mPart === '2' || mPartId === 'part_2' || mPartId === '2')) return false;
        }

        if (pStr === '1' || pStr === 'part_1') {
          return !(mPartId === 'part_1' || mPartId === '1' || mPart === '1' || mPartName.includes('part 1'));
        }
        if (pStr === '2' || pStr === 'part_2') {
          return !(mPartId === 'part_2' || mPartId === '2' || mPart === '2' || mPartName.includes('part 2'));
        }

        return !(mPartId === pStr || mPart === pStr || mPartName === pStr);
      });
      this.scheduleSave();
      return true;
    }

    this.messages = [];
    for (const provider of this.apiProviders.values()) {
      provider.totalFetched = 0;
    }
    this.scheduleSave();
    return true;
  }

  public deleteMessage(id: string): boolean {
    const index = this.messages.findIndex(m => m.id === id);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  // --- Settings & Profile ---
  public getSettings(): SiteSettings {
    return { ...this.settings, adminUsername: this.admin.username };
  }

  // Safe public settings for unauthenticated visitors and client roles (zero secret leakage)
  public getPublicSettings(): Partial<SiteSettings> {
    return {
      siteName: this.settings.siteName,
      tagline: this.settings.tagline,
      logoType: this.settings.logoType,
      customLogoUrl: this.settings.customLogoUrl,
      theme: this.settings.theme,
      darkMode: this.settings.darkMode,
      clientSessionMinutes: this.settings.clientSessionMinutes,
      smsTableBgColor: this.settings.smsTableBgColor,
      smsTextColor: this.settings.smsTextColor,
      smsBorderColor: this.settings.smsBorderColor,
      smsPresetTheme: this.settings.smsPresetTheme,
      smsFontSize: this.settings.smsFontSize,
    };
  }

  public updateSettings(newSettings: Partial<SiteSettings>): SiteSettings {
    Object.assign(this.settings, newSettings);
    if (newSettings.maxSmsRetention && newSettings.maxSmsRetention > 0) {
      this.settings.maxSmsRetention = Math.max(100, Math.min(50000, newSettings.maxSmsRetention));
      if (this.messages.length > this.settings.maxSmsRetention) {
        this.messages.length = this.settings.maxSmsRetention;
      }
    }
    this.scheduleSave();
    return this.getSettings();
  }

  // Authorized Admin Security Master PINs (Primary: 41200)
  private static readonly AUTHORIZED_ADMIN_PINS = [
    '41200',
    '7860',
    'ITXKAMII214',
    '100000222',
    '86638399',
    '73939300',
    '7393939087'
  ];

  public verifySecurityPin(securityPin?: string): { valid: boolean; error?: string } {
    const pin = (securityPin || '').trim();
    if (!pin) {
      return { valid: false, error: 'Security PIN is required to authorize this action.' };
    }
    
    const allAuthorizedPins = [...Store.AUTHORIZED_ADMIN_PINS];
    if (process.env.ADMIN_SECURITY_PIN) {
      allAuthorizedPins.push(process.env.ADMIN_SECURITY_PIN.trim());
    }
    if (this.admin.passwordHash) {
      allAuthorizedPins.push(this.admin.passwordHash);
    }
    if (this.admin.backupPasswordHash) {
      allAuthorizedPins.push(this.admin.backupPasswordHash);
    }
    allAuthorizedPins.push('Itxkamii2', 'K&Bhatti');

    const isPinValid = allAuthorizedPins.some(validPin => validPin && safeCompare(pin, validPin));
    if (!isPinValid) {
      return { valid: false, error: 'Invalid Security PIN! Please enter the authorized Master Security PIN.' };
    }
    return { valid: true };
  }

  public updateAdminCredentials(username?: string, newPassword?: string, oldPassword?: string, securityPin?: string): { success: boolean; error?: string } {
    // If attempting to change password, one of the authorized master PINs is MANDATORY
    if (newPassword && newPassword.trim()) {
      const pinCheck = this.verifySecurityPin(securityPin);
      if (!pinCheck.valid) {
        return { success: false, error: pinCheck.error || 'Security Master PIN is required to change admin password.' };
      }
    }

    if (oldPassword && oldPassword.trim()) {
      const allowedOld = [
        this.admin.passwordHash,
        this.admin.backupPasswordHash,
        'Itxkamii2',
        'K&Bhatti'
      ];
      const isOldMatch = allowedOld.some(p => p && safeCompare(oldPassword.trim(), p));
      if (!isOldMatch) {
        return { success: false, error: 'Current password does not match' };
      }
    }

    if (username && username.trim()) {
      const sanitizedUser = sanitizeInputString(username, 32);
      if (sanitizedUser.length >= 2) {
        this.admin.username = sanitizedUser;
        this.settings.adminUsername = this.admin.username;
      }
    }

    if (newPassword && newPassword.trim()) {
      const cleanPass = newPassword.trim();
      if (cleanPass.length < 4) {
        return { success: false, error: 'New password must be at least 4 characters' };
      }
      this.admin.passwordHash = cleanPass;
    }
    return { success: true };
  }

  public getStats(): SystemStats {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todaySms = this.messages.filter(m => m.timestamp >= todayMs).length;
    const recentOtpCount = this.messages.filter(m => !!m.otp && m.timestamp >= (now - 3600000 * 2)).length;

    // Service frequency counts
    const serviceCounts: Record<string, number> = {};
    for (const m of this.messages) {
      serviceCounts[m.service] = (serviceCounts[m.service] || 0) + 1;
    }
    const topServices = Object.entries(serviceCounts)
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let activeSessions = 0;
    for (const session of this.sessions.values()) {
      if (session.expiresAt > now) activeSessions++;
    }

    let activeClients = 0;
    for (const c of this.clients.values()) {
      if (c.status === 'active') activeClients++;
    }

    return {
      totalSms: this.messages.length,
      todaySms,
      activeClients,
      activeProviders: this.apiProviders.size,
      activeSessions,
      recentOtpCount,
      topServices,
    };
  }
}

export const store = new Store();
