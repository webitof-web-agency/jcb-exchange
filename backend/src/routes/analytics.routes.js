"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.get('/partner-overview', auth_middleware_1.requireAuth, analytics_controller_1.getPartnerAnalyticsOverview);
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map