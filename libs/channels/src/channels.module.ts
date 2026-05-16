import { Module } from '@nestjs/common';
import { CoreModule } from '@forge-core/core';
import { ChannelsService } from './channels.service';
import { ChannelConversationService } from './conversation.service';

// NOTE: InboundService is NOT registered here because it requires app-layer
// injection tokens (INBOUND_AGENTS_SERVICE etc.) that are only wired in the
// consuming app module (AppChannelsModule).
@Module({
  imports: [CoreModule],
  providers: [ChannelsService, ChannelConversationService],
  exports: [ChannelsService, ChannelConversationService],
})
export class ChannelsModule {}
