"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const master_routes_1 = __importDefault(require("./master.routes"));
const auth_routes_1 = __importDefault(require("./auth.routes"));
const document_routes_1 = __importDefault(require("./document.routes"));
const listing_routes_1 = __importDefault(require("./listing.routes"));
const lead_routes_1 = __importDefault(require("./lead.routes"));
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
const superadmin_routes_1 = __importDefault(require("./superadmin.routes"));
const notification_routes_1 = __importDefault(require("./notification.routes"));
const router = (0, express_1.Router)();
router.use('/master', master_routes_1.default);
router.use('/auth', auth_routes_1.default);
router.use('/documents', document_routes_1.default);
router.use('/superadmin', superadmin_routes_1.default);
router.use('/listings', listing_routes_1.default);
router.use('/leads', lead_routes_1.default);
router.use('/analytics', analytics_routes_1.default);
router.use('/notifications', notification_routes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map