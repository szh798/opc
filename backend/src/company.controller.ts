import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Controller()
export class CompanyController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("company/cards")
  getCompanyCards() {
    return this.store.getCompanyCards();
  }

  @Get("company/panel")
  getCompanyPanel() {
    return this.store.getCompanyPanel();
  }

  @Post("company/actions/:actionId")
  executeCompanyAction(
    @Param("actionId") actionId: string,
    @Body() payload: Record<string, unknown>
  ) {
    return this.store.executeCompanyAction(actionId, payload);
  }
}
