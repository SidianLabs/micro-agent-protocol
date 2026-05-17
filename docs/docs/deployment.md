<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Deployment Guide

This guide covers deploying MAP Protocol to production environments using Docker and Kubernetes.

## Docker

### Docker Compose Setup

Create a `docker-compose.yml` for local development:

```yaml
MAP/docs/deployment.md#L1-50
version: '3.8'

services:
  map-server:
    image: mapprotocol/map-server:latest
    ports:
      - "8787:8787"
    environment:
      - NODE_ENV=production
      - PORT=8787
      - MAP_DEPLOYMENT_PROFILE=open
      - MAP_TASK_STORE_PATH=/data/tasks.db
      - MAP_RECEIPT_STORE_PATH=/data/receipts.db
      - MAP_ASYNC_QUEUE_MAX_CONCURRENT=10
      - MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH=1000
    volumes:
      - map-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  map-data:
```

### Production Docker Configuration

```dockerfile
# Multi-stage build for smaller production image
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Run as non-root user
USER node

EXPOSE 8787

CMD ["node", "dist/src/demo-server-main.js"]
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `8787` |
| `MAP_DEPLOYMENT_PROFILE` | Deployment profile | `open` |
| `MAP_ENFORCE_SIGNED_REQUESTS` | Require signed requests | `false` |
| `MAP_REQUIRE_TENANT` | Require tenant ID | `false` |
| `MAP_TASK_STORE_PATH` | Task store file path | `tasks.json` |
| `MAP_RECEIPT_STORE_PATH` | Receipt store file path | `receipts.json` |
| `MAP_ASYNC_QUEUE_MAX_CONCURRENT` | Max concurrent tasks | `10` |
| `MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH` | Max queue depth | `1000` |
| `MAP_ASYNC_QUEUE_MAX_ATTEMPTS` | Max retry attempts | `3` |
| `MAP_ASYNC_QUEUE_RETRY_DELAY_MS` | Initial retry delay | `1000` |
| `MAP_ASYNC_QUEUE_MAX_RETRY_DELAY_MS` | Max retry delay | `60000` |
| `MAP_SIGNING_KEYS` | JSON array of signing keys | `[]` |
| `MAP_SIGNING_ACTIVE_KID` | Active signing key ID | - |
| `MAP_SIGNING_KEYS_REVOKED` | Comma-separated revoked key IDs | - |
| `MAP_KEY_MAX_AGE_MS` | Max request age in ms | `300000` |

### Production Configuration

```bash
# Production environment variables
export NODE_ENV=production
export PORT=8787
export MAP_DEPLOYMENT_PROFILE=verified
export MAP_ENFORCE_SIGNED_REQUESTS=true
export MAP_REQUIRE_TENANT=true
export MAP_TASK_STORE_PATH=/data/tasks.db
export MAP_RECEIPT_STORE_PATH=/data/receipts.db
export MAP_ASYNC_QUEUE_MAX_CONCURRENT=50
export MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH=10000
export MAP_ASYNC_QUEUE_MAX_ATTEMPTS=5

# Signing keys (RS256 for verified/regulated)
export MAP_SIGNING_KEYS='[{
  "kid": "kid_prod_rs",
  "alg": "RS256",
  "private_key_pem": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...",
  "public_key_pem": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...",
  "status": "active",
  "demo_only": false
}]'
export MAP_SIGNING_ACTIVE_KID=kid_prod_rs
```

---

## Kubernetes

### Helm Chart Values

Create a `values.yaml` for your Helm deployment:

```yaml
MAP/docs/deployment.md#L90-150
# values.yaml

replicaCount: 3

image:
  repository: mapprotocol/map-server
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8787

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: api.map-protocol.dev
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: map-server-tls
      hosts:
        - api.map-protocol.dev

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

env:
  MAP_DEPLOYMENT_PROFILE: verified
  MAP_ENFORCE_SIGNED_REQUESTS: "true"
  MAP_REQUIRE_TENANT: "true"
  MAP_ASYNC_QUEUE_MAX_CONCURRENT: "50"
  MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH: "10000"

persistence:
  enabled: true
  storageClass: standard-ssd
  size: 50Gi

securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

podSecurityContext:
  seccompProfile:
    type: RuntimeDefault

livenessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 5
```

### ConfigMaps

Create a ConfigMap for non-sensitive configuration:

```yaml
MAP/docs/deployment.md#L165-190
apiVersion: v1
kind: ConfigMap
metadata:
  name: map-server-config
  namespace: map-protocol
data:
  MAP_DEPLOYMENT_PROFILE: "verified"
  MAP_ENFORCE_SIGNED_REQUESTS: "true"
  MAP_REQUIRE_TENANT: "true"
  MAP_ASYNC_QUEUE_MAX_CONCURRENT: "50"
  MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH: "10000"
  MAP_ASYNC_QUEUE_MAX_ATTEMPTS: "5"
  MAP_ASYNC_QUEUE_RETRY_DELAY_MS: "1000"
  MAP_ASYNC_QUEUE_MAX_RETRY_DELAY_MS: "60000"
  MAP_KEY_MAX_AGE_MS: "300000"
```

### Secrets Management

Use Kubernetes Secrets for sensitive data:

```yaml
MAP/docs/deployment.md#L200-225
apiVersion: v1
kind: Secret
metadata:
  name: map-server-secrets
  namespace: map-protocol
type: Opaque
stringData:
  MAP_SIGNING_KEYS: |
    [
      {
        "kid": "kid_prod_rs",
        "alg": "RS256",
        "private_key_pem": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...",
        "public_key_pem": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...",
        "status": "active",
        "demo_only": false
      }
    ]
  MAP_SIGNING_ACTIVE_KID: "kid_prod_rs"
```

### Deployment Resource

```yaml
MAP/docs/deployment.md#L235-280
apiVersion: apps/v1
kind: Deployment
metadata:
  name: map-server
  namespace: map-protocol
spec:
  replicas: 3
  selector:
    matchLabels:
      app: map-server
  template:
    metadata:
      labels:
        app: map-server
    spec:
      serviceAccountName: map-server
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: map-server
          image: mapprotocol/map-server:latest
          ports:
            - containerPort: 8787
          env:
            - name: MAP_DEPLOYMENT_PROFILE
              valueFrom:
                configMapKeyRef:
                  name: map-server-config
                  key: MAP_DEPLOYMENT_PROFILE
            - name: MAP_SIGNING_KEYS
              valueFrom:
                secretKeyRef:
                  name: map-server-secrets
                  key: MAP_SIGNING_KEYS
            - name: MAP_SIGNING_ACTIVE_KID
              valueFrom:
                secretKeyRef:
                  name: map-server-secrets
                  key: MAP_SIGNING_ACTIVE_KID
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8787
          readinessProbe:
            httpGet:
              path: /ready
              port: 8787
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: map-server-data
```

---

## Production Checklist

### Security Checklist

- [ ] Use `verified` or `regulated` deployment profile
- [ ] Enable `MAP_ENFORCE_SIGNED_REQUESTS=true`
- [ ] Require tenant ID with `MAP_REQUIRE_TENANT=true`
- [ ] Configure RSA-2048 signing keys
- [ ] Set up key rotation schedule
- [ ] Enable TLS 1.2+ only (disable older versions)
- [ ] Configure rate limiting
- [ ] Set up network policies to restrict access
- [ ] Run as non-root user
- [ ] Enable seccomp/AppArmor profiles
- [ ] Use secrets for all sensitive configuration
- [ ] Review and restrict ingress/egress traffic

### Monitoring Checklist

- [ ] Set up liveness/readiness probes
- [ ] Configure Prometheus metrics endpoint (`/metrics`)
- [ ] Set up alerts for:
  - High error rates (>5%)
  - Queue depth exceeding threshold
  - High memory/CPU usage
  - Failed health checks
  - Signing key expiration (30 days before)
- [ ] Set up distributed tracing (if available)
- [ ] Configure log aggregation
- [ ] Set up log retention policy (90+ days for audit)
- [ ] Monitor dead letter queue depth
- [ ] Track request latency p95/p99

### Backup Checklist

- [ ] Configure regular task store backups
- [ ] Configure regular receipt store backups
- [ ] Test backup restoration procedure
- [ ] Set up off-site backup storage
- [ ] Document backup recovery time objective (RTO)
- [ ] Document backup recovery point objective (RPO)
- [ ] Export and store signing keys securely
- [ ] Document key recovery procedure

### High Availability Checklist

- [ ] Deploy minimum 3 replicas
- [ ] Configure horizontal pod autoscaling
- [ ] Set up pod disruption budget
- [ ] Configure readiness gates for rolling updates
- [ ] Use persistent storage with replication
- [ ] Set up multi-zone deployment (if available)
- [ ] Configure load balancer health checks
- [ ] Test failover procedure

### Performance Checklist

- [ ] Configure appropriate resource limits
- [ ] Tune `MAP_ASYNC_QUEUE_MAX_CONCURRENT` for workload
- [ ] Configure `MAP_ASYNC_QUEUE_MAX_QUEUE_DEPTH` appropriately
- [ ] Set up connection pooling (if database backend)
- [ ] Enable response caching where appropriate
- [ ] Configure appropriate timeout values
- [ ] Set up CDN for static assets (if any)

### Compliance Checklist

- [ ] Enable audit event logging
- [ ] Configure audit log retention (90+ days)
- [ ] Set up audit log export schedule
- [ ] Verify audit chain integrity regularly
- [ ] Document all security incidents
- [ ] Set up compliance reporting
- [ ] Configure data retention policies
- [ ] Enable receipt signature verification

---

## Next Steps

- [Security Guide](./security-guide.md) - Security configuration details
- [Policy Configuration](./policy-guide.md) - Policy engine setup
- [TypeScript SDK](./sdk/typescript.md) - Client integration
- [Protocol Specification](./protocol-spec.md) - Complete protocol reference
