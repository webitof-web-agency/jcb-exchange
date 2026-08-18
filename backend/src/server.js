"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const soldListingRetention_1 = require("./utils/soldListingRetention");
const PORT = process.env.PORT || 5000;
(0, soldListingRetention_1.startSoldListingRetentionJob)();
app_1.default.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
//# sourceMappingURL=server.js.map