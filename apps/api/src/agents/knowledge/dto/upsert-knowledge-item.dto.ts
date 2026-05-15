import { PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const KNOWLEDGE_ITEM_TYPES = ['qa', 'document', 'shopify_product'] as const;

export type KnowledgeItemType = (typeof KNOWLEDGE_ITEM_TYPES)[number];

export class UpsertKnowledgeItemDto {
  @IsIn(KNOWLEDGE_ITEM_TYPES)
  type!: KnowledgeItemType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  knowledgeSourceOptionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateKnowledgeItemDto extends PartialType(UpsertKnowledgeItemDto) {}
