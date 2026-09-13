import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

// 1. Ensure dev CLI mode & memory persistence before anything else loads
process.env.DEV_CLI_MODE = "true";
process.env.CHAT_PERSISTENCE_MODE = "memory";

dotenv.config();

import { getConfig } from "../config/env.js";
import { agentService } from "../ai/agent.service.js";
import { conversationService } from "../context/conversation.service.js";
import { actionConfirmationService } from "../actions/action-confirmation.service.js";
import { MockOslavaGateway } from "./mock-oslava.gateway.js";
import type { ActorContext } from "../auth/actor-context.js";

async function runCli(): Promise<void> {
  let config;
  try {
    config = getConfig();
  } catch (err: any) {
    console.error(`\n[Config Error] ${err.message}\n`);
    process.exit(1);
  }

  if (!config.GROQ_API_KEY) {
    console.error("\n==================================================");
    console.error("GROQ_API_KEY is required to run the chat CLI.");
    console.error("Please set GROQ_API_KEY in your environment or .env file:");
    console.error('  $env:GROQ_API_KEY = "gsk_..." (PowerShell)');
    console.error('  export GROQ_API_KEY="gsk_..." (Bash)');
    console.error("==================================================\n");
    process.exit(1);
  }

  const DEV_ACTOR: ActorContext = {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Local Test Admin",
    workerNumber: 999,
    accessToken: "dev-cli-mock-jwt",
    requestId: "dev-cli-init",
  };

  const gateway = new MockOslavaGateway();
  let currentSession = await conversationService.createSession(
    DEV_ACTOR.userId,
  );

  console.log("--------------------------------------------------");
  console.log("Oslava Admin AI — Local Logic & Confirmation Test Mode");
  console.log(`Model: ${config.GROQ_MODEL}`);
  console.log("Persistence: memory");
  console.log("Oslava data: mock");
  console.log("Type /help for commands");
  console.log("Type /exit to quit");
  console.log("--------------------------------------------------\n");

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      let line: string;
      try {
        line = await rl.question("You > ");
      } catch {
        break;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed === "/exit") {
        console.log("Goodbye!");
        break;
      }

      if (trimmed === "/help") {
        console.log("\nCommands:");
        console.log("  /help              - Show available commands");
        console.log("  /state             - Show current conversation entity context");
        console.log("  /pending           - Show active pending action awaiting confirmation");
        console.log("  /confirm [id]      - Confirm and execute pending action");
        console.log("  /cancel [id]       - Cancel pending action");
        console.log("  /reset             - Reset session and restore sample mock data");
        console.log("  /exit              - Quit the chat\n");
        continue;
      }

      if (trimmed === "/reset") {
        gateway.resetMockData();
        currentSession = await conversationService.createSession(
          DEV_ACTOR.userId,
        );
        console.log(
          "\nConversation and mock gateway reset. Started fresh session.\n",
        );
        continue;
      }

      if (trimmed === "/state") {
        const state = await conversationService.getState(currentSession.id);
        console.log("\n--- Safe Session State ---");
        console.log(
          `current_worker: ${state?.currentWorkerLabel ?? "none"} (${state?.currentWorkerId ?? "none"})`,
        );
        console.log(
          `current_event:  ${state?.currentEventLabel ?? "none"} (${state?.currentEventId ?? "none"})`,
        );
        console.log(
          `recent worker result count: ${state?.recentWorkerResults?.length ?? 0}`,
        );
        console.log(
          `recent event result count:  ${state?.recentEventResults?.length ?? 0}`,
        );
        console.log("---------------------------\n");
        continue;
      }

      if (trimmed === "/pending") {
        const pending =
          await actionConfirmationService.getActivePendingActionForSession(
            currentSession.id,
          );
        if (!pending) {
          console.log("\nNo pending actions awaiting confirmation in this session.\n");
        } else {
          console.log("\n==================================================");
          console.log("[ACTIVE PENDING ACTION]");
          console.log(`Action ID:   ${pending.id}`);
          console.log(`Type:        ${pending.actionType}`);
          console.log(`Status:      ${pending.status}`);
          console.log(`Expires At:  ${new Date(pending.expiresAt).toISOString()}`);
          console.log("Summary:");
          console.dir(pending.displaySummary, { depth: null });
          console.log("--------------------------------------------------");
          console.log(`To execute:  /confirm ${pending.id}  (or simply /confirm)`);
          console.log(`To cancel:   /cancel ${pending.id}   (or simply /cancel)`);
          console.log("==================================================\n");
        }
        continue;
      }

      if (trimmed.startsWith("/confirm")) {
        const parts = trimmed.split(/\s+/);
        let actionId = parts[1];
        if (!actionId) {
          const pending =
            await actionConfirmationService.getActivePendingActionForSession(
              currentSession.id,
            );
          if (!pending) {
            console.log("\nNo active pending action found to confirm.\n");
            continue;
          }
          actionId = pending.id;
        }

        try {
          const confirmRequestId = randomUUID();
          const result = await actionConfirmationService.confirmAction({
            actionId,
            userId: DEV_ACTOR.userId,
            gateway,
            requestId: confirmRequestId,
          });

          console.log("\n==================================================");
          console.log(`ACTION CONFIRMED & EXECUTED`);
          console.log(`Action ID: ${result.actionId}`);
          console.log(`Type:      ${result.actionType}`);
          console.log(`Status:    ${result.status}`);
          console.log("Result Summary:");
          console.dir(result.resultSummary, { depth: null });
          console.log("==================================================\n");
        } catch (err: any) {
          console.log(`\n[Execution Error]: ${err.message || String(err)}\n`);
        }
        continue;
      }

      if (trimmed.startsWith("/cancel")) {
        const parts = trimmed.split(/\s+/);
        let actionId = parts[1];
        if (!actionId) {
          const pending =
            await actionConfirmationService.getActivePendingActionForSession(
              currentSession.id,
            );
          if (!pending) {
            console.log("\nNo active pending action found to cancel.\n");
            continue;
          }
          actionId = pending.id;
        }

        try {
          const result = await actionConfirmationService.cancelAction({
            actionId,
            userId: DEV_ACTOR.userId,
            reason: "Cancelled by admin via CLI",
          });

          console.log("\n==================================================");
          console.log(`ACTION CANCELLED`);
          console.log(`Action ID: ${result.actionId}`);
          console.log(`Type:      ${result.actionType}`);
          console.log(`Status:    ${result.status}`);
          console.log("==================================================\n");
        } catch (err: any) {
          console.log(`\n[Cancel Error]: ${err.message || String(err)}\n`);
        }
        continue;
      }

      const turnRequestId = randomUUID();
      try {
        process.stdout.write("\nAssistant > ");
        const turnResult = await agentService.executeUserTurn({
          sessionId: currentSession.id,
          userPrompt: trimmed,
          requestId: turnRequestId,
          gateway,
          actor: { ...DEV_ACTOR, requestId: turnRequestId },
        });

        if (turnResult.response.type === "message") {
          console.log(turnResult.response.content);
        } else if (turnResult.response.type === "entity_selection_required") {
          console.log(turnResult.response.content);
          for (let i = 0; i < turnResult.response.selection.options.length; i++) {
            const opt = turnResult.response.selection.options[i];
            console.log(`  ${i + 1}. ${opt.display_name} (${opt.subtitle}) [${opt.id}]`);
          }
        } else if (turnResult.response.type === "confirmation_required") {
          console.log(turnResult.response.content);
          console.log("\n--------------------------------------------------");
          console.log("[CONFIRMATION CARD]");
          console.log(`Action ID:   ${turnResult.response.action.id}`);
          console.log(`Action Type: ${turnResult.response.action.type}`);
          console.log(`Expires At:  ${turnResult.response.action.expires_at}`);
          console.log("Summary:");
          console.dir(turnResult.response.action.summary, { depth: null });
          console.log("--------------------------------------------------");
          console.log(
            `To execute: /confirm ${turnResult.response.action.id} (or /confirm)`,
          );
          console.log(
            `To cancel:  /cancel ${turnResult.response.action.id} (or /cancel)`,
          );
          console.log("--------------------------------------------------");
        }
        console.log();
      } catch (err: any) {
        console.log(`\n[Error]: ${err.message || String(err)}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

// Automatically start if executed directly
runCli().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
