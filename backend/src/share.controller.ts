import { Body, Controller, Get, Post } from "@nestjs/common";
import { BuildShareCaptionDto, GenerateShareImageDto } from "./share.dto";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Controller()
export class ShareController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("share/preview")
  getSharePreview() {
    return this.store.getSharePreview();
  }

  @Post("share/generate-image")
  generateShareImage(@Body() _payload: GenerateShareImageDto) {
    return this.store.generateShareImage();
  }

  @Post("share/caption")
  buildShareCaption(@Body() payload: BuildShareCaptionDto) {
    return this.store.buildShareCaption({ ...payload });
  }
}
