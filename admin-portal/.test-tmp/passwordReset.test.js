"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const passwordReset_1 = require("./passwordReset");
(0, node_test_1.default)('accepts a strong matching password for reset', () => {
    strict_1.default.equal((0, passwordReset_1.validatePasswordResetInput)('secure-pass-123', 'secure-pass-123'), null);
});
(0, node_test_1.default)('rejects missing, short, oversized, and mismatched reset passwords', () => {
    strict_1.default.match((0, passwordReset_1.validatePasswordResetInput)('', 'secure-pass-123') || '', /required/i);
    strict_1.default.match((0, passwordReset_1.validatePasswordResetInput)('short', 'short') || '', /8 characters/i);
    strict_1.default.match((0, passwordReset_1.validatePasswordResetInput)('a'.repeat(129), 'a'.repeat(129)) || '', /128 characters/i);
    strict_1.default.match((0, passwordReset_1.validatePasswordResetInput)('secure-pass-123', 'different-pass') || '', /match/i);
});
