import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '@forge-core/core';
import { ConversationsService } from './conversations.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('agents/:id/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(
    @CurrentTenant() orgId: string,
    @Param('id') agentId: string,
  ) {
    return this.conversationsService.create(orgId, agentId);
  }

  @Get()
  findAll(
    @CurrentTenant() orgId: string,
    @Param('id') agentId: string,
    @Query('page') page?: string,
  ) {
    return this.conversationsService.findAll(orgId, agentId, page ? parseInt(page, 10) : 1);
  }

  @Get(':convId')
  findOne(
    @CurrentTenant() orgId: string,
    @Param('id') agentId: string,
    @Param('convId') convId: string,
  ) {
    return this.conversationsService.findOne(orgId, agentId, convId);
  }

  @Post(':convId/chat')
  chat(
    @CurrentTenant() orgId: string,
    @Param('id') agentId: string,
    @Param('convId') convId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.conversationsService.chat(orgId, agentId, convId, dto.message);
  }

  @Delete(':convId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() orgId: string,
    @Param('id') agentId: string,
    @Param('convId') convId: string,
  ) {
    return this.conversationsService.remove(orgId, agentId, convId);
  }
}
