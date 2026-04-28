const { STORAGE_KEYS, DEFAULT_HEADERS } = require("../utils/env");
const { getRuntimeConfig } = require("../utils/runtime");

function joinUrl(baseURL, path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedBase = String(baseURL || "").replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}

function getToken() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.TOKEN) || "";
  } catch (_error) {
    return "";
  }
}

function concatBytes(left, right) {
  const a = left || new Uint8Array(0);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right || []);
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

function utf8SafeEnd(bytes) {
  if (!bytes || !bytes.length) return 0;
  let start = bytes.length - 1;
  while (start >= 0 && (bytes[start] & 0xc0) === 0x80) {
    start -= 1;
  }
  if (start < 0) return 0;
  const first = bytes[start];
  const expected = first < 0x80 ? 1 : (first & 0xe0) === 0xc0 ? 2 : (first & 0xf0) === 0xe0 ? 3 : 4;
  return start + expected <= bytes.length ? bytes.length : start;
}

function decodeUtf8Bytes(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length;) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      output += String.fromCharCode(b1);
    } else if ((b1 & 0xe0) === 0xc0 && i < bytes.length) {
      const b2 = bytes[i++];
      output += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if ((b1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      output += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if ((b1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      const codePoint = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      output += String.fromCodePoint(codePoint);
    }
  }
  return output;
}

function createChunkDecoder() {
  if (typeof TextDecoder !== "undefined") {
    const decoder = new TextDecoder("utf-8");
    return {
      decode(chunk) {
        return decoder.decode(chunk, { stream: true });
      },
      flush() {
        return decoder.decode();
      }
    };
  }

  let pending = new Uint8Array(0);
  return {
    decode(chunk) {
      const merged = concatBytes(pending, chunk);
      const safeEnd = utf8SafeEnd(merged);
      const safe = merged.slice(0, safeEnd);
      pending = merged.slice(safeEnd);
      return decodeUtf8Bytes(safe);
    },
    flush() {
      const text = decodeUtf8Bytes(pending);
      pending = new Uint8Array(0);
      return text;
    }
  };
}

function createSseParser() {
  let buffer = "";
  return {
    feed(text) {
      buffer += String(text || "").replace(/\r\n/g, "\n");
      const events = [];
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf("\n\n");
        if (!rawEvent.trim()) continue;
        let eventName = "message";
        const dataLines = [];
        rawEvent.split("\n").forEach((line) => {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        });
        if (!dataLines.length) continue;
        try {
          events.push({
            event: eventName,
            data: JSON.parse(dataLines.join("\n"))
          });
        } catch (_error) {
          // Ignore malformed partial events; the buffer boundary logic handles valid split chunks.
        }
      }
      return events;
    }
  };
}

function startRouterMessageStream(sessionId, payload = {}, handlers = {}) {
  const runtimeConfig = getRuntimeConfig();
  const token = getToken();
  const decoder = createChunkDecoder();
  const parser = createSseParser();
  let settled = false;
  let requestTask = null;

  const promise = new Promise((resolve, reject) => {
    requestTask = wx.request({
      url: joinUrl(runtimeConfig.baseURL, `/router/sessions/${sessionId}/messages/stream`),
      method: "POST",
      data: payload,
      timeout: Math.max(1000, Number(runtimeConfig.timeout || 15000), 310000),
      enableChunked: true,
      responseType: "arraybuffer",
      header: {
        ...DEFAULT_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success() {
        if (!settled) {
          settled = true;
          resolve({ ok: true });
        }
      },
      fail(error) {
        if (!settled) {
          settled = true;
          reject(error || new Error("stream_request_failed"));
        }
      },
      complete() {
        const trailing = decoder.flush();
        if (trailing) {
          parser.feed(trailing).forEach((item) => handlers.onEvent && handlers.onEvent(item));
        }
      }
    });

    if (requestTask && typeof requestTask.onChunkReceived === "function") {
      requestTask.onChunkReceived((res) => {
        const text = decoder.decode(res.data);
        const events = parser.feed(text);
        events.forEach((item) => {
          if (handlers.onEvent) {
            handlers.onEvent(item);
          }
          if (item.event === "stream.done" && !settled) {
            settled = true;
            resolve(item.data || { ok: true });
          }
          if (item.event === "stream.error" && !settled) {
            settled = true;
            const message = item.data && item.data.message ? item.data.message : "stream_error";
            reject(new Error(message));
          }
        });
      });
    }
  });

  return {
    promise,
    abort() {
      if (requestTask && typeof requestTask.abort === "function") {
        requestTask.abort();
      }
    }
  };
}

module.exports = {
  createSseParser,
  createChunkDecoder,
  startRouterMessageStream
};
