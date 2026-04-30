import { Router } from 'express';
import { getDatasourceStatus } from '../controllers/systemController';

const router = Router();

router.get('/datasource', getDatasourceStatus);

export default router;
