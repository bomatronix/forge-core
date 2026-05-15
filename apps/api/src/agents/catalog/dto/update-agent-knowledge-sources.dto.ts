import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateAgentKnowledgeSourcesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceSlugs?: string[];
}
