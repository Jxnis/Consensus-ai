/**
 * Prompt Compression — Phase 1: Lossless layers only
 * Reference: ClawRouter compression design (MIT)
 *
 * Three safe layers applied when total chars > 5000 (~1000 tokens):
 *   L1 — Message deduplication  (2-5% savings)
 *   L2 — Whitespace normalization (3-8% savings)
 *   L5 — JSON compaction in tool results (2-5% savings)
 *
 * Skipped (risky): L3 dictionary encoding, L4 path shortening, L7 dynamic codebook
 */

export interface Message {
  role: string;
  content: string | unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
  [key: string]: unknown;
}

export interface CompressionStats {
  original_chars: number;
  compressed_chars: number;
  saved_chars: number;
  ratio: number;  // compressed / original — lower is better
  layers_applied: string[];
}

const COMPRESSION_THRESHOLD_CHARS = 5000;

/**
 * L1: Deduplicate repeated assistant messages.
 * Only deduplicates assistant messages — never user, system, or tool messages.
 * Preserves tool_use → tool_result pairing.
 */
function deduplicateMessages(messages: Message[]): Message[] {
  const seenAssistantHashes = new Set<string>();
  return messages.filter(msg => {
    if (msg.role !== "assistant") return true;
    if (msg.tool_calls) return true; // Never dedup tool-call messages

    const key = `${msg.role}:${msg.tool_call_id ?? ""}:${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`;
    if (seenAssistantHashes.has(key)) return false;
    seenAssistantHashes.add(key);
    return true;
  });
}

/**
 * L2: Conservative whitespace normalization.
 * SAFE operations only — never alter indentation or content structure:
 * - Normalize line endings (\r\n → \n)
 * - Max 2 consecutive blank lines
 * - Trim trailing whitespace per line
 * - Trim start/end of full text
 *
 * NOT done (would break code): tab→space, indentation collapsing, space collapsing
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")               // normalize line endings
    .replace(/\n{3,}/g, "\n\n")           // max 2 consecutive blank lines
    .replace(/[ \t]+$/gm, "")             // trim trailing whitespace per line
    .trim();
}

function applyWhitespaceToMessages(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (typeof msg.content !== "string") return msg;
    const normalized = normalizeWhitespace(msg.content);
    if (normalized === msg.content) return msg;
    return { ...msg, content: normalized };
  });
}

/**
 * L5: Compact JSON in tool results and tool call arguments.
 * Strips pretty-printing from JSON content — safe because it's re-parsed anyway.
 */
function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text; // Not valid JSON, leave as-is
  }
}

function applyJsonCompaction(messages: Message[]): Message[] {
  return messages.map(msg => {
    // Compact tool result content
    if (msg.role === "tool" && typeof msg.content === "string") {
      const compacted = compactJson(msg.content);
      if (compacted !== msg.content) return { ...msg, content: compacted };
    }

    // Compact tool call arguments
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      const compactedCalls = (msg.tool_calls as any[]).map(tc => {
        if (tc?.function?.arguments && typeof tc.function.arguments === "string") {
          const compacted = compactJson(tc.function.arguments);
          if (compacted !== tc.function.arguments) {
            return { ...tc, function: { ...tc.function, arguments: compacted } };
          }
        }
        return tc;
      });
      return { ...msg, tool_calls: compactedCalls };
    }

    return msg;
  });
}

function countChars(messages: Message[]): number {
  return messages.reduce((sum, msg) => {
    if (typeof msg.content === "string") return sum + msg.content.length;
    if (msg.content != null) return sum + JSON.stringify(msg.content).length;
    return sum;
  }, 0);
}

/**
 * Main compression entry point.
 * Returns original messages unchanged if below threshold or nothing to compress.
 */
export function compressMessages(messages: Message[]): { messages: Message[]; stats: CompressionStats } {
  const originalChars = countChars(messages);

  // Skip compression below threshold — overhead not worth it
  if (originalChars < COMPRESSION_THRESHOLD_CHARS) {
    return {
      messages,
      stats: { original_chars: originalChars, compressed_chars: originalChars, saved_chars: 0, ratio: 1, layers_applied: [] },
    };
  }

  const layersApplied: string[] = [];
  let current = messages;

  // L1: Deduplication
  const afterDedup = deduplicateMessages(current);
  if (afterDedup.length < current.length) {
    layersApplied.push("L1:dedup");
    current = afterDedup;
  }

  // L2: Whitespace normalization
  const afterWhitespace = applyWhitespaceToMessages(current);
  const whitespaceChars = countChars(afterWhitespace);
  if (whitespaceChars < countChars(current)) {
    layersApplied.push("L2:whitespace");
    current = afterWhitespace;
  }

  // L5: JSON compaction
  const afterJson = applyJsonCompaction(current);
  const jsonChars = countChars(afterJson);
  if (jsonChars < countChars(current)) {
    layersApplied.push("L5:json");
    current = afterJson;
  }

  const compressedChars = countChars(current);
  const savedChars = originalChars - compressedChars;
  const ratio = compressedChars / originalChars;

  return {
    messages: current,
    stats: {
      original_chars: originalChars,
      compressed_chars: compressedChars,
      saved_chars: savedChars,
      ratio: parseFloat(ratio.toFixed(4)),
      layers_applied: layersApplied,
    },
  };
}
