import 'dotenv/config';
import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /collections/ads/records
 * Create a new ad record in PocketBase
 * Requires authentication (Bearer token)
 * 
 * Request body:
 *   - title: string (required)
 *   - description: string (required)
 *   - price: number (required)
 *   - category: string (required)
 *   - location: string (optional)
 *   - images: array (optional)
 *   - contact_phone: string (optional)
 *   - contact_email: string (optional)
 *   - [other ad fields]
 * 
 * Response:
 *   - 201 Created with the created record object
 *   - 400 Bad Request if validation fails
 *   - 401 Unauthorized if not authenticated
 */
router.post('/ads/records', async (req, res) => {
  logger.info('[COLLECTIONS] ========== CREATE AD REQUEST START =========');
  logger.info(`[COLLECTIONS] req.auth: ${JSON.stringify(req.auth || 'UNDEFINED')}`);
  logger.info(`[COLLECTIONS] Request body: ${JSON.stringify(req.body)}`);

  // ============================================
  // AUTHENTICATION CHECK
  // ============================================
  if (!req.auth || !req.auth.id) {
    logger.warn('[COLLECTIONS] Unauthorized: No authenticated user');
    return res.status(401).json({ error: 'Unauthorized - authentication required' });
  }

  logger.info(`[COLLECTIONS] Authenticated user: ${req.auth.id}`);

  // ============================================
  // INPUT VALIDATION
  // ============================================
  const { title, description, price, category } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    logger.warn('[COLLECTIONS] Validation failed: Missing or invalid title');
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }

  if (!description || typeof description !== 'string' || description.trim() === '') {
    logger.warn('[COLLECTIONS] Validation failed: Missing or invalid description');
    return res.status(400).json({ error: 'Description is required and must be a non-empty string' });
  }

  if (price === undefined || price === null) {
    logger.warn('[COLLECTIONS] Validation failed: Missing price');
    return res.status(400).json({ error: 'Price is required' });
  }

  const numPrice = parseFloat(price);
  if (isNaN(numPrice) || numPrice < 0) {
    logger.warn('[COLLECTIONS] Validation failed: Invalid price value');
    return res.status(400).json({ error: 'Price must be a valid non-negative number' });
  }

  if (!category || typeof category !== 'string' || category.trim() === '') {
    logger.warn('[COLLECTIONS] Validation failed: Missing or invalid category');
    return res.status(400).json({ error: 'Category is required and must be a non-empty string' });
  }

  // ============================================
  // CREATE AD RECORD IN POCKETBASE
  // ============================================
  const adData = {
    title: title.trim(),
    description: description.trim(),
    price: numPrice,
    category: category.trim(),
    user_id: req.auth.id,
    is_featured: false,
    status: 'active',
  };

  // Add optional fields if provided
  if (req.body.location) {
    adData.location = req.body.location;
  }
  if (req.body.contact_phone) {
    adData.contact_phone = req.body.contact_phone;
  }
  if (req.body.contact_email) {
    adData.contact_email = req.body.contact_email;
  }
  if (req.body.images && Array.isArray(req.body.images)) {
    adData.images = req.body.images;
  }

  logger.info(`[COLLECTIONS] Creating ad with data: ${JSON.stringify(adData)}`);

  try {
    const createdRecord = await pb.collection('ads').create(adData);

    logger.info(`[COLLECTIONS] Ad created successfully`);
    logger.info(`[COLLECTIONS] Created record ID: ${createdRecord.id}`);
    logger.info(`[COLLECTIONS] Created record: ${JSON.stringify(createdRecord)}`);
    logger.info('[COLLECTIONS] ========== CREATE AD REQUEST END =========');

    // Return 201 Created with the created record
    res.status(201).json(createdRecord);
  } catch (error) {
    logger.error(`[COLLECTIONS] Error creating ad: ${error.message}`);
    logger.error(`[COLLECTIONS] Error type: ${error.constructor.name}`);
    logger.debug(`[COLLECTIONS] Error stack: ${error.stack}`);
    throw error; // Let errorMiddleware handle it
  }
});

/**
 * GET /collections/ads/records
 * Retrieve all ads (with optional filtering)
 * 
 * Query parameters:
 *   - filter: string (optional) - PocketBase filter expression
 *   - sort: string (optional) - Sort order (e.g., '-created')
 *   - page: number (optional) - Page number (default: 1)
 *   - perPage: number (optional) - Records per page (default: 30)
 * 
 * Response:
 *   - Array of ad records
 */
router.get('/ads/records', async (req, res) => {
  logger.info('[COLLECTIONS] ========== GET ADS REQUEST START =========');
  logger.info(`[COLLECTIONS] Query params: ${JSON.stringify(req.query)}`);

  const { filter, sort, page = 1, perPage = 30 } = req.query;

  try {
    const options = {
      page: parseInt(page, 10) || 1,
      perPage: parseInt(perPage, 10) || 30,
    };

    if (sort) {
      options.sort = sort;
    }

    logger.info(`[COLLECTIONS] Fetching ads with options: ${JSON.stringify(options)}`);

    let query = pb.collection('ads');

    if (filter) {
      query = query.getList(options.page, options.perPage, { filter, sort: options.sort });
    } else {
      query = query.getList(options.page, options.perPage, { sort: options.sort });
    }

    const records = await query;

    logger.info(`[COLLECTIONS] Retrieved ${records.items.length} ads`);
    logger.info('[COLLECTIONS] ========== GET ADS REQUEST END =========');

    res.json(records);
  } catch (error) {
    logger.error(`[COLLECTIONS] Error fetching ads: ${error.message}`);
    throw error; // Let errorMiddleware handle it
  }
});

/**
 * GET /collections/ads/records/:id
 * Retrieve a single ad by ID
 * 
 * Response:
 *   - Single ad record object
 */
router.get('/ads/records/:id', async (req, res) => {
  const { id } = req.params;

  logger.info(`[COLLECTIONS] Fetching ad: ${id}`);

  try {
    const record = await pb.collection('ads').getOne(id);

    logger.info(`[COLLECTIONS] Ad retrieved: ${JSON.stringify(record)}`);

    res.json(record);
  } catch (error) {
    logger.error(`[COLLECTIONS] Error fetching ad: ${error.message}`);
    throw error; // Let errorMiddleware handle it
  }
});

/**
 * PATCH /collections/ads/records/:id
 * Update an ad record
 * Requires authentication and ownership (user_id must match)
 * 
 * Request body:
 *   - Any ad fields to update
 * 
 * Response:
 *   - Updated ad record
 */
router.patch('/ads/records/:id', async (req, res) => {
  const { id } = req.params;

  logger.info(`[COLLECTIONS] ========== UPDATE AD REQUEST START =========`);
  logger.info(`[COLLECTIONS] req.auth: ${JSON.stringify(req.auth || 'UNDEFINED')}`);
  logger.info(`[COLLECTIONS] Ad ID: ${id}`);
  logger.info(`[COLLECTIONS] Request body: ${JSON.stringify(req.body)}`);

  // ============================================
  // AUTHENTICATION CHECK
  // ============================================
  if (!req.auth || !req.auth.id) {
    logger.warn('[COLLECTIONS] Unauthorized: No authenticated user');
    return res.status(401).json({ error: 'Unauthorized - authentication required' });
  }

  // ============================================
  // VERIFY OWNERSHIP
  // ============================================
  try {
    const existingRecord = await pb.collection('ads').getOne(id);

    if (existingRecord.user_id !== req.auth.id) {
      logger.warn(`[COLLECTIONS] Forbidden: User ${req.auth.id} cannot update ad owned by ${existingRecord.user_id}`);
      return res.status(403).json({ error: 'Forbidden - you can only update your own ads' });
    }

    logger.info(`[COLLECTIONS] Ownership verified for user ${req.auth.id}`);

    // ============================================
    // UPDATE AD RECORD
    // ============================================
    const updateData = { ...req.body };
    // Prevent user_id from being changed
    delete updateData.user_id;

    logger.info(`[COLLECTIONS] Updating ad with data: ${JSON.stringify(updateData)}`);

    const updatedRecord = await pb.collection('ads').update(id, updateData);

    logger.info(`[COLLECTIONS] Ad updated successfully`);
    logger.info(`[COLLECTIONS] Updated record: ${JSON.stringify(updatedRecord)}`);
    logger.info('[COLLECTIONS] ========== UPDATE AD REQUEST END =========');

    res.json(updatedRecord);
  } catch (error) {
    logger.error(`[COLLECTIONS] Error updating ad: ${error.message}`);
    throw error; // Let errorMiddleware handle it
  }
});

/**
 * DELETE /collections/ads/records/:id
 * Delete an ad record
 * Requires authentication and ownership (user_id must match)
 * 
 * Response:
 *   - 204 No Content on success
 */
router.delete('/ads/records/:id', async (req, res) => {
  const { id } = req.params;

  logger.info(`[COLLECTIONS] ========== DELETE AD REQUEST START =========`);
  logger.info(`[COLLECTIONS] req.auth: ${JSON.stringify(req.auth || 'UNDEFINED')}`);
  logger.info(`[COLLECTIONS] Ad ID: ${id}`);

  // ============================================
  // AUTHENTICATION CHECK
  // ============================================
  if (!req.auth || !req.auth.id) {
    logger.warn('[COLLECTIONS] Unauthorized: No authenticated user');
    return res.status(401).json({ error: 'Unauthorized - authentication required' });
  }

  // ============================================
  // VERIFY OWNERSHIP
  // ============================================
  try {
    const existingRecord = await pb.collection('ads').getOne(id);

    if (existingRecord.user_id !== req.auth.id) {
      logger.warn(`[COLLECTIONS] Forbidden: User ${req.auth.id} cannot delete ad owned by ${existingRecord.user_id}`);
      return res.status(403).json({ error: 'Forbidden - you can only delete your own ads' });
    }

    logger.info(`[COLLECTIONS] Ownership verified for user ${req.auth.id}`);

    // ============================================
    // DELETE AD RECORD
    // ============================================
    logger.info(`[COLLECTIONS] Deleting ad ${id}`);

    await pb.collection('ads').delete(id);

    logger.info(`[COLLECTIONS] Ad deleted successfully`);
    logger.info('[COLLECTIONS] ========== DELETE AD REQUEST END =========');

    res.status(204).send();
  } catch (error) {
    logger.error(`[COLLECTIONS] Error deleting ad: ${error.message}`);
    throw error; // Let errorMiddleware handle it
  }
});

export default router;
