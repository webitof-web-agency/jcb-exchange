"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const listing_controller_1 = require("../controllers/listing.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.requireAuth, listing_controller_1.createListing);
router.get('/', auth_middleware_1.requireAuth, listing_controller_1.getListings);
router.get('/:id', auth_middleware_1.requireAuth, listing_controller_1.getListingById);
router.put('/:id', auth_middleware_1.requireAuth, listing_controller_1.updateListing);
router.delete('/:id', auth_middleware_1.requireAuth, listing_controller_1.deleteListing);
router.patch('/:id/status', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, listing_controller_1.updateListingStatus);
router.patch('/:id/availability', auth_middleware_1.requireAuth, listing_controller_1.updateListingAvailability);
exports.default = router;
//# sourceMappingURL=listing.routes.js.map