# Document storage

Both personal documents and SOP imports use `DocumentStorage`. New uploads use
Cloudinary when credentials are configured; existing local StorageKeys continue
to read from `SOP_UPLOAD_DIR`. Existing files are not automatically migrated.

Configuration in backend `.env` only:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_DOCUMENT_FOLDER=hrm_documents
```

The complete individual credential set takes precedence. `CLOUDINARY_URL` is
used only when all three individual variables are absent. Partial configuration
fails startup instead of mixing credentials. `CLOUDINARY_DOCUMENT_FOLDER` defaults
to `hrm_documents`; invoice storage configuration is unaffected. With no credentials,
local storage remains available for development. Failed Cloudinary uploads never
silently fall back to disk.

DOCX/PDF bytes are uploaded directly from memory with the official SDK,
`resource_type: raw` and `type: authenticated`. StorageKey is
`cloudinary:<public_id>` (including the file extension); no schema change is needed.
View/download APIs retain their permission checks and fetch a short-lived signed
download URL server-side. The frontend receives bytes, so existing PDF/Word viewers
continue using the same API endpoints. Secrets and signed URLs are not returned.
Reference: https://cloudinary.com/documentation/control_access_to_media

Moving a personal document to trash retains its file for restoration. Permanent
deletion calls Cloudinary destroy; upload failures do not insert a document row,
and database-create failures trigger uploaded-file cleanup.

Restart the existing backend with `npm run start` after configuration changes.
Do not start another server while port 3000 is occupied.

Verification:

```sh
npm run typecheck
npm test
npx tsx scripts/verify-cloudinary-storage.ts
```

The last command uploads only a synthetic test PDF, compares downloaded bytes,
and deletes it in a finally block. It does not insert database records.
On 2026-09-08, typecheck and 76 tests passed; the configured account's API ping
returned `ok`, but upload returned HTTP 403 with both stream and base64 SDK calls.
End-to-end upload/download verification therefore remains pending until that
provider/network restriction is resolved. Do not treat a successful ping as proof
that uploads are permitted.
