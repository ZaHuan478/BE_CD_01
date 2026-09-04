import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { AppError } from '../common/errors.js'
import type { AppEnv } from '../config/env.js'
import { AuthRepository } from './auth.repository.js'
import type { AuthPrincipal } from './types.js'

interface JwtPayload { sub?: string }

function secureStringEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest()
  const rightDigest = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

export class AuthService {
  constructor(
    private readonly env: AppEnv,
    private readonly repository: AuthRepository
  ) {}

  async loginDevelopment(identifier: string, password: string) {
    const account = await this.repository.findDevelopmentAccount(identifier)
    const passwordMatches = secureStringEquals(password, this.env.developmentDemoPassword)
    if (!account || !passwordMatches) {
      throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Tài khoản hoặc mật khẩu không đúng')
    }

    return {
      accountId: account.AccountId,
      username: account.Username,
      fullName: account.FullName,
      email: account.Email
    }
  }

  async authenticate(request: FastifyRequest): Promise<AuthPrincipal> {
    let principal: AuthPrincipal | null

    if (this.env.authMode === 'development') {
      const rawAccountId = request.headers['x-user-id']
      const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId
      if (!accountId) {
        throw new AppError(401, 'AUTH_DEVELOPMENT_USER_REQUIRED', 'Select a development account before calling this endpoint')
      }
      principal = await this.repository.findPrincipal({ accountId })
    } else {
      let payload: JwtPayload
      try {
        payload = await request.jwtVerify<JwtPayload>()
      } catch {
        throw new AppError(401, 'AUTH_INVALID_TOKEN', 'A valid bearer token is required')
      }
      if (!payload.sub) throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Token does not contain a subject')
      principal = await this.repository.findPrincipal({ externalSubject: payload.sub })
    }

    if (!principal) throw new AppError(401, 'AUTH_ACCOUNT_NOT_FOUND', 'Account is inactive or not provisioned')
    request.principal = principal
    return principal
  }
}
