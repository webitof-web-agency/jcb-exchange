"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lead_controller_1 = require("../controllers/lead.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', lead_controller_1.createLead);
router.post('/public-contact', auth_middleware_1.requireAuth, lead_controller_1.createPublicContactLead);
router.get('/my-leads', auth_middleware_1.requireAuth, lead_controller_1.getMyLeads);
router.get('/badges', auth_middleware_1.requireAuth, lead_controller_1.getMyLeadBadges);
router.get('/:id', auth_middleware_1.requireAuth, lead_controller_1.getLeadById);
router.post('/:id/activities', auth_middleware_1.requireAuth, lead_controller_1.addLeadActivity);
router.patch('/:id/status', auth_middleware_1.requireAuth, lead_controller_1.updateLeadStatus);
exports.default = router;
//# sourceMappingURL=lead.routes.js.map