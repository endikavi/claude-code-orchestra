/**
 * Generate Let's Encrypt certificate using ACME HTTP-01 challenge.
 *
 * Requirements:
 *   - Port 80 must be accessible from the internet (forwarded to this machine)
 *   - No other service using port 80 during execution
 *
 * Usage:
 *   node scripts/generate-letsencrypt.mjs <domain> [email]
 *
 * Example:
 *   node scripts/generate-letsencrypt.mjs n8n-endikavi.ddns.net endikavi@gmail.com
 *
 * Output:
 *   Certificates saved to %APPDATA%/claude-orchestra/ssl/ (or platform equivalent)
 */

import acme from 'acme-client';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const domain = process.argv[2];
const email = process.argv[3] || 'admin@' + domain;

if (!domain) {
  console.error('Usage: node scripts/generate-letsencrypt.mjs <domain> [email]');
  process.exit(1);
}

// Determine SSL directory (matches SslCertificateService paths)
function getSslDir() {
  const platform = os.platform();
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-orchestra', 'ssl');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'claude-orchestra', 'ssl');
  } else {
    return path.join(os.homedir(), '.config', 'claude-orchestra', 'ssl');
  }
}

const sslDir = getSslDir();
fs.mkdirSync(sslDir, { recursive: true });

console.log(`\n--- Let's Encrypt Certificate Generator ---`);
console.log(`Domain:  ${domain}`);
console.log(`Email:   ${email}`);
console.log(`Output:  ${sslDir}`);
console.log(`-------------------------------------------\n`);

// Store for HTTP-01 challenge tokens
const challengeTokens = new Map();

// Start HTTP server on port 80 for ACME challenge
const challengeServer = http.createServer((req, res) => {
  const prefix = '/.well-known/acme-challenge/';
  if (req.url && req.url.startsWith(prefix)) {
    const token = req.url.slice(prefix.length);
    const keyAuth = challengeTokens.get(token);
    if (keyAuth) {
      console.log(`  [challenge] Served token: ${token}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(keyAuth);
      return;
    }
  }
  res.writeHead(404);
  res.end('Not found');
});

try {
  await new Promise((resolve, reject) => {
    challengeServer.listen(80, '0.0.0.0', () => {
      console.log('[ok] Challenge server listening on port 80');
      resolve();
    });
    challengeServer.on('error', (err) => {
      if (err.code === 'EACCES') {
        reject(new Error('Port 80 requires admin/root privileges. Run as Administrator.'));
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

  console.log('[1/4] Registering ACME account...');
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  console.log('[2/4] Creating certificate order...');
  const order = await client.createOrder({
    identifiers: [{ type: 'dns', value: domain }],
  });

  // Get authorizations and fulfill challenges
  console.log('[3/4] Completing HTTP-01 challenge...');
  const authorizations = await client.getAuthorizations(order);

  for (const auth of authorizations) {
    const challenge = auth.challenges.find(c => c.type === 'http-01');
    if (!challenge) {
      throw new Error('No HTTP-01 challenge available. Check domain configuration.');
    }

    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
    challengeTokens.set(challenge.token, keyAuthorization);

    console.log(`  [challenge] Token ready for ${auth.identifier.value}`);

    // Notify ACME server that challenge is ready
    await client.verifyChallenge(auth, challenge);
    await client.completeChallenge(challenge);

    // Wait for validation
    await client.waitForValidStatus(challenge);
    console.log(`  [challenge] Validated!`);
  }

  // Generate CSR and private key
  console.log('[4/4] Generating certificate...');
  const [serverKey, csr] = await acme.crypto.createCsr({
    commonName: domain,
    altNames: [domain],
  });

  // Finalize order and get certificate
  await client.finalizeOrder(order, csr);
  const certificate = await client.getCertificate(order);

  // Save files
  const certPath = path.join(sslDir, 'server.crt');
  const keyPath = path.join(sslDir, 'server.key');

  fs.writeFileSync(certPath, certificate, { mode: 0o644 });
  fs.writeFileSync(keyPath, serverKey.toString(), { mode: 0o600 });

  console.log(`\n--- SUCCESS ---`);
  console.log(`Certificate: ${certPath}`);
  console.log(`Private Key: ${keyPath}`);
  console.log(`\nNow enable SSL in Orchestra:`);
  console.log(`  Settings > Remote Access > SSL > Enabled = true`);
  console.log(`  Set certPath = ${certPath}`);
  console.log(`  Set keyPath  = ${keyPath}`);
  console.log(`  (selfSigned should be OFF)`);
  console.log(`---`);

} catch (err) {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
} finally {
  challengeServer.close();
}
