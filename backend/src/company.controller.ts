import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CompanyService } from "./company.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get("company/cards")
  getCompanyCards() {
    return this.companyService.getCompanyCards();
  }

  @Get("company/panel")
  getCompanyPanel() {
    return this.companyService.getCompanyPanel();
  }

  @Post("company/actions/:actionId")
  executeCompanyAction(
    @Param("actionId") actionId: string,
    @Body() payload: Record<string, unknown>
  ) {
    return this.companyService.executeCompanyAction(actionId, payload);
  }
}
