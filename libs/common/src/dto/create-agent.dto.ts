import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  agentType?: string;

  @IsObject()
  @IsOptional()
  uiConfig?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  aiConfig?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  knowledgeSourceSlugs?: string[];
}
