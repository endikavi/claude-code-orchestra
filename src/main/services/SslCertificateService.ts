import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import forge from 'node-forge';
import acme from 'acme-client';
import { getUserDataPath } from '../utils/paths';
import type {
  SslConfig,
  SslServerOptions,
  CertificateValidationResult,
  CertificateInfo,
} from '@shared/types/ssl';

/**
 * Service for SSL certificate management
 * Handles generation of self-signed certificates and loading of custom certificates
 */
export class SslCertificateService {
  private static instance: SslCertificateService | null = null;
  private certDir: string;

  private constructor() {
    this.certDir = join(getUserDataPath(), 'ssl');
    this.ensureCertDir();
  }

  public static getInstance(): SslCertificateService {
    if (!SslCertificateService.instance) {
      SslCertificateService.instance = new SslCertificateService();
    }
    return SslCertificateService.instance;
  }

  /**
   * Ensure the SSL certificate directory exists
   */
  private ensureCertDir(): void {
    if (!existsSync(this.certDir)) {
      mkdirSync(this.certDir, { recursive: true });
    }
  }

  /**
   * Get the default paths for self-signed certificates
   */
  public getDefaultCertPaths(): { certPath: string; keyPath: string } {
    return {
      certPath: join(this.certDir, 'server.crt'),
      keyPath: join(this.certDir, 'server.key'),
    };
  }

  /**
   * Get the paths for Let's Encrypt certificates
   */
  public getLetsEncryptCertPaths(): { certPath: string; keyPath: string } {
    return {
      certPath: join(this.certDir, 'letsencrypt.crt'),
      keyPath: join(this.certDir, 'letsencrypt.key'),
    };
  }

  /**
   * Generate a Let's Encrypt certificate via ACME HTTP-01 challenge
   * @param domain - The domain name for the certificate
   * @param email - Optional email for ACME registration
   * @returns The paths to the generated certificate and key
   */
  public async generateLetsEncryptCert(
    domain: string,
    email?: string
  ): Promise<{ certPath: string; keyPath: string }> {
    const contactEmail = email || `admin@${domain}`;
    console.log(`[SslCertificateService] Generating Let's Encrypt certificate for ${domain}`);

    // Store for HTTP-01 challenge tokens
    const challengeTokens = new Map<string, string>();

    // Start HTTP server on port 80 for ACME challenge
    const challengeServer = http.createServer((req, res) => {
      const prefix = '/.well-known/acme-challenge/';
      if (req.url && req.url.startsWith(prefix)) {
        const token = req.url.slice(prefix.length);
        const keyAuth = challengeTokens.get(token);
        if (keyAuth) {
          console.log(`[SslCertificateService] Served ACME challenge token: ${token}`);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(keyAuth);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found');
    });

    try {
      // Start challenge server
      await new Promise<void>((resolve, reject) => {
        challengeServer.listen(80, '0.0.0.0', () => {
          console.log('[SslCertificateService] Challenge server listening on port 80');
          resolve();
        });
        challengeServer.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EACCES') {
            reject(
              new Error('Port 80 requires administrator/root privileges. Run as Administrator.')
            );
          } else if (err.code === 'EADDRINUSE') {
            reject(new Error('Port 80 is already in use. Stop the service using it first.'));
          } else {
            reject(err);
          }
        });
      });

      // Create ACME client (production)
      const client = new acme.Client({
        directoryUrl: acme.directory.letsencrypt.production,
        accountKey: await acme.crypto.createPrivateKey(),
      });

      // Register account
      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${contactEmail}`],
      });

      // Create certificate order
      const order = await client.createOrder({
        identifiers: [{ type: 'dns', value: domain }],
      });

      // Complete HTTP-01 challenge
      const authorizations = await client.getAuthorizations(order);

      for (const auth of authorizations) {
        const challenge = auth.challenges.find((c: { type: string }) => c.type === 'http-01');
        if (!challenge) {
          throw new Error('No HTTP-01 challenge available. Check domain configuration.');
        }

        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        challengeTokens.set(challenge.token, keyAuthorization);

        await client.verifyChallenge(auth, challenge);
        await client.completeChallenge(challenge);
        await client.waitForValidStatus(challenge);
      }

      // Generate CSR and private key
      const [serverKey, csr] = await acme.crypto.createCsr({
        commonName: domain,
        altNames: [domain],
      });

      // Finalize order and get certificate
      await client.finalizeOrder(order, csr);
      const certificate = await client.getCertificate(order);

      // Save files with separate names from self-signed
      const paths = this.getLetsEncryptCertPaths();
      writeFileSync(paths.certPath, certificate, { mode: 0o644 });
      writeFileSync(paths.keyPath, serverKey.toString(), { mode: 0o600 });

      console.log(`[SslCertificateService] Let's Encrypt certificate saved to ${paths.certPath}`);
      console.log(`[SslCertificateService] Let's Encrypt key saved to ${paths.keyPath}`);

      return paths;
    } finally {
      challengeServer.close();
    }
  }

  /**
   * Generate a self-signed certificate
   * @param hostname - The hostname for the certificate (defaults to 'localhost')
   * @param days - Number of days until expiration (defaults to 365)
   * @returns The paths to the generated certificate and key
   */
  public generateSelfSignedCert(
    hostname: string = 'localhost',
    days: number = 365
  ): { certPath: string; keyPath: string } {
    console.log(`[SslCertificateService] Generating self-signed certificate for ${hostname}`);

    // Generate RSA key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;

    // Set serial number
    cert.serialNumber = '01' + Date.now().toString(16);

    // Set validity period
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);

    // Set subject and issuer (same for self-signed)
    const attrs = [
      { name: 'commonName', value: hostname },
      { name: 'organizationName', value: 'Claude Code Orchestra' },
      { name: 'organizationalUnitName', value: 'Self-Signed' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Set extensions
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false,
      },
      {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: hostname }, // DNS name
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ]);

    // Self-sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Save to files
    const paths = this.getDefaultCertPaths();
    writeFileSync(paths.certPath, certPem, { mode: 0o644 });
    writeFileSync(paths.keyPath, keyPem, { mode: 0o600 });

    console.log(`[SslCertificateService] Certificate saved to ${paths.certPath}`);
    console.log(`[SslCertificateService] Key saved to ${paths.keyPath}`);

    return paths;
  }

  /**
   * Get or create a self-signed certificate
   * Returns existing certificate if still valid, generates new one otherwise
   */
  public getOrCreateSelfSignedCert(hostname: string = 'localhost'): {
    certPath: string;
    keyPath: string;
  } {
    const paths = this.getDefaultCertPaths();

    // Check if certificate exists and is valid
    if (existsSync(paths.certPath) && existsSync(paths.keyPath)) {
      const validation = this.validateCertificate(paths.certPath);
      if (validation.valid && validation.daysRemaining && validation.daysRemaining > 30) {
        console.log(
          `[SslCertificateService] Using existing certificate (${validation.daysRemaining} days remaining)`
        );
        return paths;
      }
    }

    // Generate new certificate
    return this.generateSelfSignedCert(hostname);
  }

  /**
   * Load certificates from the given config
   * @param config - SSL configuration
   * @returns SSL server options for https.createServer
   */
  public loadCertificates(config: SslConfig): SslServerOptions {
    let certPath: string;
    let keyPath: string;

    if (config.letsEncrypt) {
      // Use Let's Encrypt certificate
      const paths = this.getLetsEncryptCertPaths();
      if (!existsSync(paths.certPath) || !existsSync(paths.keyPath)) {
        throw new Error("Let's Encrypt certificate not found. Generate one first via Settings.");
      }
      certPath = paths.certPath;
      keyPath = paths.keyPath;
    } else if (config.selfSigned) {
      // Use self-signed certificate
      const paths = this.getOrCreateSelfSignedCert();
      certPath = paths.certPath;
      keyPath = paths.keyPath;
    } else {
      // Use custom certificate paths
      if (!config.certPath || !config.keyPath) {
        throw new Error('Certificate and key paths are required when not using self-signed');
      }
      certPath = config.certPath;
      keyPath = config.keyPath;
    }

    // Validate certificates exist
    if (!existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }
    if (!existsSync(keyPath)) {
      throw new Error(`Key file not found: ${keyPath}`);
    }

    const options: SslServerOptions = {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    };

    // Add CA bundle if specified
    if (config.caPath && existsSync(config.caPath)) {
      options.ca = readFileSync(config.caPath);
    }

    // Add passphrase if specified
    if (config.passphrase) {
      options.passphrase = config.passphrase;
    }

    return options;
  }

  /**
   * Validate a certificate file
   * @param certPath - Path to the certificate file
   * @returns Validation result with certificate details
   */
  public validateCertificate(certPath: string): CertificateValidationResult {
    try {
      if (!existsSync(certPath)) {
        return { valid: false, error: 'Certificate file not found' };
      }

      const certPem = readFileSync(certPath, 'utf-8');
      const cert = forge.pki.certificateFromPem(certPem);

      const now = new Date();
      const validFrom = cert.validity.notBefore;
      const validTo = cert.validity.notAfter;

      // Check if certificate is currently valid
      if (now < validFrom) {
        return {
          valid: false,
          error: 'Certificate is not yet valid',
          validFrom,
          validTo,
        };
      }

      if (now > validTo) {
        return {
          valid: false,
          error: 'Certificate has expired',
          validFrom,
          validTo,
        };
      }

      // Calculate days remaining
      const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Get subject and issuer
      const getAttr = (attrs: forge.pki.CertificateField[], name: string): string | undefined => {
        const attr = attrs.find((a) => a.name === name || a.shortName === name);
        return attr?.value?.toString();
      };

      const subject = getAttr(cert.subject.attributes, 'commonName');
      const issuer = getAttr(cert.issuer.attributes, 'commonName');
      const isSelfSigned = subject === issuer;

      // Calculate fingerprint
      const md = forge.md.sha256.create();
      md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
      const fingerprint = md.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':') || '';

      return {
        valid: true,
        subject,
        issuer,
        validFrom,
        validTo,
        daysRemaining,
        isSelfSigned,
        fingerprint,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to parse certificate',
      };
    }
  }

  /**
   * Get detailed certificate information
   * @param certPath - Path to the certificate file
   * @returns Certificate information or null if invalid
   */
  public getCertificateInfo(certPath: string): CertificateInfo | null {
    try {
      if (!existsSync(certPath)) {
        return null;
      }

      const certPem = readFileSync(certPath, 'utf-8');
      const cert = forge.pki.certificateFromPem(certPem);

      const getAttr = (attrs: forge.pki.CertificateField[], name: string): string | undefined => {
        const attr = attrs.find((a) => a.name === name || a.shortName === name);
        return attr?.value?.toString();
      };

      // Calculate fingerprint
      const md = forge.md.sha256.create();
      md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
      const fingerprint = md.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':') || '';

      const subjectCN = getAttr(cert.subject.attributes, 'commonName');
      const issuerCN = getAttr(cert.issuer.attributes, 'commonName');

      return {
        subject: {
          commonName: subjectCN,
          organization: getAttr(cert.subject.attributes, 'organizationName'),
          organizationalUnit: getAttr(cert.subject.attributes, 'organizationalUnitName'),
          country: getAttr(cert.subject.attributes, 'countryName'),
        },
        issuer: {
          commonName: issuerCN,
          organization: getAttr(cert.issuer.attributes, 'organizationName'),
        },
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        serialNumber: cert.serialNumber,
        fingerprint,
        isSelfSigned: subjectCN === issuerCN,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a key file is encrypted (requires passphrase)
   * @param keyPath - Path to the key file
   * @returns True if the key is encrypted
   */
  public isKeyEncrypted(keyPath: string): boolean {
    try {
      if (!existsSync(keyPath)) {
        return false;
      }

      const keyPem = readFileSync(keyPath, 'utf-8');
      return keyPem.includes('ENCRYPTED');
    } catch {
      return false;
    }
  }

  /**
   * Validate that a certificate and key match
   * @param certPath - Path to the certificate file
   * @param keyPath - Path to the key file
   * @param passphrase - Optional passphrase for encrypted keys
   * @returns True if the certificate and key match
   */
  public validateCertKeyPair(
    certPath: string,
    keyPath: string,
    passphrase?: string
  ): { valid: boolean; error?: string } {
    try {
      if (!existsSync(certPath)) {
        return { valid: false, error: 'Certificate file not found' };
      }
      if (!existsSync(keyPath)) {
        return { valid: false, error: 'Key file not found' };
      }

      const certPem = readFileSync(certPath, 'utf-8');
      const keyPem = readFileSync(keyPath, 'utf-8');

      const cert = forge.pki.certificateFromPem(certPem);

      let privateKey: forge.pki.PrivateKey;
      if (keyPem.includes('ENCRYPTED')) {
        if (!passphrase) {
          return { valid: false, error: 'Key is encrypted but no passphrase provided' };
        }
        privateKey = forge.pki.decryptRsaPrivateKey(keyPem, passphrase);
        if (!privateKey) {
          return { valid: false, error: 'Failed to decrypt key with provided passphrase' };
        }
      } else {
        privateKey = forge.pki.privateKeyFromPem(keyPem);
      }

      // Verify that the public key from the cert matches the private key
      const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
      const derivedPublicKeyPem = forge.pki.publicKeyToPem(
        forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e)
      );

      if (publicKeyPem !== derivedPublicKeyPem) {
        return { valid: false, error: 'Certificate and key do not match' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }
}

// Export singleton getter
export function getSslCertificateService(): SslCertificateService {
  return SslCertificateService.getInstance();
}
