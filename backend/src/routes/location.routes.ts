import { Router } from 'express';
import { getCountries, getStatesByCountry, getCitiesByState } from '../controllers/location.controller';

const router = Router();

router.get('/countries', getCountries);
router.get('/states/:countryId', getStatesByCountry);
router.get('/cities/:stateId', getCitiesByState);

export default router;
