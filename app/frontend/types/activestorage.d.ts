declare module '@rails/activestorage' {
  type DirectUploadDelegate = {
    directUploadWillStoreFileWithXHR?: (request: XMLHttpRequest) => void
  }

  export class DirectUpload {
    constructor(file: File, url: string, delegate?: DirectUploadDelegate)
    create(callback: (error: Error, blob: { signed_id: string; filename: string }) => void): void
  }
}
