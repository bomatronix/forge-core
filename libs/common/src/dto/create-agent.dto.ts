import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsObject()
  @IsOptional()
  uiConfig?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  aiConfig?: Record<string, unknown>;
}
