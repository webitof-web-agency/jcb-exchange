"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const location_controller_1 = require("../controllers/location.controller");
const router = (0, express_1.Router)();
router.get('/countries', location_controller_1.getCountries);
router.get('/states/:countryId', location_controller_1.getStatesByCountry);
router.get('/cities/:stateId', location_controller_1.getCitiesByState);
exports.default = router;
//# sourceMappingURL=location.routes.js.map