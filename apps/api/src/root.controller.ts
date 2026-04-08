import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root() {
    return {
      status: 'ok',
      name: 'Ruya Platform API',
      version: '1.0.0',
    };
  }
}
