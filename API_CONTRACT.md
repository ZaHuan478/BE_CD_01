# API contract

Base path: `/api/v1`.

## Response envelope

API mới dùng một trong ba dạng sau. Các endpoint cũ (`/me`, `/bootstrap`, `/modules`,
`/sops`) tạm giữ response cũ để Frontend hiện tại không bị gián đoạn; FE sẽ chuyển dần
sang contract này.

Single resource:

```json
{
  "data": {},
  "requestId": "uuid"
}
```

Collection:

```json
{
  "data": [],
  "meta": { "total": 0 },
  "requestId": "uuid"
}
```

Error:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Human-readable message",
    "details": null
  },
  "requestId": "uuid"
}
```

## Identity and visible modules

- `GET /me`: compatibility response containing identity, organization, grants, menu and modules.
- `GET /me/modules`: effective modules, including common, manual, HRM and system grants.
- `GET /modules`: compatibility collection of modules visible to the current account.
- `GET /modules/:moduleId/sops`: published SOPs visible in one module.

## Simple user-module administration

- `GET /admin/users?search=...`: users and their organization metadata.
- `GET /admin/users/:id/module-access`: all published modules plus direct/effective access.
- `PUT /admin/users/:id/module-access`: replaces only `manual` grants.

Request:

```json
{
  "moduleIds": ["emp", "att", "leave"]
}
```

Common modules do not need a manual row. HRM and system grants are never deleted by this API.
Every change is recorded in `AuditLog`.

## Knowledge search

`GET /search?q=nghi%20phep&moduleId=leave&type=all&limit=20`

Searches published SOPs, documents, guidance and glossary terms. The backend removes results
whose module is not visible to the authenticated account; the frontend must not implement this
security filter itself.

## Status codes

- `200`: read/update succeeded.
- `201`: resource created.
- `204`: command succeeded without a response body.
- `400`: validation error.
- `401`: authentication required or invalid.
- `403`: authenticated but not authorized.
- `404`: resource not found.
- `409`: uniqueness, reference, workflow-state or optimistic-concurrency conflict.
- `500`: unexpected server error.
