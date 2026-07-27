const Redis = require("ioredis");

const startupEndpoint = process.env.VALKEY_STARTUP_ENDPOINT;
const password = process.env.VALKEY_PASSWORD;
const key = process.env.VALKEY_KEY || "dev:apisix:example";
const value =
  process.env.VALKEY_VALUE || `hello-valkey-${new Date().toISOString()}`;

if (!startupEndpoint) {
  console.error(
    "Missing VALKEY_STARTUP_ENDPOINT. Example: 172.23.0.46:31900",
  );
  process.exit(1);
}

if (!password) {
  console.error("Missing VALKEY_PASSWORD.");
  process.exit(1);
}

const separatorIndex = startupEndpoint.lastIndexOf(":");

if (separatorIndex < 1 || separatorIndex === startupEndpoint.length - 1) {
  console.error(
    "VALKEY_STARTUP_ENDPOINT must use the format <host>:<port>.",
  );
  process.exit(1);
}

const host = startupEndpoint.slice(0, separatorIndex);
const port = Number(startupEndpoint.slice(separatorIndex + 1));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("VALKEY_STARTUP_ENDPOINT contains an invalid port.");
  process.exit(1);
}

// Only one startup endpoint is configured. APISIX forwards the bootstrap
// connection to one of the Ready Valkey pods. ioredis then discovers the
// complete cluster topology automatically.
const valkey = new Redis.Cluster([{ host, port }], {
  slotsRefreshTimeout: 5000,
  slotsRefreshInterval: 30000,
  clusterRetryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
  redisOptions: {
    password,
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
  },
});

valkey.on("error", (error) => {
  console.error(`[valkey] ${error.name}: ${error.message}`);
});

async function main() {
  console.log(`Startup endpoint: ${startupEndpoint}`);

  await valkey.set(key, value);
  const storedValue = await valkey.get(key);
  const slot = await valkey.cluster("keyslot", key);

  if (storedValue !== value) {
    throw new Error(
      `Value mismatch: expected "${value}", received "${storedValue}"`,
    );
  }

  console.log(`SET/GET successful`);
  console.log(`Key: ${key}`);
  console.log(`Value: ${storedValue}`);
  console.log(`Hash slot: ${slot}`);
}

main()
  .catch((error) => {
    console.error("Valkey test failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    valkey.disconnect();
  });
