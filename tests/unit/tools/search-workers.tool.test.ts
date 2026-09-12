import { describe, it, expect, vi } from "vitest";
import { SearchWorkersTool } from "../../../src/tools/reads/search-workers.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { WorkerSearchResultDto } from "../../../src/domain/worker.types.js";
import { InvalidInputError } from "../../../src/domain/errors.js";

describe("SearchWorkersTool", () => {
  const tool = new SearchWorkersTool();

  it("passes search query, category, and account status to gateway", async () => {
    const mockWorkers: WorkerSearchResultDto[] = [
      {
        worker_id: "usr-w-1",
        worker_number: 101,
        full_name: "Alice Walker",
        category: "A",
        account_status: "ACTIVE",
        reliability_score: 95.0,
      },
    ];

    const mockGateway = {
      searchWorkers: vi.fn().mockResolvedValue(mockWorkers),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_search_w",
      },
      gateway: mockGateway,
      requestId: "req_search_w",
    };

    const result = await tool.execute(context, {
      query: "Alice",
      category: "A",
      account_status: "ACTIVE",
      limit: 15,
      offset: 0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.worker_id).toBe("usr-w-1");
    }

    expect(mockGateway.searchWorkers).toHaveBeenCalledWith({
      query: "Alice",
      category: "A",
      account_status: "ACTIVE",
      limit: 15,
      offset: 0,
    });
  });

  it("applies default limit of 10 and offset of 0", async () => {
    const mockGateway = {
      searchWorkers: vi.fn().mockResolvedValue([]),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_search_w",
      },
      gateway: mockGateway,
      requestId: "req_search_w",
    };

    await tool.execute(context, {});
    expect(mockGateway.searchWorkers).toHaveBeenCalledWith({
      query: undefined,
      category: undefined,
      account_status: undefined,
      limit: 10,
      offset: 0,
    });
  });

  it("rejects limits greater than 25", async () => {
    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_search_w",
      },
      gateway: {} as OslavaGateway,
      requestId: "req_search_w",
    };

    await expect(
      tool.execute(context, { limit: 50 }),
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects negative offsets", async () => {
    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_search_w",
      },
      gateway: {} as OslavaGateway,
      requestId: "req_search_w",
    };

    await expect(
      tool.execute(context, { offset: -5 }),
    ).rejects.toThrow(InvalidInputError);
  });
});
