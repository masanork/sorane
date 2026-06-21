/**
 * Authoritative hash algorithms sorane dispatches at runtime (CBOM drift gate).
 * Update cbom.json in the same PR when this list changes.
 */
export interface HashAlgorithmSpec {
  readonly bomRef: string;
  readonly name: string;
  /** Argument passed to `crypto.createHash()` */
  readonly nodeName: string;
  readonly description: string;
  readonly oid: string;
  readonly role: string;
}

export const SUPPORTED_HASH_ALGORITHMS: readonly HashAlgorithmSpec[] = [
  {
    bomRef: "sorane-crypto-sha256",
    name: "SHA-256",
    nodeName: "sha256",
    description:
      "Node.js crypto.createHash('sha256') for font subset cache keys and search incremental hashes.",
    oid: "2.16.840.1.101.3.4.2.1",
    role: "integrity",
  },
] as const;