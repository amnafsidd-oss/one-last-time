import { Router } from 'express';
import healthCheck from './health-check.js';
import payfastRouter from './payfast.js';
import collectionsRouter from './collections.js';

const router = Router();

export default () => {
    router.get('/health', healthCheck);
    router.use('/payfast', payfastRouter);
    router.use('/collections', collectionsRouter);

    return router;
};
