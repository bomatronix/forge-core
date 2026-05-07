import { IsIn } from 'class-validator';
import type { AgentStatus } from '../interfaces/agent.interface';

export const AGENT_STATUSES: AgentStatus[] = ['draft', 'live', 'paused'];

export class UpdateStatusDto {
  @IsIn(AGENT_STATUSES)
  status!: AgentStatus;
}
