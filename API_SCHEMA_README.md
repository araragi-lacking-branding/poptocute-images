# API Schema for Cloudflare API Shield

This directory contains OpenAPI v3.0 schema files compatible with Cloudflare's API Shield and API Abuse Detection toolset.

## Files

- `openapi-schema.yaml` - OpenAPI 3.0.3 schema in YAML format (recommended for readability)
- `openapi-schema.json` - OpenAPI 3.0.3 schema in JSON format (alternative)

## About Cloudflare API Shield

Cloudflare API Shield provides:
- **Schema Validation** - Validates incoming requests against your OpenAPI schema
- **Volumetric Abuse Detection** - ML-powered detection of API abuse patterns
- **Rate Limiting** - Per-endpoint rate limiting recommendations
- **Sequence Analysis** - Identifies malicious API request sequences
- **BOLA Detection** - Detects Broken Object Level Authorization vulnerabilities

## How to Upload Schema to Cloudflare

### Using Cloudflare Dashboard

1. Log in to your Cloudflare Dashboard
2. Select your zone (cutetopop.com)
3. Navigate to **Security** → **API Shield**
4. Click on **Schema Validation**
5. Click **Add Schema** or **Upload Schema**
6. Upload `openapi-schema.yaml` or `openapi-schema.json`
7. Cloudflare will validate and parse your schema

### Using Wrangler CLI

```bash
# Upload schema using Wrangler
npx wrangler api-shield upload-schema openapi-schema.yaml --zone-id YOUR_ZONE_ID

# Or using the Cloudflare API directly
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/api_gateway/operations/schema_validation" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @openapi-schema.json
```

### Using Cloudflare API

```bash
# Get your zone ID
ZONE_ID=$(npx wrangler whoami | grep "Zone ID" | awk '{print $3}')

# Upload schema
curl -X PUT \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/api_gateway/user_schemas" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "cutetopop-api-schema",
    "kind": "openapi_v3",
    "source": "'"$(cat openapi-schema.json | jq -c)"'"
  }'
```

## Schema Features

This schema documents all API endpoints:

### Public Endpoints
- `GET /api/random` - Random image with metadata
- `GET /api/images` - Paginated image list
- `GET /api/stats` - Database statistics
- `GET /images.json` - All active image filenames (cached)

### Admin Endpoints
- `GET /api/admin/tags` - List all tags by category
- `POST /api/admin/tags` - Create new tag
- `GET /api/admin/images/{id}` - Get image details
- `PUT /api/admin/images/{id}` - Update image metadata
- `POST /api/admin/upload` - Upload new image
- `POST /api/admin/sync` - Sync D1 to KV cache
- `POST /api/admin/sync-kv` - Alternative sync endpoint

## Suggested Rate Limits

The schema includes suggested rate limits in the `x-cloudflare-api-shield` extension:

| Endpoint | Suggested Limit |
|----------|----------------|
| `/api/random` | 100 req/min per IP |
| `/api/images` | 60 req/min per IP |
| `/api/stats` | 30 req/min per IP |
| `/images.json` | 60 req/min per IP |
| `/api/admin/upload` | 10 req/hour per IP |
| `/api/admin/sync` | 5 req/hour per IP |
| `/api/admin/*` (other) | 30 req/min per IP |

## Configuring Volumetric Abuse Detection

1. In Cloudflare Dashboard, go to **Security** → **API Shield**
2. Select **Abuse Detection**
3. Enable **Volumetric Abuse Detection**
4. Cloudflare will:
   - Learn baseline traffic patterns for each endpoint
   - Detect anomalous request volumes
   - Suggest rate limiting rules
   - Automatically block or challenge suspicious sessions

## Enabling Schema Validation

After uploading the schema:

1. Go to **Security** → **API Shield** → **Schema Validation**
2. Enable validation for your uploaded schema
3. Choose validation mode:
   - **Log only** (recommended initially) - Logs violations without blocking
   - **Block** - Rejects requests that don't match the schema
4. Monitor logs to identify legitimate traffic issues before switching to Block mode

## Known Limitations

### Multipart/Form-Data Not Supported

Cloudflare API Shield does not currently support schema validation for `multipart/form-data` request bodies. This affects:

- **Endpoint:** `POST /api/admin/upload`
- **Impact:** Request body structure cannot be validated by Cloudflare
- **Workaround:** Validation is handled in the Worker code
- **Still Protected:** Rate limiting and volumetric abuse detection still function normally

When uploading the schema to Cloudflare, you will see this warning:
```json
{
  "code": 29,
  "message": "unsupported media type: multipart/form-data",
  "locations": [".paths[\"/api/admin/upload\"].post.requestBody"]
}
```

This is **expected behavior** and does not affect the other 10 endpoints, which will be fully validated.

### Supported Content Types

Cloudflare API Shield Schema Validation supports:
- ✅ `application/json`
- ✅ `application/x-www-form-urlencoded`
- ✅ Query parameters
- ✅ Path parameters
- ❌ `multipart/form-data` (file uploads)

## Monitoring API Abuse

View API Shield analytics:
1. Dashboard → **Analytics & Logs** → **API Shield**
2. Review:
   - Request volume per endpoint
   - Schema validation violations
   - Detected abuse patterns
   - Rate limiting triggers

## Testing the Schema

### Validate Schema Locally

```bash
# Using Redocly CLI (recommended - actively maintained)
npx @redocly/cli lint openapi-schema.yaml

# Or validate JSON schema
npx @redocly/cli lint openapi-schema.json

# Check for specific rules
npx @redocly/cli lint openapi-schema.yaml --extends=recommended
```

### Generate API Documentation

```bash
# Using Redocly to build HTML documentation
npx @redocly/cli build-docs openapi-schema.yaml -o api-docs.html

# Preview documentation locally
npx @redocly/cli preview-docs openapi-schema.yaml

# Using Swagger UI (alternative)
npx swagger-ui-watcher openapi-schema.yaml
```

## Schema Maintenance

When adding new API endpoints:

1. Update `openapi-schema.yaml` with new paths and schemas
2. Validate the schema locally
3. Re-upload to Cloudflare
4. Update rate limiting rules if needed
5. Monitor for validation errors in Cloudflare logs

## Security Considerations

### Current Status
- ⚠️ **No authentication implemented** - Admin endpoints are currently unprotected
- Schema includes `ApiKeyAuth` security scheme for future implementation

### Recommended Improvements
1. **Add authentication** to admin endpoints:
   - API key authentication
   - JWT tokens
   - Cloudflare Access integration

2. **Enable Cloudflare Access** for `/admin/*` paths:
   ```bash
   # In Cloudflare Dashboard:
   # Zero Trust → Access → Applications → Add an application
   # Protect: cutetopop.com/admin*
   # Protect: cutetopop.com/api/admin/*
   ```

3. **Implement CSRF protection** for state-changing operations

4. **Add request signing** for sensitive admin operations

## Resources

- [Cloudflare API Shield Documentation](https://developers.cloudflare.com/api-shield/)
- [Schema Validation Guide](https://developers.cloudflare.com/api-shield/security/schema-validation/)
- [Volumetric Abuse Detection](https://developers.cloudflare.com/api-shield/security/volumetric-abuse-detection/)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Cloudflare API Gateway API](https://developers.cloudflare.com/api/operations/api-gateway-operations-list-operations)

## Support

For issues or questions:
- Project email: lambda@cutetopop.com
- Cloudflare Support: https://dash.cloudflare.com/support
- OpenAPI Specification: https://github.com/OAI/OpenAPI-Specification

## Validation Results

Current schema validation status:
- ✅ **Valid OpenAPI 3.0.3 schema**
- ⚠️ 9 warnings (non-blocking, best practice suggestions)
- ❌ 0 errors

Run validation with: `npx @redocly/cli lint openapi-schema.yaml`

## Version History

- **v1.0.2** (2025-01-30) - Documentation update for Cloudflare limitations
  - Added "Known Limitations" section documenting multipart/form-data restriction
  - Updated /api/admin/upload description with Cloudflare validation note
  - Clarified that warning about multipart/form-data is expected behavior
  - Documented supported content types for schema validation

- **v1.0.1** (2025-01-30) - Security and tooling updates
  - Fixed security definitions for all endpoints
  - Updated documentation to use @redocly/cli (actively maintained)
  - Removed deprecated swagger-cli references
  - Added explicit security: [] for public endpoints
  - Added TODO comments for admin endpoint authentication

- **v1.0.0** (2025-01-30) - Initial schema creation
  - Documented all public and admin endpoints
  - Added suggested rate limits
  - Included Cloudflare API Shield configuration hints
