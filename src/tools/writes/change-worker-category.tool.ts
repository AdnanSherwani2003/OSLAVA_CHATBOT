import {
  changeWorkerCategoryInputSchema,
  ChangeWorkerCategoryInput,
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

export class ChangeWorkerCategoryTool
  implements WriteIntentTool<ChangeWorkerCategoryInput>
{
  public readonly name = "change_worker_category";
  public readonly description =
    "Proposes changing a worker's tier/category by exactly one step (A <-> B <-> C <-> F). Requires an explicit operational reason (min 3 chars). Does NOT mutate data immediately; stages a pending action requiring explicit admin confirmation.";
  public readonly inputSchema = changeWorkerCategoryInputSchema;
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
      actionType: "change_worker_category",
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
