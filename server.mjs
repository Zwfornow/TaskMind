import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_PORT = 8787;
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 1024 * 1024;

loadDotEnv(resolve(process.cwd(), ".env"));

const port = normalizePort(process.env.PORT);

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "127.0.0.1"}`,
  );

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname !== "/api/deepseek") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";

  if (!apiKey) {
    sendJson(response, 500, { error: "服务端未配置 DEEPSEEK_API_KEY。" });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const messages = sanitizeMessages(payload.messages);

    if (messages.length === 0) {
      sendJson(response, 400, { error: "请求体缺少有效的 messages 数组。" });
      return;
    }

    const model =
      typeof payload.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
    const temperature = normalizeTemperature(payload.temperature);
    const timeoutMs = normalizeTimeout(process.env.DEEPSEEK_TIMEOUT_MS);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const upstreamResponse = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          messages,
        }),
        signal: abortController.signal,
      });

      const upstreamText = await upstreamResponse.text();
      const upstreamJson = parseJsonSafely(upstreamText);

      if (!upstreamResponse.ok) {
        const errorMessage = extractUpstreamError(
          upstreamJson,
          upstreamResponse.status,
        );
        sendJson(response, upstreamResponse.status, { error: errorMessage });
        return;
      }

      if (!upstreamJson) {
        sendJson(response, 502, { error: "DeepSeek 返回了无法解析的响应。" });
        return;
      }

      sendJson(response, 200, upstreamJson);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (isAbortError(error)) {
      sendJson(response, 504, { error: "DeepSeek 请求超时，请稍后重试。" });
      return;
    }

    const message =
      error instanceof Error ? error.message : "代理服务处理失败。";
    sendJson(response, 400, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`DeepSeek proxy listening on http://127.0.0.1:${port}`);
});

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function normalizePort(value) {
  const parsed = Number.parseInt(value ?? `${DEFAULT_PORT}`, 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_PORT;
}

function normalizeTimeout(value) {
  const parsed = Number.parseInt(value ?? `${DEFAULT_TIMEOUT_MS}`, 10);

  if (Number.isInteger(parsed) && parsed >= 1000) {
    return parsed;
  }

  return DEFAULT_TIMEOUT_MS;
}

function normalizeTemperature(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(value, 0), 2);
  }

  return 0.3;
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const role = item.role;
    const content = item.content;

    if (
      (role !== "system" && role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      return [];
    }

    return [
      {
        role,
        content: content.trim(),
      },
    ];
  });
}

function readJsonBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        rejectPromise(new Error("请求体过大，已超过 1MB 限制。"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        rejectPromise(new Error("请求体为空。"));
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolvePromise(JSON.parse(raw));
      } catch {
        rejectPromise(new Error("请求体不是合法 JSON。"));
      }
    });

    request.on("error", (error) => {
      rejectPromise(error);
    });
  });
}

function parseJsonSafely(raw) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractUpstreamError(payload, status) {
  if (payload && typeof payload === "object") {
    const errorValue = payload.error;

    if (
      errorValue &&
      typeof errorValue === "object" &&
      typeof errorValue.message === "string"
    ) {
      return `DeepSeek 请求失败：${errorValue.message}`;
    }
  }

  return `DeepSeek 请求失败：${status}`;
}

function isAbortError(error) {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}
