import { Injectable, Logger } from "@nestjs/common";
import Dysmsapi20170525, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import * as $Util from "@alicloud/tea-util";
import { getAppConfig } from "../shared/app-config";

export type VerificationSmsResult = {
  ok: boolean;
  dryRun: boolean;
  provider: "aliyun";
  providerBizId?: string;
  providerRequestId?: string;
  providerCode?: string;
  providerMessage?: string;
};

type SendVerificationCodeInput = {
  phone: string;
  code: string;
  outId: string;
};

@Injectable()
export class AliyunSmsService {
  private readonly logger = new Logger(AliyunSmsService.name);
  private readonly config = getAppConfig();
  private client: Dysmsapi20170525 | null = null;

  isReady() {
    if (!this.config.isReleaseLike && (this.config.smsDryRun || !this.config.smsEnabled)) {
      return true;
    }

    return !!(
      this.config.smsEnabled &&
      this.config.aliyunSmsAccessKeyId &&
      this.config.aliyunSmsAccessKeySecret &&
      this.config.aliyunSmsSignName &&
      this.config.aliyunSmsTemplateCode
    );
  }

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<VerificationSmsResult> {
    if (!this.config.isReleaseLike && (this.config.smsDryRun || !this.config.smsEnabled)) {
      this.logger.warn(`sms local dry-run enabled; skip provider send outId=${input.outId}`);
      return {
        ok: true,
        dryRun: true,
        provider: "aliyun",
        providerBizId: `dry-run-${input.outId}`,
        providerCode: "OK",
        providerMessage: "DRY_RUN"
      };
    }

    const client = this.getClient();
    const templateParam = JSON.stringify({
      [this.config.aliyunSmsTemplateParamName || "code"]: input.code
    });
    const request = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: input.phone,
      signName: this.config.aliyunSmsSignName,
      templateCode: this.config.aliyunSmsTemplateCode,
      templateParam,
      outId: input.outId
    });

    try {
      const response = await client.sendSmsWithOptions(request, new $Util.RuntimeOptions({}));
      const body = response.body;
      const providerCode = String(body?.code || "");
      return {
        ok: providerCode === "OK",
        dryRun: false,
        provider: "aliyun",
        providerBizId: body?.bizId,
        providerRequestId: body?.requestId,
        providerCode,
        providerMessage: body?.message
      };
    } catch (error) {
      const detail = this.extractProviderError(error);
      this.logger.warn(
        `aliyun sms send failed outId=${input.outId} code=${detail.providerCode || "UNKNOWN"} message=${detail.providerMessage || ""}`
      );
      return {
        ok: false,
        dryRun: false,
        provider: "aliyun",
        ...detail
      };
    }
  }

  private getClient() {
    if (this.client) {
      return this.client;
    }

    const openApiConfig = new $OpenApi.Config({
      accessKeyId: this.config.aliyunSmsAccessKeyId,
      accessKeySecret: this.config.aliyunSmsAccessKeySecret
    });
    openApiConfig.endpoint = this.config.aliyunSmsEndpoint || "dysmsapi.aliyuncs.com";
    this.client = new Dysmsapi20170525(openApiConfig);
    return this.client;
  }

  private extractProviderError(error: unknown) {
    const payload = error as {
      message?: unknown;
      data?: {
        Code?: unknown;
        code?: unknown;
        Message?: unknown;
        message?: unknown;
        RequestId?: unknown;
        requestId?: unknown;
      };
    };
    const data = payload && typeof payload.data === "object" ? payload.data : undefined;
    const providerCode = String(data?.Code || data?.code || "");
    const providerMessage = String(data?.Message || data?.message || payload?.message || "");
    const providerRequestId = String(data?.RequestId || data?.requestId || "");

    return {
      ...(providerCode ? { providerCode } : {}),
      ...(providerMessage ? { providerMessage } : {}),
      ...(providerRequestId ? { providerRequestId } : {})
    };
  }
}
