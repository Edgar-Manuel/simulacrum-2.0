// Tests for the brace-balanced JSON extractor used by the agent pipeline.
// We import the agent service and reach into the private method via the
// instance — the alternative would be to extract the helper to its own
// module, but doing that here keeps the change surface tight.

import { describe, it, expect } from 'vitest';
import { aiAgentsService } from './agentService';

// Access the private helper. We deliberately type-erase here; this is
// test-only code.
const parse = (response: string, fallback: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (aiAgentsService as any).safeParseJSON(response, fallback);

describe('safeParseJSON', () => {
    it('extracts a simple JSON object', () => {
        expect(parse('{"a":1}', null)).toEqual({ a: 1 });
    });

    it('extracts the FIRST balanced object even when there is trailing garbage', () => {
        // The previous regex-based implementation matched from the first {
        // to the LAST }, swallowing the trailing object and breaking parse.
        const input = '{"action":"BUY","confidence":80} extra text { "other": 1 }';
        expect(parse(input, null)).toEqual({ action: 'BUY', confidence: 80 });
    });

    it('handles nested objects', () => {
        const input = 'noise {"a":{"b":{"c":42}},"d":[1,2]} trailing';
        expect(parse(input, null)).toEqual({ a: { b: { c: 42 } }, d: [1, 2] });
    });

    it('ignores braces inside string values', () => {
        const input = 'prefix {"msg":"contains {fake} braces","ok":true} suffix';
        expect(parse(input, null)).toEqual({ msg: 'contains {fake} braces', ok: true });
    });

    it('handles escaped quotes inside strings', () => {
        const input = '{"quote":"he said \\"hi\\"","n":1}';
        expect(parse(input, null)).toEqual({ quote: 'he said "hi"', n: 1 });
    });

    it('returns the fallback when there is no JSON object', () => {
        expect(parse('plain text, no braces', { fallback: true })).toEqual({ fallback: true });
    });

    it('returns the fallback when the JSON is truncated', () => {
        // Unbalanced braces — should not parse.
        expect(parse('{"action":"BUY", "data":{"x":1}', { fb: 1 })).toEqual({ fb: 1 });
    });

    it('returns the fallback when JSON is structurally complete but invalid', () => {
        // Balanced braces but invalid JSON content.
        expect(parse('{this is not, valid: json}', 'fb')).toBe('fb');
    });
});
