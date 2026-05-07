import { Controller, Get, Param, Query } from "@nestjs/common";
import { PolicyCatalogService } from "./policy-catalog.service";

@Controller()
export class PolicyController {
  constructor(private readonly catalog: PolicyCatalogService) {}

  @Get("policies")
  async listPolicies(
    @Query("region") region?: string,
    @Query("limit") limit?: string
  ) {
    const policies = await this.catalog.listPolicies({
      activeOnly: true,
      region: String(region || "").trim(),
      limit: Number.parseInt(String(limit || "50"), 10) || 50
    });

    return {
      ok: true,
      policies
    };
  }

  @Get("policies/:id")
  async getPolicy(@Param("id") id: string) {
    const policy = await this.catalog.getPolicy(id);
    return {
      ok: !!policy,
      policy
    };
  }
}
