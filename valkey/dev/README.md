# Node.js dev test for Valkey Cluster

This example connects to Valkey Cluster using exactly one APISIX startup
endpoint.

## Install

```bash
cd valkey/dev
npm install
```

## Run

PowerShell:

```powershell
$env:VALKEY_STARTUP_ENDPOINT = "172.23.0.46:31900"
$env:VALKEY_PASSWORD = "<password>"
npm start
```

Bash:

```bash
export VALKEY_STARTUP_ENDPOINT="172.23.0.46:31900"
export VALKEY_PASSWORD="<password>"
npm start
```

Optional key and value:

```bash
export VALKEY_KEY="dev:my-key"
export VALKEY_VALUE="hello-valkey"
```

The application configures only one startup node. After APISIX forwards the
bootstrap connection to a Ready pod, `ioredis` discovers the remaining Valkey
Cluster topology automatically.
