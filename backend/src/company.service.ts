import { Injectable } from "@nestjs/common";
import { cloneJson } from "./shared/json";
import { DEFAULT_COMPANY_CARDS } from "./shared/catalog";

@Injectable()
export class CompanyService {
  getCompanyCards() {
    return cloneJson(DEFAULT_COMPANY_CARDS);
  }

  getCompanyPanel() {
    return {
      title: "我的公司",
      cards: this.getCompanyCards()
    };
  }

  executeCompanyAction(actionId: string, payload: Record<string, unknown>) {
    return {
      success: true,
      actionId,
      payload,
      executedAt: new Date().toISOString()
    };
  }
}
