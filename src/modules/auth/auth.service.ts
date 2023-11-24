import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '@/modules/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/shared/redis/redis.service';
import * as svgCaptcha from 'svg-captcha';
import { ApiResponseCodeEnum } from '@/helper/enums';
import { SessionInfo } from 'express-session';
import { JwtPayload } from 'passport-jwt';
import { UserLogoutDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 账号密码校验用户
   * @date 2023/8/30 - 16:39:05
   * @author Peng
   *
   * @param {string} userName
   * @param {string} password
   * @returns {*}
   */
  validateUser(userName: string, password: string) {
    return this.userService.findOneByUserNameAndPwd(userName, password);
  }

  /**
   * 生成accessToken
   * @date 2023/9/1 - 14:52:01
   * @author Peng
   *
   * @async
   * @param {number} id
   * @param {string} userName
   * @returns {unknown}
   */
  async generateAccessToken(id: number, userName: string) {
    return `${await this.jwtService.signAsync({
      sub: id,
      userName,
    })}`;
  }

  /**
   * 校验token
   * @date 2023/9/1 - 14:52:20
   * @author Peng
   *
   * @async
   * @param {string} token
   * @returns {Promise<JwtPayload>}
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
      });
    } catch (e) {
      throw new UnauthorizedException({
        e,
        code: ApiResponseCodeEnum.UNAUTHORIZED_ACCESS_TOKEN,
        msg: '身份认证信息失效，请重新认证！',
      });
    }
  }

  /**
   * 生成refreshToken
   * @date 2023/9/7 - 15:26:40
   * @author Peng
   *
   * @async
   * @param {number} id
   * @returns {unknown}
   */
  async generateRefreshToken(id: number) {
    return await this.jwtService.signAsync(
      { sub: id },
      {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
        expiresIn: this.configService.get<number>('JWT_REFRESH_TOKEN_EXPIRES_IN'),
      },
    );
  }

  /**
   * 验证 refresh_token
   * @date 2023/9/7 - 18:04:51
   * @author Peng
   *
   * @async
   * @param {string} token
   * @returns {Promise<JwtPayload | null>}
   */
  async verifyRefresToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      });
    } catch (e) {
      throw new UnauthorizedException({
        e,
        code: ApiResponseCodeEnum.UNAUTHORIZED_REFRESH_TOKEN,
        msg: '登录信息已过期，请重新登录！',
      });
    }
  }

  /**
   * 解析 token 信息
   * @date 2023/9/3 - 21:39:01
   * @author Peng
   *
   * @async
   * @param {string} token
   * @returns {unknown}
   */
  async parseToken(token: string): Promise<JwtPayload> {
    return await this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
    });
  }

  /**
   * 设置 token到redis
   * @date 2023/9/1 - 14:52:29
   * @author Peng
   *
   * @async
   * @param {string} key
   * @param {string} token
   * @returns {*}
   */
  async setTokenToRedis(key: string, token: string) {
    await this.redis.setCache(
      key,
      token,
      this.configService.get<number>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
    );
  }

  /**
   * 获取 redis token key
   * @date 2023/9/1 - 14:52:48
   * @author Peng
   *
   * @param {number} id
   * @param {string} userName
   * @returns {string}
   */
  redisTokenKeyStr(id: number, userName: string) {
    return `user_token:${id}-${userName}`;
  }

  /**
   * 获取Redis中的token
   * @date 2023/9/3 - 22:05:26
   * @author Peng
   *
   * @async
   * @param {number} id
   * @param {string} userName
   * @returns {Promise<string>}
   */
  async getRedisToken(id: number, userName: string): Promise<string> {
    return await this.redis.getCache(this.redisTokenKeyStr(id, userName));
  }

  private rn(min, max) {
    return parseInt(Math.random() * (max - min) + min);
  }

  private rc(min, max, opacity?: number) {
    let r = this.rn(min, max);
    let g = this.rn(min, max);
    let b = this.rn(min, max);
    return `rgba(${r},${g},${b},${opacity || 1})`;
  }

  /**
   * 生成验证码
   * @date 2023/9/1 - 15:14:05
   * @author Peng
   *
   * @returns {*}
   */
  generateCaptcha(phone: boolean) {
    // createMathExpr 创建一个 简单加法的 svg 验证码
    return svgCaptcha.create({
      width: phone ? 80 : 135,
      height: 40,
      size: 4, // 验证码长度
      ignoreChars: '0OlI', // 排除字符
      noise: 2, // 干扰线
      // color: false, // 验证码字符颜色
      background: this.rc(180, 230), // 验证码背景颜色
      // background: "#cc9966" // 验证码背景颜色
    });
  }

  /**
   * 校验验证码
   * @date 2023/9/1 - 16:42:08
   * @author Peng
   *
   * @param {string} captcha
   * @param {SessionInfo} session
   */
  verifyCaptcha(captcha: string, session: SessionInfo) {
    if (!session?.captcha)
      throw new UnauthorizedException({
        code: ApiResponseCodeEnum.UNAUTHORIZED_NOTFOUND_SESSION,
        msg: '无法获取到Session信息!请确保请求携带cookie',
      });

    if (!session?.expirationTimestamp || Date.now() > session.expirationTimestamp)
      throw new UnauthorizedException({
        code: ApiResponseCodeEnum.UNAUTHORIZED_CAPTCHA_EXPIRE,
        msg: '验证码已过期!',
      });

    if (captcha.toLocaleLowerCase() !== session.captcha.toLocaleLowerCase())
      throw new UnauthorizedException({
        code: ApiResponseCodeEnum.UNAUTHORIZED_CAPTCHA_ERROR,
        msg: '验证码输入有误!',
      });
  }

  /**
   * 通过用户ID和用户名查询用户
   * @date 2023/9/3 - 16:33:51
   * @author Peng
   *
   * @param {number} id
   * @param {string} userName
   * @returns {*}
   */
  validateUserByIdAndName(id: number, userName: string) {
    return this.userService.findOneByUserIdAndUserName(id, userName);
  }

  /**
   * 刷新token
   * @date 2023/9/3 - 23:50:11
   * @author Peng
   *
   * @async
   * @param {number} id
   * @param {string} userName
   * @param {Response} res
   * @returns {*}
   */
  async refreshAccessToken(id: number, userName: string): Promise<string> {
    try {
      // 生成新的token
      const token = await this.generateAccessToken(id, userName);
      // 将新的token 设置到 redis中
      await this.setTokenToRedis(this.redisTokenKeyStr(id, userName), token);
      return token;
    } catch (e) {
      throw new InternalServerErrorException({
        code: ApiResponseCodeEnum.INTERNALSERVERERROR_REDIS,
        e,
      });
    }
  }

  /**
   * 获取token的TTL
   * @date 2023/9/4 - 14:10:25
   * @author Peng
   *
   * @async
   * @param {string} token
   * @returns {unknown}
   */
  async getTokenTTL(key: string) {
    return await this.redis.getTTL(key);
  }

  async findUserById(id: number) {
    return await this.userService.findOneById(id);
  }

  async clearUserToken(data: UserLogoutDto) {
    const { id, userName } = data;
    const key = this.redisTokenKeyStr(id, userName);
    const val = await this.redis.clearCatch(key);
    console.log('val ------', val);
  }
}
