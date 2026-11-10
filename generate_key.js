/**
 * NeuGate - Hardware License Key Generator
 * Usage: node generate_key.js <machine_uuid>
 */

const uuid = process.argv[2];

if (!uuid) {
  console.log("Error: Please provide a machine fingerprint/UUID.");
  console.log("Usage: node generate_key.js <uuid>");
  process.exit(1);
}

function generateKey(machineUuid) {
  const salt = "NEUGATE_SCHOOL_SECRET_KEY_SALT_2026";
  const combined = `${machineUuid.trim()}:${salt}`;
  
  // FNV-1a 64-bit hash implementation
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  
  const bytes = Buffer.from(combined, 'utf8');
  
  for (let byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  
  const hexStr = hash.toString(16).toUpperCase().padStart(16, '0');
  return `NEUG-${hexStr.slice(0, 4)}-${hexStr.slice(4, 8)}-${hexStr.slice(8, 12)}`;
}

const key = generateKey(uuid);
console.log("\n=============================================");
console.log(`Machine Fingerprint: ${uuid}`);
console.log(`Generated License Key: ${key}`);
console.log("=============================================\n");
