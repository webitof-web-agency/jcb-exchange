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
    const states = await prisma.state.findMany({
      where: { countryId: parseInt(countryId, 10) },
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
    const cities = await prisma.city.findMany({
      where: { stateId: parseInt(stateId, 10) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    res.json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
};
