-- Link a conversion draft to the immutable personal source document.
-- The same Cloudinary/local storage key is reused; the source file is not uploaded twice.
ALTER TABLE SopImportJob
  ADD COLUMN SourceDocumentId VARCHAR(100) CHARACTER SET ascii NULL AFTER JobTitle,
  ADD KEY IX_SopImportJob_SourceDocument (SourceDocumentId);
