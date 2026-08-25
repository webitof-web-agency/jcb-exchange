"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCitiesByState = exports.getStatesByCountry = exports.getCountries = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const getCountries = async (req, res) => {
    try {
        const countries = await prisma_1.default.country.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, iso2: true, emoji: true },
        });
        res.json(countries);
    }
    catch (error) {
        console.error('Error fetching countries:', error);
        res.status(500).json({ error: 'Failed to fetch countries' });
    }
};
exports.getCountries = getCountries;
const getStatesByCountry = async (req, res) => {
    try {
        const { countryId } = req.params;
        if (typeof countryId !== 'string') {
            return res.status(400).json({ error: 'Country id is required' });
        }
        const normalizedCountryId = Number.parseInt(countryId, 10);
        if (!Number.isFinite(normalizedCountryId)) {
            return res.status(400).json({ error: 'Invalid country id' });
        }
        const states = await prisma_1.default.state.findMany({
            where: { countryId: normalizedCountryId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, stateCode: true },
        });
        res.json(states);
    }
    catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ error: 'Failed to fetch states' });
    }
};
exports.getStatesByCountry = getStatesByCountry;
const getCitiesByState = async (req, res) => {
    try {
        const { stateId } = req.params;
        if (typeof stateId !== 'string') {
            return res.status(400).json({ error: 'State id is required' });
        }
        const normalizedStateId = Number.parseInt(stateId, 10);
        if (!Number.isFinite(normalizedStateId)) {
            return res.status(400).json({ error: 'Invalid state id' });
        }
        const cities = await prisma_1.default.city.findMany({
            where: { stateId: normalizedStateId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        });
        res.json(cities);
    }
    catch (error) {
        console.error('Error fetching cities:', error);
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
};
exports.getCitiesByState = getCitiesByState;
//# sourceMappingURL=location.controller.js.map