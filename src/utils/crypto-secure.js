import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// Secure key derivation - NEVER use the fallback in production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 64) {
  throw new Error('ENCRYPTION_KEY must be set and at least 64 characters long');
}

// Derive a proper encryption key using PBKDF2
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
}

// Get main encryption key
function getEncryptionKey() {
  const salt = Buffer.from(process.env.ENCRYPTION_SALT || 'default-salt-replace-in-production', 'utf8');
  return deriveKey(ENCRYPTION_KEY, salt);
}

export function encrypt(plaintext) {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty data');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedData
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

export function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Invalid encrypted data');
  }

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Missing encryption components');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
      throw new Error('Invalid encryption component lengths');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

// Secure hash function for passwords
export function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(SALT_LENGTH);
  } else if (typeof salt === 'string') {
    salt = Buffer.from(salt, 'hex');
  }
  
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  return {
    hash: hash.toString('hex'),
    salt: salt.toString('hex')
  };
}

// Verify password against hash
export function verifyPassword(password, hash, salt) {
  const { hash: computedHash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
}

// Secure random token generation
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Encrypt sensitive API credentials
export function encryptCredentials(credentials) {
  return {
    metaApiToken: credentials.metaApiToken ? encrypt(credentials.metaApiToken) : null,
    metaApiPassword: credentials.metaApiPassword ? encrypt(credentials.metaApiPassword) : null,
    brokerServer: credentials.brokerServer || null, // Server names are not sensitive
    accountNumber: credentials.accountNumber || null // Account numbers are identifiers, not secrets
  };
}

// Decrypt sensitive API credentials
export function decryptCredentials(encryptedCredentials) {
  return {
    metaApiToken: encryptedCredentials.metaApiToken ? decrypt(encryptedCredentials.metaApiToken) : null,
    metaApiPassword: encryptedCredentials.metaApiPassword ? decrypt(encryptedCredentials.metaApiPassword) : null,
    brokerServer: encryptedCredentials.brokerServer || null,
    accountNumber: encryptedCredentials.accountNumber || null
  };
}

// Secure data wiping
export function secureWipe(obj) {
  if (typeof obj === 'string') {
    // Can't actually wipe strings in JS, but we can try to overwrite
    return crypto.randomBytes(obj.length).toString('hex').slice(0, obj.length);
  } else if (Buffer.isBuffer(obj)) {
    obj.fill(0);
  } else if (typeof obj === 'object' && obj !== null) {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        obj[key] = '';
      } else if (Buffer.isBuffer(obj[key])) {
        obj[key].fill(0);
      }
    });
  }
}