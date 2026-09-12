import {
  closeEventInputSchema,
  CloseEventInput,
} from "../../actions/action.schemas.js";
import {
  actionProposalService,
  ActionProposalService,
} from "../../actions/action-proposal.service.js";
import { validateInput } from "../../guardrails/input-validation.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import type {
  ToolExecutionContext,
  WriteIntentResult,
  WriteIntentTool,
} from "../tool.types.js";

export class CloseEventTool implements WriteIntentTool<CloseEventInput> {
  public readonly name = "close_event";
  public readonly description =
    "Proposes closing a completed event and finalizing it. Requires an explicit operational reason (min 3 chars). Does NOT mutate data immediately; stages a pending action requiring explicit admin confirmation.";
  public readonly inputSchema = closeEventInputSchema;
  public readonly category = "WRITE_INTENT" as const;

  constructor(
    private readonly proposalService: ActionProposalService = actionProposalService,
  ) {}

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<WriteIntentResult>> {
    const input = validateInput(this.inputSchema, rawInput);
    if (!context.sessionId) {
      throw new Error("sessionId is required to propose a write action.");
    }

    const action = await this.proposalService.proposeAction({
      sessionId: context.sessionId,
      userId: context.actor.userId,
      actionType: "close_event",
      args: input,
      gateway: context.gateway,
      createdRequestId: context.requestId,
    });

    return toolSuccess({
      action,
      confirmationRequired: true,
    });
  }
}
