import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("dotenv/config", () => ({}));
vi.mock("cors", () => ({ default: vi.fn(() => vi.fn()) }));

// Shared app mock — same object across resets so we can assert on it
const mockApp = {
  use: vi.fn().mockReturnThis(),
  get: vi.fn().mockReturnThis(),
  post: vi.fn().mockReturnThis(),
  listen: vi.fn().mockReturnThis(),
};

vi.mock("express", () => {
  const e = Object.assign(vi.fn(() => mockApp), {
    json: vi.fn(() => vi.fn()),
  });
  return { default: e };
});

// Makes process.exit actually stop execution — needed so uninitialised agent
// is never reached by route handlers after a mocked startup failure.
function mockExit() {
  return vi
    .spyOn(process, "exit")
    .mockImplementation((_code?: number | string | null): never => {
      throw new Error("process.exit called");
    });
}

describe("api server startup", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("calls process.exit(1) and logs to stderr when MCP connection fails", async () => {
    vi.doMock("../client/gateway.js", () => ({
      MultiServerGateway: vi.fn(function () {
        return {
          addHttpServer: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        };
      }),
    }));
    vi.doMock("../agent/agent.js", () => ({
      Agent: vi.fn(function () {
        return { initialize: vi.fn(), availableTools: [] };
      }),
    }));

    const exitSpy = mockExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("./server.js")).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[API\] Failed to connect to MCP HTTP server:/),
      expect.any(Error),
    );
    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it("initialises the agent and starts listening when MCP connection succeeds", async () => {
    const mockInitialize = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../client/gateway.js", () => ({
      MultiServerGateway: vi.fn(function () {
        return { addHttpServer: vi.fn().mockResolvedValue(undefined) };
      }),
    }));
    vi.doMock("../agent/agent.js", () => ({
      Agent: vi.fn(function () {
        return { initialize: mockInitialize, availableTools: [] };
      }),
    }));

    const exitSpy = mockExit();

    await import("./server.js");

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockInitialize).toHaveBeenCalledOnce();
    expect(mockApp.listen).toHaveBeenCalledOnce();
  });
});
