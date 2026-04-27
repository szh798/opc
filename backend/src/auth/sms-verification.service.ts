import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../shared/prisma.service";
import { getAppConfig } from "../shared/app-config";
import { AliyunSmsService, VerificationSmsResult } from "./aliyun-sms.service";

const SENDABLE_STATUSES = ["sent", "dry_run"];
const DEFAULT_PURPOSE = "login";

type RequestMetadata = {
  requestIp?: string;
  userAgent?: string;
};

type SendCodePayload = {
  phone?: string;
  purpose?: string;
};

type VerifyCodePayload = SendCodePayload & {
  code?: string;
};

export type VerifiedSmsCode = {
  phone: string;
  phoneHash: string;
  phoneMasked: string;
  purpose: string;
};

@Injectable()
export class SmsVerificationService {
  private readonly config = getAppConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliyunSmsService: AliyunSmsService
  ) {}

  async sendCode(payload: SendCodePayload, metadata: RequestMetadata = {}) {
    if (!this.aliyunSmsService.isReady()) {
      throw new ServiceUnavailableException({
        code: "SMS_PROVIDER_NOT_CONFIGURED",
        message: "短信服务尚未配置"
      });
    }

    const phone = normalizePhoneNumber(payload.phone);
    const purpose = normalizePurpose(payload.purpose);
    const phoneHash = this.hash(`phone:${phone}`);
    const now = new Date();
    const cooldownSince = new Date(now.getTime() - this.config.smsCodeCooldownSeconds * 1000);
    const hourlySince = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.smsVerificationCode.findFirst({
      where: {
        phoneHash,
        purpose,
        sendStatus: { in: SENDABLE_STATUSES },
        createdAt: { gte: cooldownSince }
      },
      orderBy: { createdAt: "desc" }
    });

    if (recent) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (recent.createdAt.getTime() + this.config.smsCodeCooldownSeconds * 1000 - now.getTime()) /
            1000
        )
      );
      throw new HttpException(
        {
          code: "SMS_CODE_COOLDOWN",
          message: `验证码发送太频繁，请 ${retryAfterSeconds} 秒后再试`,
          retryAfterSeconds
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const hourlyCount = await this.prisma.smsVerificationCode.count({
      where: {
        phoneHash,
        purpose,
        sendStatus: { in: SENDABLE_STATUSES },
        createdAt: { gte: hourlySince }
      }
    });

    if (hourlyCount >= this.config.smsCodeMaxPerPhonePerHour) {
      throw new HttpException(
        {
          code: "SMS_CODE_HOURLY_LIMIT",
          message: "该手机号验证码发送次数已达上限，请稍后再试"
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const code = generateNumericCode(this.config.smsCodeDigits);
    const expiresAt = new Date(now.getTime() + this.config.smsCodeTtlSeconds * 1000);
    const record = await this.prisma.smsVerificationCode.create({
      data: {
        phoneHash,
        phoneMasked: maskPhone(phone),
        purpose,
        codeHash: this.hash(`code:${phone}:${purpose}:${code}`),
        expiresAt,
        requestIp: truncate(metadata.requestIp, 128),
        userAgent: truncate(metadata.userAgent, 512)
      }
    });

    const result = await this.aliyunSmsService.sendVerificationCode({
      phone,
      code,
      outId: record.id
    });
    await this.recordProviderResult(record.id, result);

    if (!result.ok) {
      throw new HttpException(
        {
          code: "ALIYUN_SMS_SEND_FAILED",
          message: "验证码发送失败，请稍后重试"
        },
        HttpStatus.BAD_GATEWAY
      );
    }

    return {
      success: true,
      maskedPhone: maskPhone(phone),
      expiresIn: this.config.smsCodeTtlSeconds,
      cooldownSeconds: this.config.smsCodeCooldownSeconds,
      ...(result.dryRun && !this.config.isReleaseLike ? { devCode: code } : {})
    };
  }

  async verifyCode(payload: VerifyCodePayload) {
    const verified = await this.consumeCode(payload);

    return {
      success: true,
      verified: true,
      maskedPhone: verified.phoneMasked,
      purpose: verified.purpose
    };
  }

  async consumeLoginCode(payload: VerifyCodePayload) {
    return this.consumeCode({
      phone: payload.phone,
      code: payload.code,
      purpose: "login"
    });
  }

  private async consumeCode(payload: VerifyCodePayload): Promise<VerifiedSmsCode> {
    const phone = normalizePhoneNumber(payload.phone);
    const purpose = normalizePurpose(payload.purpose);
    const code = String(payload.code || "").trim();

    if (!/^\d{4,8}$/.test(code)) {
      throwInvalidOrExpiredCode();
    }

    const phoneHash = this.hash(`phone:${phone}`);
    const record = await this.prisma.smsVerificationCode.findFirst({
      where: {
        phoneHash,
        purpose,
        sendStatus: { in: SENDABLE_STATUSES },
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!record) {
      throwInvalidOrExpiredCode();
    }

    if (record.attempts >= this.config.smsCodeMaxVerifyAttempts) {
      throw new HttpException(
        {
          code: "SMS_CODE_ATTEMPT_LIMIT",
          message: "验证码错误次数过多，请重新获取"
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const isValid = safeEqual(record.codeHash, this.hash(`code:${phone}:${purpose}:${code}`));
    if (!isValid) {
      await this.prisma.smsVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } }
      });
      throwInvalidOrExpiredCode();
    }

    await this.prisma.smsVerificationCode.update({
      where: { id: record.id },
      data: {
        attempts: { increment: 1 },
        consumedAt: new Date()
      }
    });

    return {
      phone,
      phoneHash,
      phoneMasked: record.phoneMasked,
      purpose
    };
  }

  private async recordProviderResult(recordId: string, result: VerificationSmsResult) {
    await this.prisma.smsVerificationCode.update({
      where: { id: recordId },
      data: {
        sendStatus: result.ok ? (result.dryRun ? "dry_run" : "sent") : "failed",
        provider: result.provider,
        providerBizId: truncate(result.providerBizId, 128),
        providerRequestId: truncate(result.providerRequestId, 128),
        providerCode: truncate(result.providerCode, 64),
        providerMessage: truncate(result.providerMessage, 512)
      }
    });
  }

  private hash(value: string) {
    return createHmac("sha256", this.config.smsCodeHashSecret || this.config.jwtSecret)
      .update(value)
      .digest("hex");
  }
}

function normalizePhoneNumber(raw: unknown) {
  const compact = String(raw || "").replace(/[\s-]/g, "");
  const withoutCountryCode = compact
    .replace(/^\+86/, "")
    .replace(/^0086/, "")
    .replace(/^86(?=1\d{10}$)/, "");

  if (!/^1[3-9]\d{9}$/.test(withoutCountryCode)) {
    throw new BadRequestException({
      code: "INVALID_PHONE_NUMBER",
      message: "请输入有效的中国大陆手机号"
    });
  }

  return withoutCountryCode;
}

function normalizePurpose(raw: unknown) {
  const purpose = String(raw || DEFAULT_PURPOSE).trim() || DEFAULT_PURPOSE;
  if (purpose !== "login" && purpose !== "bind_phone") {
    throw new BadRequestException({
      code: "INVALID_SMS_PURPOSE",
      message: "验证码用途无效"
    });
  }

  return purpose;
}

function generateNumericCode(digits: number) {
  const normalizedDigits = Math.min(8, Math.max(4, digits || 6));
  const max = 10 ** normalizedDigits;
  return randomInt(0, max).toString().padStart(normalizedDigits, "0");
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function truncate(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function throwInvalidOrExpiredCode(): never {
  throw new BadRequestException({
    code: "SMS_CODE_INVALID_OR_EXPIRED",
    message: "验证码无效或已过期"
  });
}
