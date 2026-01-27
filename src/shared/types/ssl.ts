// SSL/TLS Configuration Types

/**
 * SSL configuration for HTTPS/WSS encryption
 */
export interface SslConfig {
  /** Whether SSL/TLS is enabled */
  enabled: boolean;
  /** Path to the certificate file (.pem/.crt) */
  certPath?: string;
  /** Path to the private key file (.key) */
  keyPath?: string;
  /** Optional: Path to CA certificate bundle */
  caPath?: string;
  /** Use auto-generated self-signed certificate */
  selfSigned?: boolean;
  /** Use Let's Encrypt (ACME) certificate */
  letsEncrypt?: boolean;
  /** Email for ACME registration and expiry notifications */
  acmeEmail?: string;
  /** Passphrase for encrypted private keys */
  passphrase?: string;
}

/**
 * Result of certificate validation
 */
export interface CertificateValidationResult {
  valid: boolean;
  error?: string;
  subject?: string;
  issuer?: string;
  validFrom?: Date;
  validTo?: Date;
  daysRemaining?: number;
  isSelfSigned?: boolean;
  fingerprint?: string;
}

/**
 * Information about a certificate
 */
export interface CertificateInfo {
  subject: {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
  };
  issuer: {
    commonName?: string;
    organization?: string;
  };
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  fingerprint: string;
  isSelfSigned: boolean;
}

/**
 * SSL server options for https.createServer
 */
export interface SslServerOptions {
  key: Buffer | string;
  cert: Buffer | string;
  ca?: Buffer | string;
  passphrase?: string;
  rejectUnauthorized?: boolean;
}

/**
 * Default SSL configuration
 */
export const DEFAULT_SSL_CONFIG: SslConfig = {
  enabled: false,
  selfSigned: false,
};
