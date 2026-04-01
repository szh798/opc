import { Body, Controller, Get, Patch } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";
import { UpdateUserProfileDto } from "./user.dto";

@Controller()
export class UserController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("user")
  getCurrentUser() {
    return this.store.getUser();
  }

  @Patch("user/profile")
  updateCurrentUser(@Body() payload: UpdateUserProfileDto) {
    return this.store.updateUser({ ...payload });
  }

  @Get("user/sidebar")
  getUserSidebar() {
    return this.store.getSidebarPayload();
  }
}
