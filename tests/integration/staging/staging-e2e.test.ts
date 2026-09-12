import { describe, it, expect } from "vitest";

const shouldRunStaging =
  process.env.RUN_STAGING_E2E_TESTS === "true" &&
  Boolean(process.env.OSLAVA_TEST_BASE_URL) &&
  Boolean(process.env.OSLAVA_TEST_ADMIN_JWT);

const baseUrl = process.env.OSLAVA_TEST_BASE_URL || "http://localhost:3000";
const adminJwt = process.env.OSLAVA_TEST_ADMIN_JWT || "";

// Disposable write test fixture IDs (STRICTLY REQUIRED for live mutation tests)
const testWorkerId = process.env.OSLAVA_TEST_WORKER_ID;
const testDraftEventId = process.env.OSLAVA_TEST_DRAFT_EVENT_ID;
const testInProgressEventId = process.env.OSLAVA_TEST_IN_PROGRESS_EVENT_ID;
const testCompletedEventId = process.env.OSLAVA_TEST_COMPLETED_EVENT_ID;

describe.skipIf(!shouldRunStaging)("Staging E2E: Real Supabase Integration Suite", () => {
  let createdSessionId: string;

  const authHeaders = {
    Authorization: `Bearer ${adminJwt}`,
    "Content-Type": "application/json",
  };

  it("authenticates caller and verifies ACTIVE ADMIN profile via /v1/auth/me", async () => {
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user_id).toBeDefined();
    expect(["ADMIN", "SUPER_ADMIN"]).toContain(data.role);
    expect(data.account_status).toBe("ACTIVE");
  });

  it("creates a new chat session via POST /v1/chat/sessions", async () => {
    const res = await fetch(`${baseUrl}/v1/chat/sessions`, {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session.id).toBeDefined();
    createdSessionId = data.session.id;
  });

  it("executes dashboard read turn via chatbot agent", async () => {
    const res = await fetch(
      `${baseUrl}/v1/chat/sessions/${createdSessionId}/messages`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ message: "What is our dashboard overview today?" }),
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response.type).toBe("message");
    expect(data.response.content).toBeTruthy();
  });

  it("executes worker search turn", async () => {
    const res = await fetch(
      `${baseUrl}/v1/chat/sessions/${createdSessionId}/messages`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ message: "Search active field workers" }),
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response.type).toBe("message");
  });

  it("executes event search turn", async () => {
    const res = await fetch(
      `${baseUrl}/v1/chat/sessions/${createdSessionId}/messages`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ message: "Show upcoming events" }),
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response.type).toBe("message");
  });

  describe("Staging Live Write Tests (Disposable Fixtures Only)", () => {
    const canTestWorkerWrite = Boolean(testWorkerId);
    const canTestPublishWrite = Boolean(testDraftEventId);

    it.skipIf(!canTestWorkerWrite)(
      "proposes category change and confirms on disposable test worker",
      async () => {
        // 1. Propose change via chat message
        const propRes = await fetch(
          `${baseUrl}/v1/chat/sessions/${createdSessionId}/messages`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              message: `Change worker ${testWorkerId} category because of staging validation run`,
            }),
          },
        );

        expect(propRes.status).toBe(200);
        const propData = await propRes.json();

        if (propData.response.type === "confirmation_required") {
          const actionId = propData.response.actionId;

          // 2. Confirm action
          const confRes = await fetch(
            `${baseUrl}/v1/chat/actions/${actionId}/confirm`,
            {
              method: "POST",
              headers: authHeaders,
            },
          );

          expect(confRes.status).toBe(200);
          const confData = await confRes.json();
          expect(confData.status).toBe("SUCCEEDED");
        }
      },
    );

    it.skipIf(!canTestPublishWrite)(
      "proposes publish on disposable draft event and cancels safely",
      async () => {
        const propRes = await fetch(
          `${baseUrl}/v1/chat/sessions/${createdSessionId}/messages`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              message: `Publish draft event ${testDraftEventId} because staging test verification`,
            }),
          },
        );

        expect(propRes.status).toBe(200);
        const propData = await propRes.json();

        if (propData.response.type === "confirmation_required") {
          const actionId = propData.response.actionId;

          // Cancel action safely
          const cancelRes = await fetch(
            `${baseUrl}/v1/chat/actions/${actionId}/cancel`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ reason: "Staging test verification cancel" }),
            },
          );

          expect(cancelRes.status).toBe(200);
          const cancelData = await cancelRes.json();
          expect(cancelData.status).toBe("CANCELLED");
        }
      },
    );
  });
});
