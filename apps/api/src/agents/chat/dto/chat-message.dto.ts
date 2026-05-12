import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4096)
  content!: string;
}

export class ChatMessageDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages!: MessageDto[];
}
