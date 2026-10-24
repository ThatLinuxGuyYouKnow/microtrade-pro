import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { CONFIG } from '../config.js';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface Wallet {
  id: string;
  address: string;
  publicKeyHex: string;
  sign(message: string): string;
  verify(message: string, signature: string): boolean;
}

function privateKeyFromSeed(seed: string): KeyObject {
  const digest = createHash('sha256').update(`microtrade-pro::${seed}`).digest();
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, digest]), format: 'der', type: 'pkcs8' });
}

export function publicKeyHex(key: KeyObject): string {
  const der = createPublicKey(key).export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32).toString('hex');
}

export function walletFromSeed(id: string, seed: string): Wallet {
  const privateKey = privateKeyFromSeed(seed);
  const publicHex = publicKeyHex(privateKey);
  const address = `0x${createHash('sha256').update(publicHex).digest('hex').slice(0, 40)}`;
  return {
    id,
    address,
    publicKeyHex: publicHex,
    sign(message: string) {
      return sign(null, Buffer.from(message), privateKey).toString('hex');
    },
    verify(message: string, signature: string) {
      try {
        return verify(null, Buffer.from(message), createPublicKey(privateKey), Buffer.from(signature, 'hex'));
      } catch {
        return false;
      }
    },
  };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function shortHash(hash: string, head = 10, tail = 6): string {
  if (!hash) return '—';
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function txDigest(input: {
  from: string;
  to: string;
  method: string;
  args: Record<string, unknown>;
  valueMtr: number;
  nonce: number;
  timestamp: string;
}): string {
  return sha256(JSON.stringify(input));
}

/** Deterministic validator identity used for PoA block production. */
export const VALIDATOR_WALLET = walletFromSeed('validator', 'cedar-hollow-validator-1');
export const TREASURY_WALLET = walletFromSeed('treasury', 'cedar-hollow-treasury');

export function explorerAddress(address: string): string {
  return address.startsWith('0x') ? address : `0x${address}`;
}

export const WALLET_META = {
  validator: { address: VALIDATOR_WALLET.address, name: CONFIG.validatorName },
  treasury: { address: TREASURY_WALLET.address, name: 'Community Treasury' },
};
