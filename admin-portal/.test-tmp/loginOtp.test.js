"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const loginOtp_1 = require("./loginOtp");
(0, node_test_1.default)('normalizes OTP configuration to safe client bounds', () => {
    strict_1.default.equal((0, loginOtp_1.normalizeOtpLength)(undefined), 6);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpLength)(3), 4);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpLength)(12), 10);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpExpirySeconds)(undefined, 900), 900);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpExpirySeconds)(30, 900), 60);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpCooldownSeconds)(0), 1);
    strict_1.default.equal((0, loginOtp_1.normalizeOtpCooldownSeconds)(120), 120);
});
(0, node_test_1.default)('keeps OTP input numeric and bounded', () => {
    strict_1.default.equal((0, loginOtp_1.normalizeOtpInput)('a1 2-3x4', 4), '1234');
    strict_1.default.equal((0, loginOtp_1.normalizeOtpInput)('987654', 6), '987654');
});
(0, node_test_1.default)('calculates expiry and resend countdowns without negative values', () => {
    const now = 1_000_000;
    strict_1.default.equal((0, loginOtp_1.getOtpSecondsRemaining)(now + 10_500, now), 11);
    strict_1.default.equal((0, loginOtp_1.getOtpSecondsRemaining)(now - 1, now), 0);
    strict_1.default.equal((0, loginOtp_1.getOtpResendSecondsRemaining)(now + 2_100, now), 3);
    strict_1.default.equal((0, loginOtp_1.getOtpResendSecondsRemaining)(0, now), 0);
});
