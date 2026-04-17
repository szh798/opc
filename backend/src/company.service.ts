import { Injectable } from "@nestjs/common";

@Injectable()
export class CompanyService {
  getCompanyCards() {
    return [];
  }

  getCompanyPanel() {
    return {
      title: "我的公司",
      cards: [],
      status: "coming_soon"
    };
  }

  executeCompanyAction(actionId: string, payload: Record<string, unknown>) {
    return {
      success: false,
      status: "coming_soon",
      actionId,
      payload,
      executedAt: new Date().toISOString()
    };
  }
}
