import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, api } from "../src/services/apiClient";

async function withFetch(
  mockFetch: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("API errors preserve status and code without exposing server messages", async () => {
  await withFetch(
    async () =>
      new Response(
        JSON.stringify({ error: "private backend detail", code: "BAD_INPUT" }),
        { status: 400 },
      ),
    async () => {
      await assert.rejects(api.getMe(true), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "BAD_INPUT");
        assert.equal(
          error.message,
          "The request could not be completed. Check the entered values and try again.",
        );
        assert.ok(!error.message.includes("private backend detail"));
        return true;
      });
    },
  );
});

test("malformed and server-error responses use safe API errors", async () => {
  await withFetch(
    async () => new Response("database secret sentinel", { status: 503 }),
    async () => {
      await assert.rejects(api.getMe(true), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 503);
        assert.equal(error.code, "INVALID_RESPONSE");
        assert.ok(!error.message.includes("database secret sentinel"));
        return true;
      });
    },
  );
});

test("network failures are normalized", async () => {
  await withFetch(
    async () => {
      throw new Error("private transport detail");
    },
    async () => {
      await assert.rejects(api.getMe(true), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 0);
        assert.equal(error.code, "NETWORK_ERROR");
        assert.ok(!error.message.includes("private transport detail"));
        return true;
      });
    },
  );
});

test("license validation preserves only the safe correlated diagnostic envelope", async () => {
  let requestId = "";
  let validationRequest: RequestInit | undefined;

  await withFetch(
    async (input, init) => {
      if (String(input) === "/api/auth/csrf") {
        return new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
          status: 200,
        });
      }
      validationRequest = init;
      requestId =
        new Headers(init?.headers).get("X-LicenX-Diagnostic-Request-ID") || "";
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          request_id: requestId,
          diagnostic: {
            request_id: requestId,
            stage: "response_signing",
            error_name: "Error",
            error_message: "Invalid private key PEM",
            error_stack: "must not reach the browser",
          },
          private_key: "must not reach the browser",
        }),
        { status: 500 },
      );
    },
    async () => {
      const result = await api.validateLicense({
        license_key: "VCON-TEST-KEY",
        hwid: "HWID-TEST",
      });

      assert.equal(result.status, 500);
      assert.match(
        requestId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      assert.equal(result.requestId, requestId);
      assert.deepEqual(result.data, {
        error: "The server could not complete the request. Please try again.",
        code: "HTTP_500",
        request_id: requestId,
        diagnostic: {
          request_id: requestId,
          stage: "response_signing",
          error_name: "Error",
          error_message: "Invalid private key PEM",
        },
      });

      const requestHeaders = new Headers(validationRequest?.headers);
      assert.equal(requestHeaders.get("X-CSRF-Token"), "csrf-test");
      assert.equal(
        requestHeaders.get("X-LicenX-Diagnostic-Request-ID"),
        requestId,
      );
      assert.equal(validationRequest?.credentials, "same-origin");
      assert.equal(validationRequest?.cache, "no-store");
    },
  );
});

test("requests abort at the shared timeout and report a stable timeout code", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((
    callback: (...args: any[]) => void,
    delay: number,
    ...args: any[]
  ) => {
    assert.equal(delay, 30_000);
    return originalSetTimeout(callback, 0, ...args);
  }) as typeof setTimeout;

  try {
    await withFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const rejectOnAbort = () =>
            reject(new DOMException("aborted", "AbortError"));
          if (signal?.aborted) {
            rejectOnAbort();
          } else {
            signal?.addEventListener("abort", rejectOnAbort, { once: true });
          }
        }),
      async () => {
        await assert.rejects(api.getMe(true), (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 0);
          assert.equal(error.code, "TIMEOUT");
          return true;
        });
      },
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
