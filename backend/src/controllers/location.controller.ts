import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export const getCountries = async (req: Request, res: Response) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, iso2: true, emoji: true },
    });
    res.json(countries);
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
};

export const getStatesByCountry = async (req: Request, res: Response) => {
  try {
    const { countryId } = req.params;
    if (typeof countryId !== 'string') {
      return res.status(400).json({ error: 'Country id is required' });
    }

    const normalizedCountryId = Number.parseInt(countryId, 10);
    if (!Number.isFinite(normalizedCountryId)) {
      return res.status(400).json({ error: 'Invalid country id' });
    }

    const states = await prisma.state.findMany({
      where: { countryId: normalizedCountryId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, stateCode: true },
    });
    res.json(states);
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ error: 'Failed to fetch states' });
  }
};

export const getCitiesByState = async (req: Request, res: Response) => {
  try {
    const { stateId } = req.params;
    if (typeof stateId !== 'string') {
      return res.status(400).json({ error: 'State id is required' });
    }

    const normalizedStateId = Number.parseInt(stateId, 10);
    if (!Number.isFinite(normalizedStateId)) {
      return res.status(400).json({ error: 'Invalid state id' });
    }

    const cities = await prisma.city.findMany({
      where: { stateId: normalizedStateId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    res.json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
};
