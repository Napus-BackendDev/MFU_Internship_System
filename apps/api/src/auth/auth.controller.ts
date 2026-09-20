import type { AppEnvironment } from '@internship/config'
import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'

import type { AuthenticatedRequest } from '../common/http.js'
import { readCookie } from '../common/http.js'
import { Authenticated, Public } from './auth.decorators.js'
import { OidcService } from './oidc.service.js'
import { SessionService, type SessionTokens } from './session.service.js'

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly oidcService: OidcService,
    private readonly sessionService: SessionService
  ) {}

  @Public()
  @Get('login')
  public async login(@Res() response: Response): Promise<void> {
    const start = await this.oidcService.start()
    response.cookie('its_oidc', start.transientToken, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      path: '/api/v2/auth/callback',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
    response.redirect(start.url.toString())
  }

  @Public()
  @Get('callback')
  public async callback(
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const transientToken = readCookie(request, 'its_oidc')
    if (!transientToken) {
      response.status(401).json({ code: 'OIDC_CALLBACK_INVALID' })
      return
    }

    const redirectUri = this.config.get('OIDC_REDIRECT_URI', { infer: true })
    if (!redirectUri) {
      response.status(503).json({ code: 'OIDC_NOT_CONFIGURED' })
      return
    }

    const callbackUrl = new URL(redirectUri)
    callbackUrl.search = new URL(request.url, 'http://internal').search
    const actor = await this.oidcService.finish(callbackUrl, transientToken)
    const tokens = await this.sessionService.issue(actor)

    response.clearCookie('its_oidc', { path: '/api/v2/auth/callback' })
    this.setSessionCookies(response, tokens)
    response.redirect(this.config.get('PUBLIC_WEB_URL', { infer: true }))
  }

  @Authenticated()
  @Get('me')
  public me(@Req() request: AuthenticatedRequest): {
    actor: NonNullable<AuthenticatedRequest['actor']>
  } {
    return { actor: request.actor! }
  }

  @Public()
  @Post('refresh')
  @HttpCode(204)
  public async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const refreshToken = readCookie(request, 'its_refresh')
    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    this.setSessionCookies(
      response,
      await this.sessionService.refresh(refreshToken)
    )
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  public async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const refreshToken = readCookie(request, 'its_refresh')
    if (refreshToken) await this.sessionService.revoke(refreshToken)
    response.clearCookie('its_access', { path: '/' })
    response.clearCookie('its_refresh', { path: '/api/v2/auth' })
  }

  private setSessionCookies(response: Response, tokens: SessionTokens): void {
    this.setAccessCookie(response, tokens.accessToken)
    response.cookie('its_refresh', tokens.refreshToken, {
      httpOnly: true,
      maxAge:
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/api/v2/auth',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
  }

  private setAccessCookie(response: Response, token: string): void {
    response.cookie('its_access', token, {
      httpOnly: true,
      maxAge:
        this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
  }
}
