export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (entity: string, id?: string) =>
  new AppError(404, 'NOT_FOUND', id ? `${entity} ${id} was not found` : `${entity} was not found`)
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message)
export const conflict = (code: string, message?: string) =>
  new AppError(409, message ? code : 'CONFLICT', message ?? code)
